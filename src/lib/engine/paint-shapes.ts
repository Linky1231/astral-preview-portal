/**
 * Formas del editor de dibujo.
 *
 * Antes el lienzo solo tenía línea, rectángulo y círculo, y además se
 * «quemaban» en el bitmap de la capa al soltar el dedo: una vez colocadas no se
 * podían ni mover ni corregir. Aquí vive todo lo que hace falta para tratarlas
 * como objetos:
 *
 *   · el catálogo de formas disponibles (lo que muestra la ventana «Formas»)
 *   · la geometría, en comandos de trazo independientes de cualquier lienzo, de
 *     modo que la misma definición sirve para pintar en el canvas y para la
 *     vista previa en SVG (una sola fuente de verdad)
 *   · las cuentas de encuadre, toque, movimiento y tamaño
 *
 * Las coordenadas de la forma son las del dibujo (px del lienzo): `x0,y0` es
 * donde empezó el gesto y `x1,y1` donde terminó. La dirección se conserva, así
 * que una línea o una flecha mantienen su diagonal.
 */

/** Comandos de trazo: se aplican igual a un `ctx` 2D que a un `d` de SVG. */
export type ShapeSegment =
  | { t: "M"; x: number; y: number }
  | { t: "L"; x: number; y: number }
  | { t: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { t: "Z" };

/** Rectángulo de encuadre de una forma (siempre con ancho y alto positivos). */
export interface ShapeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Forma colocada en el lienzo: objeto propio, no píxeles del bitmap. */
export interface ShapeObject {
  id: string;
  shape: PaintShape;
  /** Extremos del gesto que la creó, en px del lienzo (conservan la dirección). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  /** Grosor del trazo, en px del lienzo. */
  width: number;
  /** Relleno sólido en las formas cerradas; las abiertas siempre se trazan. */
  filled: boolean;
}

export const PAINT_SHAPES = [
  { id: "line", name: "Línea", description: "Recta entre los dos puntos", closed: false },
  { id: "arrow", name: "Flecha", description: "Recta con punta", closed: false },
  { id: "rect", name: "Rectángulo", description: "Cuatro esquinas rectas", closed: true },
  { id: "roundrect", name: "Redondeado", description: "Rectángulo de esquinas suaves", closed: true },
  { id: "ellipse", name: "Elipse", description: "Óvalo del tamaño del gesto", closed: true },
  { id: "triangle", name: "Triángulo", description: "Tres lados", closed: true },
  { id: "righttriangle", name: "Triángulo recto", description: "Con ángulo recto abajo", closed: true },
  { id: "diamond", name: "Rombo", description: "Cuatro puntas en los ejes", closed: true },
  { id: "pentagon", name: "Pentágono", description: "Cinco lados", closed: true },
  { id: "hexagon", name: "Hexágono", description: "Seis lados", closed: true },
  { id: "trapezoid", name: "Trapecio", description: "Base ancha y tapa corta", closed: true },
  { id: "parallelogram", name: "Paralelogramo", description: "Lados inclinados", closed: true },
  { id: "star", name: "Estrella", description: "Cinco puntas", closed: true },
  { id: "burst", name: "Destello", description: "Ocho puntas cortas", closed: true },
  { id: "heart", name: "Corazón", description: "Dos lóbulos y punta", closed: true },
  { id: "cross", name: "Cruz", description: "Dos brazos gruesos", closed: true },
  { id: "ring", name: "Anillo", description: "Dos círculos concéntricos", closed: true },
  { id: "bubble", name: "Bocadillo", description: "Burbuja con rabito", closed: true },
] as const;

export type PaintShape = typeof PAINT_SHAPES[number]["id"];

/** Definición del catálogo (nombre, descripción y si es cerrada). */
export function shapeDef(shape: PaintShape): typeof PAINT_SHAPES[number] {
  return PAINT_SHAPES.find(s => s.id === shape) ?? PAINT_SHAPES[0];
}

/** ¿La forma se puede rellenar? Las abiertas (línea, flecha) solo se trazan. */
export function shapeClosed(shape: PaintShape): boolean {
  return shapeDef(shape).closed;
}

/** Encuadre normalizado: vale cualquier dirección de arrastre. */
export function shapeBox(x0: number, y0: number, x1: number, y1: number): ShapeBox {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/** Tamaño del gesto, con signo: dice hacia dónde se dibujó la forma. */
export function shapeSize(x0: number, y0: number, x1: number, y1: number): { w: number; h: number } {
  return { w: x1 - x0, h: y1 - y0 };
}

/** Desplaza la forma (los cuatro extremos van juntos, la dirección no cambia). */
export function translateShape(
  s: { x0: number; y0: number; x1: number; y1: number },
  dx: number,
  dy: number,
): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: s.x0 + dx, y0: s.y0 + dy, x1: s.x1 + dx, y1: s.y1 + dy };
}

