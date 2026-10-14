import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const material3 = read("src/material3.css");
const styles = read("src/styles.css");
const feed = read("src/routes/feed.tsx");
const plus = read("src/routes/plus.tsx");
const search = read("src/components/social/SearchSection.tsx");
const home = read("src/components/social/GamesHome.tsx");
const animation = read("src/components/engine/AnimationEditor.tsx");

describe("elevación M3 sin recortes", () => {
  it("deja de recortar el lienzo de la cabecera (contención de layout, no de pintado)", () => {
    const header = styles.split("Header stability")[1];
    expect(header).toContain("contain: layout;");
    expect(header).not.toContain("contain: layout paint;");
  });

  it("define una barra deslizante con aire vertical propio, compensado para no mover el contenido", () => {
    const scrollX = material3.split(".m3-scroll-x {")[1].split("}")[0];
    expect(scrollX).toContain("overflow-x: auto;");
    expect(scrollX).toContain("overflow-y: hidden;");
    expect(scrollX).toContain("padding-block: 0.75rem;");
    expect(scrollX).toContain("margin-block: -0.75rem;");
  });

  it("la aplica a las barras deslizantes con botones elevados de toda la app", () => {
    // Barra de publicaciones (categorías del feed), pestañas del Centro Plus,
    // filtros del buscador, chips de Inicio y listas del editor de animación.
    expect(feed).toContain('className="flex items-center gap-1.5 m3-scroll-x no-scrollbar"');
    expect(plus).toContain('className="flex gap-1.5 m3-scroll-x no-scrollbar"');
    expect(search).toContain("m3-scroll-x no-scrollbar -mx-1 px-1");
    expect(home.match(/m3-scroll-x no-scrollbar -mx-1 px-1/g)?.length).toBe(2);
    // Las dos barras del editor de animación (fichas de clips y línea de
    // tiempo) llevan el aire vertical, aunque difieran en el espacio interno.
    expect(animation.match(/m3-scroll-x no-scrollbar/g)?.length).toBe(2);
  });

  it("no quedan barras deslizantes sin aire vertical en las pantallas revisadas", () => {
    for (const [name, source] of [["feed", feed], ["plus", plus], ["search", search], ["animation", animation]] as const) {
      expect(source.includes("overflow-x-auto"), `${name} todavía tiene un scroller sin aire`).toBe(false);
    }
  });
});
