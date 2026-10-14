import { describe, expect, it } from "vitest";
import {
  MENU_SECTIONS,
  isMenuSectionId,
  menuSectionById,
  visibleMenuEntries,
} from "../src/lib/social/menu-sections";

describe("secciones del menú de tres líneas", () => {
  it("agrupa todas las opciones en secciones con nombre y resumen", () => {
    expect(MENU_SECTIONS.map((section) => section.id)).toEqual([
      "social",
      "comunidad",
      "creacion",
      "ajustes",
    ]);
    for (const section of MENU_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.hint.length).toBeGreaterThan(0);
      expect(section.entries.length).toBeGreaterThan(0);
    }
  });

  it("cada opción navega a una ruta o abre un panel, nunca las dos cosas ni ninguna", () => {
    const ids = new Set<string>();
    for (const section of MENU_SECTIONS) {
      for (const entry of section.entries) {
        expect(ids.has(entry.id)).toBe(false);
        ids.add(entry.id);
        expect(Boolean(entry.to) !== Boolean(entry.action)).toBe(true);
        if (entry.to) expect(entry.to.startsWith("/")).toBe(true);
      }
    }
  });

  it("describe qué ofrece cada opción y cómo se abre", () => {
    for (const section of MENU_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.description.length).toBeGreaterThan(30);
        expect(entry.cta.trim().length).toBeGreaterThan(2);
      }
    }
  });

  it("destaca una sola opción por sección para no competir entre tarjetas", () => {
    for (const section of MENU_SECTIONS) {
      expect(section.entries.filter((entry) => entry.featured)).toHaveLength(1);
    }
  });

  it("reserva el aviso de restringido para Moderación y el acento Plus para el Centro Plus", () => {
    const restringidas = MENU_SECTIONS.flatMap((section) => section.entries.filter((entry) => entry.restricted));
    const acentoPlus = MENU_SECTIONS.flatMap((section) => section.entries.filter((entry) => entry.accent === "plus"));

    expect(restringidas.map((entry) => entry.id)).toEqual(["moderation"]);
    expect(acentoPlus.map((entry) => entry.id)).toEqual(["plus"]);
  });

  it("oculta Moderación a quien no modera y la muestra a quien sí", () => {
    const comunidad = menuSectionById("comunidad");
    const paraTodos = visibleMenuEntries(comunidad, false).map((entry) => entry.id);
    const paraModeradores = visibleMenuEntries(comunidad, true).map((entry) => entry.id);

    expect(paraTodos).not.toContain("moderation");
    expect(paraModeradores).toContain("moderation");
    expect(paraTodos.length).toBe(paraModeradores.length - 1);
  });

  it("reconoce solo identificadores de sección existentes", () => {
    expect(isMenuSectionId("ajustes")).toBe(true);
    expect(isMenuSectionId(null)).toBe(false);
    expect(isMenuSectionId("perfil")).toBe(false);
    expect(() => menuSectionById("perfil" as never)).toThrow();
  });
});