/** Coloca la esquina superior izquierda del encuadre en (x, y). */
export function placeShape(
  s: { x0: number; y0: number; x1: number; y1: number },
  x: number,
  y: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const box = shapeBox(s.x0, s.y0, s.x1, s.y1);
  return translateShape(s, x - box.x, y - box.y);
}

/**
 * Cambia el tamaño conservando el punto de origen y la dirección del gesto, de
 * modo que una forma dibujada «al revés» no se da la vuelta al redimensionarla.
 */
export function resizeShape(
  s: { x0: number; y0: number; x1: number; y1: number },
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const sx = sign(s.x1 - s.x0);
  const sy = sign(s.y1 - s.y0);
  return {
    x0: s.x0,
    y0: s.y0,
    x1: s.x0 + sx * Math.max(1, Math.abs(w)),
    y1: s.y0 + sy * Math.max(1, Math.abs(h)),
  };
}

/** Encuadre del gesto cuadrado (Shift): conserva la dirección y el lado mayor. */
export function constrainShape(x0: number, y0: number, x1: number, y1: number): { x1: number; y1: number } {
  const side = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const sign = (v: number) => (v < 0 ? -1 : 1);
  return {
    x1: x0 + sign(x1 - x0) * side,
    y1: y0 + sign(y1 - y0) * side,
  };
}

