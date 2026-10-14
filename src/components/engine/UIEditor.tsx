import { useEffect, useRef, useState } from "react";
import type { Scene, UIElement, UIElementKind, UIAnchor, UIAction, UIBind } from "@/lib/engine/core";
import { newUIElement, resolveUIRect, uid } from "@/lib/engine/core";
import { drawTransparencyGrid, fileToDataURL, getRenderableImage } from "@/lib/engine/images";
import { canvasPixelSize, needsCanvasResize } from "@/lib/engine/canvas";
import { UI_EVENTS, type EventType, type Script } from "@/lib/engine/scripts";
import { drawEntity } from "./GameRuntime";
import { ScriptEditor } from "./ScriptEditor";

interface Props {
  scene: Scene;
  onChange: (s: Scene) => void;
}

const KIND_LIST: { id: UIElementKind; icon: string; label: string }[] = [
  { id: "button", icon: "◉", label: "BOTÓN" },
  { id: "label", icon: "T", label: "TEXTO" },
  { id: "image", icon: "▣", label: "IMAGEN" },
  { id: "panel", icon: "▭", label: "PANEL" },
  { id: "bar", icon: "▬", label: "BARRA" },
  { id: "joystick", icon: "◎", label: "STICK" },
];


const ANCHORS: UIAnchor[] = ["tl","tc","tr","cl","c","cr","bl","bc","br"];

/** Los tres momentos de ejecución de un script de interfaz, en un toque. */
const EXECUTION_CHIPS: { event: EventType; label: string }[] = [
  { event: "onTap", label: "AL PULSAR" },
  { event: "onHold", label: "MANTENER" },
  { event: "onRelease", label: "AL SOLTAR" },
];

type Snap = "peek" | "half" | "full";

