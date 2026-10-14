import { describe, expect, it } from "vitest";
import { formatPublicOrbes, shouldShowPublicOrbes } from "../src/lib/social/profile-visibility";

describe("visibilidad pública de orbes", () => {
  it("muestra incluso un saldo de cero cuando la preferencia está activa", () => {
    expect(shouldShowPublicOrbes(true, 0)).toBe(true);
    expect(formatPublicOrbes(8195)).toBe("8195");
  });

  it("respeta la preferencia privada y no presenta saldos inválidos", () => {
    expect(shouldShowPublicOrbes(false, 40)).toBe(false);
    expect(shouldShowPublicOrbes(true, null)).toBe(false);
  });
});
