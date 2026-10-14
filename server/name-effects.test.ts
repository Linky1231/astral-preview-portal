import { describe, expect, it } from "vitest";
import {
  NAME_EFFECTS,
  isNameEffectId,
  nameEffectClass,
  nameEffectLabel,
} from "../src/lib/social/name-effects";

describe("efectos de nombre de Plus", () => {
  it("aplica la clase CSS del efecto guardado", () => {
    expect(nameEffectClass("rainbow")).toBe("name-fx name-fx-rainbow");
    expect(nameEffectClass("neon")).toBe("name-fx name-fx-neon");
  });

  it("no inventa clases con valores que no están en el catálogo", () => {
    expect(nameEffectClass(null)).toBeNull();
    expect(nameEffectClass("")).toBeNull();
    expect(nameEffectClass("explosion")).toBeNull();
    expect(isNameEffectId("shadow")).toBe(true);
    expect(isNameEffectId("shadow ")).toBe(false);
  });

  it("ofrece una etiqueta legible para cada id del catálogo", () => {
    for (const effect of NAME_EFFECTS) {
      expect(nameEffectLabel(effect.id)).toBe(effect.label);
      expect(nameEffectClass(effect.id)).toContain(`name-fx-${effect.id}`);
    }
    expect(nameEffectLabel(null)).toBeNull();
  });

  it("mantiene un id único y con estilos por cada opción de la rejilla", () => {
    const ids = NAME_EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["glow", "rainbow", "gradient", "pulse", "shadow", "neon"]);
  });
});
