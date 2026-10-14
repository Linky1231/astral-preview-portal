import { describe, expect, it } from "vitest";
import {
  PAINT_SHAPES,
  constrainShape,
  placeShape,
  resizeShape,
  segmentsToPathD,
  shapeBox,
  shapeClosed,
  shapeDef,
  shapeHit,
  shapeOutline,
  shapePathD,
  shapeSegments,
  shapeSize,
  translateShape,
  type PaintShape,
  type ShapeSegment,
} from "./paint-shapes";

/** Caja de referencia: 100..300 en los dos ejes. */
const BOX = shapeBox(100, 100, 300, 300);

/** Todos los puntos que toca un comando, incluidos los de control. */
function pointsOf(segments: ShapeSegment[]): { x: number; y: number }[] {
  return segments.flatMap(s => {
    if (s.t === "Z") return [];
    if (s.t === "C") return [{ x: s.c1x, y: s.c1y }, { x: s.c2x, y: s.c2y }, { x: s.x, y: s.y }];
    return [{ x: s.x, y: s.y }];
  });
}

const everyShape = PAINT_SHAPES.map(s => s.id) as PaintShape[];

describe("catálogo de formas", () => {
  it("ofrece muchas más formas que la línea, el rectángulo y el círculo de antes", () => {
    expect(everyShape.length).toBeGreaterThanOrEqual(14);
    for (const id of ["line", "rect", "ellipse", "triangle", "star", "heart", "arrow"] as PaintShape[]) {
      expect(everyShape).toContain(id);
    }
    expect(new Set(everyShape).size).toBe(everyShape.length); // sin repetidos
  });

  it("cada forma tiene nombre y descripción para la ventana «Formas»", () => {
    for (const s of PAINT_SHAPES) {
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.description.length).toBeGreaterThan(4);
    }
    expect(shapeDef("star").name).toBe("Estrella");
    expect(shapeDef("line").closed).toBe(false);
    expect(shapeClosed("heart")).toBe(true);
  });
});

describe("encuadre y posición", () => {
  it("normaliza el encuadre en cualquier dirección de arrastre", () => {
    expect(shapeBox(300, 100, 100, 300)).toEqual({ x: 100, y: 100, w: 200, h: 200 });
    expect(shapeBox(100, 100, 300, 100)).toEqual({ x: 100, y: 100, w: 200, h: 0 });
  });

  it("conserva la dirección del gesto aparte del encuadre", () => {
    expect(shapeSize(300, 300, 100, 100)).toEqual({ w: -200, h: -200 });
  });

  it("mueve la forma sin deformarla", () => {
    const s = { x0: 100, y0: 100, x1: 300, y1: 200 };
    expect(translateShape(s, 10, -5)).toEqual({ x0: 110, y0: 95, x1: 310, y1: 195 });
  });

  it("coloca la esquina del encuadre donde se le pide", () => {
    const s = { x0: 300, y0: 260, x1: 150, y1: 200 }; // dibujada hacia arriba-izquierda
    const placed = placeShape(s, 40, 60);
    expect(shapeBox(placed.x0, placed.y0, placed.x1, placed.y1)).toEqual({ x: 40, y: 60, w: 150, h: 60 });
  });

  it("redimensiona sin dar la vuelta a una forma trazada al revés", () => {
    const s = { x0: 300, y0: 300, x1: 200, y1: 220 };
    const bigger = resizeShape(s, 160, 90);
    expect(bigger).toEqual({ x0: 300, y0: 300, x1: 140, y1: 210 });
    expect(shapeBox(bigger.x0, bigger.y0, bigger.x1, bigger.y1)).toEqual({ x: 140, y: 210, w: 160, h: 90 });
    // Nunca por debajo de 1 px: una forma de tamaño cero no se podría recuperar.
    const tiny = resizeShape(s, 0, 0);
    expect(shapeBox(tiny.x0, tiny.y0, tiny.x1, tiny.y1).w).toBe(1);
  });

  it("cuadra el gesto con Shift en las cuatro diagonales", () => {
    expect(constrainShape(0, 0, 30, 80)).toEqual({ x1: 80, y1: 80 });
    expect(constrainShape(0, 0, -30, 80)).toEqual({ x1: -80, y1: 80 });
    expect(constrainShape(0, 0, 30, -80)).toEqual({ x1: 80, y1: -80 });
    expect(constrainShape(0, 0, -30, -80)).toEqual({ x1: -80, y1: -80 });
  });

  it("engorda el encuadre con la mitad del trazo para la marca de selección", () => {
    const outline = shapeOutline({ x0: 100, y0: 100, x1: 200, y1: 200, width: 10 });
    expect(outline).toEqual({ x: 95, y: 95, w: 110, h: 110 });
  });
});

