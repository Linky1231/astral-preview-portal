import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Pencil, Eraser, PaintBucket, Slash, Square, Circle, Pipette, Type, Move,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, Layers, Undo2, Redo2, Plus, Save, X,
  ChevronDown,
} from "lucide-react";
import type { SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";
import { STABILIZE_DEFAULT, STABILIZE_MAX, STABILIZE_MIN, stabilizePoint } from "@/lib/engine/paint-stabilizer";

type Tool = "brush" | "eraser" | "fill" | "line" | "rect" | "circle" | "picker" | "text" | "move";

interface PaintLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
}

const SIZE_OPTIONS = [128, 256, 512, 768, 1024];

const PALETTES: { name: string; colors: string[] }[] = [
  {
    name: "Neon",
    colors: [
      "#000000", "#1f2937", "#6b7280", "#f8fafc",
      "#ef4444", "#f97316", "#fbbf24", "#22c55e",
      "#06b6d4", "#38bdf8", "#3b82f6", "#8b5cf6",
      "#ec4899", "#7c2d12", "#fde68a", "#0ea5e9",
    ],
  },
  {
    name: "Pastel",
    colors: [
      "#ffffff", "#fde2e4", "#fad2e1", "#e2ece9",
      "#bee1e6", "#cddafd", "#dfe7fd", "#f0efeb",
      "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff",
      "#a0c4ff", "#bdb2ff", "#ffc6ff", "#fffffc",
    ],
  },
  {
    name: "Retro 8-bit",
    colors: [
      "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57",
      "#ffcd75", "#a7f070", "#38b764", "#257179",
      "#29366f", "#3b5dc9", "#41a6f6", "#73eff7",
      "#f4f4f4", "#94b0c2", "#566c86", "#333c57",
    ],
  },
  {
    name: "Earth",
    colors: [
      "#2d1b0e", "#5c3a1e", "#8b5a2b", "#c08552",
      "#dab49d", "#f3e9dc", "#606c38", "#283618",
      "#bc6c25", "#dda15e", "#fefae0", "#a98467",
      "#6f4518", "#3f2d20", "#b08968", "#ddb892",
    ],
  },
  {
    name: "Mono",
    colors: [
      "#000000", "#111111", "#222222", "#333333",
      "#444444", "#555555", "#666666", "#777777",
      "#888888", "#999999", "#aaaaaa", "#bbbbbb",
      "#cccccc", "#dddddd", "#eeeeee", "#ffffff",
    ],
  },
];

const FONTS = ["Rajdhani", "Orbitron", "JetBrains Mono", "Georgia", "Arial"];

interface Props {
  onSave: (sprite: SpriteAsset) => void;
  onClose: () => void;
}

