import { describe, expect, it } from "vitest";
import { MIN_PLACED_SIZE, placedEntitySize } from "./sprite-placement";

const scene = { w: 1200, h: 700 };

describe("el asset entra en la escena con su tamaño", () => {
  it("usa los píxeles reales del dibujo, no una medida fija", () => {
    expect(placedEntitySize({ w: 512, h: 512 }, scene)).toEqual({ w: 512, h: 512 });
    expect(placedEntitySize({ w: 96, h: 96 }, scene)).toEqual({ w: 96, h: 96 });
  });

  it("conserva la proporción de un lienzo estirado", () => {
    expect(placedEntitySize({ w: 1024, h: 256 }, scene)).toEqual({ w: 1024, h: 256 });
    // Aunque se reduzca para que quepa, la proporción se mantiene.
    const big = placedEntitySize({ w: 2400, h: 600 }, scene);
    expect(big.w).toBe(1200);
    expect(big.h).toBe(300);
  });

  it("nunca amplía un dibujo pequeño y deja un mínimo visible", () => {
    expect(placedEntitySize({ w: 24, h: 24 }, scene)).toEqual({ w: 24, h: 24 });
    expect(placedEntitySize({ w: 1, h: 1 }, scene)).toEqual({ w: MIN_PLACED_SIZE, h: MIN_PLACED_SIZE });
  });

  it("no se rompe con medidas imposibles", () => {
    expect(placedEntitySize({ w: 0, h: 0 }, scene)).toEqual({ w: MIN_PLACED_SIZE, h: MIN_PLACED_SIZE });
    expect(placedEntitySize({ w: 64, h: 64 }, { w: 0, h: 0 })).toEqual({ w: 64, h: 64 });
  });
});
