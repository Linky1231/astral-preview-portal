import { describe, expect, it } from "vitest";
import { DEFAULT_COMMUNITY_SETTINGS, parseCommunitySettings } from "./about";

describe("ajustes comunitarios", () => {
  it("usa valores seguros cuando el documento guardado no es JSON válido", () => {
    expect(parseCommunitySettings("no-json")).toEqual(DEFAULT_COMMUNITY_SETTINGS);
  });

  it("normaliza texto y mantiene activada la revisión salvo que administración la desactive", () => {
    const settings = parseCommunitySettings(JSON.stringify({ title: "  Reglas  ", rules: " Respeto ", moderationEnabled: false }));
    expect(settings.title).toBe("Reglas");
    expect(settings.rules).toBe("Respeto");
    expect(settings.moderationEnabled).toBe(false);
  });
});
