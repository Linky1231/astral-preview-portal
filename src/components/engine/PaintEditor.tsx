import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "@/lib/preferences";
import type { SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";
import { pinchAnchor, pinchScrollDelta, pinchZoom, pinchZoomArmed, type ZoomAnchor } from "@/lib/engine/paint-zoom";
import { createRafCoalescer } from "@/lib/engine/raf-coalesce";
import { STABILIZE_DEFAULT, STABILIZE_MAX, STABILIZE_MIN, stabilizePoint } from "@/lib/engine/paint-stabilizer";
import { PAINT_BRUSHES, drawBrush, type PaintBrush } from "@/lib/engine/paint-brush";
import { drawCanvasChecker, gridEdgesScaled } from "@/lib/engine/paint-grid";
import {
  canvasBox,
  canvasScale,
  clampCanvasSide,
  keptArea,
  zoomForBox,
  type CanvasSize,
} from "@/lib/engine/paint-canvas";
import {
  PAINT_SHAPES,
  constrainShape,
  paintShape,
  placeShape,
  resizeShape,
  shapeBox,
  shapeClosed,
  shapeDef,
  shapeHit,
  shapeOutline,
  shapePathD,
  translateShape,
  type PaintShape,
  type ShapeObject,
} from "@/lib/engine/paint-shapes";
import {
  Pencil, Eraser, PaintBucket, Shapes, Pipette, Type, Move,
  Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Copy, Trash2, Layers,
  Undo2, Redo2, Plus, X, Check, SlidersHorizontal, Grid,
  Maximize2, AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Tool = "brush" | "eraser" | "fill" | "shape" | "picker" | "text" | "move";

interface Props {
  onSave: (sprite: SpriteAsset) => void;
  onClose: () => void;
  size?: number;
  /**
   * Dibujo ya hecho que se abre para SEGUIR editándolo (el lápiz de cada
   * textura en «Añade texturas»). Entra en la primera capa sin reescalarlo y
   * el lienzo adopta la medida en la que se pintó, así que no se pierde nada.
   */
  source?: {
    image: string;
    width?: number;
    height?: number;
    /** Nombre que ya tenía la textura: al guardar se conserva. */
    name?: string;
  };
}

const SIZE_OPTIONS = [128, 256, 512, 768, 1024];
const BRUSH_PRESETS = [2, 4, 8, 16, 32];

/** Atajos de una letra para elegir herramienta (misma letra que la etiqueta). */
const TOOL_BY_KEY: Record<string, Tool> = {
  b: "brush", e: "eraser", g: "fill", s: "shape", i: "picker", t: "text", v: "move",
};

/**
 * Las letras de las formas sueltas de antes siguen funcionando: eligen esa
 * forma y activan «Formas», en lugar de tener una herramienta por forma.
 */
const SHAPE_BY_KEY: Record<string, PaintShape> = {
  l: "line", r: "rect", c: "ellipse", a: "arrow",
};

/**
 * Objeto de texto del lienzo.
 *
 * Antes el texto se «quemaba» en el bitmap de la capa: al mover la capa se
 * desplazaba junto con el dibujo y no había forma de corregirlo. Ahora es un
 * objeto propio, con su posición y aspecto, que la herramienta «Mover»
 * selecciona y arrastra sin tocar el resto de la obra.
 */
interface TextObject {
  id: string;
  text: string;
  x: number; // esquina superior izquierda, en px del lienzo
  y: number;
  fontSize: number;
  font: string;
  color: string;
}

const TEXT_LINE_HEIGHT = 1.1;

function textFontOf(t: TextObject): string {
  return `${t.fontSize}px "${t.font}", sans-serif`;
}

/** Contexto 2D fuera de pantalla solo para medir texto. */
let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx!;
}

/** Caja del texto en px del lienzo: delimita la selección y el área de toque. */
function measureTextObject(t: TextObject): { w: number; h: number } {
  const ctx = measurer();
  ctx.font = textFontOf(t);
  const lines = t.text.split("\n");
  let w = 1;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  return { w, h: Math.max(1, lines.length) * t.fontSize * TEXT_LINE_HEIGHT };
}

function drawTextObject(ctx: CanvasRenderingContext2D, t: TextObject) {
  ctx.save();
  ctx.fillStyle = t.color;
  ctx.font = textFontOf(t);
  ctx.textBaseline = "top";
  t.text.split("\n").forEach((line, i) => {
    ctx.fillText(line, t.x, t.y + i * t.fontSize * TEXT_LINE_HEIGHT);
  });
  ctx.restore();
}

/**
 * La forma, dibujada como icono. Sale de la MISMA geometría que el lienzo
 * (`shapePathD`), así que la ventana «Formas» nunca miente sobre lo que pinta.
 */
function ShapeGlyph({ shape, size = 20 }: { shape: PaintShape; size?: number }) {
  const view = 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d={shapePathD(shape, { x: 2.5, y: 2.5, w: view - 5, h: view - 5 })} />
    </svg>
  );
}