describe("geometría de cada forma", () => {
  it("empieza por un punto y cierra solo las formas cerradas", () => {
    for (const id of everyShape) {
      const segments = shapeSegments(id, BOX);
      expect(segments[0].t, id).toBe("M");
      expect(segments.length, id).toBeGreaterThan(1);
      const last = segments[segments.length - 1];
      if (shapeClosed(id)) expect(last.t, id).toBe("Z");
      else expect(last.t, id).toBe("L");
    }
  });

  it("no se sale del encuadre (las flechas aparte, por su punta)", () => {
    for (const id of everyShape) {
      if (id === "arrow") continue;
      for (const p of pointsOf(shapeSegments(id, BOX))) {
        expect(p.x, id).toBeGreaterThanOrEqual(BOX.x - 0.001);
        expect(p.x, id).toBeLessThanOrEqual(BOX.x + BOX.w + 0.001);
        expect(p.y, id).toBeGreaterThanOrEqual(BOX.y - 0.001);
        expect(p.y, id).toBeLessThanOrEqual(BOX.y + BOX.h + 0.001);
      }
    }
  });

  it("dibuja la recta y la flecha de esquina a esquina", () => {
    for (const id of ["line", "arrow"] as PaintShape[]) {
      const segments = shapeSegments(id, BOX);
      expect(segments[0]).toEqual({ t: "M", x: 100, y: 100 });
      expect(segments[1]).toEqual({ t: "L", x: 300, y: 300 });
    }
    // La flecha retoma el trazo en la punta para dibujar las dos alas, y estas
    // caen dentro de un margen razonable alrededor de la punta.
    const after = shapeSegments("arrow", BOX).slice(2);
    expect(after).toHaveLength(3);
    expect(after[1]).toEqual({ t: "M", x: 300, y: 300 });
    for (const wing of [after[0], after[2]]) {
      expect(wing.t).toBe("L");
      const p = wing as { x: number; y: number };
      expect(Math.abs(p.x - 300)).toBeLessThanOrEqual(48);
      expect(Math.abs(p.y - 300)).toBeLessThanOrEqual(48);
    }
  });

  it("traza las formas cerradas con curvas cuando toca", () => {
    const curved = (id: PaintShape) => shapeSegments(id, BOX).some(s => s.t === "C");
    expect(curved("ellipse")).toBe(true);
    expect(curved("roundrect")).toBe(true);
    expect(curved("heart")).toBe(true);
    expect(curved("rect")).toBe(false);
    expect(curved("triangle")).toBe(false);
  });

  it("el anillo son dos círculos: se puede vaciar por dentro", () => {
    const segments = shapeSegments("ring", BOX);
    const starts = segments.filter((s, i) => s.t === "M" && i > 0);
    expect(starts).toHaveLength(1);
    // El círculo interior arranca al 55 % del radio: queda hueco para vaciarlo.
    expect((starts[0] as { x: number }).x).toBeCloseTo(200 - 100 * 0.55);
  });

  it("resuelve la misma forma en SVG para la vista previa", () => {
    const d = shapePathD("star", BOX);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).not.toContain("NaN");
    expect(segmentsToPathD([{ t: "M", x: 0, y: 0 }, { t: "Z" }])).toBe("M0 0 Z");
  });
});

describe("toque de la forma", () => {
  it("no selecciona una recta desde la esquina opuesta de su caja", () => {
    const line = { shape: "line" as PaintShape, x0: 100, y0: 100, x1: 300, y1: 300 };
    expect(shapeHit(line, 200, 200, 8)).toBe(true);   // sobre la diagonal
    expect(shapeHit(line, 290, 110, 8)).toBe(false);  // dentro de la caja, lejos de la recta
  });

  it("selecciona una forma cerrada desde su interior", () => {
    const rect = { shape: "rect" as PaintShape, x0: 100, y0: 100, x1: 300, y1: 300 };
    expect(shapeHit(rect, 200, 200, 6)).toBe(true);
    expect(shapeHit(rect, 320, 200, 6)).toBe(false);
    expect(shapeHit(rect, 200, 80, 6)).toBe(false);
  });

  it("deja un margen para el dedo, proporcional al grosor del trazo", () => {
    const rect = { shape: "rect" as PaintShape, x0: 100, y0: 100, x1: 300, y1: 300 };
    expect(shapeHit(rect, 303, 200, 6)).toBe(true);
    expect(shapeHit(rect, 200, 90, 6)).toBe(false);
  });
});
