import { describe, expect, it } from "vitest";
import {
  CANVAS_MAX,
  CANVAS_MIN,
  canvasBox,
  canvasLongSide,
  canvasScale,
  clampCanvasSide,
  keptArea,
  zoomForBox,
} from "./paint-canvas";

const square = { w: 512, h: 512 };

describe("geometría del lienzo", () => {
  it("limita el tamaño a medidas enteras y razonables", () => {
    expect(clampCanvasSide(511.6)).toBe(512);
    expect(clampCanvasSide(4)).toBe(CANVAS_MIN);
    expect(clampCanvasSide(99_999)).toBe(CANVAS_MAX);
    expect(clampCanvasSide(Number.NaN)).toBe(CANVAS_MIN);
  });

  it("el marco conserva la proporción del dibujo: nunca lo deforma", () => {
    const wide = { w: 1024, h: 256 };
    const box = canvasBox(600, 1, wide);
    // El lado mayor ocupa «ajustar» y el otro guarda su proporción.
    expect(box.w).toBe(600);
    expect(box.h).toBe(150);
    expect(canvasScale(600, 1, wide)).toBeCloseTo(box.w / wide.w, 5);
    expect(canvasLongSide({ w: 128, h: 1024 })).toBe(1024);
  });

  it("un lienzo cuadrado sigue siendo cuadrado", () => {
    const box = canvasBox(600, 2, square);
    expect(box.w).toBe(1200);
    expect(box.h).toBe(1200);
  });

  it("el zoom mantiene en pantalla el mismo ancho que durante el arrastre", () => {
    const resized = { w: 1024, h: 512 };
    const zoom = zoomForBox(800, 600, resized);
    const box = canvasBox(600, zoom, resized);
    expect(box.w).toBe(800);
    // Y el alto se deduce de la proporción del lienzo.
    expect(box.h).toBe(400);
  });

  it("al agrandar el lienzo se añade superficie y el dibujo no cambia de escala", () => {
    // Todo lo que había sigue dentro, en el mismo sitio (1:1, sin factores).
    expect(keptArea(square, { w: 1024, h: 768 })).toEqual({ x: 0, y: 0, w: 512, h: 512 });
  });

  it("al reducir el lienzo se recorta lo que sobra, sin encoger el dibujo", () => {
    expect(keptArea(square, { w: 256, h: 128 })).toEqual({ x: 0, y: 0, w: 256, h: 128 });
    // Cambiar de forma también recorta, y nunca devuelve una escala.
    expect(keptArea({ w: 1024, h: 256 }, { w: 300, h: 900 })).toEqual({ x: 0, y: 0, w: 300, h: 256 });
    // Un lienzo que no cambia conserva todo.
    expect(keptArea(square, square)).toEqual({ x: 0, y: 0, w: 512, h: 512 });
  });
});
