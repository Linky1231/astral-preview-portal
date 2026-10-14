import { describe, expect, it } from "vitest";
import {
  MAX_PAINT_ZOOM,
  MIN_PAINT_ZOOM,
  pinchAnchor,
  pinchScrollDelta,
  pinchZoom,
  pinchZoomArmed,
  type ScreenRect,
} from "./paint-zoom";

describe("zoom del lienzo por pellizco", () => {
  it("acerca al separar los dedos y aleja al juntarlos", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(1, 100, 50)).toBe(0.5);
  });
  it("es continuo y parte del zoom existente", () => {
    expect(pinchZoom(1.5, 100, 123)).toBeCloseTo(1.845);
    expect(pinchZoom(2, 100, 100)).toBe(2);
  });
  it("respeta los límites de reducción y ampliación", () => {
    expect(pinchZoom(1, 100, 1)).toBe(MIN_PAINT_ZOOM);
    expect(pinchZoom(2, 100, 1000)).toBe(MAX_PAINT_ZOOM);
  });
  it("no genera escalas inválidas con una distancia inicial nula", () => {
    expect(pinchZoom(1.5, 0, 100)).toBe(1.5);
    expect(pinchZoom(1.5, 100, NaN)).toBe(1.5);
  });
});

/**
 * Al mover el lienzo con dos dedos la distancia entre ellos nunca se queda
 * quieta: oscila unos píxeles. Sin margen, ese vaivén cambiaba la escala unas
 * décimas, el lienzo se reescalaba en cada cuadro y la retícula se veía temblar.
 */
describe("el paneo con dos dedos no cambia la escala", () => {
  it("un desplazamiento con vaivén de los dedos no arma el zoom", () => {
    // Dedos a 160 px que se juntan y se separan ±4 px: es un paneo.
    for (const distance of [156, 158, 160, 162, 164]) {
      expect(pinchZoomArmed(160, distance)).toBe(false);
    }
  });

  it("cuando los dedos se separan de verdad, el zoom empieza a seguirles", () => {
    expect(pinchZoomArmed(160, 175)).toBe(true);
    expect(pinchZoomArmed(160, 140)).toBe(true);
    // Y el margen es relativo: en un lienzo pequeño también vale.
    expect(pinchZoomArmed(60, 61)).toBe(false);
    expect(pinchZoomArmed(60, 70)).toBe(true);
  });

  it("no arma el zoom con distancias inválidas", () => {
    expect(pinchZoomArmed(0, 100)).toBe(false);
    expect(pinchZoomArmed(-10, 100)).toBe(false);
    expect(pinchZoomArmed(160, NaN)).toBe(false);
  });
});

/**
 * El lienzo se reescala cambiando su tamaño en el visor (no con `transform`),
 * así que el ancla del pellizco depende del scroll: si no se corrige, el zoom
 * tira siempre desde la esquina superior izquierda del contenido.
 */
