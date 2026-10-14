import { useEffect, useRef, useState, useCallback } from "react";
import type { Entity, EntityKind, Scene } from "@/lib/engine/core";
import {
  KIND_PRESETS, uid, sortedForRender, isOnHiddenLayer, layerOpacityFor, isPlayerEntity,
  duplicateEntityInScene, CLONE_OFFSET,
  childrenOf, entityById, removeEntityWithChildren, setEntityPosition,
} from "@/lib/engine/core";
import { canvasPixelSize, needsCanvasResize } from "@/lib/engine/canvas";
import { getRenderableImage } from "@/lib/engine/images";
import { currentFrameRenderable } from "@/lib/engine/animations";
import { drawChibiCharacter } from "@/lib/engine/character";

interface Props {
  scene: Scene;
  tool: EntityKind | "select" | "erase";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (scene: Scene) => void;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_PX = 14;
const SNAP_OPTIONS = [0, 8, 20, 40] as const;

function handlePos(e: Entity, h: HandleId) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  switch (h) {
    case "nw": return { x: e.x, y: e.y };
    case "n":  return { x: cx, y: e.y };
    case "ne": return { x: e.x + e.w, y: e.y };
    case "e":  return { x: e.x + e.w, y: cy };
    case "se": return { x: e.x + e.w, y: e.y + e.h };
    case "s":  return { x: cx, y: e.y + e.h };
    case "sw": return { x: e.x, y: e.y + e.h };
    case "w":  return { x: e.x, y: cy };
  }
}

function resizeEntity(e: Entity, h: HandleId, wx: number, wy: number, snap: number): Entity {
  const sn = (v: number) => snap > 0 ? Math.round(v / snap) * snap : Math.round(v);
  const minSize = Math.max(snap || 8, 8);
  let { x, y, w, h: he } = e;
  const right = x + w;
  const bottom = y + he;
  if (h.includes("w")) { const nx = Math.min(sn(wx), right - minSize); w = right - nx; x = nx; }
  if (h.includes("e")) { const nr = Math.max(sn(wx), x + minSize); w = nr - x; }
  if (h.includes("n")) { const ny = Math.min(sn(wy), bottom - minSize); he = bottom - ny; y = ny; }
  if (h.includes("s")) { const nb = Math.max(sn(wy), y + minSize); he = nb - y; }
  return { ...e, x, y, w, h: he };
}