/** Rejilla con todas las formas: la ventana «Formas» y el panel de selección. */
function ShapePicker({
  value,
  onPick,
}: {
  value: PaintShape;
  onPick: (shape: PaintShape) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {PAINT_SHAPES.map(item => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onPick(item.id)}
            aria-label={item.name}
            aria-pressed={on}
            title={`${item.name}: ${item.description}`}
            className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
              on
                ? "border-primary bg-accent text-accent-foreground"
                : "border-line bg-card text-ink-2 hover:bg-muted hover:text-foreground"
            }`}
          >
            <ShapeGlyph shape={item.id} size={22} />
            <span className="w-full truncate text-center text-[9px] font-medium leading-none">{item.name}</span>
          </button>
        );
      })}
    </div>
  );
}

interface PaintLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  canvas: HTMLCanvasElement;
  /** Textos de la capa: objetos independientes, no píxeles del bitmap. */
  texts: TextObject[];
  /**
   * Formas de la capa: también objetos. Se seleccionan, se mueven y se editan
   * aunque ya estén colocadas, en lugar de quedar fundidas con el dibujo.
   */
  shapes: ShapeObject[];
}

/** Estado guardable para deshacer: bitmap de una capa + todos los objetos. */
interface Snapshot {
  layerId: string;
  dataUrl: string;
  texts: { layerId: string; items: TextObject[] }[];
  shapes: { layerId: string; items: ShapeObject[] }[];
}

interface PendingConfirm {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  action: () => void;
}

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

/** Tablero de transparencia de las miniaturas (cuadros de 8px). */
const CHECKER: CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, var(--m3-surface-highest) 25%, transparent 25%), linear-gradient(-45deg, var(--m3-surface-highest) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--m3-surface-highest) 75%), linear-gradient(-45deg, transparent 75%, var(--m3-surface-highest) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  backgroundColor: "var(--m3-surface-lowest)",
};

/** Tarjeta de sección del panel: cabecera micro-label + contenido. */
function SectionCard({
  label,
  icon,
  action,
  children,
}: {
  label: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-3">
      <header className="flex items-center justify-between gap-2 mb-2.5">
        <span className="section-label">
          {icon}
          {label}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PaintEditor({ onSave, onClose, size: initialSize = 512, source }: Props) {
  // Imagen que se reabre (si la hay): se lee una sola vez, al crear la primera
  // capa, para que un cambio de tamaño del lienzo no vuelva a cargarla.
  const sourceImage = useRef(source?.image ?? null);
  // El lienzo tiene dos medidas independientes: se puede cambiar (más ancho o
  // más alto) mientras se dibuja, y el dibujo NO se reescala: lo que sobra se
  // recorta y lo que falta se añade vacío. Al reabrir una textura, manda la
  // medida del dibujo que se está editando.
  const [canvas, setCanvas] = useState<CanvasSize>(() => ({
    w: clampCanvasSide(source?.width ?? initialSize),
    h: clampCanvasSide(source?.height ?? initialSize),
  }));
  const sizeW = canvas.w;
  const sizeH = canvas.h;
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#38bdf8");
  const [recent, setRecent] = useState<string[]>([]);
  const [width, setWidth] = useState(6);
  const [brush, setBrush] = useState<PaintBrush>("round");
  const [name, setName] = useState(source?.name?.trim() || "drawing");
  const [stabilizeLevel, setStabilizeLevel] = useState(STABILIZE_DEFAULT);
  const [pressureOn, setPressureOn] = useState(true);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  // Vista del lienzo: zoom sobre la medida «ajustar» y guía de cuadrícula.
  const [zoom, setZoom] = useState(1);
  const [fitPx, setFitPx] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  // El tablero de transparencia toma sus colores de los tokens del tema: si el
  // tema cambia con el editor abierto hay que volver a pintarlo.
  const theme = usePreferences().theme;
  // En móvil y tablet el panel es una hoja; solo las pantallas anchas lo fijan.
  const [panelOpen, setPanelOpen] = useState(false);
  const [quickSetting, setQuickSetting] = useState<"color" | "width" | "brush" | "shapes" | null>(null);
  const [hasArtwork, setHasArtwork] = useState(false);
  // Si había dibujo antes del gesto en curso: cancelarlo devuelve el lienzo Y
  // esta marca, para que el lienzo vacío siga invitando a dibujar.
  const artworkBeforeGesture = useRef(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const PALETTE = PALETTES[paletteIdx].colors;
  // Texto seleccionado como objeto (herramienta «Mover»).
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const selectedTextIdRef = useRef<string | null>(null);
  // Marca si el campo de texto en edición ya tiene su punto de deshacer.
  const textEditSnapshot = useRef(false);
  // Formas: la que se está dibujando y la que está seleccionada como objeto.
  const [shapeKind, setShapeKind] = useState<PaintShape>("rect");
  const [shapeFilled, setShapeFilled] = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const selectedShapeIdRef = useRef<string | null>(null);
  // Marca si el campo de la forma en edición ya tiene su punto de deshacer.
  const shapeEditSnapshot = useRef(false);

  // text overlay state
  const [textInput, setTextInput] = useState<{
    open: boolean; x: number; y: number; value: string; fontSize: number; font: string; color: string; id?: string;
  } | null>(null);

  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Tablero de transparencia ya dibujado: se rehace solo cuando cambia la
  // medida real de la pantalla o el color del tema, nunca en cada cuadro.
  const checkerRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Marco del lienzo: el pellizco necesita su rectángulo para anclarse.
  const boxRef = useRef<HTMLDivElement | null>(null);

  // ---------- Layers ----------
  const makeLayerCanvas = (): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = sizeW; c.height = sizeH;
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
  // Capa activa derivada del ESTADO para el render: `activeLayer()` lee refs y
  // no debe llamarse durante el render.
  const active = layers.find(l => l.id === activeLayerId) ?? null;
  const activeEditable = !!active && active.visible && !active.locked;
  // Texto seleccionado derivado del ESTADO (el panel se actualiza solo).
  const selectedText = selectedTextId
    ? layers.flatMap(l => l.texts).find(t => t.id === selectedTextId) ?? null
    : null;
  // Forma seleccionada derivada del ESTADO, igual que el texto.
  const selectedShape = selectedShapeId
    ? layers.flatMap(l => l.shapes).find(s => s.id === selectedShapeId) ?? null
    : null;
  // Encuadre de la forma seleccionada para los campos de posición y tamaño.
  const selectedShapeBox = selectedShape
    ? shapeBox(selectedShape.x0, selectedShape.y0, selectedShape.x1, selectedShape.y1)
    : null;

  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const activePointerId = useRef<number | null>(null);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    ids: number[];
    distance: number;
    zoom: number;
    /** ¿Los dedos ya se han separado lo bastante para hacer zoom? */
    zooming: boolean;
    /** Punto del dibujo que el gesto tiene agarrado (0..1), o `null` sin marco. */
    anchor: ZoomAnchor | null;
    /** Foco del último cuadro aplicado (la mitad entre los dos dedos). */
    focus: { x: number; y: number };
  } | null>(null);
  // Gesto de vista (pellizco o cambio de tamaño del lienzo): se aplica al DOM
  // por cuadro y SIN re-renderizar el editor, que es lo que hacía que el zoom
  // fuera a tirones. El estado de React solo se fija al soltar.
  const pinchFrames = useRef<ReturnType<typeof createRafCoalescer<number>> | null>(null);
  const resizeFrames = useRef<ReturnType<typeof createRafCoalescer<{ dx: number; dy: number }>> | null>(null);
  // Tamaño de lienzo que se está mostrando sin pasar por React (gesto en curso).
  const liveBox = useRef<CanvasSize | null>(null);
  // Medida que enseña el lienzo mientras se arrastra el tirador: el tamaño nuevo
  // y la escala del dibujo, que no cambia durante el gesto.
  const resizeLive = useRef<{ scale: number; box: CanvasSize } | null>(null);
  const liveZoom = useRef(1);
  const resizeDrag = useRef<{
    id: number;
    x0: number;
    y0: number;
    /** Píxeles de pantalla por píxel de dibujo en el momento de agarrar. */
    scale: number;
    box0: CanvasSize;
    want: CanvasSize;
    /** Área útil del visor y sitio del marco en ella, para no correr el lienzo. */
    area: CanvasSize;
    offset: { x: number; y: number };
  } | null>(null);
  const gestureBlocked = useRef(false);
  const restoringStroke = useRef(false);
  // Mientras dura un gesto de vista no se rehace el bitmap de pantalla: la
  // imagen se estira con CSS (gratis) y se vuelve a pintar una sola vez al
  // soltar. Reescalar el lienzo en cada cuadro era el grueso del tirón.
  const gesturePixels = useRef(false);
  const deferredBlit = useRef(false);

  const syncHistory = () => {
    setHistory({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    });
  };

  const displayScale = useRef<number>(1);
  const dragRect = useRef<DOMRect | null>(null);

  /** Aplica el repintado que se dejó pendiente durante un gesto de vista. */
  const flushDeferredBlit = () => {
    gesturePixels.current = false;
    if (!deferredBlit.current) return;
    deferredBlit.current = false;
    blit();
  };

  /** Cierra un gesto de vista: una sola repintura, ya a la medida final. */
  const endViewGesture = () => {
    deferredBlit.current = true;
    flushDeferredBlit();
  };

  /** Tamaño del marco escrito directamente en el DOM (sin pasar por React). */
  const applyLiveBox = (w: number, h: number) => {
    const box = boxRef.current;
    if (!box) return;
    const bw = Math.max(1, Math.round(w));
    const bh = Math.max(1, Math.round(h));
    box.style.width = `${bw}px`;
    box.style.height = `${bh}px`;
    liveBox.current = { w: bw, h: bh };
  };

  // Tarea del pellizco siempre fresca: el cuadro que se aplique dentro de unos
  // milisegundos no puede llevar la medida de un render antiguo.
  const pinchFrameTask = useRef<() => void>(() => {});

  /** Una sola aplicación por cuadro para una ráfaga de eventos de vista. */
  const schedulePinchFrame = () => {
    if (!pinchFrames.current) pinchFrames.current = createRafCoalescer<number>(() => pinchFrameTask.current());
    pinchFrames.current.push(1);
  };
  const scheduleResizeFrame = (dx: number, dy: number) => {
    if (!resizeFrames.current) resizeFrames.current = createRafCoalescer<{ dx: number; dy: number }>(v => applyResizeFrame(v.dx, v.dy));
    resizeFrames.current.push({ dx, dy });
  };

  /**
   * Aplica el cuadro pendiente del pellizco: el marco se escribe en píxeles y
   * el visor se desplaza para que el punto agarrado siga bajo los dedos. Nada
   * de esto pasa por React, así que el gesto no re-renderiza el editor.
   */
  const applyPinchFrame = () => {
    const gesture = pinch.current;
    const box = boxRef.current;
    if (!gesture || !box) return;
    const [a, b] = gesture.ids.map(id => touchPoints.current.get(id));
    if (!a || !b) return;
    const focus = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    // Los dedos nunca mantienen la distancia exacta mientras desplazan el
    // lienzo: hasta que no se separen lo suficiente el gesto es solo paneo, así
    // que la escala (y la retícula) no cambia ni un píxel. Cuando el dedo se
    // separa de verdad, el zoom empieza a seguirle desde esa distancia, sin
    // ningún salto (el zoom de partida es el que ya había).
    if (!gesture.zooming && pinchZoomArmed(gesture.distance, distance)) {
      gesture.zooming = true;
      gesture.distance = distance;
      gesture.zoom = liveZoom.current;
    }
    const next = gesture.zooming ? pinchZoom(gesture.zoom, gesture.distance, distance) : liveZoom.current;
    const viewport = viewportRef.current;
    if (next !== liveZoom.current || !liveBox.current) {
      // Cambió la escala: se reescala el marco y, con la medida ya puesta, se
      // resuelve el ancla para que el punto agarrado siga bajo los dedos.
      const scale = canvasScale(fitPx, next, canvas);
      applyLiveBox(scale * sizeW, scale * sizeH);
      liveZoom.current = next;
      if (gesture.anchor && viewport) {
        const { dx, dy } = pinchScrollDelta(gesture.anchor, box.getBoundingClientRect(), focus);
        if (dx) viewport.scrollLeft += dx;
        if (dy) viewport.scrollTop += dy;
      }
    } else if (viewport) {
      // Sin cambio de escala el gesto solo mueve la cámara: lo que se movió el
      // foco es exactamente lo que hay que mover el visor. Ni una medición.
      const dx = focus.x - gesture.focus.x;
      const dy = focus.y - gesture.focus.y;
      if (dx) viewport.scrollLeft -= dx;
      if (dy) viewport.scrollTop -= dy;
    }
    gesture.focus = focus;
  };

  /**
   * Aplica el cuadro pendiente del tirador: el lienzo enseña en vivo su medida
   * nueva (cuadros añadidos o quitados) y el dibujo no se mueve de escala.
   */
  const applyResizeFrame = (dx: number, dy: number) => {
    const drag = resizeDrag.current;
    if (!drag) return;
    const want = {
      w: clampCanvasSide((drag.box0.w + dx) / drag.scale),
      h: clampCanvasSide((drag.box0.h + dy) / drag.scale),
    };
    drag.want = want;
    resizeLive.current = { scale: drag.scale, box: want };
    applyLiveBox(want.w * drag.scale, want.h * drag.scale);
    // El lienzo no se pasea: se congela el sitio del marco en el visor mientras
    // dura el arrastre, así crece hacia la derecha y hacia abajo y la esquina
    // superior izquierda (el origen del dibujo) se queda clavada donde estaba.
    const box = boxRef.current;
    if (box) {
      box.style.marginLeft = `${drag.offset.x}px`;
      box.style.marginTop = `${drag.offset.y}px`;
    }
  };

  /** Agarra el tirador: a partir de aquí el marco cambia de tamaño al arrastrar. */
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const scale = sizeW > 0 ? rect.width / sizeW : 0;
    if (!(scale > 0)) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // Área útil del visor (sin su relleno) y distancia del marco a su origen:
    // con ellas el lienzo se queda en su sitio mientras se redimensiona y vuelve
    // solo al centro al soltar.
    const viewport = viewportRef.current;
    const vcs = viewport ? getComputedStyle(viewport) : null;
    const padL = vcs ? (parseFloat(vcs.paddingLeft) || 0) : 0;
    const padT = vcs ? (parseFloat(vcs.paddingTop) || 0) : 0;
    const vrect = viewport ? viewport.getBoundingClientRect() : null;
    const area = {
      w: viewport ? viewport.clientWidth - padL - (vcs ? (parseFloat(vcs.paddingRight) || 0) : 0) : 0,
      h: viewport ? viewport.clientHeight - padT - (vcs ? (parseFloat(vcs.paddingBottom) || 0) : 0) : 0,
    };
    const offset = viewport && vrect
      ? { x: rect.left - vrect.left - padL + viewport.scrollLeft, y: rect.top - vrect.top - padT + viewport.scrollTop }
      : { x: 0, y: 0 };
    resizeDrag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      scale,
      box0: { w: rect.width, h: rect.height },
      want: { w: sizeW, h: sizeH },
      area,
      offset,
    };
    // El dibujo NO se estira: durante el arrastre el lienzo repinta en vivo la
    // medida nueva (retícula de cuadros añadidos o quitados) y pega el dibujo a
    // la esquina con la escala con la que empezó el gesto.
    resizeLive.current = { scale, box: { w: sizeW, h: sizeH } };
  };

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current;
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    scheduleResizeFrame(e.clientX - drag.x0, e.clientY - drag.y0);
  };

  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current;
    if (!drag || drag.id !== e.pointerId) return;
    e.stopPropagation();
    resizeDrag.current = null;
    resizeFrames.current?.cancel();
    const next = drag.want;
    // El zoom se recalcula para que el lienzo siga ocupando lo mismo en pantalla:
    // al soltar, el dibujo no da ningún salto.
    const nextZoom = zoomForBox(next.w * drag.scale, fitPx, next);
    liveBox.current = null;
    // Fin del previsualizado: el lienzo vuelve a la medida del estado.
    resizeLive.current = null;
    if (next.w !== sizeW || next.h !== sizeH) {
      resizeCanvas(next);
      setZoom(nextZoom);
    }
    // Deja el marco en la medida definitiva de la vista (por si el render no
    // llega a escribirla: el tirador escribe el tamaño a mano).
    const committed = canvasBox(fitPx, nextZoom, next);
    applyLiveBox(committed.w, committed.h);
    liveBox.current = null;
    // Se retira el sitio congelado con una transición corta hacia la posición
    // centrada definitiva: el lienzo vuelve a su sitio sin dar un salto.
    const held = boxRef.current;
    if (held) {
      held.style.transition = "margin 180ms ease";
      held.style.marginLeft = `${Math.max(0, (drag.area.w - committed.w) / 2)}px`;
      held.style.marginTop = `${Math.max(0, (drag.area.h - committed.h) / 2)}px`;
      window.setTimeout(() => {
        const box = boxRef.current;
        if (box) { box.style.transition = ""; box.style.marginLeft = ""; box.style.marginTop = ""; }
      }, 240);
    }
    endViewGesture();
  };

  // ---------- Textos y formas como objetos independientes ----------
  /** Ni un texto ni una forma se editan si su capa está oculta o bloqueada. */
  const objectEditLocked = (layer: PaintLayer) => !layer.visible || layer.locked;

  const findText = (id: string | null): { layer: PaintLayer; text: TextObject } | null => {
    if (!id) return null;
    for (const layer of layersRef.current) {
      const text = layer.texts.find(t => t.id === id);
      if (text) return { layer, text };
    }
    return null;
  };

  const selectText = (id: string | null) => {
    selectedTextIdRef.current = id;
    setSelectedTextId(id);
  };

  /** Reemplaza los textos de una capa (ref + estado, para pintar al instante). */
  const updateTexts = (layerId: string, fn: (texts: TextObject[]) => TextObject[]) => {
    const next = layersRef.current.map(l => l.id === layerId ? { ...l, texts: fn(l.texts) } : l);
    layersRef.current = next;
    setLayers(next);
  };

  const snapshotTexts = () =>
    layersRef.current.map(l => ({ layerId: l.id, items: l.texts.map(t => ({ ...t })) }));

  const applyTextSnapshot = (snap: { layerId: string; items: TextObject[] }[]) => {
    const map = new Map(snap.map(s => [s.layerId, s.items]));
    const next = layersRef.current.map(l => {
      const items = map.get(l.id);
      return items ? { ...l, texts: items.map(t => ({ ...t })) } : l;
    });
    layersRef.current = next;
    setLayers(next);
  };

  /** Si el texto seleccionado desapareció (deshacer, borrar capa...), suelta la selección. */
  const reconcileTextSelection = () => {
    if (selectedTextIdRef.current && !findText(selectedTextIdRef.current)) selectText(null);
  };

  /** Texto bajo un punto del lienzo: de la capa de arriba abajo. */
  const hitTestText = (wx: number, wy: number) => {
    const ordered = [...layersRef.current].reverse();
    for (const layer of ordered) {
      if (objectEditLocked(layer)) continue;
      for (let i = layer.texts.length - 1; i >= 0; i--) {
        const t = layer.texts[i];
        const m = measureTextObject(t);
        const pad = 4;
        if (wx >= t.x - pad && wx <= t.x + m.w + pad && wy >= t.y - pad && wy <= t.y + m.h + pad) {
          return { layer, text: t };
        }
      }
    }
    return null;
  };

  const updateSelectedText = (patch: Partial<TextObject>) => {
    const found = findText(selectedTextIdRef.current);
    if (!found || objectEditLocked(found.layer)) return;
    updateTexts(found.layer.id, texts =>
      texts.map(t => t.id === found.text.id ? { ...t, ...patch } : t));
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  /** Un solo punto de deshacer por sesión de edición en un campo. */
  const beginTextFieldEdit = () => {
    if (textEditSnapshot.current) return;
    pushSnapshot();
    textEditSnapshot.current = true;
  };

  const deleteSelectedText = () => {
    const found = findText(selectedTextIdRef.current);
    if (!found || objectEditLocked(found.layer)) return;
    pushSnapshot();
    updateTexts(found.layer.id, texts => texts.filter(t => t.id !== found.text.id));
    selectText(null);
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  const duplicateSelectedText = () => {
    const found = findText(selectedTextIdRef.current);
    if (!found || objectEditLocked(found.layer)) return;
    pushSnapshot();
    const copy: TextObject = { ...found.text, id: uid(), x: found.text.x + 12, y: found.text.y + 12 };
    updateTexts(found.layer.id, texts => [...texts, copy]);
    selectText(copy.id);
    setTool("move");
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  // ---------- Formas como objetos independientes ----------
  const findShape = (id: string | null): { layer: PaintLayer; shape: ShapeObject } | null => {
    if (!id) return null;
    for (const layer of layersRef.current) {
      const shape = layer.shapes.find(s => s.id === id);
      if (shape) return { layer, shape };
    }
    return null;
  };

  const selectShape = (id: string | null) => {
    selectedShapeIdRef.current = id;
    setSelectedShapeId(id);
  };

  /** Reemplaza las formas de una capa (ref + estado, para pintar al instante). */
  const updateShapes = (layerId: string, fn: (shapes: ShapeObject[]) => ShapeObject[]) => {
    const next = layersRef.current.map(l => l.id === layerId ? { ...l, shapes: fn(l.shapes) } : l);
    layersRef.current = next;
    setLayers(next);
  };

  const snapshotShapes = () =>
    layersRef.current.map(l => ({ layerId: l.id, items: l.shapes.map(s => ({ ...s })) }));

  // `snap` puede faltar en puntos de deshacer creados antes de que las formas
  // fuesen objetos (una recarga en caliente a mitad de sesión), así que se
  // ignora en vez de romper el deshacer.
  const applyShapeSnapshot = (snap: { layerId: string; items: ShapeObject[] }[] | undefined) => {
    if (!snap) return;
    const map = new Map(snap.map(s => [s.layerId, s.items]));
    const next = layersRef.current.map(l => {
      const items = map.get(l.id);
      return items ? { ...l, shapes: items.map(s => ({ ...s })) } : l;
    });
    layersRef.current = next;
    setLayers(next);
  };

  /** Si la forma seleccionada desapareció (deshacer, borrar capa...), suelta la selección. */
  const reconcileShapeSelection = () => {
    if (selectedShapeIdRef.current && !findShape(selectedShapeIdRef.current)) selectShape(null);
  };

  /**
   * Forma bajo un punto del lienzo, de la capa de arriba abajo. El margen de
   * toque incluye el grosor del trazo, para acertar sin precisión de píxel.
   */
  const hitTestShapeObject = (wx: number, wy: number) => {
    const ordered = [...layersRef.current].reverse();
    for (const layer of ordered) {
      if (objectEditLocked(layer)) continue;
      for (let i = layer.shapes.length - 1; i >= 0; i--) {
        const s = layer.shapes[i];
        if (shapeHit(s, wx, wy, Math.max(6, s.width / 2 + 4))) return { layer, shape: s };
      }
    }
    return null;
  };

  const updateSelectedShape = (patch: Partial<ShapeObject>) => {
    const found = findShape(selectedShapeIdRef.current);
    if (!found || objectEditLocked(found.layer)) return;
    updateShapes(found.layer.id, shapes =>
      shapes.map(s => s.id === found.shape.id ? { ...s, ...patch } : s));
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  /** Un solo punto de deshacer por sesión de edición en un campo de la forma. */
  const beginShapeFieldEdit = () => {
    if (shapeEditSnapshot.current) return;
    pushSnapshot();
    shapeEditSnapshot.current = true;
  };

  const deleteSelectedShape = () => {
    const found = findShape(selectedShapeIdRef.current);
    if (!found || objectEditLocked(found.layer)) return;
    pushSnapshot();
    updateShapes(found.layer.id, shapes => shapes.filter(s => s.id !== found.shape.id));
    selectShape(null);
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  const duplicateSelectedShape = () => {
    const found = findShape(selectedShapeIdRef.current);
    if (!found || objectEditLocked(found.layer)) return;
    pushSnapshot();
    const copy: ShapeObject = {
      ...found.shape,
      id: uid(),
      ...translateShape(found.shape, 12, 12),
    };
    updateShapes(found.layer.id, shapes => [...shapes, copy]);
    selectShape(copy.id);
    setTool("move");
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  /**
   * Guarda la forma que se acaba de trazar. Nace como objeto (no como píxeles),
   * así que queda seleccionada y se puede mover o corregir cuando quieras.
   */
  const addShapeObject = (draft: ShapeObject) => {
    const layer = activeLayer();
    if (!layer || !isLayerEditable()) return;
    updateShapes(layer.id, shapes => [...shapes, draft]);
    selectShape(draft.id);
    selectText(null);
    // Como el texto: queda lista para colocarla con «Mover».
    setTool("move");
    setHasArtwork(true);
    setPreviewVersion(v => v + 1);
  };

  /** Compone las capas visibles (con sus formas y sus textos) en el búfer. */
  const compositeInto = (c: CanvasRenderingContext2D, source: PaintLayer[]) => {
    c.clearRect(0, 0, sizeW, sizeH);
    for (const l of source) {
      if (!l.visible) continue;
      c.globalAlpha = Math.max(0, Math.min(1, l.opacity));
      c.drawImage(l.canvas, 0, 0);
      // Las formas van sobre el bitmap y por debajo de los textos.
      for (const s of l.shapes) paintShape(c, s);
      for (const t of l.texts) drawTextObject(c, t);
    }
    c.globalAlpha = 1;
  };

  /** Fuente de la vista: búfer compuesto. */
  const recomposite = () => {
    const buf = bufferRef.current; if (!buf) return;
    compositeInto(buf.getContext("2d")!, layersRef.current);
  };

  /**
   * Tablero de transparencia ya rasterizado: una sola bitmap exacta por medida
   * de lienzo, medida de pantalla y colores del tema (nunca se recompone a
   * mitad de un gesto).
   */
  const checkerPattern = (
    w: number,
    h: number,
    cols: number[],
    rows: number[],
    gridW: number,
    gridH: number,
    light: string,
    dark: string,
  ) => {
    const key = `${w}x${h}|${gridW}x${gridH}|${light}|${dark}`;
    const cached = checkerRef.current;
    if (cached && cached.key === key) return cached.canvas;
    const canvas = cached?.canvas ?? document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    drawCanvasChecker(canvas.getContext("2d")!, w, h, light, dark, cols, rows);
    checkerRef.current = { key, canvas };
    return canvas;
  };

  /** Vuelca el búfer al canvas de pantalla a la escala de vista actual. */
  const blit = (preview?: (ctx: CanvasRenderingContext2D) => void) => {
    // Durante un gesto de vista no se rehace el bitmap: la imagen se repinta una
    // sola vez al soltar. Rehacerlo en cada cuadro era lo que hacía que el zoom
    // fuera a tirones.
    if (gesturePixels.current) { deferredBlit.current = true; return; }
    const c = canvasRef.current; const buf = bufferRef.current;
    if (!c || !buf) return;
    const ctx = c.getContext("2d")!;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (W <= 0 || H <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Mantener nítidos los píxeles del bitmap al ampliar, sin mezclar cuadros.
    ctx.imageSmoothingEnabled = false;
    // Los colores de la retícula salen de los tokens del tema, como el resto de
    // la interfaz, para que se vea igual en claro y en oscuro.
    const cs = getComputedStyle(c);
    const light = cs.getPropertyValue("--m3-surface-lowest").trim() || "#f4f4f5";
    const dark = cs.getPropertyValue("--m3-surface-highest").trim() || "#d4d4d8";
    // Con el tirador agarrado el lienzo enseña YA su medida nueva: la retícula
    // se ancla donde estaba y crece con el lienzo (cuadros añadidos o quitados
    // en el borde, nunca movidos) y el dibujo se conserva a la escala con la que
    // empezó el arrastre. Así el marco nunca se ve vacío, con la retícula vieja
    // dentro ni temblando mientras se arrastra.
    const live = resizeLive.current;
    const gridW = live ? live.box.w : sizeW;
    const gridH = live ? live.box.h : sizeH;
    const artScale = live ? live.scale : W / sizeW;
    // La retícula se mide en píxeles del LIENZO y de ahí pasa a la pantalla: el
    // cuadro conserva su tamaño de dibujo (`PAINT_GRID_CELL`) sea cual sea el
    // zoom. Los bordes se anclan en el origen, así que al arrastrar el tirador
    // los cuadros que ya existen NO se mueven (se añaden o se quitan en el borde)
    // y el último cierra en el filo.
    const cols = gridEdgesScaled(gridW, c.width, artScale * dpr);
    const rows = gridEdgesScaled(gridH, c.height, artScale * dpr);
    // El tablero va DENTRO del bitmap del lienzo: un patrón de CSS se recompone
    // por su cuenta y por eso la retícula se veía temblar al hacer zoom.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(checkerPattern(c.width, c.height, cols, rows, gridW, gridH, light, dark), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // El dibujo se pega a la esquina, a su escala: aquí no hay ninguna
    // deformación, solo recorte o superficie nueva alrededor.
    ctx.drawImage(buf, 0, 0, sizeW * artScale, sizeH * artScale);
    displayScale.current = artScale;
    // Guía de cuadrícula: el MISMO paso y los mismos bordes enteros que el
    // tablero, así que sus líneas caen exactamente sobre los cuadros.
    if (showGrid) {
      const line = Math.max(1, Math.round(dpr));
      const half = line % 2 === 0 ? 0 : 0.5;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = line;
      ctx.strokeStyle = cs.getPropertyValue("--primary").trim() || "#3b82f6";
      ctx.beginPath();
      for (let i = 0; i < cols.length - 1; i++) {
        ctx.moveTo(cols[i] + half, 0);
        ctx.lineTo(cols[i] + half, c.height);
      }
      for (let j = 0; j < rows.length - 1; j++) {
        ctx.moveTo(0, rows[j] + half);
        ctx.lineTo(c.width, rows[j] + half);
      }
      ctx.stroke();
      ctx.restore();
    }
    // El texto seleccionado se marca SIEMPRE encima de la obra: la marca es de
    // la vista, no forma parte del dibujo que se guarda.
    const marked = findText(selectedTextIdRef.current);
    if (marked) {
      const s = displayScale.current;
      const m = measureTextObject(marked.text);
      const bx = (marked.text.x - 3) * s;
      const by = (marked.text.y - 3) * s;
      const bw = (m.w + 6) * s;
      const bh = (m.h + 6) * s;
      ctx.save();
      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
      const hs = 10;
      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#0ea5e9";
      ctx.fillRect(bx + bw - hs / 2, by + bh - hs / 2, hs, hs);
      ctx.strokeRect(bx + bw - hs / 2 + 0.5, by + bh - hs / 2 + 0.5, hs - 1, hs - 1);
      ctx.restore();
    }
    // La forma seleccionada lleva su propia marca, también solo en la vista.
    const markedShape = findShape(selectedShapeIdRef.current);
    if (markedShape) {
      const s = displayScale.current;
      const box = shapeOutline(markedShape.shape);
      ctx.save();
      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(box.x * s, box.y * s, box.w * s, box.h * s);
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (preview) {
      ctx.save();
      ctx.scale(displayScale.current, displayScale.current);
      preview(ctx);
      ctx.restore();
    }
  };

  /**
   * Abre el dibujo que ya existía (el lápiz de «Añade texturas») en la primera
   * capa, sin reescalarlo: se sigue editando exactamente donde se dejó y todo
   * lo que había sigue ahí, listo para retocar, deshacer y volver a guardar.
   */
  const loadSourceDrawing = (layer: PaintLayer, image: string) => {
    const img = new Image();
    img.onload = () => {
      const ctx = layer.canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      ctx.drawImage(img, 0, 0);
      setHasArtwork(true);
      recomposite();
      blit();
      setPreviewVersion(v => v + 1);
    };
    img.onerror = () => console.error("No se pudo abrir el dibujo guardado para seguir editándolo.");
    img.src = image;
  };

  useEffect(() => {
    // El búfer se reutiliza: al cambiar el lienzo de medida solo hay que
    // rehacerlo (el dibujo ya viene recortado o ampliado por `resizeCanvas`).
    const buf = bufferRef.current ?? document.createElement("canvas");
    buf.width = sizeW; buf.height = sizeH;
    const bctx = buf.getContext("2d")!;
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bufferRef.current = buf;
    if (layersRef.current.length === 0) {
      // Primera capa: el editor nace con un lienzo vacío, o con la textura que
      // se ha abierto para seguir editándola.
      const initId = uid();
      const firstLayer: PaintLayer = { id: initId, name: "Capa 1", visible: true, locked: false, opacity: 1, canvas: makeLayerCanvas(), texts: [], shapes: [] };
      layersRef.current = [firstLayer];
      activeLayerIdRef.current = initId;
      setLayers([firstLayer]);
      setActiveLayerId(initId);
      undoStack.current = [];
      redoStack.current = [];
      setHistory({ canUndo: false, canRedo: false });
      setHasArtwork(false);
      setTextInput(null);
      selectText(null);
      selectShape(null);
      if (sourceImage.current) loadSourceDrawing(firstLayer, sourceImage.current);
    }
    textEditSnapshot.current = false;
    shapeEditSnapshot.current = false;
    recomposite();
    blit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeW, sizeH]);

  // Mide el área disponible y deja el lienzo entero dentro de ella. El zoom
  // multiplica esa medida de «ajustar» (y el visor pasa a hacer scroll). En
  // layout-effect para que la primera pintura ya salga a escala correcta.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      // El relleno del visor depende del punto de ruptura: se lee del estilo
      // resuelto para que el lienzo quepa siempre sin desbordar.
      const cs = getComputedStyle(el);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const w = el.clientWidth - padX;
      const h = el.clientHeight - padY;
      setFitPx(Math.max(1, Math.floor(Math.min(w, h))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // En cada render: la tarea del pellizco queda al día (medida del área, tamaño
  // del lienzo) y, si el gesto está en curso, el tamaño que se escribe a mano
  // vuelve a mandar: el lienzo no da un salto a la medida anterior mientras los
  // dedos siguen en la pantalla.
  useLayoutEffect(() => {
    pinchFrameTask.current = applyPinchFrame;
    const live = liveBox.current;
    if (live) applyLiveBox(live.w, live.h);
  });

  // Al cambiar el tamaño del lienzo visible (zoom o medida) hay que reescalar
  // el búfer de presentación: el canvas de pantalla se redibuja con la escala.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => blit());
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeW, sizeH]);

  // Encender o apagar la guía, o cambiar de tema (los colores del tablero
  // salen de los tokens), se ve al instante: el repintado ya lo incluye.
  useEffect(() => {
    blit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrid, theme]);

  const pushSnapshot = () => {
    const layer = activeLayer(); if (!layer) return;
    artworkBeforeGesture.current = hasArtwork;
    undoStack.current.push({
      layerId: layer.id,
      dataUrl: layer.canvas.toDataURL("image/png"),
      // Los textos y las formas viajan con el punto de deshacer: moverlos o
      // editarlos también se deshace con Ctrl+Z.
      texts: snapshotTexts(),
      shapes: snapshotShapes(),
    });
    if (undoStack.current.length > 32) undoStack.current.shift();
    redoStack.current = [];
    syncHistory();
    setHasArtwork(true);
    setPreviewVersion(v => v + 1);
  };

  const getPos = (e: React.PointerEvent) => {
    const r = dragRect.current ?? canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * sizeW,
      y: ((e.clientY - r.top) / r.height) * sizeH,
    };
  };

  const drag = useRef<{
    active: boolean; tool: Tool;
    last: { x: number; y: number };
    start: { x: number; y: number };
    smooth: { x: number; y: number };
    // Arrastre del objeto de texto seleccionado (herramienta «Mover»).
    textId?: string | null;
    textLayerId?: string | null;
    textStart?: { x: number; y: number } | null;
    // Arrastre de la forma seleccionada (herramienta «Mover»).
    shapeId?: string | null;
    shapeLayerId?: string | null;
    shapeStart?: { x0: number; y0: number; x1: number; y1: number } | null;
  }>({ active: false, tool: "brush", last: { x: 0, y: 0 }, start: { x: 0, y: 0 }, smooth: { x: 0, y: 0 } });

  // Copia del bitmap de la capa tomada al empezar el trazo: cancelar (el
  // segundo dedo de un pellizco, por ejemplo) devuelve el lienzo al instante,
  // sin decodificar el PNG guardado en el historial.
  const strokeBackup = useRef<HTMLCanvasElement | null>(null);
  const strokeBackupLayerId = useRef<string | null>(null);


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
    if (!erase) { drawBrush(c, brush, color, w ?? width, x0, y0, x1, y1); return; }
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

  const captureStrokeBackup = () => {
    const layer = activeLayer();
    if (!layer) return;
    let backup = strokeBackup.current;
    if (!backup) { backup = document.createElement("canvas"); strokeBackup.current = backup; }
    if (backup.width !== sizeW || backup.height !== sizeH) { backup.width = sizeW; backup.height = sizeH; }
    const c = backup.getContext("2d")!;
    c.clearRect(0, 0, sizeW, sizeH);
    c.drawImage(layer.canvas, 0, 0);
    strokeBackupLayerId.current = layer.id;
  };

  const stampDot = (x: number, y: number, erase: boolean, w?: number) => {
    const c = bctx();
    if (!erase) { drawBrush(c, brush, color, w ?? width, x, y, x, y); return; }
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
    const img = c.getImageData(0, 0, sizeW, sizeH);
    const data = img.data;
    const W = sizeW, H = sizeH;
    const idx = (x: number, y: number) => (y * W + x) * 4;
    const startX = Math.floor(sx), startY = Math.floor(sy);
    if (startX < 0 || startY < 0 || startX >= W || startY >= H) return;
    const i0 = idx(startX, startY);
    const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
    const fr = parseInt(hex.slice(1, 3), 16);
    const fg = parseInt(hex.slice(3, 5), 16);
    const fb = parseInt(hex.slice(5, 7), 16);
    // Tolerance handles anti-aliased edges so no thin halo remains.
    const TOL = 90 * 90; // squared color distance
    const TOL_A = 80;     // alpha tolerance
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
    // Dilate filled mask by 2px to eat into AA halo and remove leftover gaps.
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

  /**
   * Borrador de la forma que se está trazando: es el mismo objeto que se
   * guardará al soltar el dedo, así que lo que se ve durante el gesto es
   * exactamente lo que queda en el lienzo (y luego se puede mover y editar).
   */
  const shapeDraftAt = (x0: number, y0: number, x1: number, y1: number, square: boolean): ShapeObject => {
    const end = square ? constrainShape(x0, y0, x1, y1) : { x1, y1 };
    return {
      id: "draft",
      shape: shapeKind,
      x0, y0,
      x1: end.x1, y1: end.y1,
      color,
      width,
      filled: shapeFilled && shapeClosed(shapeKind),
    };
  };

  /** Guarda un color en la fila de recientes (sin duplicados). */
  const rememberColor = (hex: string) => {
    const v = hex.toLowerCase();
    setRecent(prev => [v, ...prev.filter(c => c !== v)].slice(0, 8));
  };

  /** Elige un color y lo recuerda en la fila de recientes. */
  const paintColor = (hex: string) => {
    setColor(hex.toLowerCase());
    rememberColor(hex);
  };

  const pickColorAt = (x: number, y: number) => {
    const buf = bufferRef.current; if (!buf) return;
    const c = buf.getContext("2d")!;
    const d = c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (d[3] === 0) return;
    const hex = "#" + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, "0")).join("");
    paintColor(hex);
  };

  const cancelStroke = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    // Todo gesto guarda su punto de deshacer al empezar, así que cancelar
    // siempre tiene algo que devolver: es lo que deja el lienzo intacto cuando
    // el dedo que iba a pintar resulta ser el primer dedo de un pellizco.
    // La copia vale solo para este trazo: se toma ahora y deja de valer aquí,
    // así que una cancelación nunca puede devolver un bitmap viejo.
    const backup = strokeBackupLayerId.current ? strokeBackup.current : null;
    const backupLayerId = strokeBackupLayerId.current;
    strokeBackupLayerId.current = null;
    const prev = undoStack.current.pop();
    syncHistory();
    // Cancelar no dejó dibujo nuevo: la invitación a dibujar vuelve a su sitio.
    setHasArtwork(artworkBeforeGesture.current);
    if (!prev) return;
    const layer = layersRef.current.find(l => l.id === prev.layerId);
    if (!layer) return;
    // Cancelar también devuelve los objetos a como estaban antes del gesto.
    applyTextSnapshot(prev.texts);
    reconcileTextSelection();
    applyShapeSnapshot(prev.shapes);
    reconcileShapeSelection();
    // La vuelta atrás es inmediata, copiando el bitmap que se guardó al empezar
    // el trazo. Decodificar el PNG del historial dejaba a la vista, durante un
    // instante, el punto del trazo que el pellizco venía a descartar.
    if (backup && backupLayerId === layer.id) {
      const c = layer.canvas.getContext("2d")!;
      c.clearRect(0, 0, sizeW, sizeH);
      c.drawImage(backup, 0, 0);
      recomposite();
      blit();
      setPreviewVersion(v => v + 1);
      return;
    }
    restoringStroke.current = true;
    const img = new Image();
    img.onload = () => {
      const c = layer.canvas.getContext("2d")!;
      c.clearRect(0, 0, sizeW, sizeH);
      c.drawImage(img, 0, 0);
      restoringStroke.current = false;
      recomposite(); blit();
      setPreviewVersion(v => v + 1);
    };
    img.onerror = () => {
      restoringStroke.current = false;
      console.error("No se pudo restaurar el trazo cancelado del lienzo.");
    };
    img.src = prev.dataUrl;
  };

  // El visor recibe los dedos incluso fuera del cuadrado o al salir de él.
  const onTouchDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    // Los campos del cuadro de texto conservan su interacción táctil normal, y
    // el tirador del lienzo tiene su propio gesto.
    if (e.target instanceof Element && e.target.closest("input, textarea, select, button, [data-canvas-handle]")) return;
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const captureTarget = e.target instanceof HTMLCanvasElement ? e.target : e.currentTarget;
    captureTarget.setPointerCapture(e.pointerId);
    if (touchPoints.current.size === 2 && !gestureBlocked.current) {
      gestureBlocked.current = true;
      cancelStroke();
      activePointerId.current = null;
      dragRect.current = null;
      setTextInput(null);
      // A partir de aquí el lienzo no se rehace hasta soltar (ver `blit`).
      gesturePixels.current = true;
      const entries = [...touchPoints.current.entries()];
      const [a, b] = entries.map(([, point]) => point);
      // El gesto agarra el punto que hay entre los dos dedos y no lo suelta
      // hasta que termine: ese mismo punto sigue a los dedos, así que un
      // pellizco puede acercar y mover el lienzo a la vez.
      const box = boxRef.current;
      const focus = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      liveZoom.current = zoom;
      liveBox.current = null;
      pinch.current = {
        ids: entries.map(([id]) => id),
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        zoom,
        zooming: false,
        anchor: box ? pinchAnchor(box.getBoundingClientRect(), focus) : null,
        focus,
      };
    }
  };

  const onTouchMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!touchPoints.current.has(e.pointerId)) return;
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch.current) return;
    // La ráfaga de eventos del dedo se resuelve en un solo cuadro: se lee la
    // posición de los dedos y se escribe el marco una vez por fotograma.
    schedulePinchFrame();
  };

  const onTouchEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    touchPoints.current.delete(e.pointerId);
    if (pinch.current?.ids.includes(e.pointerId)) {
      pinch.current = null;
      pinchFrames.current?.cancel();
      // El gesto terminó: el zoom se fija de una vez (un solo render) y el
      // lienzo se repinta a la escala final.
      liveBox.current = null;
      if (liveZoom.current !== zoom) setZoom(liveZoom.current);
      endViewGesture();
    }
    // No volver a dibujar con el dedo restante: esperar a levantar todos.
    if (touchPoints.current.size === 0) {
      gestureBlocked.current = false;
      endViewGesture();
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (gestureBlocked.current || restoringStroke.current || touchPoints.current.size > 1) return;
    activePointerId.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    // Cache bounding rect for the whole drag — avoids layout reads per move
    dragRect.current = canvasRef.current!.getBoundingClientRect();
    // Ensure display canvas backing-store is sized correctly before drawing on it
    blit();
    const p = getPos(e);
    if (tool === "picker") { pickColorAt(p.x, p.y); dragRect.current = null; return; }
    if (tool === "text") {
      const hit = hitTestText(p.x, p.y);
      if (hit) {
        activeLayerIdRef.current = hit.layer.id;
        setActiveLayerId(hit.layer.id);
        selectText(hit.text.id);
        setTextInput({ open: true, ...hit.text, value: hit.text.text });
        dragRect.current = null;
        return;
      }
      if (!isLayerEditable()) { dragRect.current = null; return; }
      setTextInput({ open: true, x: p.x, y: p.y, value: "", fontSize: Math.max(16, width * 4), font: "Rajdhani", color });
      dragRect.current = null;
      return;
    }
    // «Formas»: el gesto traza la forma elegida. Se ve mientras se arrastra y
    // al soltar queda como objeto, no fundida con los píxeles.
    if (tool === "shape") {
      if (!isLayerEditable()) { dragRect.current = null; return; }
      pushSnapshot();
      captureStrokeBackup();
      drag.current = { active: true, tool, last: p, start: p, smooth: p };
      selectText(null);
      selectShape(null);
      const draft = shapeDraftAt(p.x, p.y, p.x, p.y, e.shiftKey);
      blit(ctx => paintShape(ctx, draft));
      return;
    }
    // «Mover» trabaja sobre objetos, no sobre píxeles: si se toca un texto o una
    // forma se arrastra SOLO ese objeto; si no, no se desplaza nada del dibujo.
    if (tool === "move") {
      const hitText = hitTestText(p.x, p.y);
      if (hitText) {
        if (hitText.layer.id !== activeLayerIdRef.current) {
          activeLayerIdRef.current = hitText.layer.id;
          setActiveLayerId(hitText.layer.id);
        }
        selectShape(null);
        selectText(hitText.text.id);
        setTextInput(null);
        pushSnapshot();
        captureStrokeBackup();
        drag.current = {
          active: true, tool, last: p, start: p, smooth: p,
          textId: hitText.text.id, textLayerId: hitText.layer.id,
          textStart: { x: hitText.text.x, y: hitText.text.y },
        };
        blit();
        return;
      }
      const hitShape = hitTestShapeObject(p.x, p.y);
      if (hitShape) {
        if (hitShape.layer.id !== activeLayerIdRef.current) {
          activeLayerIdRef.current = hitShape.layer.id;
          setActiveLayerId(hitShape.layer.id);
        }
        selectText(null);
        setTextInput(null);
        selectShape(hitShape.shape.id);
        pushSnapshot();
        captureStrokeBackup();
        drag.current = {
          active: true, tool, last: p, start: p, smooth: p,
          shapeId: hitShape.shape.id, shapeLayerId: hitShape.layer.id,
          shapeStart: {
            x0: hitShape.shape.x0, y0: hitShape.shape.y0,
            x1: hitShape.shape.x1, y1: hitShape.shape.y1,
          },
        };
        blit();
        return;
      }
      dragRect.current = null;
      selectText(null);
      selectShape(null);
      recomposite(); blit();
      return;
    }
    if (!isLayerEditable()) { dragRect.current = null; return; }
    if (tool === "fill") {
      pushSnapshot();
      captureStrokeBackup();
      drag.current = { active: true, tool, last: p, start: p, smooth: p };
      floodFill(p.x, p.y, color);
      recomposite(); blit();
      return;
    }
    // Lápiz y borrador. El punto se pinta en el MISMO instante del toque,
    // también con el dedo: el lienzo responde al apoyar, sin esperar a que el
    // gesto se aclare. Si aparece un segundo dedo, el gesto pasa a ser un
    // pellizco y `cancelStroke` devuelve la capa a su copia de seguridad, así
    // que aquel punto suelto desaparece y el dibujo queda como estaba.
    drag.current = { active: true, tool, last: p, start: p, smooth: p };
    pushSnapshot();
    captureStrokeBackup();
    const pr = pressureOn && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5;
    const w = width * (pressureOn && brush !== "pixel" ? (0.4 + 1.2 * pr) : 1);
    stampDot(p.x, p.y, tool === "eraser", w);
    recomposite();
    blit();
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    if (activePointerId.current !== e.pointerId) return;
    if (gestureBlocked.current || touchPoints.current.size > 1) return;
    const p = getPos(e);
    if (drag.current.tool === "brush" || drag.current.tool === "eraser") {
      const r = dragRect.current!;
      const events = (typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : []) as PointerEvent[];
      const points = events.length ? events.map(ev => ({
        x: ((ev.clientX - r.left) / r.width) * sizeW,
        y: ((ev.clientY - r.top) / r.height) * sizeH,
        pressure: ev.pressure,
      })) : [{ x: p.x, y: p.y, pressure: e.pressure }];
      const erase = drag.current.tool === "eraser";
      for (const pt of points) {
        const pr = pressureOn && pt.pressure > 0 && pt.pressure !== 0.5 ? pt.pressure : 0.5;
        const w = width * (pressureOn && brush !== "pixel" ? (0.4 + 1.2 * pr) : 1);
        let x1 = pt.x, y1 = pt.y;
        if (stabilizeLevel > 0 && brush !== "pixel") {
          const smoothed = stabilizePoint(drag.current.last, pt, stabilizeLevel);
          x1 = smoothed.x;
          y1 = smoothed.y;
        }
        strokeSegment(drag.current.last.x, drag.current.last.y, x1, y1, erase, w);
        drag.current.last = { x: x1, y: y1 };
      }
      // Cada segmento se compone y se pinta en el canvas visible en el mismo
      // gesto: el trazo aparece al instante, con cualquier lápiz y sin tener
      // que levantar el dedo ni hacer nada más.
      recomposite();
      blit();
    } else if (drag.current.tool === "shape") {
      // La forma sigue al dedo con la misma geometría que tendrá al soltarla.
      const draft = shapeDraftAt(drag.current.start.x, drag.current.start.y, p.x, p.y, e.shiftKey);
      blit(ctx => paintShape(ctx, draft));
    } else if (drag.current.tool === "move" && drag.current.shapeId && drag.current.shapeLayerId && drag.current.shapeStart) {
      // Solo se mueve esa forma: el bitmap y el resto de objetos se quedan.
      const id = drag.current.shapeId;
      const dx = Math.round(p.x - drag.current.start.x);
      const dy = Math.round(p.y - drag.current.start.y);
      const moved = translateShape(drag.current.shapeStart, dx, dy);
      updateShapes(drag.current.shapeLayerId, shapes =>
        shapes.map(s => s.id === id ? { ...s, ...moved } : s));
      recomposite(); blit();
    } else if (drag.current.tool === "move" && drag.current.textId && drag.current.textLayerId && drag.current.textStart) {
      // Solo se mueve el objeto de texto: el bitmap de la capa y el resto de
      // los textos se quedan exactamente donde estaban.
      const id = drag.current.textId;
      const nx = Math.round(drag.current.textStart.x + (p.x - drag.current.start.x));
      const ny = Math.round(drag.current.textStart.y + (p.y - drag.current.start.y));
      updateTexts(drag.current.textLayerId, texts =>
        texts.map(t => t.id === id ? { ...t, x: nx, y: ny } : t));
      recomposite(); blit();
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    if (activePointerId.current !== e.pointerId) return;
    const p = getPos(e);
    const t = drag.current.tool;
    if (t === "brush" || t === "eraser") {
      const erase = t === "eraser";
      // El punto del toque ya se pintó al apoyar (también con el dedo): aquí
      // solo se cierra el trazo hasta donde se ha soltado.
      strokeSegment(drag.current.last.x, drag.current.last.y, p.x, p.y, erase);
      recomposite(); blit();
    } else if (t === "shape") {
      const from = drag.current.start;
      const draft = shapeDraftAt(from.x, from.y, p.x, p.y, e.shiftKey);
      // Un toque suelto no deja una forma de un píxel: se descarta el punto de
      // deshacer que se había guardado al empezar el gesto.
      if (shapeBox(draft.x0, draft.y0, draft.x1, draft.y1).w < 2 && shapeBox(draft.x0, draft.y0, draft.x1, draft.y1).h < 2) {
        cancelStroke();
      } else {
        addShapeObject({ ...draft, id: uid() });
        recomposite(); blit();
      }
    } else if (t === "move") {
      // Un toque selecciona y abre la edición; un arrastre solo recoloca.
      if (Math.hypot(p.x - drag.current.start.x, p.y - drag.current.start.y) * displayScale.current < 6) {
        const hit = findText(drag.current.textId ?? null);
        if (hit) setTextInput({ open: true, ...hit.text, value: hit.text.text });
      }
      drag.current.textId = null;
      drag.current.textLayerId = null;
      drag.current.textStart = null;
      drag.current.shapeId = null;
      drag.current.shapeLayerId = null;
      drag.current.shapeStart = null;
      recomposite(); blit();
    }
    drag.current.active = false;
    activePointerId.current = null;
    dragRect.current = null;
    // El trazo terminó bien: su copia de seguridad ya no hace falta.
    strokeBackupLayerId.current = null;
    setPreviewVersion(v => v + 1);
  };

  const commitText = () => {
    const state = textInput;
    if (!state || !state.value.trim()) { setTextInput(null); return; }
    const layer = activeLayer();
    if (!layer || !isLayerEditable()) { setTextInput(null); return; }
    pushSnapshot();
    const obj: TextObject = {
      id: state.id ?? uid(),
      text: state.value,
      x: Math.round(state.x),
      y: Math.round(state.y),
      fontSize: Math.max(8, Math.min(200, Math.round(state.fontSize) || 16)),
      font: state.font,
      color: state.color,
    };
    updateTexts(layer.id, texts => state.id ? texts.map(t => t.id === state.id ? obj : t) : [...texts, obj]);
    setTextInput(null);
    // Nace seleccionado y con la herramienta «Mover» lista para colocarlo.
    selectShape(null);
    selectText(obj.id);
    setTool("move");
    setHasArtwork(true);
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };

  /** Restaura un punto de deshacer: bitmaps de capa (si aplica) y objetos. */
  const applySnapshot = (snap: Snapshot, target: Snapshot[]) => {
    const layer = layersRef.current.find(l => l.id === snap.layerId);
    target.push({
      layerId: snap.layerId,
      dataUrl: layer ? layer.canvas.toDataURL("image/png") : "",
      texts: snapshotTexts(),
      shapes: snapshotShapes(),
    });
    applyTextSnapshot(snap.texts);
    reconcileTextSelection();
    applyShapeSnapshot(snap.shapes);
    reconcileShapeSelection();
    recomposite(); blit();
    if (!layer || !snap.dataUrl) { setPreviewVersion(v => v + 1); return; }
    const img = new Image();
    img.onload = () => {
      const c = layer.canvas.getContext("2d")!;
      c.clearRect(0, 0, sizeW, sizeH);
      c.drawImage(img, 0, 0);
      recomposite(); blit(); setPreviewVersion(v => v + 1);
    };
    img.src = snap.dataUrl;
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    applySnapshot(prev, redoStack.current);
    syncHistory();
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    applySnapshot(next, undoStack.current);
    syncHistory();
  };

  const clearActiveLayer = () => {
    if (!isLayerEditable()) return;
    pushSnapshot();
    const c = bctx();
    c.clearRect(0, 0, sizeW, sizeH);
    recomposite(); blit();
    setPreviewVersion(v => v + 1);
  };
  const clearAll = () => {
    if (!isLayerEditable()) return;
    setPendingConfirm({
      title: "¿Limpiar la capa activa?",
      description: "Se borra el contenido de la capa seleccionada. Puedes deshacerlo.",
      confirmLabel: "LIMPIAR",
      destructive: true,
      action: clearActiveLayer,
    });
  };

  const save = () => {
    recomposite();
    const buf = bufferRef.current; if (!buf) return;
    const dataUrl = buf.toDataURL("image/png");
    const asset: SpriteAsset = {
      id: uid(),
      name: name.trim() || "drawing",
      width: sizeW,
      height: sizeH,
      fps: 8,
      loop: true,
      frames: [{ id: uid(), layers: [], composite: dataUrl }],
    };
    onSave(asset);
  };

  // Acciones siempre frescas para el listener de teclado (se registra una vez).
  const actionsRef = useRef({
    undo, redo, save,
    deleteSelectedText, duplicateSelectedText, clearTextSelection: () => selectText(null),
    deleteSelectedShape, duplicateSelectedShape, clearShapeSelection: () => selectShape(null),
  });
  useEffect(() => {
    actionsRef.current = {
      undo, redo, save,
      deleteSelectedText, duplicateSelectedText, clearTextSelection: () => selectText(null),
      deleteSelectedShape, duplicateSelectedShape, clearShapeSelection: () => selectShape(null),
    };
  });

  // Atajos: herramientas con una letra, historial con modificador y zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      // Las ventanas rápidas gestionan su foco y Escape; no activar atajos debajo.
      if (t?.closest('[data-paint-quick-setting]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) actionsRef.current.redo(); else actionsRef.current.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); actionsRef.current.redo(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); actionsRef.current.save(); return; }
      // Objeto de texto seleccionado: se puede soltar, borrar o duplicar.
      // Solo fuera de un campo de escritura (ahí Backspace borra una letra).
      if (!typing && selectedTextIdRef.current) {
        if (e.key === "Escape") { e.preventDefault(); actionsRef.current.clearTextSelection(); blit(); return; }
        if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); actionsRef.current.deleteSelectedText(); return; }
        if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); actionsRef.current.duplicateSelectedText(); return; }
      }
      // La forma seleccionada se suelta, se borra y se duplica igual que el texto.
      if (!typing && selectedShapeIdRef.current) {
        if (e.key === "Escape") { e.preventDefault(); actionsRef.current.clearShapeSelection(); blit(); return; }
        if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); actionsRef.current.deleteSelectedShape(); return; }
        if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); actionsRef.current.duplicateSelectedShape(); return; }
      }
      if (mod || typing) return;
      const key = e.key.toLowerCase();
      // Las letras de las formas eligen la forma y activan «Formas».
      const shapeFromKey = SHAPE_BY_KEY[key];
      if (shapeFromKey) { setShapeKind(shapeFromKey); setTool("shape"); return; }
      const next = TOOL_BY_KEY[key];
      if (next) { setTool(next); return; }
      if (e.key === "[") setWidth(w => Math.max(1, w - 1));
      if (e.key === "]") setWidth(w => Math.min(48, w + 1));
      if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Layer operations (panel) ----------
  const addLayer = () => {
    const newL: PaintLayer = { id: uid(), name: `Capa ${layersRef.current.length + 1}`, visible: true, locked: false, opacity: 1, canvas: makeLayerCanvas(), texts: [], shapes: [] };
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
    const copy: PaintLayer = {
      ...src,
      id: uid(),
      name: src.name + " copia",
      canvas: c,
      // Los textos y las formas también se duplican, con identidad propia.
      texts: src.texts.map(t => ({ ...t, id: uid() })),
      shapes: src.shapes.map(s => ({ ...s, id: uid() })),
    };
    const next = [...layersRef.current];
    next.splice(idx + 1, 0, copy);
    layersRef.current = next;
    setLayers(next);
    setActiveLayerId(copy.id);
    activeLayerIdRef.current = copy.id;
    recomposite(); blit();
  };
  const removeLayer = (id: string) => {
    if (layersRef.current.length <= 1) return;
    const next = layersRef.current.filter(l => l.id !== id);
    layersRef.current = next;
    setLayers(next);
    if (activeLayerIdRef.current === id) {
      const fallback = next[next.length - 1].id;
      setActiveLayerId(fallback);
      activeLayerIdRef.current = fallback;
    }
    // Si el texto o la forma seleccionados vivían en esa capa, ya no existen.
    reconcileTextSelection();
    reconcileShapeSelection();
    recomposite(); blit();
  };
  const deleteLayer = (id: string) => {
    if (layersRef.current.length <= 1) return;
    const target = layersRef.current.find(l => l.id === id);
    setPendingConfirm({
      title: "¿Borrar esta capa?",
      description: target ? `Se eliminará «${target.name}» con todo su contenido.` : undefined,
      confirmLabel: "BORRAR",
      destructive: true,
      action: () => removeLayer(id),
    });
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
    if (idx <= 0) return; // nothing below
    const top = layersRef.current[idx];
    const below = layersRef.current[idx - 1];
    const c = below.canvas.getContext("2d")!;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, top.opacity));
    c.drawImage(top.canvas, 0, 0);
    c.restore();
    // Los textos de la capa que se combina pasan a la de abajo: siguen siendo
    // objetos independientes, no se rasterizan.
    const belowTexts = [...below.texts, ...top.texts];
    const belowShapes = [...below.shapes, ...top.shapes];
    const next = layersRef.current
      .filter(l => l.id !== id)
      .map(l => l.id === below.id ? { ...l, texts: belowTexts, shapes: belowShapes } : l);
    layersRef.current = next;
    setLayers(next);
    if (activeLayerIdRef.current === id) {
      setActiveLayerId(below.id);
      activeLayerIdRef.current = below.id;
    }
    recomposite(); blit();
  };
  const flattenNow = () => {
    recomposite();
    const buf = bufferRef.current!;
    const merged = makeLayerCanvas();
    merged.getContext("2d")!.drawImage(buf, 0, 0);
    const texts = layersRef.current.flatMap(l => l.texts.map(t => ({ ...t })));
    const shapes = layersRef.current.flatMap(l => l.shapes.map(s => ({ ...s })));
    const single: PaintLayer = { id: uid(), name: "Aplanada", visible: true, locked: false, opacity: 1, canvas: merged, texts, shapes };
    layersRef.current = [single];
    setLayers([single]);
    setActiveLayerId(single.id);
    activeLayerIdRef.current = single.id;
    undoStack.current = [];
    redoStack.current = [];
    syncHistory();
    recomposite(); blit();
  };
  const flatten = () => {
    setPendingConfirm({
      title: "¿Aplanar todas las capas?",
      description: "Todas las capas se combinan en una sola. El historial de deshacer se vaciará.",
      confirmLabel: "APLANAR",
      destructive: true,
      action: flattenNow,
    });
  };
  const updateLayer = (id: string, p: Partial<PaintLayer>) => {
    const next = layersRef.current.map(l => l.id === id ? { ...l, ...p } : l);
    layersRef.current = next;
    setLayers(next);
    recomposite(); blit();
  };

  // ---------- Tamaño del lienzo (se recorta o se añade, nunca se estira) ----------
  /**
   * Cambia el tamaño del lienzo SIN tocar la escala del dibujo: el contenido se
   * conserva 1:1 desde la esquina, así que agrandar añade superficie vacía y
   * reducir recorta lo que sobra. Los textos y las formas mantienen su tamaño y
   * su sitio: si quedan fuera del lienzo nuevo se recortan, y al agrandarlo otra
   * vez reaparecen. Nada se reescala, así que la obra nunca se deforma.
   */
  const resizeCanvas = (next: CanvasSize) => {
    if (next.w === sizeW && next.h === sizeH) return;
    const kept = keptArea(canvas, next);
    const resized = layersRef.current.map(layer => {
      const out = document.createElement("canvas");
      out.width = next.w; out.height = next.h;
      const c = out.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      // Copia el área que sobrevive, 1:1 y desde la esquina: aquí no hay ninguna
      // escala, solo recorte (y un trozo nuevo, que queda vacío).
      c.drawImage(layer.canvas, kept.x, kept.y, kept.w, kept.h, kept.x, kept.y, kept.w, kept.h);
      return { ...layer, canvas: out };
    });
    layersRef.current = resized;
    setLayers(resized);
    // Los puntos de deshacer guardan bitmaps del tamaño anterior.
    undoStack.current = [];
    redoStack.current = [];
    syncHistory();
    strokeBackupLayerId.current = null;
    textEditSnapshot.current = false;
    shapeEditSnapshot.current = false;
    setCanvas(next);
  };

  /** Los atajos de tamaño dejan el lienzo cuadrado, recortando o añadiendo. */
  const changeSize = (side: number) => resizeCanvas({ w: clampCanvasSide(side), h: clampCanvasSide(side) });

  // Miniatura compuesta para la barra superior (derivada del ESTADO, no de refs).
  const thumb = useMemo(() => {
    try {
      const c = document.createElement("canvas");
      c.width = sizeW; c.height = sizeH;
      const ctx = c.getContext("2d");
      if (!ctx) return "";
      compositeInto(ctx, layers);
      return c.toDataURL("image/png");
    } catch { return ""; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, previewVersion, sizeW, sizeH]);

  const TOOLS: { id: Tool; icon: ReactNode; title: string; key: string }[] = [
    { id: "brush", icon: <Pencil size={20} strokeWidth={1.9} />, title: "Pincel", key: "B" },
    { id: "eraser", icon: <Eraser size={20} strokeWidth={1.9} />, title: "Borrador", key: "E" },
    { id: "fill", icon: <PaintBucket size={20} strokeWidth={1.9} />, title: "Relleno", key: "G" },
    // Una sola herramienta para todas las formas: el icono es la forma elegida y
    // la ventana «Formas» (abajo, junto a «Lápices») tiene el catálogo completo.
    { id: "shape", icon: <ShapeGlyph shape={shapeKind} size={20} />, title: "Formas", key: "S" },
    { id: "picker", icon: <Pipette size={20} strokeWidth={1.9} />, title: "Cuentagotas", key: "I" },
    { id: "text", icon: <Type size={20} strokeWidth={1.9} />, title: "Texto", key: "T" },
    { id: "move", icon: <Move size={20} strokeWidth={1.9} />, title: "Mover", key: "V" },
  ];

  // Marco del lienzo: conserva la proporción del dibujo, así que la vista nunca
  // lo deforma y el zoom sigue siendo una sola escala.
  const frameBox = canvasBox(fitPx, zoom, canvas);
  const boxPx = frameBox.w;
  // Cuadro de texto: anclado al punto tocado, pero siempre dentro del lienzo
  // (mide ~200×170 px, así que se limita su posición para no quedar recortado).
  const textPopupLeft = textInput && boxPx > 0
    ? `${Math.max(0, Math.min((1 - 200 / boxPx) * 100, (textInput.x / sizeW) * 100))}%`
    : "0%";
  const textPopupTop = textInput && boxPx > 0
    ? `${Math.max(0, Math.min((1 - 230 / boxPx) * 100, (textInput.y / sizeH) * 100))}%`
    : "0%";

  // Fuera de paneles animados: un transform en un ancestro limita position:fixed.
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 h-dvh z-[125] flex flex-col bg-background text-foreground overflow-hidden"
      aria-label="Editor de dibujo"
    >
      {/* ══ Barra superior (M3 small top app bar) ═══════════════════════════ */}
      <header className="shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 h-14 sm:h-16 border-b border-line bg-surface-2">
        <button
          onClick={onClose}
          title="Cerrar el editor"
          aria-label="Cerrar el editor"
          className="shrink-0 w-10 h-10 grid place-items-center rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition"
        >
          <X size={20} />
        </button>

        <div
          className="hidden md:block shrink-0 w-9 h-9 rounded-xl border border-line"
          style={
            thumb
              ? {
                  ...CHECKER,
                  backgroundImage: `url(${thumb})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }
              : CHECKER
          }
          aria-hidden
        />

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dibujo sin título"
          aria-label="Nombre del dibujo"
          className="min-w-0 flex-1 max-w-[240px] sm:max-w-[300px] bg-muted border border-line rounded-xl px-2.5 py-1.5 text-[13px] font-medium truncate focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring/40 transition"
        />

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!history.canUndo}
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
            className="hidden md:grid w-10 h-10 place-items-center rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition disabled:opacity-35 disabled:pointer-events-none"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            disabled={!history.canRedo}
            title="Rehacer (Ctrl+Shift+Z)"
            aria-label="Rehacer"
            className="hidden md:grid w-10 h-10 place-items-center rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition disabled:opacity-35 disabled:pointer-events-none"
          >
            <Redo2 size={18} />
          </button>
          <button
            onClick={() => setPanelOpen(true)}
            title="Ajustes y capas"
            aria-label="Abrir ajustes y capas"
            aria-expanded={panelOpen}
            aria-controls="paint-settings"
            className="xl:hidden relative shrink-0 w-10 h-10 grid place-items-center rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition"
          >
            <SlidersHorizontal size={19} />
          </button>
          <button
            onClick={onClose}
            className="hidden sm:inline-flex items-center h-10 px-3 rounded-full text-[13px] font-medium text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            title="Guardar (Ctrl+S)"
            className="btn-grad shrink-0 inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full text-[13px] font-semibold text-primary-foreground active:scale-95 transition"
          >
            <Check size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Guardar</span>
            <span className="sr-only sm:hidden">Guardar</span>
          </button>
        </div>
      </header>

      {/* ══ Cuerpo: rail + lienzo + panel (columna en móvil, fila en escritorio) */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col md:flex-row">
        {/* ── Herramientas: dock inferior en móvil / rail lateral en escritorio */}
        <nav
          aria-label="Herramientas de dibujo"
          className="order-2 md:order-1 shrink-0 flex md:flex-col items-center gap-0.5 md:gap-1 p-1.5 md:py-3 overflow-x-auto md:overflow-x-visible md:overflow-y-auto no-scrollbar border-t md:border-t-0 md:border-r border-line bg-surface-2 md:w-[72px]"
        >
          {TOOLS.map(t => {
            const on = tool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={`${t.title} (${t.key})`}
                aria-label={t.title}
                aria-pressed={on}
                className="group shrink-0 flex flex-col items-center gap-0.5 md:gap-1 md:w-full px-0 md:px-1 py-1 rounded-2xl transition"
              >
                <span
                  className={`grid place-items-center w-10 md:w-11 h-8 rounded-full transition-colors ${
                    on
                      ? "bg-accent text-accent-foreground"
                      : "text-ink-2 group-hover:bg-muted group-hover:text-foreground"
                  }`}
                >
                  {t.icon}
                </span>
                <span className={`hidden md:block text-[10px] leading-none font-medium ${on ? "text-foreground" : "text-ink-3"}`}>
                  {t.title}
                </span>
              </button>
            );
          })}
          {/* Historial en el dock móvil (en escritorio vive en la barra superior) */}
          <span className="md:hidden shrink-0 w-px self-stretch my-2 bg-line" aria-hidden />
          <button
            onClick={undo}
            disabled={!history.canUndo}
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
            className="md:hidden shrink-0 grid place-items-center w-10 h-10 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition disabled:opacity-35 disabled:pointer-events-none"
          >
            <Undo2 size={19} />
          </button>
          <button
            onClick={redo}
            disabled={!history.canRedo}
            title="Rehacer (Ctrl+Shift+Z)"
            aria-label="Rehacer"
            className="md:hidden shrink-0 grid place-items-center w-10 h-10 rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition disabled:opacity-35 disabled:pointer-events-none"
          >
            <Redo2 size={19} />
          </button>
        </nav>

        {/* ── Visor del lienzo ─────────────────────────────────────────────── */}
        <div className="order-1 md:order-2 flex-1 min-w-0 min-h-0 flex flex-col bg-surface-2/50">
          {/* Accesos siempre visibles, independientes del panel de ajustes. */}
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-surface-2" aria-label="Ajustes rápidos del trazo">
            <Popover open={quickSetting === "color"} onOpenChange={open => setQuickSetting(open ? "color" : null)}>
              <PopoverTrigger asChild>
                <button
                  aria-label="Cambiar color"
                  title="Cambiar color"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3 text-xs font-medium hover:bg-accent transition"
                >
                  <span className="h-5 w-5 rounded-full border border-line" style={{ background: color }} aria-hidden />
                  Color
                </button>
              </PopoverTrigger>
              <PopoverContent data-paint-quick-setting align="start" collisionPadding={12} aria-label="Cambiar color del trazo" className="z-[126] w-80 max-w-[calc(100vw-24px)] max-h-[70dvh] overflow-y-auto rounded-2xl border-line">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Color del trazo</h3>
                  <button aria-label="Cerrar color" onClick={() => setQuickSetting(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"><X size={16} /></button>
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <input type="color" value={color} onChange={e => paintColor(e.target.value)} aria-label="Color personalizado" className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-muted" />
                  <span className="text-xs font-mono uppercase">{color}</span>
                  <select value={paletteIdx} onChange={e => setPaletteIdx(Number(e.target.value))} aria-label="Paleta rápida" className="ml-auto min-w-0 rounded-lg border border-line bg-muted px-2 py-2 text-xs">
                    {PALETTES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {PALETTE.map(c => (
                    <button key={c} aria-label={`Color ${c}`} aria-pressed={color === c.toLowerCase()} onClick={() => paintColor(c)} className={`aspect-square rounded-lg border border-line ${color === c.toLowerCase() ? "ring-2 ring-primary ring-offset-2 ring-offset-popover" : "hover:scale-105"}`} style={{ background: c }} />
                  ))}
                </div>
                {recent.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-muted-foreground">Recientes</p>
                    <div className="flex flex-wrap gap-2">
                      {recent.map(c => <button key={c} aria-label={`Color reciente ${c}`} onClick={() => paintColor(c)} className="h-7 w-7 rounded-full border border-line" style={{ background: c }} />)}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Popover open={quickSetting === "width"} onOpenChange={open => setQuickSetting(open ? "width" : null)}>
              <PopoverTrigger asChild>
                <button aria-label="Cambiar grosor" title="Cambiar grosor" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3 text-xs font-medium hover:bg-accent transition">
                  <Pencil size={16} /> Grosor <span className="font-mono tabular-nums text-primary">{width} px</span>
                </button>
              </PopoverTrigger>
              <PopoverContent data-paint-quick-setting align="start" collisionPadding={12} aria-label="Cambiar grosor del trazo" className="z-[126] w-72 max-w-[calc(100vw-24px)] max-h-[70dvh] overflow-y-auto rounded-2xl border-line">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Grosor · {width} px</h3>
                  <button aria-label="Cerrar grosor" onClick={() => setQuickSetting(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"><X size={16} /></button>
                </div>
                <Slider min={1} max={48} step={1} value={[width]} onValueChange={([v]) => setWidth(v)} aria-label="Grosor rápido del trazo" className="my-4" />
                <div className="flex gap-1.5">
                  {BRUSH_PRESETS.map(p => (
                    <button key={p} onClick={() => setWidth(p)} aria-label={`Grosor ${p} píxeles`} aria-pressed={width === p} className={`h-10 flex-1 rounded-full text-xs font-semibold ${width === p ? "bg-accent text-accent-foreground" : "bg-muted text-ink-2 hover:bg-accent"}`}>{p}</button>
                  ))}
                </div>
                <div className="mt-3 grid h-14 place-items-center rounded-xl bg-muted" aria-hidden>
                  <span className="rounded-full" style={{ width, height: width, background: tool === "eraser" ? "var(--muted-foreground)" : color }} />
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {/* Aviso de capa no editable: franja propia, sin tapar el lienzo */}
          {!activeEditable && (
            <div className="shrink-0 h-9 flex items-center justify-center gap-2 px-3 border-b border-line bg-warn/15">
              <AlertTriangle size={14} className="shrink-0 text-warn" />
              <span className="text-[11px] font-medium text-foreground truncate">
                {active
                  ? (active.locked ? "Capa bloqueada: no se puede dibujar en ella" : "Capa oculta: no se puede dibujar en ella")
                  : "Sin capa activa"}
              </span>
              {active && (
                <button
                  onClick={() => updateLayer(active.id, active.locked ? { locked: false } : { visible: true })}
                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
                >
                  {active.locked ? "Desbloquear" : "Mostrar"}
                </button>
              )}
            </div>
          )}
          <div
            ref={viewportRef}
            className="flex-1 min-w-0 min-h-0 flex overflow-auto overscroll-contain touch-none p-3 md:p-5"
            onPointerDownCapture={onTouchDown}
            onPointerMoveCapture={onTouchMove}
            onPointerUpCapture={onTouchEnd}
            onPointerCancelCapture={onTouchEnd}
          >
            {/* El marco conserva la proporción del lienzo y el tirador vive
                fuera del recorte, para que dibujar en la esquina siga libre. */}
            <div
              ref={boxRef}
              className="relative m-auto shrink-0"
              style={{ width: frameBox.w, height: frameBox.h }}
            >
              <div className="absolute inset-0 rounded-2xl border border-line shadow-[var(--m3-elev-2)] overflow-hidden">
              {/* Tablero de transparencia: lo pinta `blit` dentro del bitmap del
                  lienzo, con la misma retícula que la guía. El color de fondo
                  solo cubre el instante previo a la primera pintura. */}
              <div className="w-full h-full relative" style={{ backgroundColor: "var(--m3-surface-lowest)" }}>
                <canvas
                  key={`canvas-${sizeW}x${sizeH}`}
                  ref={canvasRef}
                  className="w-full h-full touch-none block"
                  style={{ touchAction: "none", background: "transparent" }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={() => {
                    cancelStroke();
                    activePointerId.current = null;
                    dragRect.current = null;
                  }}
                />
                {/* La guía de cuadrícula la dibuja `blit` sobre el tablero, con
                    los mismos bordes enteros, así que ya no hay una capa de CSS
                    que se desincronice al hacer zoom. */}
              </div>

              {/* Estado vacío: invita a dibujar sin bloquear el trazo */}
              {!hasArtwork && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-4 text-center">
                  <div className="rounded-2xl bg-popover/90 border border-line px-4 py-3 shadow-[var(--m3-elev-1)]">
                    <Pencil size={22} className="mx-auto text-primary" />
                    <p className="mt-1.5 text-[13px] font-semibold text-foreground">Empieza a dibujar</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Elige una herramienta y traza sobre el lienzo
                    </p>
                  </div>
                </div>
              )}

              {/* Pista de «Mover»: esta herramienta trabaja sobre objetos, no sobre píxeles */}
              {tool === "move" && !selectedText && !selectedShape && (
                <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
                  <span className="rounded-full bg-popover/90 border border-line px-3 py-1 text-[11px] text-muted-foreground shadow-[var(--m3-elev-1)]">
                    {layers.some(l => l.texts.length > 0 || l.shapes.length > 0)
                      ? "Toca un texto o una forma para seleccionarlos y arrástralos para moverlos"
                      : "Añade un texto o una forma y muévelos aquí"}
                  </span>
                </div>
              )}

              {/* Entrada de texto: vive dentro del marco, anclada al punto tocado */}
              {textInput?.open && (
                <div
                  className="absolute z-10 rounded-2xl p-2.5 flex flex-col gap-2 max-w-[92%] max-h-full overflow-y-auto border border-line bg-popover text-popover-foreground shadow-[var(--m3-elev-3)]"
                  style={{ left: textPopupLeft, top: textPopupTop }}
                >
                  <textarea
                    autoFocus
                    value={textInput.value}
                    onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                    placeholder="Escribe el texto…"
                    aria-label="Texto"
                    className="bg-muted border border-line rounded-xl px-2 py-1.5 text-[13px] w-44 min-h-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex items-center gap-1.5">
                    <select
                      value={textInput.font}
                      onChange={(e) => setTextInput({ ...textInput, font: e.target.value })}
                      aria-label="Fuente"
                      className="bg-muted border border-line rounded-xl text-[10px] px-2 py-1 flex-1"
                    >
                      {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input
                      type="number"
                      min={8}
                      max={200}
                      value={textInput.fontSize}
                      onChange={(e) => setTextInput({ ...textInput, fontSize: Number(e.target.value) })}
                      aria-label="Tamaño de fuente"
                      className="bg-muted border border-line rounded-xl text-[10px] px-2 py-1 w-14 tabular-nums"
                    />
                  </div>
                  <label className="flex items-center justify-between gap-2 text-[11px]">
                    Color del texto
                    <input type="color" value={textInput.color} onChange={e => setTextInput({ ...textInput, color: e.target.value })} aria-label="Color del texto en el lienzo" className="h-8 w-12 rounded border border-line bg-muted" />
                  </label>
                  <div className="flex gap-1.5">
                    <button onClick={() => setTextInput(null)} className="flex-1 text-[10px] font-medium px-2 py-1.5 rounded-full border border-line bg-card text-ink-2 hover:bg-accent transition">
                      Cancelar
                    </button>
                    <button onClick={commitText} className="flex-1 btn-grad text-[10px] font-semibold px-2 py-1.5 rounded-full text-primary-foreground active:scale-95 transition">
                      {textInput.id ? "Aplicar" : "Añadir"}
                    </button>
                  </div>
                </div>
              )}
              </div>

              {/* Tirador del lienzo: se arrastra para cambiar su tamaño sin
                  reescalar el dibujo (se recorta o se añade superficie). Vive
                  fuera del recorte, así que la esquina sigue siendo papel. */}
              <div
                data-canvas-handle
                role="button"
                tabIndex={0}
                title={`Cambiar el tamaño del lienzo (${sizeW}×${sizeH})`}
                aria-label="Cambiar el tamaño del lienzo arrastrando"
                onPointerDown={onResizeDown}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                onPointerCancel={onResizeUp}
                className="absolute -bottom-2 -right-2 z-20 grid h-8 w-8 cursor-nwse-resize place-items-center rounded-full border border-line bg-card text-ink-2 shadow-[var(--m3-elev-2)] touch-none hover:text-primary hover:border-primary/40 active:scale-95 transition"
              >
                <Maximize2 size={14} />
              </div>
            </div>
          </div>

          {/* Barra inferior del visor: medidas, zoom y cuadrícula */}
          <div className="shrink-0 h-12 flex items-center justify-between gap-2 px-2 md:px-3 border-t border-line bg-surface-2">
            <span className="pl-1 text-[10px] font-mono tabular-nums text-muted-foreground truncate">
              {sizeW}×{sizeH} · {Math.round(zoom * 100)}%
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Único acceso a los lápices: vive abajo, junto al lienzo, y su
                  ventana se abre desde el borde inferior. */}
              <button
                onClick={() => setQuickSetting("brush")}
                aria-label="Elegir lápices"
                aria-expanded={quickSetting === "brush"}
                aria-controls="paint-brushes-sheet"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[11px] font-medium text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition"
              >
                <Pencil size={15} />
                <span className="hidden sm:inline">Lápices</span>
                <span className="font-mono text-primary">{PAINT_BRUSHES.find(b => b.id === brush)?.name ?? brush}</span>
              </button>
              {/* Misma ubicación y misma apertura que «Lápices»: la ventana con
                  todas las formas disponibles. */}
              <button
                onClick={() => setQuickSetting("shapes")}
                aria-label="Elegir formas"
                aria-expanded={quickSetting === "shapes"}
                aria-controls="paint-shapes-sheet"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[11px] font-medium text-ink-2 hover:bg-accent hover:text-accent-foreground active:scale-95 transition"
              >
                <Shapes size={15} />
                <span className="hidden sm:inline">Formas</span>
                <span className="font-mono text-primary">{shapeDef(shapeKind).name}</span>
              </button>
              <span className="w-px self-stretch my-1.5 bg-line" aria-hidden />
              <span className="hidden lg:inline px-2 text-[10px] text-muted-foreground">Pellizca con dos dedos para ampliar, reducir o mover el lienzo</span>
              <button
                onClick={() => setZoom(1)}
                title="Ajustar al área (0)"
                aria-label="Ajustar al área"
                className="h-9 px-2 rounded-full text-[10px] font-mono tabular-nums text-ink-2 hover:bg-accent hover:text-accent-foreground transition"
              >
                {Math.round(zoom * 100)}%
              </button>
              <span className="w-px self-stretch my-1.5 bg-line" aria-hidden />
              <button
                onClick={() => setShowGrid(g => !g)}
                aria-pressed={showGrid}
                title="Cuadrícula de guía"
                aria-label="Cuadrícula de guía"
                className={`w-9 h-9 grid place-items-center rounded-full transition ${
                  showGrid ? "bg-accent text-accent-foreground" : "text-ink-2 hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Grid size={16} />
              </button>
              <button
                onClick={() => setZoom(1)}
                title="Ajustar al área"
                aria-label="Ajustar al área"
                className="w-9 h-9 grid place-items-center rounded-full text-ink-2 hover:bg-accent hover:text-accent-foreground transition"
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Panel de ajustes y capas (hoja inferior en móvil, fijo en escritorio) */}
        {panelOpen && (
          <div
            className="xl:hidden absolute inset-0 z-30 bg-black/40"
            onClick={() => setPanelOpen(false)}
            aria-hidden
          />
        )}
        <aside
          id="paint-settings"
          aria-label="Ajustes y capas"
          className={`${
            panelOpen ? "flex" : "hidden"
          } xl:flex order-3 shrink-0 min-w-0 flex-col absolute inset-x-0 bottom-0 z-40 max-h-[80dvh] rounded-t-[28px] xl:static xl:inset-auto xl:z-auto xl:max-h-none xl:rounded-none border-t xl:border-t-0 xl:border-l border-line bg-card shadow-[var(--m3-elev-3)] xl:shadow-none w-full max-w-xl mx-auto xl:mx-0 xl:w-[320px] 2xl:w-[352px]`}
        >
          <div className="xl:hidden shrink-0 pt-2 pb-1 flex justify-center">
            <span className="h-1 w-9 rounded-full bg-line-strong" aria-hidden />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-1 xl:py-3 space-y-2.5">
            {/* — Trazo — */}
            <SectionCard label="Trazo" icon={<Pencil size={11} />}>
              <label className="mt-2.5 flex items-center justify-between gap-2 cursor-pointer select-none">
                <span className="text-[11px] text-ink-2">Presión</span>
                <Switch checked={pressureOn} onCheckedChange={setPressureOn} aria-label="Sensibilidad a la presión" />
              </label>
            </SectionCard>

            {/* — Estabilización del lápiz: barra para calibrar el trazo — */}
            <SectionCard label="Estabilización" icon={<Pencil size={11} />}>
              <div className="mt-1 flex items-center gap-3">
                <Slider
                  min={STABILIZE_MIN}
                  max={STABILIZE_MAX}
                  step={1}
                  value={[stabilizeLevel]}
                  onValueChange={([v]) => setStabilizeLevel(v)}
                  aria-label="Nivel de estabilización del lápiz"
                  className="flex-1"
                />
                <span className="text-[11px] font-mono tabular-nums text-primary w-9 text-right">
                  {stabilizeLevel}%
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                {stabilizeLevel === 0
                  ? "Sin estabilización: el trazo sigue el dedo o el lápiz al instante. Ideal para detalles rápidos."
                  : "Suaviza el temblor de la mano: a más nivel el trazo es más limpio, pero responde un poco más despacio."}
              </p>
            </SectionCard>

            {/* — Texto seleccionado: objeto independiente del dibujo — */}
            {selectedText && (
              <SectionCard
                label="Texto seleccionado"
                icon={<Type size={11} />}
                action={
                  <button
                    onClick={duplicateSelectedText}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-line bg-card text-ink-2 hover:bg-accent transition inline-flex items-center gap-1"
                  >
                    <Copy size={11} /> Duplicar
                  </button>
                }
              >
                <textarea
                  value={selectedText.text}
                  onFocus={beginTextFieldEdit}
                  onBlur={() => { textEditSnapshot.current = false; }}
                  onChange={(e) => updateSelectedText({ text: e.target.value })}
                  aria-label="Contenido del texto"
                  className="w-full bg-muted border border-line rounded-xl px-2 py-1.5 text-[13px] min-h-[56px] focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <div className="mt-2 flex items-center gap-1.5">
                  <select
                    value={selectedText.font}
                    onChange={(e) => updateSelectedText({ font: e.target.value })}
                    aria-label="Fuente del texto"
                    className="bg-muted border border-line rounded-xl text-[10px] px-2 py-1 flex-1"
                  >
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <input
                    type="number"
                    min={8}
                    max={200}
                    value={selectedText.fontSize}
                    onFocus={beginTextFieldEdit}
                    onBlur={() => { textEditSnapshot.current = false; }}
                    onChange={(e) => updateSelectedText({ fontSize: Math.max(8, Math.min(200, Number(e.target.value) || 8)) })}
                    aria-label="Tamaño de fuente del texto"
                    className="bg-muted border border-line rounded-xl text-[10px] px-2 py-1 w-14 tabular-nums"
                  />
                  <label className="relative w-8 h-8 shrink-0" title="Color del texto">
                    <input
                      type="color"
                      value={selectedText.color}
                      onChange={(e) => updateSelectedText({ color: e.target.value.toLowerCase() })}
                      aria-label="Color del texto"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <span
                      className="block w-8 h-8 rounded-xl border border-line pointer-events-none"
                      style={{ background: selectedText.color }}
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] leading-relaxed text-ink-3">
                    Arrastra con «Mover» para colocarlo: solo se mueve este texto.
                  </span>
                  <button
                    onClick={deleteSelectedText}
                    className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition inline-flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Borrar
                  </button>
                </div>
              </SectionCard>
            )}

            {/* — Forma seleccionada: editable también después de colocarla — */}
            {selectedShape && selectedShapeBox && (
              <SectionCard
                label="Forma seleccionada"
                icon={<Shapes size={11} />}
                action={
                  <button
                    onClick={duplicateSelectedShape}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-line bg-card text-ink-2 hover:bg-accent transition inline-flex items-center gap-1"
                  >
                    <Copy size={11} /> Duplicar
                  </button>
                }
              >
                <ShapePicker
                  value={selectedShape.shape}
                  onPick={kind => { beginShapeFieldEdit(); updateSelectedShape({ shape: kind }); }}
                />
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {([
                    { label: "X", value: Math.round(selectedShapeBox.x), aria: "Posición X de la forma", apply: (v: number) => placeShape(selectedShape, v, selectedShapeBox.y) },
                    { label: "Y", value: Math.round(selectedShapeBox.y), aria: "Posición Y de la forma", apply: (v: number) => placeShape(selectedShape, selectedShapeBox.x, v) },
                    { label: "Ancho", value: Math.round(selectedShapeBox.w), aria: "Ancho de la forma", apply: (v: number) => resizeShape(selectedShape, v, selectedShapeBox.h) },
                    { label: "Alto", value: Math.round(selectedShapeBox.h), aria: "Alto de la forma", apply: (v: number) => resizeShape(selectedShape, selectedShapeBox.w, v) },
                  ]).map(field => (
                    <label key={field.label} className="flex items-center gap-1.5 text-[10px] text-ink-3">
                      {field.label}
                      <input
                        type="number"
                        min={field.label === "Ancho" || field.label === "Alto" ? 1 : 0}
                        max={field.label === "Ancho" ? sizeW : field.label === "Alto" ? sizeH : Math.max(sizeW, sizeH)}
                        value={field.value}
                        onFocus={beginShapeFieldEdit}
                        onBlur={() => { shapeEditSnapshot.current = false; }}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const v = Number.isFinite(raw) ? Math.round(raw) : 0;
                          updateSelectedShape(field.apply(v));
                        }}
                        aria-label={field.aria}
                        className="min-w-0 flex-1 bg-muted border border-line rounded-lg px-2 py-1 text-[10px] tabular-nums"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Slider
                    min={1}
                    max={48}
                    step={1}
                    value={[selectedShape.width]}
                    onValueChange={([v]) => { beginShapeFieldEdit(); updateSelectedShape({ width: v }); }}
                    onValueCommit={() => { shapeEditSnapshot.current = false; }}
                    aria-label="Grosor de la forma seleccionada"
                    className="flex-1"
                  />
                  <span className="w-8 text-right font-mono text-[10px] tabular-nums text-primary">{selectedShape.width}</span>
                  <label className="relative h-8 w-8 shrink-0" title="Color de la forma">
                    <input
                      type="color"
                      value={selectedShape.color}
                      onChange={(e) => updateSelectedShape({ color: e.target.value.toLowerCase() })}
                      aria-label="Color de la forma"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <span className="pointer-events-none block h-8 w-8 rounded-xl border border-line" style={{ background: selectedShape.color }} />
                  </label>
                </div>
                <label className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span>Relleno sólido</span>
                  <Switch
                    checked={selectedShape.filled && shapeClosed(selectedShape.shape)}
                    onCheckedChange={v => { beginShapeFieldEdit(); updateSelectedShape({ filled: v }); }}
                    disabled={!shapeClosed(selectedShape.shape)}
                    aria-label="Relleno de la forma seleccionada"
                  />
                </label>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] leading-relaxed text-ink-3">
                    Arrástrala con «Mover» (V) o escribe aquí su posición: solo se mueve esta forma.
                  </span>
                  <button
                    onClick={deleteSelectedShape}
                    className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition inline-flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Borrar
                  </button>
                </div>
              </SectionCard>
            )}

            {/* — Capas — */}
            <SectionCard
              label={`Capas · ${layers.length}`}
              icon={<Layers size={11} />}
              action={
                <div className="flex gap-1">
                  <button
                    onClick={addLayer}
                    className="btn-grad text-[10px] font-semibold px-2.5 py-1 rounded-full text-primary-foreground inline-flex items-center gap-1 active:scale-95 transition"
                  >
                    <Plus size={11} strokeWidth={2.5} /> Nueva
                  </button>
                  <button
                    onClick={flatten}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-line bg-card text-ink-2 hover:bg-accent transition"
                  >
                    Aplanar
                  </button>
                </div>
              }
            >
              <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-0.5">
                {[...layers].slice().reverse().map((l) => {
                  const isActive = l.id === activeLayerId;
                  return (
                    <div
                      key={l.id}
                      onClick={() => { setActiveLayerId(l.id); activeLayerIdRef.current = l.id; }}
                      className={`group rounded-xl p-2 flex flex-col gap-1.5 transition-colors cursor-pointer border ${
                        isActive ? "border-primary/40 bg-accent/40" : "border-line bg-muted hover:bg-accent/25"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-8 h-8 rounded-lg shrink-0 border border-line"
                          style={{
                            ...CHECKER,
                            backgroundImage: `url(${(() => { try { return l.canvas.toDataURL("image/png"); } catch { return ""; } })()})`,
                            backgroundSize: "contain",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat",
                            opacity: l.visible ? 1 : 0.35,
                          }}
                        />
                        <input
                          value={l.name}
                          onChange={(e) => updateLayer(l.id, { name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Nombre de la capa"
                          className="flex-1 min-w-0 bg-transparent text-[11px] font-medium focus:outline-none focus:bg-card rounded px-1 py-0.5"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }}
                          title={l.visible ? "Ocultar capa" : "Mostrar capa"}
                          aria-label={l.visible ? "Ocultar capa" : "Mostrar capa"}
                          className={`w-7 h-7 grid place-items-center rounded-full transition hover:bg-accent ${l.visible ? "text-primary" : "text-muted-foreground"}`}
                        >
                          {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { locked: !l.locked }); }}
                          title={l.locked ? "Desbloquear capa" : "Bloquear capa"}
                          aria-label={l.locked ? "Desbloquear capa" : "Bloquear capa"}
                          className={`w-7 h-7 grid place-items-center rounded-full transition hover:bg-accent ${l.locked ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {l.locked ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }}
                          disabled={layers.length <= 1}
                          title="Borrar capa"
                          aria-label="Borrar capa"
                          className="w-7 h-7 grid place-items-center rounded-full text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-1 pl-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }}
                            title="Subir capa"
                            aria-label="Subir capa"
                            className="w-7 h-7 grid place-items-center rounded-full text-ink-2 hover:bg-accent transition"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }}
                            title="Bajar capa"
                            aria-label="Bajar capa"
                            className="w-7 h-7 grid place-items-center rounded-full text-ink-2 hover:bg-accent transition"
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateLayer(l.id); }}
                            title="Duplicar capa"
                            className="ml-auto text-[10px] font-medium px-2.5 py-1 rounded-full border border-line bg-card text-ink-2 hover:bg-accent transition inline-flex items-center gap-1"
                          >
                            <Copy size={11} /> Duplicar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); mergeDown(l.id); }}
                            disabled={layers[0]?.id === l.id}
                            title="Combinar con la capa de abajo"
                            className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-line bg-card text-ink-2 hover:bg-accent transition disabled:opacity-40 disabled:pointer-events-none"
                          >
                            Combinar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {active && (
                <div className="flex items-center gap-3 mt-2.5">
                  <span className="text-[11px] text-ink-2 shrink-0">Opacidad</span>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round((active.opacity ?? 1) * 100)]}
                    onValueChange={([v]) => updateLayer(active.id, { opacity: v / 100 })}
                    aria-label="Opacidad de la capa"
                    className="flex-1"
                  />
                  <span className="text-[11px] font-mono tabular-nums text-primary w-9 text-right">
                    {Math.round((active.opacity ?? 1) * 100)}%
                  </span>
                </div>
              )}
            </SectionCard>

            {/* — Lienzo — */}
            <SectionCard
              label="Lienzo"
              icon={<Maximize2 size={11} />}
              action={
                <button
                  onClick={clearAll}
                  disabled={!activeEditable}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1"
                >
                  <Trash2 size={11} /> Limpiar
                </button>
              }
            >
              <div className="grid grid-cols-5 gap-1.5">
                {SIZE_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => changeSize(s)}
                    aria-pressed={sizeW === s && sizeH === s}
                    className={`h-8 rounded-full text-[10px] font-semibold tabular-nums transition ${
                      sizeW === s && sizeH === s
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-ink-2 hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                Arrastra el tirador de la esquina para cambiar el tamaño del lienzo: el dibujo no
                cambia de escala —lo que sobra se recorta y lo que falta se añade vacío— y la
                cuadrícula se quita o se añade con él. La guía se activa desde el visor.
              </p>
            </SectionCard>
          </div>

          <div className="xl:hidden shrink-0 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] border-t border-line">
            <button
              onClick={() => setPanelOpen(false)}
              className="w-full h-11 rounded-full btn-grad text-[13px] font-semibold text-primary-foreground active:scale-[0.98] transition"
            >
              Listo
            </button>
          </div>
        </aside>
      </div>

      {/* Hoja inferior de lápices: siempre entra desde abajo, nunca desde arriba. */}
      {quickSetting === "brush" && (
        <>
          <div
            className="fixed inset-0 z-[125] bg-black/40 animate-in fade-in"
            onClick={() => setQuickSetting(null)}
            aria-hidden
          />
          <div
            id="paint-brushes-sheet"
            role="dialog"
            aria-label="Tipos de lápiz"
            className="fixed inset-x-0 bottom-0 z-[126] mx-auto w-full max-w-md rounded-t-[28px] border-t border-line bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--m3-elev-3)] animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-strong" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Tipos de lápiz</h3>
              <button aria-label="Cerrar lápices" onClick={() => setQuickSetting(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              {PAINT_BRUSHES.map(item => (
                <button
                  key={item.id}
                  aria-pressed={brush === item.id}
                  onClick={() => { setBrush(item.id); setTool("brush"); setQuickSetting(null); }}
                  className={`w-full rounded-xl border p-3 text-left transition ${brush === item.id ? "border-primary bg-accent text-accent-foreground" : "border-line hover:bg-muted"}`}
                >
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Hoja inferior de formas: entra desde abajo, igual que la de lápices. */}
      {quickSetting === "shapes" && (
        <>
          <div
            className="fixed inset-0 z-[125] bg-black/40 animate-in fade-in"
            onClick={() => setQuickSetting(null)}
            aria-hidden
          />
          <div
            id="paint-shapes-sheet"
            role="dialog"
            aria-label="Formas disponibles"
            data-paint-quick-setting
            className="fixed inset-x-0 bottom-0 z-[126] mx-auto w-full max-w-md max-h-[80dvh] overflow-y-auto rounded-t-[28px] border-t border-line bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--m3-elev-3)] animate-in slide-in-from-bottom duration-200"
          >
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-strong" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Formas</h3>
              <button aria-label="Cerrar formas" onClick={() => setQuickSetting(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"><X size={16} /></button>
            </div>
            <ShapePicker
              value={shapeKind}
              onPick={id => { setShapeKind(id); setTool("shape"); }}
            />
            <label className="mt-3 flex items-center justify-between gap-2 text-[11px]">
              <span>Grosor</span>
              <span className="flex items-center gap-2">
                <Slider min={1} max={48} step={1} value={[width]} onValueChange={([v]) => setWidth(v)} aria-label="Grosor de la forma" className="w-28" />
                <span className="w-10 text-right font-mono tabular-nums text-primary">{width} px</span>
              </span>
            </label>
            <label className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span>Relleno sólido</span>
              <Switch
                checked={shapeFilled && shapeClosed(shapeKind)}
                onCheckedChange={setShapeFilled}
                disabled={!shapeClosed(shapeKind)}
                aria-label="Relleno de la forma"
              />
            </label>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
              {shapeClosed(shapeKind)
                ? `${shapeDef(shapeKind).name}: ${shapeDef(shapeKind).description}. Arrastra sobre el lienzo para colocarla.`
                : `${shapeDef(shapeKind).name} es una forma abierta: solo se puede trazar.`}
              {" "}Al soltarla queda seleccionada y con «Mover» la cambias de sitio cuando quieras.
            </p>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        destructive={pendingConfirm?.destructive}
        onConfirm={() => {
          const pending = pendingConfirm;
          setPendingConfirm(null);
          pending?.action();
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>,
    document.body,
  );
}