describe("ancla del pellizco", () => {
  /** Vista mínima: visor con la esquina en (0,0) y el lienzo dentro. */
  const canvas = (left: number, top: number, size: number): ScreenRect => ({
    left, top, width: size, height: size,
  });
  /** Posición en pantalla del punto anclado tras aplicar el desplazamiento. */
  const project = (rect: ScreenRect, anchor: { u: number; v: number }, scroll: { dx: number; dy: number }) => ({
    x: rect.left - scroll.dx + anchor.u * rect.width,
    y: rect.top - scroll.dy + anchor.v * rect.height,
  });

  it("toma como ancla el punto del dibujo que está bajo los dedos", () => {
    const anchor = pinchAnchor(canvas(40, 40, 300), { x: 115, y: 265 });
    expect(anchor.u).toBeCloseTo(0.25);
    expect(anchor.v).toBeCloseTo(0.75);
  });

  it("deja ese punto otra vez bajo los dedos cuando el lienzo reescala", () => {
    const focus = { x: 200, y: 160 };
    const anchor = pinchAnchor(canvas(40, 40, 300), focus);
    const after = canvas(40, 40, 480);           // el lienzo crece con el zoom
    const scroll = pinchScrollDelta(anchor, after, focus);
    const seen = project(after, anchor, scroll);
    expect(seen.x).toBeCloseTo(focus.x);
    expect(seen.y).toBeCloseTo(focus.y);
    // Y el desplazamiento es el que compensa el crecimiento, no un valor suelto:
    // el ancla está al 53,3 % / 40 % del lienzo, que al pasar de 300 a 480 px
    // se queda 96 px a la izquierda y 72 px por encima del foco.
    expect(scroll.dx).toBeCloseTo(96);
    expect(scroll.dy).toBeCloseTo(72);
  });

  it("mantiene el ancla durante todo el gesto, paso a paso", () => {
    const focus = { x: 250, y: 90 };
    // `rect` es la posición del lienzo en pantalla ya con el scroll corregido.
    let rect = canvas(40, 40, 300);
    const anchors: { u: number; v: number }[] = [];
    for (let step = 0; step < 12; step++) {
      const anchor = pinchAnchor(rect, focus);
      anchors.push(anchor);
      const size = rect.width * 1.12;            // acercar sin soltar los dedos
      const after = canvas(rect.left, rect.top, size);
      const delta = pinchScrollDelta(anchor, after, focus);
      rect = { ...after, left: after.left - delta.dx, top: after.top - delta.dy };
      // El punto anclado sigue justo bajo los dedos en cada paso.
      expect(rect.left + anchor.u * rect.width).toBeCloseTo(focus.x, 6);
      expect(rect.top + anchor.v * rect.height).toBeCloseTo(focus.y, 6);
    }
    // Y como no se mueve, el ancla es la misma en todo el gesto: sin deriva.
    for (const anchor of anchors) {
      expect(anchor.u).toBeCloseTo(anchors[0].u, 6);
      expect(anchor.v).toBeCloseTo(anchors[0].v, 6);
    }
    expect(rect.width).toBeGreaterThan(300);     // el lienzo se acercó
    expect(rect.left).toBeLessThan(40);          // y el visor lo acompañó
  });

  it("también ancla al alejar la vista", () => {
    const focus = { x: 90, y: 300 };
    const anchor = pinchAnchor(canvas(20, 20, 400), focus);
    const scroll = pinchScrollDelta(anchor, canvas(20, 20, 250), focus);
    const seen = project(canvas(20, 20, 250), anchor, scroll);
    expect(seen.x).toBeCloseTo(focus.x);
    expect(seen.y).toBeCloseTo(focus.y);
  });

  it("mueve la cámara con los dedos cuando el gesto solo se desplaza", () => {
    // Mismo tamaño (distancia entre dedos intacta): el visor se desplaza justo
    // lo contrario del movimiento, así que el dibujo sigue a los dedos.
    const rect = canvas(40, 40, 300);
    const anchor = pinchAnchor(rect, { x: 160, y: 160 });
    const focus = { x: 190, y: 140 };            // los dedos van 30 a la derecha, 20 arriba
    const { dx, dy } = pinchScrollDelta(anchor, rect, focus);
    expect(dx).toBeCloseTo(-30);
    expect(dy).toBeCloseTo(20);
    expect(rect.left - dx + anchor.u * rect.width).toBeCloseTo(focus.x);
    expect(rect.top - dy + anchor.v * rect.height).toBeCloseTo(focus.y);
  });

  it("a la vez acerca y mueve: el punto agarrado sigue bajo los dedos", () => {
    const anchor = pinchAnchor(canvas(40, 40, 300), { x: 120, y: 220 });
    const after = canvas(40, 40, 420);           // el lienzo crece…
    const focus = { x: 150, y: 180 };            // …y los dedos se han desplazado
    const { dx, dy } = pinchScrollDelta(anchor, after, focus);
    expect(after.left - dx + anchor.u * after.width).toBeCloseTo(focus.x);
    expect(after.top - dy + anchor.v * after.height).toBeCloseTo(focus.y);
    // El desplazamiento suma las dos cosas: no es solo el del zoom a foco fijo.
    const soloZoom = pinchScrollDelta(anchor, after, { x: 120, y: 220 });
    expect(dx).not.toBeCloseTo(soloZoom.dx);
    expect(dy).not.toBeCloseTo(soloZoom.dy);
  });

  it("recorta al borde del lienzo cuando los dedos caen fuera", () => {
    const outside = canvas(100, 100, 200);
    expect(pinchAnchor(outside, { x: 10, y: 10 })).toEqual({ u: 0, v: 0 });
    expect(pinchAnchor(outside, { x: 900, y: 900 })).toEqual({ u: 1, v: 1 });
  });

  it("no genera desplazamientos inválidos con un lienzo sin medir", () => {
    const anchor = pinchAnchor(canvas(0, 0, 0), { x: 50, y: 50 });
    expect(anchor).toEqual({ u: 0.5, v: 0.5 });
    const scroll = pinchScrollDelta(anchor, canvas(0, 0, 0), { x: 50, y: 50 });
    expect(Number.isFinite(scroll.dx)).toBe(true);
    expect(Number.isFinite(scroll.dy)).toBe(true);
  });
});