export function GalleryCanvasPanel({ onSave, onClose }: Props) {
  const [size, setSize] = useState<number>(512);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#38bdf8");
  const [width, setWidth] = useState(6);
  const [name, setName] = useState("Mi obra");
  const [stabilizeLevel, setStabilizeLevel] = useState(STABILIZE_DEFAULT);
  const [pressureOn, setPressureOn] = useState(true);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const PALETTE = PALETTES[paletteIdx].colors;
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [layersOpen, setLayersOpen] = useState(false);

  // text overlay state
  const [textInput, setTextInput] = useState<{
    open: boolean; x: number; y: number; value: string; fontSize: number; font: string;
  } | null>(null);

  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---------- Layers ----------
  const makeLayerCanvas = (): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return c;
  };
  const [layers, setLayers] = useState<PaintLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const layersRef = useRef<PaintLayer[]>([]);
  const activeLayerIdRef = useRef("");
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);
  const activeLayer = () => layersRef.current.find(l => l.id === activeLayerIdRef.current) ?? null;

  const undoStack = useRef<{ layerId: string; dataUrl: string }[]>([]);
  const redoStack = useRef<{ layerId: string; dataUrl: string }[]>([]);
  const activePointerId = useRef<number | null>(null);
  const activePointers = useRef<Set<number>>(new Set());

  useEffect(() => {
    const buf = document.createElement("canvas");
    buf.width = size; buf.height = size;
    const bctx = buf.getContext("2d")!;
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bufferRef.current = buf;
    const initId = uid();
    const firstLayer: PaintLayer = { id: initId, name: "Capa 1", visible: true, locked: false, opacity: 1, canvas: makeLayerCanvas() };
    layersRef.current = [firstLayer];
    activeLayerIdRef.current = initId;
    setLayers([firstLayer]);
    setActiveLayerId(initId);
    recomposite();
    blit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const recomposite = () => {
    const buf = bufferRef.current; if (!buf) return;
    const c = buf.getContext("2d")!;
    c.clearRect(0, 0, size, size);
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      c.globalAlpha = Math.max(0, Math.min(1, l.opacity));
      c.drawImage(l.canvas, 0, 0);
    }
    c.globalAlpha = 1;
  };

  const pushSnapshot = () => {
    const layer = activeLayer(); if (!layer) return;
    undoStack.current.push({ layerId: layer.id, dataUrl: layer.canvas.toDataURL("image/png") });
    if (undoStack.current.length > 32) undoStack.current.shift();
    redoStack.current = [];
    setPreviewVersion(v => v + 1);
  };

  const displayScale = useRef<number>(1);
  const dragRect = useRef<DOMRect | null>(null);

  const blit = (preview?: (ctx: CanvasRenderingContext2D) => void) => {
    const c = canvasRef.current; const buf = bufferRef.current;
    if (!c || !buf) return;
    const ctx = c.getContext("2d")!;
    const W = c.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(W * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(buf, 0, 0, W, W);
    displayScale.current = W / size;
    if (preview) {
      ctx.save();
      ctx.scale(displayScale.current, displayScale.current);
      preview(ctx);
      ctx.restore();
    }
  };

  const strokeSegmentDisplay = (x0: number, y0: number, x1: number, y1: number, erase: boolean, w: number) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const s = displayScale.current || 1;
    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, w) * s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x0 * s, y0 * s);
    ctx.lineTo(x1 * s, y1 * s);
    ctx.stroke();
    ctx.restore();
  };

  const stampDotDisplay = (x: number, y: number, erase: boolean, w: number) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const s = displayScale.current || 1;
    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * s, y * s, Math.max(0.5, w / 2) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const getPos = (e: React.PointerEvent) => {
    const r = dragRect.current ?? canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * size,
      y: ((e.clientY - r.top) / r.height) * size,
    };
  };

  const drag = useRef<{
    active: boolean; tool: Tool;
    last: { x: number; y: number };
    start: { x: number; y: number };
    smooth: { x: number; y: number };
    moveSnap?: ImageData | null;
  }>({ active: false, tool: "brush", last: { x: 0, y: 0 }, start: { x: 0, y: 0 }, smooth: { x: 0, y: 0 }, moveSnap: null });
  const bctx = (): CanvasRenderingContext2D => {
    const layer = activeLayer();
    if (!layer) return bufferRef.current!.getContext("2d")!;
    return layer.canvas.getContext("2d")!;
  };
  const isLayerEditable = () => {
    const l = activeLayer();
    return !!l && l.visible && !l.locked;
  };

  const strokeSegment = (x0: number, y0: number, x1: number, y1: number, erase: boolean, w?: number) => {
    const c = bctx();
    c.save();
    c.globalCompositeOperation = erase ? "destination-out" : "source-over";
    c.strokeStyle = color;
    c.lineWidth = Math.max(0.5, w ?? width);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.restore();
  };

  const stampDot = (x: number, y: number, erase: boolean, w?: number) => {
    const c = bctx();
    c.save();
    c.globalCompositeOperation = erase ? "destination-out" : "source-over";
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, (w ?? width) / 2), 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  const floodFill = (sx: number, sy: number, hex: string) => {
    const c = bctx();
    const img = c.getImageData(0, 0, size, size);
    const data = img.data;
    const W = size, H = size;
    const idx = (x: number, y: number) => (y * W + x) * 4;
    const startX = Math.floor(sx), startY = Math.floor(sy);
    if (startX < 0 || startY < 0 || startX >= W || startY >= H) return;
    const i0 = idx(startX, startY);
    const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
    const fr = parseInt(hex.slice(1, 3), 16);
    const fg = parseInt(hex.slice(3, 5), 16);
    const fb = parseInt(hex.slice(5, 7), 16);
    const TOL = 90 * 90;
    const TOL_A = 80;
    const matches = (i: number) => {
      const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb;
      const da = Math.abs(data[i + 3] - ta);
      return (dr * dr + dg * dg + db * db) <= TOL && da <= TOL_A;
    };
    if (data[i0] === fr && data[i0 + 1] === fg && data[i0 + 2] === fb && data[i0 + 3] === 255) return;
    const visited = new Uint8Array(W * H);
    const stack: number[] = [startX, startY];
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const vi = y * W + x;
      if (visited[vi]) continue;
      const i = vi * 4;
      if (!matches(i)) continue;
      visited[vi] = 1;
      data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    let mask = visited;
    for (let pass = 0; pass < 2; pass++) {
      const next = new Uint8Array(mask);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = y * W + x;
          if (mask[p]) continue;
          const up = y > 0 && mask[p - W];
          const dn = y < H - 1 && mask[p + W];
          const lf = x > 0 && mask[p - 1];
          const rt = x < W - 1 && mask[p + 1];
          if (up || dn || lf || rt) {
            next[p] = 1;
            const i = p * 4;
            data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
          }
        }
      }
      mask = next;
    }
    c.putImageData(img, 0, 0);
  };

  const drawPreviewShape = (ctx: CanvasRenderingContext2D, t: Tool, x0: number, y0: number, x1: number, y1: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    if (t === "line") {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else if (t === "rect") {
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (t === "circle") {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  const commitShape = (t: Tool, x0: number, y0: number, x1: number, y1: number) => {
    const c = bctx();
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    if (t === "line") {
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    } else if (t === "rect") {
      c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (t === "circle") {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  };

  const pickColorAt = (x: number, y: number) => {
    const buf = bufferRef.current; if (!buf) return;
    const c = buf.getContext("2d")!;
    const d = c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (d[3] === 0) return;
    const hex = "#" + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, "0")).join("");
    setColor(hex);
  };

  const cancelStroke = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const prev = undoStack.current[undoStack.current.length - 1];
    if (!prev) return;
    const layer = layersRef.current.find(l => l.id === prev.layerId);
    if (!layer) return;
    const img = new Image();
    img.onload = () => {
      const c = layer.canvas.getContext("2d")!;
      c.clearRect(0, 0, size, size);
      c.drawImage(img, 0, 0);
      recomposite(); blit();
    };
    img.src = prev.dataUrl;
  };

  const onDown = (e: React.PointerEvent) => {
    activePointers.current.add(e.pointerId);
    if (activePointers.current.size > 1) {
      cancelStroke();
      activePointerId.current = null;
      return;
    }
    activePointerId.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRect.current = canvasRef.current!.getBoundingClientRect();
    blit();
    const p = getPos(e);
    if (tool === "picker") { pickColorAt(p.x, p.y); dragRect.current = null; return; }
    if (tool === "text") {
      if (!isLayerEditable()) { dragRect.current = null; return; }
      setTextInput({ open: true, x: p.x, y: p.y, value: "", fontSize: Math.max(16, width * 4), font: "Rajdhani" });
      dragRect.current = null;
      return;
    }
    if (!isLayerEditable()) { dragRect.current = null; return; }
    pushSnapshot();
    drag.current = { active: true, tool, last: p, start: p, smooth: p, moveSnap: null };
    if (tool === "brush" || tool === "eraser") {
      const pr = pressureOn && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5;
      const w = width * (pressureOn ? (0.4 + 1.2 * pr) : 1);
      const erase = tool === "eraser";
      stampDot(p.x, p.y, erase, w);
      if (erase) { recomposite(); blit(); }
      else stampDotDisplay(p.x, p.y, erase, w);
    } else if (tool === "fill") {
      floodFill(p.x, p.y, color);
      recomposite(); blit();
    } else if (tool === "move") {
      const layer = activeLayer();
      if (layer) {
        const lc = layer.canvas.getContext("2d")!;
        drag.current.moveSnap = lc.getImageData(0, 0, size, size);
      }
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    if (activePointerId.current !== e.pointerId) return;
    if (activePointers.current.size > 1) { cancelStroke(); return; }
    const p = getPos(e);
    if (drag.current.tool === "brush" || drag.current.tool === "eraser") {
      const r = dragRect.current!;
      const events = (typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : []) as PointerEvent[];
      const points = events.length ? events.map(ev => ({
        x: ((ev.clientX - r.left) / r.width) * size,
        y: ((ev.clientY - r.top) / r.height) * size,
        pressure: ev.pressure,
      })) : [{ x: p.x, y: p.y, pressure: e.pressure }];
      const erase = drag.current.tool === "eraser";
      for (const pt of points) {
        const pr = pressureOn && pt.pressure > 0 && pt.pressure !== 0.5 ? pt.pressure : 0.5;
        const w = width * (pressureOn ? (0.4 + 1.2 * pr) : 1);
        let x1 = pt.x, y1 = pt.y;
        if (stabilizeLevel > 0) {
          const smoothed = stabilizePoint(drag.current.last, pt, stabilizeLevel);
          x1 = smoothed.x;
          y1 = smoothed.y;
        }
        strokeSegment(drag.current.last.x, drag.current.last.y, x1, y1, erase, w);
        if (!erase) {
          strokeSegmentDisplay(drag.current.last.x, drag.current.last.y, x1, y1, erase, w);
        }
        drag.current.last = { x: x1, y: y1 };
      }
      if (erase) { recomposite(); blit(); }
    } else if (drag.current.tool === "line" || drag.current.tool === "rect" || drag.current.tool === "circle") {
      const t = drag.current.tool;
      blit(ctx => drawPreviewShape(ctx, t, drag.current.start.x, drag.current.start.y, p.x, p.y));
    } else if (drag.current.tool === "move") {
      const layer = activeLayer();
      const snap = drag.current.moveSnap;
      if (layer && snap) {
        const dx = Math.round(p.x - drag.current.start.x);
        const dy = Math.round(p.y - drag.current.start.y);
        const lc = layer.canvas.getContext("2d")!;
        lc.clearRect(0, 0, size, size);
        const tmp = document.createElement("canvas");
        tmp.width = size; tmp.height = size;
        tmp.getContext("2d")!.putImageData(snap, 0, 0);
        lc.drawImage(tmp, dx, dy);
        recomposite(); blit();
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (!drag.current.active) return;
    if (activePointerId.current !== e.pointerId) return;
    const p = getPos(e);
    const t = drag.current.tool;
    if (t === "brush" || t === "eraser") {
      const erase = t === "eraser";
      strokeSegment(drag.current.last.x, drag.current.last.y, p.x, p.y, erase);
      if (!erase) strokeSegmentDisplay(drag.current.last.x, drag.current.last.y, p.x, p.y, erase, width);
      recomposite(); blit();
    } else if (t === "line" || t === "rect" || t === "circle") {
      commitShape(t, drag.current.start.x, drag.current.start.y, p.x, p.y);
      recomposite(); blit();
    } else if (t === "move") {
      drag.current.moveSnap = null;
      recomposite(); blit();
    }
    drag.current.active = false;
    activePointerId.current = null;
    dragRect.current = null;
    setPreviewVersion(v => v + 1);
  };

  const commitText = () => {
    if (!textInput || !textInput.value.trim()) { setTextInput(null); return; }
    if (!isLayerEditable()) { setTextInput(null); return; }
    pushSnapshot();
    const c = bctx();
    c.save();
    c.fillStyle = color;
    c.font = `${textInput.fontSize}px "${textInput.font}", sans-serif`;
    c.textBaseline = "top";
    const lines = textInput.value.split("\n");
    lines.forEach((ln, i) => c.fillText(ln, textInput.x, textInput.y + i * textInput.fontSize * 1.1));
    c.restore();
    setTextInput(null);
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    const layer = layersRef.current.find(l => l.id === prev.layerId);
    if (!layer) { setPreviewVersion(v => v + 1); return; }
    redoStack.current.push({ layerId: layer.id, dataUrl: layer.canvas.toDataURL("image/png") });
    const img = new Image();
    img.onload = () => {
      const c = layer.canvas.getContext("2d")!;
      c.clearRect(0, 0, size, size);
      c.drawImage(img, 0, 0);
      recomposite(); blit(); setPreviewVersion(v => v + 1);
    };
    img.src = prev.dataUrl;
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    const layer = layersRef.current.find(l => l.id === next.layerId);
    if (!layer) { setPreviewVersion(v => v + 1); return; }
    undoStack.current.push({ layerId: layer.id, dataUrl: layer.canvas.toDataURL("image/png") });
    const img = new Image();
    img.onload = () => {
      const c = layer.canvas.getContext("2d")!;
      c.clearRect(0, 0, size, size);
      c.drawImage(img, 0, 0);
      recomposite(); blit(); setPreviewVersion(v => v + 1);
    };
    img.src = next.dataUrl;
  };

  const clearAll = () => {
    if (!isLayerEditable()) return;
    if (!confirm("¿Limpiar la capa activa?")) return;
    pushSnapshot();
    const c = bctx();
    c.clearRect(0, 0, size, size);
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  // ---------- Layer operations ----------
  const addLayer = () => {
    const newL: PaintLayer = { id: uid(), name: `Capa ${layersRef.current.length + 1}`, visible: true, locked: false, opacity: 1, canvas: makeLayerCanvas() };
    const next = [...layersRef.current, newL];
    layersRef.current = next;
    setLayers(next);
    setActiveLayerId(newL.id);
    activeLayerIdRef.current = newL.id;
    recomposite(); blit();
  };

  const duplicateLayer = (id: string) => {
    const idx = layersRef.current.findIndex(l => l.id === id);
    if (idx < 0) return;
    const src = layersRef.current[idx];
    const c = makeLayerCanvas();
    c.getContext("2d")!.drawImage(src.canvas, 0, 0);
    const copy: PaintLayer = { ...src, id: uid(), name: src.name + " copia", canvas: c };
    const next = [...layersRef.current];
    next.splice(idx + 1, 0, copy);
    layersRef.current = next;
    setLayers(next);
    setActiveLayerId(copy.id);
    activeLayerIdRef.current = copy.id;
    recomposite(); blit();
  };

  const deleteLayer = (id: string) => {
    if (layersRef.current.length <= 1) return;
    if (!confirm("¿Borrar esta capa?")) return;
    const next = layersRef.current.filter(l => l.id !== id);
    layersRef.current = next;
    setLayers(next);
    if (activeLayerIdRef.current === id) {
      const fallback = next[next.length - 1].id;
      setActiveLayerId(fallback);
      activeLayerIdRef.current = fallback;
    }
    recomposite(); blit();
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    const idx = layersRef.current.findIndex(l => l.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= layersRef.current.length) return;
    const next = [...layersRef.current];
    [next[idx], next[j]] = [next[j], next[idx]];
    layersRef.current = next;
    setLayers(next);
    recomposite(); blit();
  };

  const mergeDown = (id: string) => {
    const idx = layersRef.current.findIndex(l => l.id === id);
    if (idx <= 0) return;
    const top = layersRef.current[idx];
    const below = layersRef.current[idx - 1];
    const c = below.canvas.getContext("2d")!;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, top.opacity));
    c.drawImage(top.canvas, 0, 0);
    c.restore();
    const next = layersRef.current.filter(l => l.id !== id);
    layersRef.current = next;
    setLayers(next);
    if (activeLayerIdRef.current === id) {
      setActiveLayerId(below.id);
      activeLayerIdRef.current = below.id;
    }
    recomposite(); blit();
  };

  const flatten = () => {
    if (!confirm("¿Aplanar todas las capas en una sola?")) return;
    recomposite();
    const buf = bufferRef.current!;
    const merged = makeLayerCanvas();
    merged.getContext("2d")!.drawImage(buf, 0, 0);
    const single: PaintLayer = { id: uid(), name: "Aplanada", visible: true, locked: false, opacity: 1, canvas: merged };
    layersRef.current = [single];
    setLayers([single]);
    setActiveLayerId(single.id);
    activeLayerIdRef.current = single.id;
    undoStack.current = [];
    redoStack.current = [];
    recomposite(); blit();
  };

  const updateLayer = (id: string, p: Partial<PaintLayer>) => {
    const next = layersRef.current.map(l => l.id === id ? { ...l, ...p } : l);
    layersRef.current = next;
    setLayers(next);
    recomposite(); blit();
  };

  const doSave = () => {
    recomposite();
    const buf = bufferRef.current; if (!buf) return;
    const dataUrl = buf.toDataURL("image/png");
    const asset: SpriteAsset = {
      id: uid(),
      name: name.trim() || "Mi obra",
      width: size,
      height: size,
      fps: 8,
      loop: true,
      frames: [{ id: uid(), layers: [], composite: dataUrl }],
    };
    onSave(asset);
  };

  const thumb = (() => {
    const buf = bufferRef.current;
    if (!buf) return "";
    try { return buf.toDataURL("image/png"); } catch { return ""; }
  })();
  void previewVersion;

  const TOOLS: { id: Tool; icon: ReactNode; title: string }[] = [
    { id: "brush", icon: <Pencil size={19} strokeWidth={2} />, title: "Pincel" },
    { id: "eraser", icon: <Eraser size={19} strokeWidth={2} />, title: "Borrador" },
    { id: "fill", icon: <PaintBucket size={19} strokeWidth={2} />, title: "Relleno" },
    { id: "line", icon: <Slash size={19} strokeWidth={2} />, title: "Línea" },
    { id: "rect", icon: <Square size={19} strokeWidth={2} />, title: "Rectángulo" },
    { id: "circle", icon: <Circle size={19} strokeWidth={2} />, title: "Círculo" },
    { id: "picker", icon: <Pipette size={19} strokeWidth={2} />, title: "Cuentagotas" },
    { id: "text", icon: <Type size={19} strokeWidth={2} />, title: "Texto" },
    { id: "move", icon: <Move size={19} strokeWidth={2} />, title: "Mover capa" },
  ];

  return (
    <div className="w-full h-full flex flex-col rounded-2xl border border-border/40 panel overflow-hidden bg-surface">
      {/* Top bar - compact but usable */}
      <div className="flex items-center justify-between px-2 py-0.5 border-b border-border/30 gap-1.5 shrink-0 bg-muted/50">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-md shrink-0 overflow-hidden"
            style={{
              backgroundColor: "#e5e7eb",
              backgroundImage: thumb ? `url(${thumb})` : undefined,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.08)",
            }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-input/40 border border-border/40 rounded-md px-2 py-1 text-sm font-medium tracking-tight min-w-0 flex-1 max-w-[120px] focus:outline-none focus:border-primary/40 focus:bg-accent/30 transition"
          />
          <select
            value={size}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (next === size) return;
              const hasContent = layersRef.current.some(l => {
                const ctx = l.canvas.getContext("2d")!;
                const d = ctx.getImageData(0, 0, l.canvas.width, l.canvas.height).data;
                for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
                return false;
              });
              if (hasContent && !confirm("Cambiar el tamaño del lienzo borrará el dibujo actual. ¿Continuar?")) return;
              undoStack.current = [];
              redoStack.current = [];
              setSize(next);
            }}
            className="bg-input/40 border border-border/40 rounded-md px-2.5 py-1.5 text-sm font-mono tracking-tight focus:outline-none focus:border-primary/40 tabular-nums shrink-0"
            aria-label="Tamaño del lienzo"
          >
            {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}×{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setLayersOpen(!layersOpen)} title="Capas"
            className={`h-8 px-2.5 rounded-md border transition inline-flex items-center gap-1.5 text-xs font-semibold ${
              layersOpen
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border/50 bg-muted/50 text-foreground/70 hover:text-foreground hover:bg-muted/80"
            }`}
          >
            <Layers size={16} />{layers.length}
          </button>
          <button onClick={onClose} className="h-8 px-2.5 rounded-md border border-border/50 bg-muted/50 text-foreground/70 hover:text-foreground hover:bg-muted/80 transition inline-flex items-center gap-1 text-xs font-semibold">
            <X size={15} />
          </button>
          <button onClick={doSave} className="h-9 px-3.5 rounded-md grad-brand text-primary-foreground hover:shadow-lg hover:shadow-primary/20 transition active:scale-[0.97] inline-flex items-center gap-1.5 text-sm font-semibold shadow-sm">
            <Save size={16} />
            <span className="hidden sm:inline">Publicar</span>
          </button>
        </div>
      </div>

      {/* Main: Canvas + Tools */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Canvas area - max space, no padding */}
        <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden p-0 relative">
          <div
            ref={containerRef}
            key={`canvas-${size}`}
            className="rounded-lg overflow-hidden max-w-full max-h-full"
            style={{ aspectRatio: "1/1", width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%" }}
          >
            <div
              className="w-full h-full rounded-lg overflow-hidden"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, #d4d4d4 25%, transparent 25%), linear-gradient(-45deg, #d4d4d4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d4 75%), linear-gradient(-45deg, transparent 75%, #d4d4d4 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                backgroundColor: "#ffffff",
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full touch-none block cursor-crosshair"
                style={{ touchAction: "none", background: "transparent" }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            </div>
          </div>
          {textInput?.open && (
            <div
              className="absolute rounded-xl p-2.5 flex flex-col gap-2 z-10"
              style={{
                left: `${(textInput.x / size) * 100}%`,
                top: `${(textInput.y / size) * 100}%`,
                maxWidth: "80%",
                background: "oklch(0.2 0.04 262 / 0.92)",
                backdropFilter: "blur(20px) saturate(180%)",
                border: "1px solid oklch(1 0 0 / 0.12)",
                boxShadow: "0 12px 40px -10px oklch(0 0 0 / 0.6)",
              }}
            >
              <textarea autoFocus value={textInput.value} onChange={(e) => setTextInput({ ...textInput, value: e.target.value })} placeholder="Type text…" className="bg-muted border border-border rounded-lg px-2 py-1.5 text-[13px] w-44 min-h-[56px] focus:outline-none focus:border-primary/50" />
              <div className="flex items-center gap-1.5">
                <select value={textInput.font} onChange={(e) => setTextInput({ ...textInput, font: e.target.value })} className="bg-muted border border-border rounded-lg text-[10px] px-2 py-1 flex-1">
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input type="number" min={8} max={200} value={textInput.fontSize} onChange={(e) => setTextInput({ ...textInput, fontSize: Number(e.target.value) })} className="bg-muted border border-border rounded-lg text-[10px] px-2 py-1 w-12 tabular-nums" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setTextInput(null)} className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border bg-muted flex-1">Cancel</button>
                <button onClick={commitText} className="text-[10px] font-semibold px-2 py-1.5 rounded-lg text-primary-foreground flex-1" style={{ background: "var(--gradient-asternal)" }}>Add</button>
              </div>
            </div>
          )}

          {/* Floating layers panel - matches gallery canvas styling */}
          {layersOpen && (
            <div
              className="absolute top-1 right-1 z-20 rounded-xl p-2.5 space-y-1.5 w-48 bg-surface border border-border/40 shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-foreground/80 inline-flex items-center gap-1.5">
                  <Layers size={13} /> CAPAS · {layers.length}
                </span>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); addLayer(); }} className="w-7 h-7 rounded-md flex items-center justify-center text-primary-foreground active:scale-95 transition" style={{ background: "var(--gradient-asternal)" }}>
                    <Plus size={13} strokeWidth={2} />
                  </button>
                  <button onClick={() => setLayersOpen(false)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted/80 border border-border/40 transition">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1 max-h-[200px] overflow-auto">
                {[...layers].slice().reverse().map((l) => {
                  const isActive = l.id === activeLayerId;
                  return (
                    <div key={l.id} className={`group rounded-lg p-2 flex items-center gap-2 transition-all cursor-pointer ${
                      isActive
                        ? "bg-primary/15 border border-primary/30"
                        : "bg-muted/40 border border-border/40 hover:bg-muted/60"
                    }`}
                      onClick={() => { setActiveLayerId(l.id); activeLayerIdRef.current = l.id; }}>
                      <div className="w-7 h-7 rounded-md shrink-0 overflow-hidden" style={{
                        backgroundColor: "#ffffff",
                        backgroundImage: `url(${(() => { try { return l.canvas.toDataURL("image/png"); } catch { return ""; }})()})`,
                        backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                        boxShadow: "inset 0 0 0 1px oklch(0.82 0.01 250 / 0.6)",
                        opacity: l.visible ? 1 : 0.35,
                      }} />
                      <input value={l.name} onChange={(e) => updateLayer(l.id, { name: e.target.value })} onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-transparent text-[11px] font-medium focus:outline-none focus:bg-muted/50 rounded px-1.5 py-0.5" />
                      <button onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }}
                        className={`w-7 h-7 grid place-items-center rounded-md transition hover:bg-muted/50 ${l.visible ? "text-primary" : "text-muted-foreground"}`}>{l.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                      <button onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { locked: !l.locked }); }}
                        className={`w-7 h-7 grid place-items-center rounded-md transition hover:bg-muted/50 ${l.locked ? "text-destructive" : "text-muted-foreground"}`}>{l.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Tools sidebar - legible buttons, compact width (más espacio para el lienzo) */}
        <div className="lg:w-[112px] shrink-0 border-t lg:border-t-0 lg:border-l border-border/30 overflow-y-auto bg-muted/20">
          <div className="p-1.5 space-y-1.5">
            {/* Tool dock - bigger buttons */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/80 border border-border/40">
              {TOOLS.map(t => (
                <button key={t.id} title={t.title} onClick={() => setTool(t.id)}
                  className={`h-9 rounded-md transition-all flex items-center justify-center ${
                    tool === t.id
                      ? "text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  style={tool === t.id ? {
                    background: "var(--gradient-asternal)",
                    boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.25), 0 2px 8px -2px oklch(0.66 0.18 252 / 0.5)",
                  } : undefined}
                >{t.icon}</button>
              ))}
            </div>

            {/* History row - uniform size, delete same as others */}
            <div className="flex gap-1">
              <button onClick={undo} title="Deshacer" className="flex-1 h-9 rounded-md border border-border/50 bg-muted/30 text-foreground/70 hover:text-foreground hover:bg-muted/60 transition flex items-center justify-center active:scale-95"><Undo2 size={18} /></button>
              <button onClick={redo} title="Rehacer" className="flex-1 h-9 rounded-md border border-border/50 bg-muted/30 text-foreground/70 hover:text-foreground hover:bg-muted/60 transition flex items-center justify-center active:scale-95"><Redo2 size={18} /></button>
              <button onClick={clearAll} title="Limpiar capa" className="flex-1 h-9 rounded-md border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition flex items-center justify-center active:scale-95"><Trash2 size={18} /></button>
            </div>

            {/* Color - legible */}
            <div className="p-2 rounded-lg bg-muted/50 border border-border/40 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="relative w-8 h-8 shrink-0">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Color picker" />
                  <div className="w-8 h-8 rounded-md pointer-events-none ring-1 ring-white/20" style={{ background: color, boxShadow: "0 2px 8px -4px oklch(0 0 0 / 0.4)" }} />
                </div>
                <input type="text" value={color.toUpperCase()} onChange={(e) => { const v = e.target.value.trim(); if (/^#?[0-9a-fA-F]{6}$/.test(v)) setColor(v.startsWith("#") ? v : `#${v}`); }}
                  className="bg-input/50 border border-border/50 rounded-md px-1.5 py-1.5 text-xs font-mono w-16 tracking-tight focus:outline-none focus:border-primary/40 uppercase" maxLength={7} aria-label="Hex color" />
              </div>
              <div className="grid grid-cols-8 gap-1">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className="aspect-square rounded-md transition-all min-h-[20px]" style={{
                    background: c,
                    boxShadow: color.toLowerCase() === c.toLowerCase()
                      ? "inset 0 0 0 1.5px white, 0 0 0 2px oklch(0.67 0.14 250 / 0.7)"
                      : "inset 0 0 0 1px oklch(1 0 0 / 0.12)",
                    transform: color.toLowerCase() === c.toLowerCase() ? "scale(1.08)" : undefined,
                  }} aria-label={c} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-muted-foreground/90 w-14 shrink-0">Grosor</span>
                <input type="range" min={1} max={48} value={width} onChange={e => setWidth(Number(e.target.value))} className="flex-1 accent-primary h-2.5" />
                <span className="font-mono text-primary font-bold w-7 text-right tabular-nums text-sm">{width}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-muted-foreground/90 w-14 shrink-0">Estab.</span>
                <input type="range" min={STABILIZE_MIN} max={STABILIZE_MAX} value={stabilizeLevel} onChange={e => setStabilizeLevel(Number(e.target.value))} className="flex-1 accent-primary h-2.5" aria-label="Nivel de estabilización del lápiz" />
                <span className="font-mono text-primary font-bold w-7 text-right tabular-nums text-sm">{stabilizeLevel}</span>
              </div>
              <div className="flex gap-2">
                <label className="flex items-center justify-between cursor-pointer select-none gap-1.5 flex-1">
                  <span className="text-sm font-semibold text-muted-foreground/90">Pres</span>
                  <span role="switch" aria-checked={pressureOn} onClick={() => setPressureOn(!pressureOn)} className="relative w-10 h-6 rounded-full transition-colors shrink-0" style={{ background: pressureOn ? "oklch(0.7 0.17 145)" : "oklch(0.35 0.02 260)", boxShadow: "inset 0 1px 2px oklch(0 0 0 / 0.4)" }}>
                    <span className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all" style={{ left: pressureOn ? "19px" : "3px", boxShadow: "0 1px 4px oklch(0 0 0 / 0.4)" }} />
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
