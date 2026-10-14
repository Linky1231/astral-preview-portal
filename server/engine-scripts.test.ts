import { describe, expect, it } from "vitest";
import { applyGenericProperty, nextVariableValue } from "../src/lib/engine/scripts";

describe("base generalizable de scripts", () => {
  it("actualiza variables numéricas sin depender de una clase de objeto", () => {
    expect(nextVariableValue(undefined, 3)).toBe(3);
    expect(nextVariableValue(7, -2)).toBe(5);
  });

  it("aplica propiedades generales y conserva límites seguros", () => {
    const object = { x: 10, w: 24, opacity: 1 };
    applyGenericProperty(object, "x", 5, "change");
    applyGenericProperty(object, "w", -99);
    applyGenericProperty(object, "opacity", 35);
    expect(object).toMatchObject({ x: 15, w: 1, opacity: 0.35 });
  });
});
