import { describe, expect, it, vi } from "vitest";
import { drawBrush, PAINT_BRUSHES } from "./paint-brush";

function context() {
  return { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), globalAlpha: 1, lineWidth: 0, lineCap: "", lineJoin: "", fillStyle: "", strokeStyle: "" };
}

describe("lápices del lienzo", () => {
  it("ofrece cinco estilos distintos", () => {
    expect(PAINT_BRUSHES.map(b => b.id)).toEqual(["round", "fine", "grain", "pixel", "marker"]);
  });
  it("pixel art usa cuadrados enteros alineados y cubre todo el segmento", () => {
    const ctx = context();
    drawBrush(ctx as unknown as CanvasRenderingContext2D, "pixel", "#123456", 4, 1, 1, 21, 1);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fillRect.mock.calls).toEqual([[0, 0, 4, 4], [4, 0, 4, 4], [8, 0, 4, 4], [12, 0, 4, 4], [16, 0, 4, 4], [20, 0, 4, 4]]);
  });
  it("el fino reduce el ancho y el marcador cambia opacidad y extremos", () => {
    const ctx = context();
    drawBrush(ctx as unknown as CanvasRenderingContext2D, "fine", "#123456", 10, 0, 0, 10, 10);
    expect(ctx.lineWidth).toBe(3);
    drawBrush(ctx as unknown as CanvasRenderingContext2D, "marker", "#123456", 10, 0, 0, 10, 10);
    expect(ctx.lineWidth).toBe(10);
    expect(ctx.globalAlpha).toBe(0.35);
    expect(ctx.lineCap).toBe("square");
  });
  it("el granulado pinta partículas reproducibles en lugar de una línea sólida", () => {
    const a = context(), b = context();
    drawBrush(a as unknown as CanvasRenderingContext2D, "grain", "#123456", 8, 0, 0, 10, 10);
    drawBrush(b as unknown as CanvasRenderingContext2D, "grain", "#123456", 8, 0, 0, 10, 10);
    expect(a.fillRect.mock.calls.length).toBeGreaterThan(8);
    expect(a.fillRect.mock.calls).toEqual(b.fillRect.mock.calls);
    expect(a.stroke).not.toHaveBeenCalled();
  });
});