export function UIEditor({ scene, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [selIds, setSelIds] = useState<string[]>([]);
  const [multiMode, setMultiMode] = useState(false);
  const [snap, setSnap] = useState<Snap>("peek");
  const [virt, setVirt] = useState({ w: 360, h: 640 });
  const [size, setSize] = useState({ w: 360, h: 640 });
  const dragRef = useRef<{ ids: string[]; mode: "move" | "resize"; sx: number; sy: number; orig: Record<string, { x: number; y: number; w: number; h: number }> } | null>(null);
  const sheetDragRef = useRef<{ startY: number; startSnap: Snap; dy: number } | null>(null);
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const tickRef = useRef(0);
  const moveFrame = useRef(0);
  const pendingDragUpdate = useRef<Array<{ id: string; patch: Partial<UIElement> }> | null>(null);


  const ui = scene.ui ?? [];
  const selSet = new Set(selIds);
  const selectedEls = ui.filter(e => selSet.has(e.id));
  const sel = selectedEls.length === 1 ? selectedEls[0] : null;
  const selId = sel?.id ?? null;

  // Use visualViewport on iOS Safari so URL-bar collapse/expand
  // doesn't desync the sheet/canvas sizing.
  const getVH = () => {
    if (typeof window === "undefined") return 800;
    return Math.round(window.visualViewport?.height ?? window.innerHeight);
  };
  const getVW = () => {
    if (typeof window === "undefined") return 360;
    return Math.round(window.visualViewport?.width ?? window.innerWidth);
  };

  // Fit preview to wrap while matching the REAL game canvas aspect (window
  // minus header & tab bar), so anchored offsets are 1:1 with PLAY.
  useEffect(() => {
    const fit = () => {
      const w = wrapRef.current; if (!w) return;
      const cs = getComputedStyle(w);
      const padT = parseFloat(cs.paddingTop) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const aw = Math.max(80, w.clientWidth - padL - padR - 8);
      const ah = Math.max(80, w.clientHeight - padT - padB - 8);
      const HEADER = 56, TABS = 72;
      const vw = Math.max(240, getVW());
      const vh = Math.max(240, getVH() - HEADER - TABS);
      const sc = Math.min(aw / vw, ah / vh);
      setVirt({ w: vw, h: vh });
      const nextSize = { w: Math.max(120, Math.round(vw * sc)), h: Math.max(120, Math.round(vh * sc)) };
      setSize(nextSize);
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.visualViewport?.addEventListener("resize", fit);
    // La barra superior puede envolver en varias filas: si cambia de alto, el
    // hueco del lienzo cambia sin disparar `resize`, así que lo observamos.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      ro?.disconnect();
    };
  }, [snap]);

  useEffect(() => {
    // Don't auto-open/close the property sheet on selection changes —
    // the user decides when to expand it via the drag handle.
    if (inspectorRef.current) inspectorRef.current.scrollTop = 0;
  }, [selId]);

  // sheet drag (vertical) — snap to peek/half/full
  const sheetHeightFor = (s: Snap) => {
    const vh = getVH();
    if (s === "full") return Math.round(vh * 0.88);
    if (s === "half") return Math.round(vh * 0.58);
    return 60;
  };
  const onSheetHandleDown = (ev: React.PointerEvent) => {
    try { (ev.currentTarget as Element).setPointerCapture(ev.pointerId); } catch {}
    sheetDragRef.current = { startY: ev.clientY, startSnap: snap, dy: 0 };
  };
  const onSheetHandleMove = (ev: React.PointerEvent) => {
    const d = sheetDragRef.current; if (!d) return;
    d.dy = ev.clientY - d.startY;
    setSheetDragOffset(d.dy);
  };
  const onSheetHandleUp = () => {
    const d = sheetDragRef.current; if (!d) { setSheetDragOffset(0); return; }
    const order: Snap[] = ["peek", "half", "full"];
    const cur = order.indexOf(d.startSnap);
    let next = cur;
    if (d.dy < -40) next = Math.min(2, cur + 1);
    else if (d.dy > 40) next = Math.max(0, cur - 1);
    setSnap(order[next]);
    setSheetDragOffset(0);
    sheetDragRef.current = null;
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  };

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let lastDraw = 0;
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (now - lastDraw < 30) return;
      lastDraw = now;
      tickRef.current++;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      // Canvas internal coords = virtual game size; CSS scales it to fit.
      // Redondeado + comparación de tamaño real: reasignar width/height limpia
      // el bitmap y el fondo de la previsualización parpadeaba.
      const next = canvasPixelSize(virt.w, virt.h, dpr);
      if (needsCanvasResize(canvas, next)) {
        canvas.width = next.width;
        canvas.height = next.height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const W = virt.w, H = virt.h;
      // game backdrop
      ctx.fillStyle = scene.bg || "#0b1e3f";
      ctx.fillRect(0, 0, W, H);
      if (scene.bgImage) {
          const img = getRenderableImage(scene.bgImage);
        if (img?.width) {
          const sa = img.width / img.height, da = W / H;
          const cover = sa > da;
          const dw = cover ? H * sa : W;
          const dh = cover ? H : W / sa;
          ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        }
      }
      // GAME CAMERA SNAPSHOT — mirror PLAY's fixed-size camera so UI editing
      // matches what the user actually sees in-game.
      const VIEW_H = 700;
      const gscale = H / VIEW_H;
      const viewW = W / gscale;
      const viewH = VIEW_H;
      const player = scene.entities.find(e => e.controllable);
      let camX = 0, camY = 0;
      if (player) {
        camX = player.x + player.w / 2 - viewW / 2;
        camY = player.y + player.h / 2 - viewH / 2;
        if (scene.width > viewW) camX = Math.max(0, Math.min(scene.width - viewW, camX));
        else camX = (scene.width - viewW) / 2;
        if (scene.height > viewH) camY = Math.max(0, Math.min(scene.height - viewH, camY));
        else camY = (scene.height - viewH) / 2;
      } else {
        camX = (scene.width - viewW) / 2;
        camY = (scene.height - viewH) / 2;
      }
      ctx.save();
      ctx.scale(gscale, gscale);
      ctx.translate(-camX, -camY);
      const tSec = tickRef.current / 60;
      const drawList = [...scene.entities].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
      for (const e of drawList) {
        if (e.visible === false) continue;
        const a = e.opacity ?? 1;
        if (a !== 1) ctx.globalAlpha = a;
        try { drawEntity(ctx, e, tSec, true); } catch { /* ignore */ }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // dim overlay so UI elements pop above the snapshot
      ctx.fillStyle = "rgba(2,6,23,0.45)";
      ctx.fillRect(0, 0, W, H);

      // safe area
      ctx.strokeStyle = "rgba(125,211,252,0.18)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(8, 8, W - 16, H - 16);
      ctx.setLineDash([]);

      const t = tickRef.current / 60;
      const mockState = {
        score: Math.floor(t * 5),
        lives: Math.max(1, (scene.startLives ?? 3) - Math.floor(t / 4) % (scene.startLives ?? 3)),
        time: t,
        timeLimit: scene.timeLimit && scene.timeLimit > 0 ? scene.timeLimit : undefined,
      };
      for (const el of ui) {
        if (el.visible === false) continue;
        drawUIElement(ctx, el, W, H, tickRef.current, mockState);
      }

      // multi-select outlines
      for (const e of selectedEls) {
        if (e.id === selId) continue;
        const rr = resolveUIRect(e, W, H);
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rr.x - 1, rr.y - 1, rr.w + 2, rr.h + 2);
        ctx.setLineDash([]);
      }

      if (sel) {
        const r = resolveUIRect(sel, W, H);
        // anchor reference point + dashed guides showing X/Y offsets
        const ap = anchorScreenPoint(sel.anchor, W, H);
        ctx.strokeStyle = "rgba(251,191,36,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y); ctx.lineTo(r.x, ap.y);
        ctx.moveTo(r.x, ap.y); ctx.lineTo(r.x, r.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // anchor reference marker
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath(); ctx.arc(ap.x, ap.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ap.x, ap.y, 5, 0, Math.PI * 2); ctx.stroke();
        // X/Y offset labels
        const lbl = `${Math.round(sel.x)}`;
        const lbl2 = `${Math.round(sel.y)}`;
        ctx.font = "600 11px Rajdhani, sans-serif";
        ctx.fillStyle = "#fbbf24";
        ctx.textBaseline = "middle";
        const midX = (ap.x + r.x) / 2;
        ctx.textAlign = "center";
        ctx.fillText(`x ${lbl}`, midX, ap.y - 8);
        ctx.textAlign = "left";
        ctx.fillText(`y ${lbl2}`, r.x + 4, (ap.y + r.y) / 2);
        ctx.textAlign = "start";

        // W/H labels on edges
        ctx.fillStyle = "#7dd3fc";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(sel.w)}`, r.x + r.w / 2, r.y - 8);
        ctx.save();
        ctx.translate(r.x + r.w + 12, r.y + r.h / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(`${Math.round(sel.h)}`, 0, 0);
        ctx.restore();
        ctx.textAlign = "start";

        // selection outline
        ctx.strokeStyle = "#7dd3fc";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
        ctx.setLineDash([]);

        // 9 anchor pickers around element
        const ah = Math.max(10, 12 / Math.max(0.001, size.w / virt.w));
        const pts: { a: UIAnchor; x: number; y: number }[] = [
          { a: "tl", x: r.x, y: r.y }, { a: "tc", x: r.x + r.w / 2, y: r.y }, { a: "tr", x: r.x + r.w, y: r.y },
          { a: "cl", x: r.x, y: r.y + r.h / 2 }, { a: "c", x: r.x + r.w / 2, y: r.y + r.h / 2 }, { a: "cr", x: r.x + r.w, y: r.y + r.h / 2 },
          { a: "bl", x: r.x, y: r.y + r.h }, { a: "bc", x: r.x + r.w / 2, y: r.y + r.h }, { a: "br", x: r.x + r.w, y: r.y + r.h },
        ];
        for (const p of pts) {
          const active = p.a === sel.anchor;
          ctx.fillStyle = active ? "#fbbf24" : "#0b1e3f";
          ctx.strokeStyle = active ? "#fbbf24" : "#7dd3fc";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, ah / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // resize handle (bottom-right)
        const hs = Math.max(14, 16 / Math.max(0.001, size.w / virt.w));
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#0ea5e9";
        ctx.fillRect(r.x + r.w - hs / 2, r.y + r.h - hs / 2, hs, hs);
        ctx.strokeRect(r.x + r.w - hs / 2 + 0.5, r.y + r.h - hs / 2 + 0.5, hs - 1, hs - 1);
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [scene, ui, sel, selIds, size, virt]);

  const updateEl = (id: string, patch: Partial<UIElement>) => {
    onChange({ ...scene, ui: ui.map(e => e.id === id ? { ...e, ...patch } : e) });
  };
  const updateMany = (patches: Array<{ id: string; patch: Partial<UIElement> }>) => {
    const map = new Map(patches.map(p => [p.id, p.patch] as const));
    onChange({ ...scene, ui: ui.map(e => map.has(e.id) ? { ...e, ...map.get(e.id)! } : e) });
  };
  const scheduleDragUpdate = (patches: Array<{ id: string; patch: Partial<UIElement> }>) => {
    pendingDragUpdate.current = patches;
    if (moveFrame.current) return;
    moveFrame.current = requestAnimationFrame(() => {
      moveFrame.current = 0;
      const next = pendingDragUpdate.current;
      pendingDragUpdate.current = null;
      if (next) updateMany(next);
    });
  };

  const addEl = (kind: UIElementKind) => {
    const el = newUIElement(kind);
    onChange({ ...scene, ui: [...ui, el] });
    setSelIds([el.id]);
  };

  const removeEl = (id: string) => {
    onChange({ ...scene, ui: ui.filter(e => e.id !== id) });
    setSelIds(ids => ids.filter(i => i !== id));
  };

  const cloneEl = (id: string) => {
    const e = ui.find(x => x.id === id); if (!e) return;
    const copy: UIElement = { ...e, id: uid(), x: e.x + 12, y: e.y + 12 };
    onChange({ ...scene, ui: [...ui, copy] });
    setSelIds([copy.id]);
  };

  // Change element's anchor while keeping its absolute on-screen position.
  const setAnchorKeepPos = (el: UIElement, newAnchor: UIAnchor) => {
    const r = resolveUIRect(el, virt.w, virt.h);
    const tmp = { ...el, anchor: newAnchor, x: 0, y: 0 };
    const base = resolveUIRect(tmp, virt.w, virt.h);
    updateEl(el.id, { anchor: newAnchor, x: Math.round(r.x - base.x), y: Math.round(r.y - base.y) });
  };

  const toggleSelect = (id: string) => {
    setSelIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };

  const toVirt = (ev: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = (ev.clientX - rect.left) * (virt.w / Math.max(1, rect.width));
    const sy = (ev.clientY - rect.top) * (virt.h / Math.max(1, rect.height));
    return { sx, sy };
  };

  // anchor reference point on screen
  const anchorScreenPoint = (a: UIAnchor, W: number, H: number) => {
    let ax = 0, ay = 0;
    if (a === "c") return { x: W / 2, y: H / 2 };
    if (a[0] === "t") ay = 0; else if (a[0] === "c") ay = H / 2; else ay = H;
    if (a[1] === "l") ax = 0; else if (a[1] === "c") ax = W / 2; else ax = W;
    return { x: ax, y: ay };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    try { (ev.currentTarget as Element).setPointerCapture(ev.pointerId); } catch {}
    const { sx, sy } = toVirt(ev);
    const grab = Math.max(18, 20 / Math.max(0.001, size.w / virt.w));

    // resize handle hit (single selection only)
    if (sel) {
      const r = resolveUIRect(sel, virt.w, virt.h);
      if (sx >= r.x + r.w - grab && sx <= r.x + r.w + grab && sy >= r.y + r.h - grab && sy <= r.y + r.h + grab) {
        const orig = { [sel.id]: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } };
        dragRef.current = { ids: [sel.id], mode: "resize", sx, sy, orig };
        return;
      }
      // anchor preset dots around element — 9 small dots
      const corners: { a: UIAnchor; x: number; y: number }[] = [
        { a: "tl", x: r.x, y: r.y }, { a: "tc", x: r.x + r.w / 2, y: r.y }, { a: "tr", x: r.x + r.w, y: r.y },
        { a: "cl", x: r.x, y: r.y + r.h / 2 }, { a: "c", x: r.x + r.w / 2, y: r.y + r.h / 2 }, { a: "cr", x: r.x + r.w, y: r.y + r.h / 2 },
        { a: "bl", x: r.x, y: r.y + r.h }, { a: "bc", x: r.x + r.w / 2, y: r.y + r.h }, { a: "br", x: r.x + r.w, y: r.y + r.h },
      ];
      for (const c of corners) {
        if (Math.abs(sx - c.x) < grab * 0.7 && Math.abs(sy - c.y) < grab * 0.7) {
          setAnchorKeepPos(sel, c.a);
          return;
        }
      }
    }

    for (let i = ui.length - 1; i >= 0; i--) {
      const el = ui[i];
      const r = resolveUIRect(el, virt.w, virt.h);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        let ids: string[];
        if (multiMode) {
          ids = selIds.includes(el.id) ? selIds.filter(i => i !== el.id) : [...selIds, el.id];
        } else {
          ids = selIds.includes(el.id) ? selIds : [el.id];
        }
        setSelIds(ids);
        const dragIds = ids.length > 0 ? ids : [el.id];
        const orig: Record<string, { x: number; y: number; w: number; h: number }> = {};
        for (const id of dragIds) {
          const e2 = ui.find(u => u.id === id); if (!e2) continue;
          orig[id] = { x: e2.x, y: e2.y, w: e2.w, h: e2.h };
        }
        dragRef.current = { ids: dragIds, mode: "move", sx, sy, orig };
        return;
      }
    }
    if (!multiMode) setSelIds([]);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const { sx, sy } = toVirt(ev);
    const dx = sx - d.sx, dy = sy - d.sy;
    if (d.mode === "move") {
      scheduleDragUpdate(d.ids.map(id => ({ id, patch: { x: Math.round(d.orig[id].x + dx), y: Math.round(d.orig[id].y + dy) } })));
    } else {
      const id = d.ids[0];
      const o = d.orig[id];
      scheduleDragUpdate([{ id, patch: { w: Math.max(16, Math.round(o.w + dx)), h: Math.max(16, Math.round(o.h + dy)) } }]);
    }
  };
  const onPointerUp = () => { dragRef.current = null; };

  const sheetH = sheetHeightFor(snap);
  const fullSheetH = sheetHeightFor("full");
  const upwardDrag = Math.max(0, -sheetDragOffset);
  const downwardDrag = Math.max(0, sheetDragOffset);
  const activeSheetH = Math.min(fullSheetH, sheetH + upwardDrag);
  const sheetTranslate = Math.min(Math.max(0, sheetH - 60), downwardDrag);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Toolbar — barra superior M3; en columna para que el canvas no la tape */}
      <div className="relative z-30 shrink-0 px-3 pt-3">
        <div className="glass rounded-2xl px-2 py-1.5">
          {/* Envuelve en varias filas: en móvil ningún atajo quedaba fuera
              de la pantalla (antes se cortaban STICK y LIMPIAR). */}
          <div className="flex flex-wrap gap-1.5 py-1.5">
            {KIND_LIST.map(k => (
              <button key={k.id} onClick={() => addEl(k.id)}
                className="glass-btn flex shrink-0 flex-col items-center justify-center gap-0.5 min-w-[58px] px-2 py-2 rounded-xl text-foreground/85 active:scale-[0.92] hover:text-primary-glow sm:min-w-[62px] sm:px-3">
                <span className="text-base leading-none">{k.icon}</span>
                <span className="text-[9px] font-display tracking-wider">{k.label}</span>
              </button>
            ))}
            <button onClick={() => { setMultiMode(m => !m); if (multiMode) setSelIds([]); }}
              className={`glass-btn flex shrink-0 flex-col items-center justify-center gap-0.5 min-w-[58px] px-2 py-2 rounded-xl active:scale-[0.92] sm:min-w-[62px] sm:px-3 ${multiMode ? "text-primary-glow ring-1 ring-primary/60" : "text-foreground/85"}`}>
              <span className="text-base leading-none">{multiMode ? "☑" : "☐"}</span>
              <span className="text-[9px] font-display tracking-wider">MULTI</span>
            </button>
            <button onClick={() => { if (confirm("¿Limpiar toda la UI?")) { onChange({ ...scene, ui: [] }); setSelIds([]); } }}
              className="glass-btn flex shrink-0 flex-col items-center justify-center gap-0.5 min-w-[58px] px-2 py-2 rounded-xl text-destructive active:scale-[0.92] sm:min-w-[62px] sm:px-3">
              <span className="text-base leading-none">✕</span>
              <span className="text-[9px] font-display tracking-wider">LIMPIAR</span>
            </button>
          </div>
        </div>
      </div>


      {/* Preview canvas — square edges, fills entire surface */}
      <div ref={wrapRef} className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center"
        style={{ paddingTop: 8, paddingBottom: sheetH + 8 }}>
        <div className="relative border border-line shadow-[var(--m3-elev-1)] overflow-hidden bg-black"
          style={{ width: size.w, height: size.h }}>
          <canvas
            ref={canvasRef}
            className="block touch-none select-none"
            style={{
              width: size.w,
              height: size.h,
              touchAction: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div className="absolute top-2 left-3 panel rounded-md px-1.5 py-0.5 text-[9px] font-mono text-primary-glow pointer-events-none">
          UI·{ui.length}·{virt.w}×{virt.h}
        </div>
      </div>

      {/* Backdrop when sheet is expanded */}
      {sel && snap === "full" && (
        <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setSnap("half")} />
      )}

      {/* Bottom sheet */}
      <div ref={sheetRef}
        className="absolute left-0 right-0 bottom-0 z-50 rounded-t-2xl border-t border-x border-border/50 bg-card/95 backdrop-blur-2xl shadow-[0_-12px_36px_oklch(0_0_0/0.5)] flex flex-col"
        style={{
          height: activeSheetH,
          transform: `translateY(${sheetTranslate}px)`,
          transition: sheetDragRef.current ? "none" : "transform 240ms cubic-bezier(0.32, 0.72, 0, 1), height 240ms cubic-bezier(0.32, 0.72, 0, 1)",
          WebkitBackdropFilter: "blur(24px)",
          paddingBottom: "env(safe-area-inset-bottom)",
          willChange: "transform, height",
        }}>
        {/* Drag handle */}
        <div
          className="shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
          style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: "none" }}
          onPointerDown={onSheetHandleDown}
          onPointerMove={onSheetHandleMove}
          onPointerUp={onSheetHandleUp}
          onPointerCancel={onSheetHandleUp}>
          <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
          {selectedEls.length === 1 && sel && (
            <div className="mt-1.5 flex items-center justify-between w-full px-3">
              <span className="font-display text-[11px] tracking-[0.22em] text-primary-glow truncate">{sel.kind.toUpperCase()} · {sel.name}</span>
              <div className="flex items-center gap-1">
                {(["peek","half","full"] as Snap[]).map(s => (
                  <button key={s} onClick={() => setSnap(s)}
                    className={`w-1.5 h-1.5 rounded-full ${snap === s ? "bg-primary-glow" : "bg-muted-foreground/30"}`} />
                ))}
                <button onClick={() => setSelIds([])} className="ml-2 text-[10px] font-display tracking-widest text-muted-foreground px-2 py-0.5 rounded border border-border">✕</button>
              </div>
            </div>
          )}
          {selectedEls.length > 1 && (
            <div className="mt-1.5 flex items-center justify-between w-full px-3">
              <span className="font-display text-[11px] tracking-[0.22em] text-primary-glow truncate">{selectedEls.length} SELECCIONADOS · EDICIÓN MÚLTIPLE</span>
              <button onClick={() => setSelIds([])} className="text-[10px] font-display tracking-widest text-muted-foreground px-2 py-0.5 rounded border border-border">✕</button>
            </div>
          )}
          {selectedEls.length === 0 && ui.length > 0 && (
            <span className="mt-0.5 font-display text-[10px] tracking-[0.2em] text-muted-foreground">
              {ui.length} ELEMENTO{ui.length > 1 ? "S" : ""} · {multiMode ? "TOCA PARA MULTI-SELECCIÓN" : "TOCA PARA EDITAR"}
            </span>
          )}
          {selectedEls.length === 0 && ui.length === 0 && (
            <span className="mt-0.5 font-display text-[10px] tracking-[0.2em] text-muted-foreground">
              AÑADE UN COMPONENTE ARRIBA
            </span>
          )}
        </div>

        {/* Sheet content */}
        <div ref={inspectorRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" } as React.CSSProperties}>
          {selectedEls.length === 0 ? (
            ui.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {ui.map(e => (
                  <button key={e.id} onClick={() => multiMode ? toggleSelect(e.id) : setSelIds([e.id])}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/60 bg-background/40 text-left active:scale-[0.98] hover:border-primary/50 transition">
                    <span className="text-primary-glow text-sm">{KIND_LIST.find(k => k.id === e.kind)?.icon ?? "·"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-display tracking-widest text-muted-foreground">{e.kind.toUpperCase()}</div>
                      <div className="text-xs font-mono text-foreground truncate">{e.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : selectedEls.length === 1 && sel ? (
            <ElementInspector key={sel.id} el={sel} update={(p) => updateEl(sel.id, p)} remove={() => removeEl(sel.id)} clone={() => cloneEl(sel.id)} />
          ) : (
            <MultiInspector
              els={selectedEls}
              applyDelta={(dx, dy) => updateMany(selectedEls.map(e => ({ id: e.id, patch: { x: e.x + dx, y: e.y + dy } })))}
              setSize={(w, h) => updateMany(selectedEls.map(e => ({ id: e.id, patch: { ...(w != null ? { w } : {}), ...(h != null ? { h } : {}) } })))}
              setVisible={(v) => updateMany(selectedEls.map(e => ({ id: e.id, patch: { visible: v } })))}
              alignAnchor={(a) => selectedEls.forEach(e => setAnchorKeepPos(e, a))}
              removeAll={() => { onChange({ ...scene, ui: ui.filter(e => !selSet.has(e.id)) }); setSelIds([]); }}
              cloneAll={() => {
                const copies = selectedEls.map(e => ({ ...e, id: uid(), x: e.x + 12, y: e.y + 12 }));
                onChange({ ...scene, ui: [...ui, ...copies] });
                setSelIds(copies.map(c => c.id));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ElementInspector({ el, update, remove, clone }: {
  el: UIElement;
  update: (p: Partial<UIElement>) => void;
  remove: () => void;
  clone: () => void;
}) {

  const fileRef = useRef<HTMLInputElement>(null);
  /** Editor de eventos del elemento (se abre a pantalla completa). */
  const [scriptsOpen, setScriptsOpen] = useState(false);
  /** Anade un script listo para el momento indicado y abre el editor. */
  const addScript = (event: EventType) => {
    update({ scripts: [...(el.scripts ?? []), { id: uid(), event, blocks: [] } as Script] });
    setScriptsOpen(true);
  };
  return (
    <div className="space-y-2.5 pt-2">
      <LabeledInput label="NOMBRE" value={el.name} onChange={v => update({ name: v })} />


      <div>
        <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1">ANCLAJE</div>
        <div className="grid grid-cols-9 gap-1">
          {ANCHORS.map(a => (
            <button key={a} onClick={() => update({ anchor: a })}
              className={`h-8 rounded-lg text-[10px] font-mono border transition-all active:scale-[0.94] ${el.anchor === a ? "border-transparent bg-secondary text-secondary-foreground" : "border-line bg-muted text-ink-2 m3-state"}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <NumInput label="X" value={el.x} onChange={v => update({ x: v })} />
        <NumInput label="Y" value={el.y} onChange={v => update({ y: v })} />
        <NumInput label="W" value={el.w} onChange={v => update({ w: v })} />
        <NumInput label="H" value={el.h} onChange={v => update({ h: v })} />
      </div>


      {(el.kind === "button" || el.kind === "label" || el.kind === "panel") && (
        <LabeledInput label="TEXTO" value={el.text ?? ""} onChange={v => update({ text: v })} />
      )}

      {(el.kind === "button" || el.kind === "label") && (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="TAMAÑO FUENTE" value={el.fontSize ?? 14} onChange={v => update({ fontSize: v })} />
          <ColorInput label="COLOR TEXTO" value={el.color ?? "#ffffff"} onChange={v => update({ color: v })} />
        </div>
      )}

      {el.kind !== "label" && (
        <div className="grid grid-cols-2 gap-2">
          <ColorInput label="FONDO" value={el.bg ?? "#0ea5e9"} onChange={v => update({ bg: v })} />
          <ColorInput label="BORDE" value={el.border ?? "#7dd3fc"} onChange={v => update({ border: v })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumInput label="RADIO" value={el.radius ?? 0} onChange={v => update({ radius: v })} />
        <NumInput label="OPACIDAD %" value={Math.round((el.opacity ?? 1) * 100)} onChange={v => update({ opacity: Math.max(0, Math.min(1, v / 100)) })} />
      </div>

      {el.kind === "image" && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">IMAGEN</div>
          <div className="flex items-center gap-2">
            {el.image && (
              <img
                src={el.image}
                alt=""
                className="w-12 h-12 rounded border border-border object-contain"
                style={{ backgroundColor: "#e5e7eb", backgroundImage: "linear-gradient(45deg,#9ca3af 25%,transparent 25%),linear-gradient(-45deg,#9ca3af 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#9ca3af 75%),linear-gradient(-45deg,transparent 75%,#9ca3af 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0", imageRendering: "auto" }}
              />
            )}
            <button onClick={() => fileRef.current?.click()} className="flex-1 py-2 rounded-xl border border-primary/50 bg-primary/15 text-primary-glow text-[10px] font-display tracking-widest active:scale-[0.96] transition">ELEGIR IMAGEN</button>
            {el.image && <button onClick={() => update({ image: null })} className="py-2 px-3 rounded-xl border border-line bg-muted text-ink-2 m3-state text-[10px] font-display active:scale-[0.96] transition">QUITAR</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const url = await fileToDataURL(f); update({ image: url }); e.target.value = ""; }} />
        </div>
      )}

      {el.kind === "button" && (
        <>
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">ACCIÓN</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {(["none","left","right","jump","restart","exit","event"] as UIAction[]).map(a => {
              const labels: Record<UIAction, string> = { none: "NINGUNA", left: "IZQ.", right: "DER.", jump: "SALTAR", restart: "REINICIAR", exit: "SALIR", event: "EVENTO" };
              return (
                <button key={a} onClick={() => update({ action: a })}
                  className={`py-1.5 rounded-lg text-[10px] font-display tracking-widest border transition active:scale-[0.94] ${(el.action ?? "none") === a ? "border-transparent bg-secondary text-secondary-foreground" : "border-line bg-muted text-ink-2 m3-state"}`}>
                  {labels[a]}
                </button>
              );
            })}
          </div>
          {el.action === "event" && (
            <LabeledInput label="NOMBRE DEL EVENTO" value={el.eventName ?? ""} onChange={v => update({ eventName: v })} />
          )}
        </>
      )}

      {(el.kind === "label" || el.kind === "bar") && (
        <>
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">VINCULAR DATO</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {(["none","score","lives","time"] as UIBind[]).map(b => {
              const labels: Record<UIBind, string> = { none: "NINGUNO", score: "PUNTOS", lives: "VIDAS", time: "TIEMPO" };
              return (
                <button key={b} onClick={() => update({ bind: b })}
                  className={`py-1.5 rounded-lg text-[10px] font-display tracking-widest border transition active:scale-[0.94] ${(el.bind ?? "none") === b ? "border-transparent bg-secondary text-secondary-foreground" : "border-line bg-muted text-ink-2 m3-state"}`}>
                  {labels[b]}
                </button>
              );
            })}
          </div>
          {el.kind === "bar" && (
            <NumInput label="VALOR MÁX." value={el.max ?? 100} onChange={v => update({ max: v })} />
          )}
        </>
      )}

      {/* Scripts del elemento: sus acciones y cuándo se ejecutan. */}
      <div className="pt-1.5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">SCRIPTS · EJECUCIÓN</div>
          <span className="text-[10px] font-mono text-muted-foreground">{el.scripts?.length ?? 0} SCRIPTS</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {EXECUTION_CHIPS.map(c => (
            <button key={c.event} onClick={() => addScript(c.event)}
              className="py-1.5 rounded-lg text-[10px] font-display tracking-widest border border-line bg-muted text-ink-2 m3-state active:scale-[0.94] transition">
              + {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setScriptsOpen(true)}
          className="w-full mt-1.5 px-3 py-2.5 rounded-md bg-primary/10 border border-accent/50 text-primary-glow font-display text-xs tracking-widest flex items-center justify-between glow-border"
        >
          <span>◉ EVENTS · BLOCKS</span>
          <span className="font-mono text-[10px] opacity-80">{el.scripts?.length ?? 0} SCRIPTS</span>
        </button>
        <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
          {el.kind === "button"
            ? "Se suman a la acción del botón: "
            : "Este elemento ejecuta sus propios scripts: "}
          cada script corre al pulsar, mientras se mantiene o al soltar el elemento.
        </p>
      </div>

      {scriptsOpen && (
        <ScriptEditor
          scripts={el.scripts}
          ownerLabel={`${el.kind.toUpperCase()} · ${el.name || "elemento"}`}
          aiTargetKind={`UI ${el.kind}`}
          aiSummary={`Elemento de interfaz ${el.kind} «${el.name}» en ${Math.round(el.x)},${Math.round(el.y)} ${el.w}x${el.h}.`}
          events={UI_EVENTS}
          onChange={(patch: { scripts: Script[] }) => update(patch)}
          onClose={() => setScriptsOpen(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-1.5 pt-2 sm:grid-cols-3">
        <button onClick={clone} className="min-w-0 py-2 px-1 rounded-xl border border-primary/50 bg-primary/15 text-primary-glow font-display text-[10px] tracking-wide truncate active:scale-[0.96] transition">⧉ CLONAR</button>
        <button onClick={() => update({ visible: !(el.visible ?? true) })} className="min-w-0 py-2 px-1 rounded-xl border border-line bg-muted text-ink-2 m3-state font-display text-[10px] tracking-wide truncate active:scale-[0.96] transition">
          {el.visible === false ? "MOSTRAR" : "OCULTAR"}
        </button>
        <button onClick={remove} className="col-span-2 min-w-0 py-2 px-1 rounded-xl border border-destructive/50 bg-destructive/20 text-destructive font-display text-[10px] tracking-wide truncate sm:col-span-1 active:scale-[0.96] transition">✕ BORRAR</button>
      </div>
    </div>
  );
}


function MultiInspector({ els, applyDelta, setSize, setVisible, alignAnchor, removeAll, cloneAll }: {
  els: UIElement[];
  applyDelta: (dx: number, dy: number) => void;
  setSize: (w: number | null, h: number | null) => void;
  setVisible: (v: boolean) => void;
  alignAnchor: (a: UIAnchor) => void;
  removeAll: () => void;
  cloneAll: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [bw, setBw] = useState<string>("");
  const [bh, setBh] = useState<string>("");
  const allVisible = els.every(e => e.visible !== false);
  return (
    <div className="space-y-3 pt-2">
      <div className="rounded-lg border border-border/50 bg-background/40 p-2">
        <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1.5">SELECCIONADOS · {els.length}</div>
        <div className="flex flex-wrap gap-1">
          {els.map(e => (
            <span key={e.id} className="px-2 py-0.5 rounded border border-primary/40 bg-primary/10 text-[10px] font-mono text-primary-glow">
              {e.kind}·{e.name}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1">MOVER (Δ)</div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
          <NumInput label="ΔX" value={dx} onChange={setDx} />
          <NumInput label="ΔY" value={dy} onChange={setDy} />
          <button onClick={() => { applyDelta(dx, dy); setDx(0); setDy(0); }}
            className="h-9 px-3 rounded-xl border border-primary/50 bg-primary/20 text-primary-glow text-[10px] font-display tracking-widest active:scale-[0.96] transition">APLICAR</button>
        </div>
        <div className="grid grid-cols-4 gap-1 mt-1.5">
          {([["←",-8,0],["→",8,0],["↑",0,-8],["↓",0,8]] as const).map(([s, x, y]) => (
            <button key={s} onClick={() => applyDelta(x, y)}
              className="py-1.5 rounded-lg border border-line bg-muted text-ink-2 m3-state text-sm active:scale-[0.94] transition">{s}</button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1">DEFINIR TAMAÑO</div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
          <div>
            <div className="text-[10px] font-display tracking-widest text-muted-foreground">W</div>
            <input type="number" value={bw} placeholder="—" onChange={e => setBw(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded bg-input/60 border border-border text-xs font-mono focus:outline-none focus:border-primary" />
          </div>
          <div>
            <div className="text-[10px] font-display tracking-widest text-muted-foreground">H</div>
            <input type="number" value={bh} placeholder="—" onChange={e => setBh(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded bg-input/60 border border-border text-xs font-mono focus:outline-none focus:border-primary" />
          </div>
          <button onClick={() => { setSize(bw ? Number(bw) : null, bh ? Number(bh) : null); setBw(""); setBh(""); }}
            className="h-9 px-3 rounded-xl border border-primary/50 bg-primary/20 text-primary-glow text-[10px] font-display tracking-widest active:scale-[0.96] transition">APLICAR</button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1">ANCLAR TODO A</div>
        <div className="grid grid-cols-9 gap-1">
          {ANCHORS.map(a => (
            <button key={a} onClick={() => alignAnchor(a)}
              className="h-8 rounded-lg text-[10px] font-mono border border-line bg-muted text-ink-2 m3-state hover:text-primary-glow active:scale-[0.94] transition">
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => setVisible(!allVisible)}
          className="py-2 rounded-xl border border-line bg-muted text-ink-2 m3-state font-display text-[10px] tracking-wide active:scale-[0.96] transition">
          {allVisible ? "OCULTAR" : "MOSTRAR"}
        </button>
        <button onClick={cloneAll}
          className="py-2 rounded-xl border border-primary/50 bg-primary/15 text-primary-glow font-display text-[10px] tracking-wide active:scale-[0.96] transition">⧉ CLONAR</button>
        <button onClick={removeAll}
          className="py-2 rounded-xl border border-destructive/50 bg-destructive/20 text-destructive font-display text-[10px] tracking-wide active:scale-[0.96] transition">✕ BORRAR</button>
      </div>
    </div>
  );
}


function LabeledInput({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  // Use a locally-managed value so iOS Safari doesn't bounce the caret on every
  // controlled re-render (which made it feel like text could only be set once).
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current && local !== value) setLocal(value); }, [value]);
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{label}</div>
      <input
        value={local}
        autoFocus={autoFocus}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; if (local !== value) onChange(local); }}
        onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
        className="w-full mt-1 px-2 py-1.5 rounded bg-input/60 border border-border text-xs font-mono focus:outline-none focus:border-primary"
      />
    </div>
  );
}
function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{label}</div>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full mt-1 px-2 py-1.5 rounded bg-input/60 border border-border text-xs font-mono focus:outline-none focus:border-primary" />
    </div>
  );
}
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{label}</div>
      <input type="color" value={hexOf(value)} onChange={e => onChange(e.target.value)}
        className="w-full h-9 mt-1 rounded border border-border bg-transparent" />
    </div>
  );
}
function hexOf(v: string): string {
  if (v.startsWith("#")) return v.slice(0, 7);
  return "#0ea5e9";
}

// ---- shared drawing (used by editor preview and runtime) ----
export function drawUIElement(ctx: CanvasRenderingContext2D, el: UIElement, W: number, H: number, tick: number, state?: { score: number; lives: number; time: number; timeLimit?: number }) {
  const r = resolveUIRect(el, W, H);
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  const radius = el.radius ?? 8;
  const path = () => roundRectPath(ctx, r.x, r.y, r.w, r.h, Math.min(radius, Math.min(r.w, r.h) / 2));

  if (el.kind === "image" && el.image) {
    const img = getRenderableImage(el.image);
    if (img) {
      ctx.save(); path(); ctx.clip();
      drawTransparencyGrid(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(125,211,252,0.15)"; path(); ctx.fill();
    }
  } else if (el.kind === "bar") {
    // bg
    ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.6)"; path(); ctx.fill();
    // value
    let v = 1;
    if (state && el.bind && el.bind !== "none") {
      const max = el.max && el.max > 0
        ? el.max
        : (el.bind === "lives" ? Math.max(1, state.lives) : 100);
      let cur = 0;
      if (el.bind === "score") cur = state.score;
      else if (el.bind === "lives") cur = state.lives;
      else if (el.bind === "time") cur = state.timeLimit ? Math.max(0, state.timeLimit - state.time) : state.time;
      v = Math.max(0, Math.min(1, cur / Math.max(1, max)));
    }
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = el.color ?? "#22c55e";
    ctx.fillRect(r.x, r.y, r.w * v, r.h);
    ctx.restore();
    if (el.border) { ctx.lineWidth = 1; ctx.strokeStyle = el.border; path(); ctx.stroke(); }
  } else if (el.kind === "joystick") {
    const rad = Math.min(r.w, r.h) / 2;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // Single base ring — no double circle.
    ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.4)";
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = el.color ?? "#7dd3fc";
    ctx.globalAlpha = (el.opacity ?? 1) * 0.7;
    // animated knob preview so it looks alive in the editor
    const ang = (tick * 0.04);
    const off = rad / 3;
    const kx = cx + Math.cos(ang) * off * (state ? 0 : 1);
    const ky = cy + Math.sin(ang) * off * (state ? 0 : 1);
    ctx.beginPath(); ctx.arc(kx, ky, rad / 2.2, 0, Math.PI * 2); ctx.fill();
  } else if (el.kind === "label") {
    let text = el.text ?? "";
    if (state && el.bind && el.bind !== "none") {
      if (el.bind === "score") text = text.replace(/\{v\}/g, String(state.score)) || `SCORE: ${state.score}`;
      else if (el.bind === "lives") text = text.replace(/\{v\}/g, String(state.lives)) || `♥ ${state.lives}`;
      else if (el.bind === "time") {
        const t = state.timeLimit ? Math.max(0, Math.ceil(state.timeLimit - state.time)) : Math.floor(state.time);
        text = text.replace(/\{v\}/g, String(t)) || `⏱ ${t}`;
      }
    }
    ctx.fillStyle = el.color ?? "#7dd3fc";
    ctx.font = `600 ${el.fontSize ?? 14}px Rajdhani, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, r.x, r.y + r.h / 2);
  } else {
    // button / panel
    ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.6)";
    path(); ctx.fill();
    if (el.border) { ctx.lineWidth = 1.5; ctx.strokeStyle = el.border; path(); ctx.stroke(); }
    if (el.text) {
      ctx.fillStyle = el.color ?? "#ffffff";
      ctx.font = `700 ${el.fontSize ?? 14}px Rajdhani, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(el.text, r.x + r.w / 2, r.y + r.h / 2);
      ctx.textAlign = "start";
    }
  }

  // subtle pulse for buttons
  if (el.kind === "button" && (el.action === "jump" || el.action === "restart")) {
    const pulse = (Math.sin(tick * 0.05) + 1) / 2 * 0.4 + 0.6;
    ctx.globalAlpha = (el.opacity ?? 1) * pulse * 0.3;
    ctx.strokeStyle = el.border ?? "#7dd3fc";
    ctx.lineWidth = 2;
    path(); ctx.stroke();
  }

  ctx.restore();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