export function SceneEditor({ scene, tool, selectedId, onSelect, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.55);
  const [snap, setSnap] = useState<number>(20);
  const animRef = useRef(0);

  // ---------- Undo / Redo history ----------
  const undoStack = useRef<Scene[]>([]);
  const redoStack = useRef<Scene[]>([]);
  const lastScene = useRef<Scene>(scene);
  const applyingHistory = useRef(false);
  const [, forceTick] = useState(0);
  const refreshUI = () => forceTick(t => t + 1);

  useEffect(() => {
    if (applyingHistory.current) {
      applyingHistory.current = false;
      lastScene.current = scene;
      return;
    }
    if (lastScene.current !== scene && lastScene.current.id === scene.id) {
      undoStack.current.push(lastScene.current);
      if (undoStack.current.length > 80) undoStack.current.shift();
      redoStack.current = [];
    }
    lastScene.current = scene;
  }, [scene]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(lastScene.current);
    applyingHistory.current = true;
    onChange(prev);
    refreshUI();
  }, [onChange]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(lastScene.current);
    applyingHistory.current = true;
    onChange(next);
    refreshUI();
  }, [onChange]);

  // ---------- Entity ops ----------
  const selected = scene.entities.find(e => e.id === selectedId) ?? null;

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    // Alineado a la rejilla cuando hay imán: la copia cae en una celda limpia.
    const result = duplicateEntityInScene(scene, selected.id, snap > 0 ? snap : CLONE_OFFSET);
    if (!result) return;
    onChange(result.scene);
    onSelect(result.cloneId);
  }, [selected, scene, snap, onChange, onSelect]);

  const deleteSelected = useCallback(() => {
    if (!selected || isPlayerEntity(selected)) return;
    // Borra la rama completa: un árbol a medias dejaría hijos sueltos. Se puede
    // deshacer con Ctrl+Z.
    onChange(removeEntityWithChildren(scene, selected.id));
    onSelect(null);
  }, [selected, scene, onChange, onSelect]);

  const bringToFront = useCallback(() => {
    if (!selected) return;
    const maxZ = scene.entities.reduce((m, e) => Math.max(m, e.z ?? 0), 0);
    onChange({
      ...scene,
      entities: scene.entities.map(e => e.id === selected.id ? { ...e, z: maxZ + 1 } : e),
    });
  }, [selected, scene, onChange]);

  const sendToBack = useCallback(() => {
    if (!selected) return;
    const minZ = scene.entities.reduce((m, e) => Math.min(m, e.z ?? 0), 0);
    onChange({
      ...scene,
      entities: scene.entities.map(e => e.id === selected.id ? { ...e, z: minZ - 1 } : e),
    });
  }, [selected, scene, onChange]);

  const flipH = useCallback(() => {
    if (!selected) return;
    onChange({
      ...scene,
      entities: scene.entities.map(e => e.id === selected.id ? { ...e, flipX: !e.flipX } : e),
    });
  }, [selected, scene, onChange]);

  const flipV = useCallback(() => {
    if (!selected) return;
    onChange({
      ...scene,
      entities: scene.entities.map(e => e.id === selected.id ? { ...e, flipY: !(e as Entity & { flipY?: boolean }).flipY } as Entity : e),
    });
  }, [selected, scene, onChange]);

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tgt = ev.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
      if (mod && (ev.key.toLowerCase() === "y" || (ev.key.toLowerCase() === "z" && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
      if (mod && ev.key.toLowerCase() === "d") { ev.preventDefault(); duplicateSelected(); return; }
      if (ev.key === "Delete" || ev.key === "Backspace") { if (selected) { ev.preventDefault(); deleteSelected(); } return; }
      if (ev.key === "]") { ev.preventDefault(); bringToFront(); return; }
      if (ev.key === "[") { ev.preventDefault(); sendToBack(); return; }
      if (ev.key.toLowerCase() === "h") { ev.preventDefault(); flipH(); return; }
      if (ev.key.toLowerCase() === "v") { ev.preventDefault(); flipV(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSelected, deleteSelected, bringToFront, sendToBack, flipH, flipV, selected]);

  // Pointer tracking
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{
    mode: "idle" | "pan" | "move" | "resize" | "place" | "pinch" | "hb-move" | "hb-resize";
    startSX?: number; startSY?: number;
    entStartX?: number; entStartY?: number; entStartW?: number; entStartH?: number;
    hbStartX?: number; hbStartY?: number; hbStartW?: number; hbStartH?: number;
    entId?: string;
    handle?: HandleId;
    panStart?: { x: number; y: number };
    pinchStartDist?: number;
    pinchStartScale?: number;
    pinchStartCenter?: { x: number; y: number };
    pinchStartPan?: { x: number; y: number };
  }>({ mode: "idle" });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w < 40 || h < 40) return;
      const s = Math.min(w / scene.width, h / scene.height) * 0.95;
      setScale(s);
      setPan({
        x: (w - scene.width * s) / 2,
        y: (h - scene.height * s) / 2,
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [scene.width, scene.height]);


  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let mounted = true;

    const hasAnimated = scene.entities.some(e => (e.animations ?? []).some(c => c.frames.length > 1 && c.fps > 0));
    const sortedEnts = sortedForRender(scene).filter(e => !isOnHiddenLayer(scene, e));
    const setupSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const next = canvasPixelSize(canvas.clientWidth, canvas.clientHeight, dpr);
      if (needsCanvasResize(canvas, next)) {
        canvas.width = next.width;
        canvas.height = next.height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    };

    const render = (t: number) => {
      if (!mounted) return;
      setupSize();
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      // Limpia en píxeles reales: con un tamaño CSS fraccionario, limpiar W×H
      // (CSS por el DPR) dejaba sin borrar la última columna o fila del bitmap.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(scale, scale);

      const grd = ctx.createLinearGradient(0, 0, 0, scene.height);
      grd.addColorStop(0, "#0b1e3f");
      grd.addColorStop(1, "#030712");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, scene.width, scene.height);

      // grid (uses current snap)
      const gridStep = snap > 0 ? Math.max(snap, 8) : 40;
      ctx.strokeStyle = "rgba(56,189,248,0.16)";
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (let x = 0; x <= scene.width; x += gridStep) { ctx.moveTo(x, 0); ctx.lineTo(x, scene.height); }
      for (let y = 0; y <= scene.height; y += gridStep) { ctx.moveTo(0, y); ctx.lineTo(scene.width, y); }
      ctx.stroke();
      ctx.strokeStyle = "rgba(125,211,252,0.6)";
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(0, 0, scene.width, scene.height);

      const tSec = t / 1000;
      for (const e of sortedEnts) {
        ctx.save();
        const la = layerOpacityFor(scene, e);
        const ea = (e.opacity ?? 1) * la;
        if (ea !== 1) ctx.globalAlpha = ea;
        const flipX = (e.facing === -1) !== !!e.flipX;
        const flipY = !!(e as Entity & { flipY?: boolean }).flipY;
        const rot = ((e.rotation ?? 0) * Math.PI) / 180;
        if (rot) {
          const cx = e.x + e.w / 2;
          const cy = e.y + e.h / 2;
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.translate(-cx, -cy);
        }
        ctx.translate(e.x + (flipX ? e.w : 0), e.y + (flipY ? e.h : 0));
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        const animImg = currentFrameRenderable(e, tSec, "idle");
        const drawFit = (img: HTMLImageElement | ImageBitmap) => {
          const fit = e.textureFit ?? "stretch";
          if (fit === "stretch") { ctx.drawImage(img, 0, 0, e.w, e.h); return; }
          const sa = img.width / img.height;
          const da = e.w / e.h;
          const cover = fit === "cover" ? sa > da : sa < da;
          const dw = cover ? e.h * sa : e.w;
          const dh = cover ? e.h : e.w / sa;
          ctx.drawImage(img, (e.w - dw) / 2, (e.h - dh) / 2, dw, dh);
        };
        if (animImg) {
          drawFit(animImg);
        } else if (e.texture) {
          const img = getRenderableImage(e.texture);
          if (img) drawFit(img);
          else { ctx.fillStyle = "rgba(56,189,248,0.15)"; ctx.fillRect(0, 0, e.w, e.h); }
        } else {
          // Match GameRuntime fallback shapes so editor preview == PLAY preview
          ctx.save();
          ctx.shadowColor = e.color;
          ctx.shadowBlur = e.kind === "coin" ? 10 : e.kind === "goal" ? 12 : 4;
          ctx.fillStyle = e.color;
          if (e.kind === "coin") {
            ctx.beginPath();
            ctx.arc(e.w / 2, e.h / 2, e.w / 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (e.kind === "goal") {
            ctx.fillStyle = "rgba(125,211,252,0.3)";
            ctx.fillRect(0, 0, e.w, e.h);
            ctx.fillStyle = e.color;
            ctx.fillRect(e.w / 2 - 2, 0, 4, e.h);
            ctx.beginPath();
            ctx.moveTo(e.w / 2 + 2, 4);
            ctx.lineTo(e.w / 2 + 22, 12);
            ctx.lineTo(e.w / 2 + 2, 20);
            ctx.closePath();
            ctx.fill();
          } else {
            const r = e.kind === "platform" ? 4 : 6;
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.arcTo(e.w, 0, e.w, e.h, r);
            ctx.arcTo(e.w, e.h, 0, e.h, r);
            ctx.arcTo(0, e.h, 0, 0, r);
            ctx.arcTo(0, 0, e.w, 0, r);
            ctx.closePath();
            ctx.fill();
            if (e.kind === "player") {
              ctx.shadowBlur = 0;
              // El contexto ya está espejado según `facing`, así que aquí va 1.
              drawChibiCharacter(ctx, 0, 0, e.w, e.h, e.color, 1);
            }
          }
          ctx.restore();
        }
        ctx.restore();
      }

      for (const e of scene.entities) {
        const hb = e.hitbox;
        if (!hb) continue;
        const isSel = e.id === selectedId;
        ctx.save();
        ctx.lineWidth = (isSel ? 2 : 1) / scale;
        ctx.strokeStyle = isSel ? "#f43f5e" : "rgba(244,63,94,0.55)";
        ctx.setLineDash([8 / scale, 6 / scale]);
        ctx.strokeRect(e.x + hb.x, e.y + hb.y, hb.w, hb.h);
        ctx.setLineDash([]);
        ctx.restore();
      }

      const sel = scene.entities.find(e => e.id === selectedId);
      if (sel) {
        ctx.restore();
        const sx = pan.x + sel.x * scale;
        const sy = pan.y + sel.y * scale;
        const sw = sel.w * scale;
        const sh = sel.h * scale;

        // Vínculos de jerarquía: con el objeto seleccionado se ven sus enlaces
        // (hacia el padre y hacia cada hijo) para no perderse en el árbol.
        const linked = [
          ...(sel.parentId ? [sel.parentId] : []),
          ...childrenOf(scene, sel.id).map(c => c.id),
        ];
        if (linked.length) {
          const selCx = pan.x + (sel.x + sel.w / 2) * scale;
          const selCy = pan.y + (sel.y + sel.h / 2) * scale;
          ctx.save();
          ctx.strokeStyle = "rgba(167,139,250,0.85)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          for (const id of linked) {
            const other = scene.entities.find(e => e.id === id);
            if (!other) continue;
            const ox = pan.x + (other.x + other.w / 2) * scale;
            const oy = pan.y + (other.y + other.h / 2) * scale;
            ctx.moveTo(selCx, selCy);
            ctx.lineTo(ox, oy);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          // Marca en el extremo de cada hijo enlazado.
          for (const id of linked) {
            const other = scene.entities.find(e => e.id === id);
            if (!other) continue;
            const ox = pan.x + (other.x + other.w / 2) * scale;
            const oy = pan.y + (other.y + other.h / 2) * scale;
            ctx.fillStyle = "#a78bfa";
            ctx.fillRect(ox - 3, oy - 3, 6, 6);
          }
          ctx.restore();
        }

        ctx.lineWidth = 1.25;
        ctx.strokeStyle = "#7dd3fc";
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);

        const label = sel.parentId
          ? `hijo · ${Math.round(sel.w)} × ${Math.round(sel.h)}`
          : `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = ctx.measureText(label).width + 10;
        const lx = sx + sw / 2 - tw / 2;
        const ly = sy - 22;
        ctx.fillStyle = "rgba(2,6,23,0.85)";
        ctx.strokeStyle = "rgba(125,211,252,0.7)";
        ctx.lineWidth = 1;
        roundRectPath(ctx, lx, ly, tw, 18, 4);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#7dd3fc";
        ctx.fillText(label, lx + 5, ly + 13);

        for (const h of HANDLES) {
          const wp = handlePos(sel, h);
          const hx = pan.x + wp.x * scale - HANDLE_PX / 2;
          const hy = pan.y + wp.y * scale - HANDLE_PX / 2;
          ctx.fillStyle = "#f8fafc";
          ctx.strokeStyle = "#0ea5e9";
          ctx.lineWidth = 1.5;
          ctx.fillRect(hx, hy, HANDLE_PX, HANDLE_PX);
          ctx.strokeRect(hx + 0.5, hy + 0.5, HANDLE_PX - 1, HANDLE_PX - 1);
        }

        // Hitbox handles (when selected entity has a hitbox)
        if (sel.hitbox) {
          const hb = sel.hitbox;
          const hbX = pan.x + (sel.x + hb.x) * scale;
          const hbY = pan.y + (sel.y + hb.y) * scale;
          const hbW = hb.w * scale;
          const hbH = hb.h * scale;
          // Glow fill to indicate draggable body
          ctx.fillStyle = "rgba(244,63,94,0.10)";
          ctx.fillRect(hbX, hbY, hbW, hbH);
          // Corner handles (smaller, pink)
          const HB_PX = 12;
          const corners: [HandleId, number, number][] = [
            ["nw", hbX, hbY],
            ["ne", hbX + hbW, hbY],
            ["sw", hbX, hbY + hbH],
            ["se", hbX + hbW, hbY + hbH],
          ];
          for (const [, cx, cy] of corners) {
            ctx.fillStyle = "#fda4af";
            ctx.strokeStyle = "#f43f5e";
            ctx.lineWidth = 1.5;
            ctx.fillRect(cx - HB_PX / 2, cy - HB_PX / 2, HB_PX, HB_PX);
            ctx.strokeRect(cx - HB_PX / 2 + 0.5, cy - HB_PX / 2 + 0.5, HB_PX - 1, HB_PX - 1);
          }
        }
      } else {
        ctx.restore();
      }

      if (hasAnimated) animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => { mounted = false; cancelAnimationFrame(animRef.current); };
  }, [scene, pan, scale, selectedId, snap]);

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - pan.x) / scale,
    y: (sy - pan.y) / scale,
  });

  const hitTest = (wx: number, wy: number) => {
    for (let i = scene.entities.length - 1; i >= 0; i--) {
      const e = scene.entities[i];
      if (e.locked) continue;
      if (e.visible === false) continue;
      if (wx >= e.x && wx <= e.x + e.w && wy >= e.y && wy <= e.y + e.h) return e;
    }
    return null;
  };

  const hitHandle = (sx: number, sy: number): HandleId | null => {
    const sel = scene.entities.find(e => e.id === selectedId);
    if (!sel) return null;
    for (const h of HANDLES) {
      const wp = handlePos(sel, h);
      const hx = pan.x + wp.x * scale;
      const hy = pan.y + wp.y * scale;
      if (Math.abs(sx - hx) <= HANDLE_PX && Math.abs(sy - hy) <= HANDLE_PX) return h;
    }
    return null;
  };

  const hitHbHandle = (sx: number, sy: number): "nw" | "ne" | "sw" | "se" | null => {
    const sel = scene.entities.find(e => e.id === selectedId);
    if (!sel || !sel.hitbox) return null;
    const hb = sel.hitbox;
    const hbX = pan.x + (sel.x + hb.x) * scale;
    const hbY = pan.y + (sel.y + hb.y) * scale;
    const hbW = hb.w * scale;
    const hbH = hb.h * scale;
    const HB_PX = 14;
    const corners: ["nw" | "ne" | "sw" | "se", number, number][] = [
      ["nw", hbX, hbY],
      ["ne", hbX + hbW, hbY],
      ["sw", hbX, hbY + hbH],
      ["se", hbX + hbW, hbY + hbH],
    ];
    for (const [name, cx, cy] of corners) {
      if (Math.abs(sx - cx) <= HB_PX && Math.abs(sy - cy) <= HB_PX) return name;
    }
    return null;
  };

  const hitHbBody = (sx: number, sy: number) => {
    const sel = scene.entities.find(e => e.id === selectedId);
    if (!sel || !sel.hitbox) return false;
    const hb = sel.hitbox;
    const hbX = pan.x + (sel.x + hb.x) * scale;
    const hbY = pan.y + (sel.y + hb.y) * scale;
    const hbW = hb.w * scale;
    const hbH = hb.h * scale;
    return sx >= hbX && sx <= hbX + hbW && sy >= hbY && sy <= hbY + hbH;
  };

  const getLocal = (ev: React.PointerEvent) => {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return { sx: ev.clientX - rect.left, sy: ev.clientY - rect.top };
  };

  const beginPinch = () => {
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    gesture.current = {
      mode: "pinch",
      pinchStartDist: dist,
      pinchStartScale: scale,
      pinchStartCenter: { x: cx, y: cy },
      pinchStartPan: { ...pan },
    };
  };

  const snapVal = (v: number) => snap > 0 ? Math.round(v / snap) * snap : Math.round(v);

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const { sx, sy } = getLocal(ev);
    pointers.current.set(ev.pointerId, { x: sx, y: sy });

    if (pointers.current.size >= 2) { beginPinch(); return; }

    const w = screenToWorld(sx, sy);

    const handle = hitHandle(sx, sy);
    if (handle && selectedId) {
      const ent = scene.entities.find(e => e.id === selectedId)!;
      gesture.current = {
        mode: "resize", handle, entId: ent.id,
        entStartX: ent.x, entStartY: ent.y, entStartW: ent.w, entStartH: ent.h,
        startSX: sx, startSY: sy,
      };
      return;
    }

    // Hitbox interactions (only when select tool active)
    if (tool === "select" && selectedId) {
      const hbHandle = hitHbHandle(sx, sy);
      const sel = scene.entities.find(e => e.id === selectedId);
      if (hbHandle && sel?.hitbox) {
        gesture.current = {
          mode: "hb-resize", handle: hbHandle, entId: sel.id,
          hbStartX: sel.hitbox.x, hbStartY: sel.hitbox.y,
          hbStartW: sel.hitbox.w, hbStartH: sel.hitbox.h,
          startSX: sx, startSY: sy,
        };
        return;
      }
      if (hitHbBody(sx, sy) && sel?.hitbox) {
        gesture.current = {
          mode: "hb-move", entId: sel.id,
          hbStartX: sel.hitbox.x, hbStartY: sel.hitbox.y,
          startSX: sx, startSY: sy,
        };
        return;
      }
    }


    if (tool === "select") {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        onSelect(hit.id);
        gesture.current = {
          mode: "move", entId: hit.id,
          entStartX: hit.x, entStartY: hit.y, startSX: sx, startSY: sy,
        };
      } else {
        onSelect(null);
        gesture.current = { mode: "pan", panStart: { ...pan }, startSX: sx, startSY: sy };
      }
    } else if (tool === "erase") {
      const hit = hitTest(w.x, w.y);
      if (hit && !isPlayerEntity(hit)) {
        // La goma también borra la rama del objeto tocado.
        onChange(removeEntityWithChildren(scene, hit.id));
      }
      gesture.current = { mode: "idle" };
    } else {
      const preset = KIND_PRESETS[tool];
      const ent: Entity = {
        ...preset,
        id: uid(),
        x: snapVal(w.x - preset.w / 2),
        y: snapVal(w.y - preset.h / 2),
      };
      let entities = scene.entities;
      // Solo puede haber un personaje jugable: el nuevo sustituye al anterior,
      // pero los dobles (tipo player sin mando) se quedan donde estén.
      if (tool === "player") entities = entities.filter(e => !isPlayerEntity(e));
      onChange({ ...scene, entities: [...entities, ent] });
      onSelect(ent.id);
      gesture.current = { mode: "idle" };
    }
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const { sx, sy } = getLocal(ev);
    if (!pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId, { x: sx, y: sy });

    const g = gesture.current;

    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const pts = Array.from(pointers.current.values());
      const [a, b] = pts;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const ratio = dist / (g.pinchStartDist || 1);
      const newScale = Math.max(0.15, Math.min(3, (g.pinchStartScale || 1) * ratio));
      const startC = g.pinchStartCenter!;
      const startPan = g.pinchStartPan!;
      const startScale = g.pinchStartScale!;
      const worldX = (startC.x - startPan.x) / startScale;
      const worldY = (startC.y - startPan.y) / startScale;
      setScale(newScale);
      setPan({ x: cx - worldX * newScale, y: cy - worldY * newScale });
      return;
    }

    if (g.mode === "pan" && g.panStart) {
      setPan({
        x: g.panStart.x + (sx - (g.startSX || 0)),
        y: g.panStart.y + (sy - (g.startSY || 0)),
      });
    } else if (g.mode === "move" && g.entId) {
      const dx = (sx - (g.startSX || 0)) / scale;
      const dy = (sy - (g.startSY || 0)) / scale;
      const target = entityById(scene, g.entId);
      if (!target) return;
      // Mover el padre arrastra a sus hijos; mover un hijo solo lo mueve a él y
      // lo mantiene dentro del padre (ver setEntityPosition en core.ts).
      onChange(setEntityPosition(
        scene,
        g.entId,
        snapVal((g.entStartX || 0) + dx),
        snapVal((g.entStartY || 0) + dy),
      ));
    } else if (g.mode === "resize" && g.entId && g.handle) {
      const w = screenToWorld(sx, sy);
      const entities = scene.entities.map(e => {
        if (e.id !== g.entId) return e;
        const base: Entity = { ...e, x: g.entStartX!, y: g.entStartY!, w: g.entStartW!, h: g.entStartH! };
        return resizeEntity(base, g.handle!, w.x, w.y, snap);
      });
      onChange({ ...scene, entities });
    } else if (g.mode === "hb-move" && g.entId) {
      const dx = (sx - (g.startSX || 0)) / scale;
      const dy = (sy - (g.startSY || 0)) / scale;
      const entities = scene.entities.map(e => {
        if (e.id !== g.entId || !e.hitbox) return e;
        return { ...e, hitbox: { ...e.hitbox, x: Math.round((g.hbStartX || 0) + dx), y: Math.round((g.hbStartY || 0) + dy) } };
      });
      onChange({ ...scene, entities });
    } else if (g.mode === "hb-resize" && g.entId && g.handle) {
      const dx = (sx - (g.startSX || 0)) / scale;
      const dy = (sy - (g.startSY || 0)) / scale;
      const entities = scene.entities.map(e => {
        if (e.id !== g.entId || !e.hitbox) return e;
        let x = g.hbStartX || 0;
        let y = g.hbStartY || 0;
        let w = g.hbStartW || 0;
        let h = g.hbStartH || 0;
        if (g.handle!.includes("w")) { x = x + dx; w = w - dx; }
        if (g.handle!.includes("e")) { w = w + dx; }
        if (g.handle!.includes("n")) { y = y + dy; h = h - dy; }
        if (g.handle!.includes("s")) { h = h + dy; }
        if (w < 4) { x = x + w - 4; w = 4; }
        if (h < 4) { y = y + h - 4; h = 4; }
        return { ...e, hitbox: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } };
      });
      onChange({ ...scene, entities });
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size < 2 && gesture.current.mode === "pinch") {
      gesture.current = { mode: "idle" };
    }
    if (pointers.current.size === 0) {
      gesture.current = { mode: "idle" };
    }
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden cyber-grid">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="absolute top-2 left-2 editor-fab-group rounded-full px-2.5 py-1 text-[10px] font-mono font-medium text-primary">
        {scene.width}×{scene.height} · {Math.round(scale * 100)}%
      </div>
    </div>
  );
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