/** Encuadre que ocupa la forma, engordado por la mitad del trazo. */
export function shapeOutline(
  s: { x0: number; y0: number; x1: number; y1: number; width: number },
): ShapeBox {
  const box = shapeBox(s.x0, s.y0, s.x1, s.y1);
  const pad = Math.max(0, s.width) / 2;
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

/* ─── Geometría ──────────────────────────────────────────────────────────── */

const KAPPA = 0.5522847498307936;

/** Elipse inscrita en la caja: cuatro curvas, sin depender de `ctx.ellipse`. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): ShapeSegment[] {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    { t: "M", x: cx - rx, y: cy },
    { t: "C", c1x: cx - rx, c1y: cy - oy, c2x: cx - ox, c2y: cy - ry, x: cx, y: cy - ry },
    { t: "C", c1x: cx + ox, c1y: cy - ry, c2x: cx + rx, c2y: cy - oy, x: cx + rx, y: cy },
    { t: "C", c1x: cx + rx, c1y: cy + oy, c2x: cx + ox, c2y: cy + ry, x: cx, y: cy + ry },
    { t: "C", c1x: cx - ox, c1y: cy + ry, c2x: cx - rx, c2y: cy + oy, x: cx - rx, y: cy },
    { t: "Z" },
  ];
}

/** Polígono de `sides` lados inscrito en la caja, con el primer vértice arriba. */
function polygonPath(cx: number, cy: number, rx: number, ry: number, sides: number, rotation = -Math.PI / 2): ShapeSegment[] {
  const out: ShapeSegment[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    out.push(i === 0 ? { t: "M", x, y } : { t: "L", x, y });
  }
  out.push({ t: "Z" });
  return out;
}

/** Estrella alternando punta y valle. */
function starPath(cx: number, cy: number, rx: number, ry: number, spikes: number, inner: number): ShapeSegment[] {
  const out: ShapeSegment[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const outer = i % 2 === 0;
    const a = -Math.PI / 2 + (i / (spikes * 2)) * Math.PI * 2;
    const k = outer ? 1 : inner;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    out.push(i === 0 ? { t: "M", x, y } : { t: "L", x, y });
  }
  out.push({ t: "Z" });
  return out;
}

const at = (box: ShapeBox, u: number, v: number) => ({ x: box.x + box.w * u, y: box.y + box.h * v });

/** Rectángulo redondeado: las esquinas llevan media curva cada una. */
function roundRectPath(box: ShapeBox): ShapeSegment[] {
  const r = Math.max(0, Math.min(box.w, box.h) * 0.22);
  const k = r * KAPPA;
  const { x, y, w, h } = box;
  return [
    { t: "M", x: x + r, y },
    { t: "L", x: x + w - r, y },
    { t: "C", c1x: x + w - r + k, c1y: y, c2x: x + w, c2y: y + r - k, x: x + w, y: y + r },
    { t: "L", x: x + w, y: y + h - r },
    { t: "C", c1x: x + w, c1y: y + h - r + k, c2x: x + w - r + k, c2y: y + h, x: x + w - r, y: y + h },
    { t: "L", x: x + r, y: y + h },
    { t: "C", c1x: x + r - k, c1y: y + h, c2x: x, c2y: y + h - r + k, x: x, y: y + h - r },
    { t: "L", x, y: y + r },
    { t: "C", c1x: x, c1y: y + r - k, c2x: x + r - k, c2y: y, x: x + r, y },
    { t: "Z" },
  ];
}

function heartPath(box: ShapeBox): ShapeSegment[] {
  const p = (u: number, v: number) => at(box, u, v);
  const a = p(0.5, 1), b = p(0.08, 0.66), c = p(0, 0.42), d = p(0, 0.3),
    e = p(0, 0.12), f = p(0.14, 0), g = p(0.3, 0), h = p(0.4, 0), i = p(0.47, 0.06), j = p(0.5, 0.16);
  const k = p(0.53, 0.06), l = p(0.6, 0), m = p(0.7, 0), n = p(0.86, 0), o = p(1, 0.12),
    q = p(1, 0.3), r = p(1, 0.42), s = p(0.92, 0.66);
  return [
    { t: "M", x: a.x, y: a.y },
    { t: "C", c1x: b.x, c1y: b.y, c2x: c.x, c2y: c.y, x: d.x, y: d.y },
    { t: "C", c1x: e.x, c1y: e.y, c2x: f.x, c2y: f.y, x: g.x, y: g.y },
    { t: "C", c1x: h.x, c1y: h.y, c2x: i.x, c2y: i.y, x: j.x, y: j.y },
    { t: "C", c1x: k.x, c1y: k.y, c2x: l.x, c2y: l.y, x: m.x, y: m.y },
    { t: "C", c1x: n.x, c1y: n.y, c2x: o.x, c2y: o.y, x: q.x, y: q.y },
    { t: "C", c1x: r.x, c1y: r.y, c2x: s.x, c2y: s.y, x: a.x, y: a.y },
    { t: "Z" },
  ];
}

/** Cruz de brazos: doce vértices, con el brazo proporcional al lado menor. */
function crossPath(box: ShapeBox): ShapeSegment[] {
  const arm = 0.34;
  const a = (1 - arm) / 2;
  const b = a + arm;
  const pts: [number, number][] = [
    [a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b],
    [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a],
  ];
  const out: ShapeSegment[] = pts.map(([u, v], i) => {
    const p = at(box, u, v);
    return i === 0 ? { t: "M", x: p.x, y: p.y } : { t: "L", x: p.x, y: p.y };
  });
  out.push({ t: "Z" });
  return out;
}

/** Boca de bocadillo: rectángulo redondeado con un rabito abajo a la izquierda. */
function bubblePath(box: ShapeBox): ShapeSegment[] {
  const body = { ...box, h: box.h * 0.78 };
  const tail: ShapeSegment[] = [
    { t: "M", x: box.x + box.w * 0.24, y: box.y + box.h * 0.72 },
    { t: "L", x: box.x + box.w * 0.18, y: box.y + box.h },
    { t: "L", x: box.x + box.w * 0.42, y: box.y + box.h * 0.76 },
    { t: "Z" },
  ];
  return [...roundRectPath(body), ...tail];
}

/**
 * Comandos de trazo de una forma dentro de su encuadre. Es la única definición
 * de cada forma: la usan el lienzo y la vista previa de la ventana «Formas».
 */
export function shapeSegments(shape: PaintShape, box: ShapeBox): ShapeSegment[] {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (shape) {
    case "line":
      return [{ t: "M", x, y }, { t: "L", x: x + w, y: y + h }];
    case "arrow": {
      const dx = w, dy = h;
      const len = Math.hypot(dx, dy) || 1;
      // Punta proporcionada al trazo, con un mínimo legible y un tope: las alas
      // pueden sobresalir un poco del encuadre, como en cualquier flecha.
      const head = Math.min(Math.max(len * 0.26, 8), 48);
      const ang = Math.atan2(dy, dx);
      const wing = (a: number) => ({ x: x + w - Math.cos(ang + a) * head, y: y + h - Math.sin(ang + a) * head });
      const a = wing(0.5);
      const b = wing(-0.5);
      return [
        { t: "M", x, y },
        { t: "L", x: x + w, y: y + h },
        { t: "L", x: a.x, y: a.y },
        { t: "M", x: x + w, y: y + h },
        { t: "L", x: b.x, y: b.y },
      ];
    }
    case "rect":
      return [
        { t: "M", x, y },
        { t: "L", x: x + w, y },
        { t: "L", x: x + w, y: y + h },
        { t: "L", x, y: y + h },
        { t: "Z" },
      ];
    case "roundrect":
      return roundRectPath(box);
    case "ellipse":
      return ellipsePath(cx, cy, w / 2, h / 2);
    case "triangle":
      return [
        { t: "M", x: cx, y },
        { t: "L", x: x + w, y: y + h },
        { t: "L", x, y: y + h },
        { t: "Z" },
      ];
    case "righttriangle":
      return [
        { t: "M", x, y },
        { t: "L", x, y: y + h },
        { t: "L", x: x + w, y: y + h },
        { t: "Z" },
      ];
    case "diamond":
      return [
        { t: "M", x: cx, y: y },
        { t: "L", x: x + w, y: cy },
        { t: "L", x: cx, y: y + h },
        { t: "L", x, y: cy },
        { t: "Z" },
      ];
    case "pentagon":
      return polygonPath(cx, cy, w / 2, h / 2, 5);
    case "hexagon":
      return polygonPath(cx, cy, w / 2, h / 2, 6);
    case "trapezoid": {
      const inset = w * 0.22;
      return [
        { t: "M", x: x + inset, y },
        { t: "L", x: x + w - inset, y },
        { t: "L", x: x + w, y: y + h },
        { t: "L", x, y: y + h },
        { t: "Z" },
      ];
    }
    case "parallelogram": {
      const skew = w * 0.24;
      return [
        { t: "M", x: x + skew, y },
        { t: "L", x: x + w, y },
        { t: "L", x: x + w - skew, y: y + h },
        { t: "L", x, y: y + h },
        { t: "Z" },
      ];
    }
    case "star":
      return starPath(cx, cy, w / 2, h / 2, 5, 0.42);
    case "burst":
      return starPath(cx, cy, w / 2, h / 2, 8, 0.44);
    case "heart":
      return heartPath(box);
    case "cross":
      return crossPath(box);
    case "ring": {
      const inner = ellipsePath(cx, cy, (w / 2) * 0.55, (h / 2) * 0.55);
      return [...ellipsePath(cx, cy, w / 2, h / 2), ...inner];
    }
    case "bubble":
      return bubblePath(box);
    default:
      return [{ t: "M", x, y }, { t: "L", x: x + w, y: y + h }];
  }
}

/** Aplica los comandos a un contexto 2D (queda listo para trazar o rellenar). */
export function tracePath(ctx: CanvasRenderingContext2D, segments: ShapeSegment[]): void {
  ctx.beginPath();
  for (const s of segments) {
    if (s.t === "M") ctx.moveTo(s.x, s.y);
    else if (s.t === "L") ctx.lineTo(s.x, s.y);
    else if (s.t === "C") ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y);
    else ctx.closePath();
  }
}

