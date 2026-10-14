import { describe, expect, it } from "vitest";
import {
  menuEntryCardClass,
  menuEntryCtaClass,
  menuEntryIconClass,
} from "../src/lib/social/menu-presentation";
import { MENU_SECTIONS, type MenuEntry } from "../src/lib/social/menu-sections";

const entrada = (id: string): MenuEntry => {
  const entry = MENU_SECTIONS.flatMap((section) => section.entries).find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Opción desconocida: ${id}`);
  return entry;
};

describe("tarjetas de las opciones del menú", () => {
  it("destaca la opción principal con el color de marca en la tarjeta y el icono", () => {
    const chats = entrada("chats");
    expect(menuEntryCardClass(chats)).toContain("border-primary/25");
    expect(menuEntryIconClass(chats)).toContain("bg-primary/10");
  });

  it("rellena en azul el botón de TODAS las opciones, no sólo el de la primera", () => {
    for (const entry of MENU_SECTIONS.flatMap((section) => section.entries)) {
      const cta = menuEntryCtaClass();
      expect(cta).toContain("grad-brand");
      expect(cta).toContain("text-primary-foreground");
      // Ningún botón del menú se queda con el estilo neutro de contorno.
      expect(cta).not.toContain("border-line-strong");
      expect(cta).not.toContain("destructive");
      expect(entry.cta.length).toBeGreaterThan(0);
    }
  });

  it("deja la tarjeta y el icono neutros en las opciones secundarias", () => {
    const buscar = entrada("search");
    expect(menuEntryCardClass(buscar)).toContain("border-border/70");
    expect(menuEntryIconClass(buscar)).toContain("text-muted-foreground");
  });

  it("marca Moderación como área restringida en tarjeta e icono", () => {
    const moderacion = entrada("moderation");
    expect(menuEntryCardClass(moderacion)).toContain("destructive");
    expect(menuEntryIconClass(moderacion)).toContain("destructive");
  });

  it("da prioridad al aviso de restringido sobre cualquier otro estilo", () => {
    const sintetica: MenuEntry = { ...entrada("moderation"), featured: true, accent: "plus" };
    expect(menuEntryCardClass(sintetica)).toContain("destructive");
    expect(menuEntryIconClass(sintetica)).toContain("destructive");
  });

  it("usa el acento cian de Plus en el icono del Centro Plus", () => {
    const plus = entrada("plus");
    expect(menuEntryIconClass(plus)).toContain("var(--plus-outline)");
    expect(menuEntryIconClass(plus)).not.toContain("bg-primary/10");
  });
});
