import { describe, expect, it } from "vitest";

import { canvasPixelSize, needsCanvasResize } from "./canvas";

describe("tamaño del bitmap del lienzo", () => {
  it("redondea a píxeles enteros aunque el tamaño CSS o el DPR sean fraccionarios", () => {
    // Un alto CSS fraccionario sale de restar cabecera, barra y navegación.
    expect(canvasPixelSize(390, 642.5, 2.5)).toEqual({ width: 975, height: 1606 });
    expect(canvasPixelSize(391.5, 700, 1.25)).toEqual({ width: 489, height: 875 });
  });

  it("no redimensiona en cada fotograma con medidas fraccionarias", () => {
    // Regresión del parpadeo: comparar el tamaño ya asignado (entero) contra
    // `clientHeight * dpr` (fraccionario) forzaba reasignar el bitmap en cada
    // fotograma, y eso vacía el lienzo.
    const first = canvasPixelSize(390, 642.5, 2.5);
    expect(needsCanvasResize({ width: 975, height: 1606 }, first)).toBe(false);

    const assigned = { width: first.width, height: first.height };
    expect(needsCanvasResize(assigned, canvasPixelSize(390, 642.5, 2.5))).toBe(false);
    expect(needsCanvasResize(assigned, canvasPixelSize(390, 642.5001, 2.5))).toBe(false);
  });

  it("solo redimensiona cuando el tamaño real cambia (giro o redimensionado)", () => {
    const assigned = canvasPixelSize(390, 642.5, 2.5);
    expect(needsCanvasResize(assigned, canvasPixelSize(390, 700, 2.5))).toBe(true);
    expect(needsCanvasResize(assigned, canvasPixelSize(844, 642.5, 2.5))).toBe(true);
  });

  it("nunca produce un lienzo de tamaño cero", () => {
    expect(canvasPixelSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
    expect(canvasPixelSize(-10, 5, 3)).toEqual({ width: 1, height: 15 });
  });
});