/** Los mismos comandos como `d` de SVG: así la vista previa no usa píxeles. */
export function segmentsToPathD(segments: ShapeSegment[]): string {
  const n = (v: number) => (Math.round(v * 100) / 100).toString();
  return segments
    .map(s => {
      if (s.t === "M") return `M${n(s.x)} ${n(s.y)}`;
      if (s.t === "L") return `L${n(s.x)} ${n(s.y)}`;
      if (s.t === "C") return `C${n(s.c1x)} ${n(s.c1y)} ${n(s.c2x)} ${n(s.c2y)} ${n(s.x)} ${n(s.y)}`;
      return "Z";
    })
    .join(" ");
}

/** «d» de SVG de una forma dentro de una caja (vista previa de la ventana). */
export function shapePathD(shape: PaintShape, box: ShapeBox): string {
  return segmentsToPathD(shapeSegments(shape, box));
}

/** Traza la forma en un contexto y la deja de un solo color, lista para pintar. */
export function paintShape(ctx: CanvasRenderingContext2D, s: ShapeObject): void {
  const box = shapeBox(s.x0, s.y0, s.x1, s.y1);
  tracePath(ctx, shapeSegments(s.shape, box));
  ctx.save();
  ctx.lineWidth = Math.max(1, s.width);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  if (s.filled && shapeClosed(s.shape)) ctx.fill("evenodd");
  else ctx.stroke();
  ctx.restore();
}

/* ─── Toque ──────────────────────────────────────────────────────────────── */

/** Distancia de un punto al segmento que une los dos extremos del gesto. */
function distanceToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x0, py - y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * ¿Cae el punto sobre la forma? Las abiertas (recta y flecha) usan la distancia
 * a la línea para que no se seleccionen desde la esquina opuesta de su caja;
 * las cerradas usan el encuadre, que es lo que el dedo espera acertar.
 */
export function shapeHit(
  s: { shape: PaintShape; x0: number; y0: number; x1: number; y1: number },
  x: number,
  y: number,
  padding = 6,
): boolean {
  if (!shapeClosed(s.shape)) {
    return distanceToSegment(x, y, s.x0, s.y0, s.x1, s.y1) <= padding;
  }
  const box = shapeBox(s.x0, s.y0, s.x1, s.y1);
  return x >= box.x - padding && x <= box.x + box.w + padding &&
    y >= box.y - padding && y <= box.y + box.h + padding;
}
