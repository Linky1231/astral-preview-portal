import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const editor = read("src/components/engine/AsternalEditor.tsx");
const panel = editor.split("function TexturesPanel(")[1] ?? "";
const paint = read("src/components/engine/PaintEditor.tsx");
const i18n = read("src/lib/i18n.ts");
const store = read("src/components/social/StoreSection.tsx");

describe("apartado «Añade texturas»", () => {
  it("el apartado se llama «Texturas», ni «Añade texturas» ni «Assets»", () => {
    expect(i18n).toContain('"tab.assets": "TEXTURAS"');
    expect(i18n).toContain('"tab.assets":"TEXTURES"');
    expect(i18n.includes('"tab.assets": "ASSETS"')).toBe(false);
    expect(i18n.includes('"tab.assets":"ASSETS"')).toBe(false);
    // El nombre largo no cabía bien en la pestaña: se queda solo «Texturas».
    expect(i18n.includes("AÑADE TEXTURAS")).toBe(false);
    expect(i18n.includes("ADD TEXTURES")).toBe(false);
    // La pestaña abre el panel de texturas y su título ya no habla de sprites.
    expect(editor).toContain('{tab === "textures" && (');
    expect(panel).toContain("<SectionTitle>TEXTURAS · {sprites.length}</SectionTitle>");
    expect(editor.includes("SPRITES ·")).toBe(false);
  });

  it("no queda vocabulario «asset» en el editor ni en el flujo que usa su biblioteca", () => {
    expect(editor.includes("ASSET")).toBe(false);
    expect(editor.includes("Librería de assets")).toBe(false);
    expect(editor).toContain("OBJETO DE LA BIBLIOTECA");
    expect(store.includes("assets de tu biblioteca")).toBe(false);
    expect(store).toContain("objetos de tu biblioteca");
  });

  it("la vista previa de una textura es fondo blanco y el dibujo, sin cuadrícula", () => {
    // El damero de transparencia del CSS del panel se sustituye por papel blanco.
    expect(panel.includes("linear-gradient(45deg,#9ca3af")).toBe(false);
    expect(panel.includes("#e5e7eb")).toBe(false);
    const tile = panel.split("aspect-square rounded-md grid place-items-center overflow-hidden border border-border/30")[1];
    expect(tile?.startsWith(" bg-white")).toBe(true);
  });

  it("cada textura lleva un lápiz para seguir editándola en cualquier momento", () => {
    expect(panel).toContain("onClick={() => setEditing(sp)}");
    expect(panel).toContain("aria-label={`Seguir editando ${sp.name}`}");
    // El lápiz es un botón grande (36 px, icono 17) y fácil de acertar con el dedo.
    expect(panel).toContain('absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full');
    expect(panel).toContain("<Pencil size={17} strokeWidth={2} />");
    // El lápiz abre el editor con el dibujo guardado dentro, no un lienzo vacío.
    expect(panel).toContain('image: editing.frames[0]?.composite ?? ""');
    expect(panel).toContain("applyEditedDrawing(s, asset)");
    // Y el editor de dibujo sabe reabrir un dibujo y conservar su nombre.
    expect(paint).toContain("source?: {");
    expect(paint).toContain("if (sourceImage.current) loadSourceDrawing(firstLayer, sourceImage.current);");
    expect(paint).toContain('useState(source?.name?.trim() || "drawing")');
  });

  it("el aviso del panel explica el lápiz", () => {
    expect(panel).toContain("Cada textura lleva un lápiz en su esquina");
    expect(panel).toContain("para seguir editándola");
  });
});

describe("lienzo de dibujo sensible al tacto", () => {
  it("el punto se pinta en el mismo instante del toque, también con el dedo", () => {
    // La espera del «primer punto pendiente» desaparece: el lienzo responde al
    // apoyar el dedo, no al primer movimiento.
    expect(paint.includes("stampPending")).toBe(false);
    expect(paint.includes("pendingFirstPoint")).toBe(false);
    expect(paint.includes("resolvePendingStamp")).toBe(false);
    expect(paint).not.toContain("paint-stroke");
    // El pincel pinta y guarda su copia de seguridad al empezar el gesto.
    const brush = paint.split("// Lápiz y borrador.")[1] ?? "";
    expect(brush).toContain("drag.current = { active: true, tool, last: p, start: p, smooth: p };");
    expect(brush).toContain("pushSnapshot();");
    expect(brush).toContain("captureStrokeBackup();");
    expect(brush).toContain('stampDot(p.x, p.y, tool === "eraser", w);');
  });

  it("un segundo dedo cancela el trazo y devuelve la capa a su copia", () => {
    // Es lo que hace seguro pintar al instante: el punto del pellizco se deshace.
    expect(paint).toContain("cancelStroke();");
    expect(paint).toContain("const prev = undoStack.current.pop();");
    expect(paint).toContain("c.drawImage(backup, 0, 0);");
    // Y el lienzo vuelve a saberse vacío: la invitación a dibujar no se pierde
    // por un pellizco que empezó con un dedo apoyado.
    expect(paint).toContain("artworkBeforeGesture.current = hasArtwork;");
    expect(paint).toContain("setHasArtwork(artworkBeforeGesture.current);");
  });
});
