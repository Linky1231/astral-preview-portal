import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const home = read("src/routes/index.tsx");
const plus = read("src/routes/plus.tsx");
const profile = read("src/components/social/ProfilePanel.tsx");
const postCard = read("src/components/social/PostCard.tsx");
const material3 = read("src/material3.css");
const styles = read("src/styles.css");

describe("menú de tres líneas por secciones", () => {
  const drawer = home.split('key="menu-drawer"')[1].split("Pantalla independiente")[0];
  const screen = home.split("Pantalla independiente de la sección del menú")[1];

  it("muestra cada sección como una sola opción en el panel lateral", () => {
    expect(drawer).toContain("MENU_SECTIONS.map((section) => (");
    expect(drawer).toContain("onClick={() => setMenuSection(section.id)}");
    // El panel lateral ya no lista las opciones de la sección: sólo sus nombres.
    expect(drawer).not.toContain("visibleMenuEntries(");
  });

  it("abre cada sección en una pantalla nueva e independiente", () => {
    expect(screen).toContain('className="fixed inset-0 z-[102] bg-background flex flex-col"');
    expect(screen).toContain("visibleMenuEntries(menuSectionById(menuSection), mod || admin)");
    // Cada opción se presenta como tarjeta con descripción y botón de acceso.
    expect(screen).toContain("<MenuOptionCard");
    expect(screen).toContain("{entry.description}");
    expect(screen).toContain("{entry.cta}");
    // Fuera del panel lateral: se monta como pantalla propia, no dentro del menú.
    expect(home.indexOf("Pantalla independiente de la sección del menú"))
      .toBeGreaterThan(home.indexOf('key="menu-drawer"'));
  });

  it("vuelve a la pantalla inicial del menú sin cerrar las tres rayas", () => {
    expect(screen).toContain('<button onClick={() => setMenuSection(null)} aria-label="Volver al menú"');
    expect(screen).toContain("Volver al menú");
    // El botón de volver sólo cambia de pantalla: no cierra el panel lateral.
    const headerBack = screen.split('aria-label="Volver al menú"')[1].split('aria-label="Cerrar menú"')[0];
    expect(headerBack).not.toContain("closeMenu()");
    expect(headerBack).not.toContain("closeDrawer()");
  });

  it("centra «Cerrar sesión» dentro de su marco (el aire de arriba no es relleno del botón)", () => {
    const logout = drawer.split("Cerrar sesión")[0].split("<div className=\"mt-auto pt-5\">").pop() ?? "";
    expect(drawer).toContain('<div className="mt-auto pt-5">');
    expect(logout).toContain('className="w-full flex items-center gap-3 px-3 h-11 rounded-xl');
    // Un `pt-*` dentro del botón empujaba el texto hacia abajo.
    expect(logout).not.toContain("pt-");
  });

  it("cierra el menú al elegir una opción y vuelve siempre a su pantalla inicial", () => {
    expect(home).toContain("const closeMenu = () => { setMenuOpen(false); setNotifOpen(false); setMenuSection(null); };");
    expect(home).toContain("const closeDrawer = () => { setMenuOpen(false); setMenuSection(null); };");
    expect(home).toContain("const openMenu = () => { setMenuSection(null); setMenuOpen(true); };");
  });
});

describe("Centro Plus: apariencia", () => {
  it("previsualiza cada efecto de nombre con las clases que se aplican de verdad", () => {
    expect(plus).toContain("name-fx name-fx-${fx.id}");
    expect(plus).toContain("nameEffectClass(me?.name_effect)");
    expect(plus).toContain("{ name_effect: id }");
  });

  it("aplica el marco elegido al anillo del avatar en la vista previa", () => {
    expect(plus).toContain("plusFrameColor(me?.avatar_frame)");
    expect(plus).toContain("PLUS_FRAMES.map((f) => {");
    expect(plus).toContain("{ avatar_frame: id }");
  });

  it("explica al usuario si el cambio se guardó o falló", () => {
    expect(plus).toContain("Guardando cambios…");
    expect(plus).toContain("Cambios guardados");
    expect(plus).toContain("No se pudo guardar el cambio.");
  });

  it("reparte el contenido en secciones navegables en vez de una lista larga", () => {
    expect(plus).toContain("PLUS_SECTIONS.map((item) => {");
    expect(plus).toContain('const [section, setSection] = useState<PlusSectionId>("apariencia")');
    for (const id of ["apariencia", "beneficios", "redes", "pruebas"]) {
      expect(plus).toContain(`section === "${id}"`);
    }
  });
});

describe("marcos de perfil más claros y efectos legibles", () => {
  it("dibuja el marco como un anillo ceñido (un poco más fino) con un borde neutro que lo separe del fondo", () => {
    // El mismo grosor en la vista previa de Plus, en el perfil y en cada publicación.
    expect(profile).toContain('className="relative shrink-0 rounded-2xl p-[2px] ring-1 ring-line-strong"');
    expect(postCard).toContain('className="w-10 h-10 rounded-full p-[2px] ring-1 ring-line-strong"');
    expect(plus).toContain('className="shrink-0 rounded-2xl p-[2px]"');
    expect(profile).not.toContain("p-[3px]");
    expect(postCard).not.toContain("p-[3px]");
    expect(plus).not.toContain("p-[3px]");
  });

  it("aclara los cuatro tonos de marco en lugar de reutilizar el color base de Plus", () => {
    expect(material3).not.toContain("--plus-frame-aurora: var(--plus)");
    expect(material3).toContain("--plus-frame-ice: oklch(0.82 0.08 200)");
    expect(material3).toContain("--plus-frame-ice: oklch(0.92 0.05 195)");
  });

  it("define Sombra, Neón y Brillo para los dos temas", () => {
    for (const rule of [".dark .name-fx-shadow", ".dark .name-fx-neon", ".dark .name-fx-glow"]) {
      expect(styles).toContain(rule);
    }
  });

  it("aplica el efecto de nombre elegido en la cabecera del perfil", () => {
    expect(profile).toContain("nameEffectClass(profile.name_effect)");
  });
});
