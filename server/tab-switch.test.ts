import { describe, expect, it } from "vitest";
import { isTabLoading, shouldFetchPrimaryTab } from "../src/lib/social/tab-switch";

describe("cambio rápido de navegación principal", () => {
  it("no vuelve a pedir datos ya cargados ni solicita datos para las vistas locales", () => {
    const loaded = new Set(["games"] as const);
    expect(shouldFetchPrimaryTab("games", loaded)).toBe(false);
    expect(shouldFetchPrimaryTab("feed", loaded)).toBe(true);
    expect(shouldFetchPrimaryTab("gallery", loaded)).toBe(false);
    expect(shouldFetchPrimaryTab("profile", loaded)).toBe(false);
  });

  it("limita el indicador de carga a la pestaña que inició la petición", () => {
    expect(isTabLoading("feed", "feed")).toBe(true);
    expect(isTabLoading("games", "feed")).toBe(false);
  });
});
