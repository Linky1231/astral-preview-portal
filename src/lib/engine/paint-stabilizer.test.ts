import { describe, expect, it } from "vitest";
import {
  STABILIZE_DEFAULT,
  STABILIZE_MAX,
  STABILIZE_MIN,
  clampStabilizeLevel,
  stabilizeAlpha,
  stabilizePoint,
} from "./paint-stabilizer";

describe("estabilizador del lápiz", () => {
  it("mantiene el nivel dentro de 0-100 y recupera el punto medio ante valores inválidos", () => {
    expect(clampStabilizeLevel(-20)).toBe(STABILIZE_MIN);
    expect(clampStabilizeLevel(180)).toBe(STABILIZE_MAX);
    expect(clampStabilizeLevel(42.6)).toBe(43);
    expect(clampStabilizeLevel(Number.NaN)).toBe(STABILIZE_DEFAULT);
  });

  it("calibra el peso del suavizado: sin estabilización sigue el cursor exacto", () => {
    expect(stabilizeAlpha(0)).toBe(1);
    const exact = stabilizePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(exact).toEqual({ x: 100, y: 0 });
  });

  it("a mayor nivel, el trazo avanza menos por punto (más suave)", () => {
    expect(stabilizeAlpha(100)).toBeLessThan(stabilizeAlpha(50));
    const soft = stabilizePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 80);
    expect(soft.x).toBeGreaterThan(0);
    expect(soft.x).toBeLessThan(100);
  });

  it("nunca pasa del cursor por suavizar el trazo", () => {
    const point = stabilizePoint({ x: 0, y: 0 }, { x: 200, y: -50 }, 70);
    expect(point.x).toBeLessThanOrEqual(200);
    expect(point.y).toBeGreaterThanOrEqual(-50);
  });
});
