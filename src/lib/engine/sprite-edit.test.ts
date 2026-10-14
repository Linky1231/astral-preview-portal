import { describe, expect, it } from "vitest";
import type { SpriteAsset } from "./core";
import { applyEditedDrawing } from "./sprite-edit";

const texture = (patch: Partial<SpriteAsset> = {}): SpriteAsset => ({
  id: "t1",
  name: "piedra",
  width: 128,
  height: 128,
  fps: 8,
  loop: true,
  frames: [{ id: "f1", layers: [], composite: "dibujo-viejo" }],
  ...patch,
});

const edited = (patch: Partial<SpriteAsset> = {}): SpriteAsset => ({
  id: "nueva",
  name: "piedra",
  width: 256,
  height: 256,
  fps: 8,
  loop: true,
  frames: [{ id: "f9", layers: [], composite: "dibujo-nuevo" }],
  ...patch,
});

describe("seguir editando una textura", () => {
  it("el dibujo nuevo vuelve a su textura: mismo id, sin copias sueltas", () => {
    const saved = applyEditedDrawing(texture(), edited());
    expect(saved.id).toBe("t1");
    expect(saved.frames).toHaveLength(1);
    expect(saved.frames[0].composite).toBe("dibujo-nuevo");
    // El lienzo del dibujo manda: la textura adopta su medida.
    expect(saved.width).toBe(256);
    expect(saved.height).toBe(256);
  });

  it("conserva el nombre y solo lo cambia si el editor trae otro", () => {
    expect(applyEditedDrawing(texture(), edited()).name).toBe("piedra");
    expect(applyEditedDrawing(texture(), edited({ name: "  roca  " })).name).toBe("roca");
    expect(applyEditedDrawing(texture(), edited({ name: "   " })).name).toBe("piedra");
  });

  it("una textura con varios fotogramas conserva los demás", () => {
    const animation = texture({
      frames: [
        { id: "f1", layers: [], composite: "dibujo-viejo" },
        { id: "f2", layers: [], composite: "segundo" },
        { id: "f3", layers: [], composite: "tercero" },
      ],
    });
    const saved = applyEditedDrawing(animation, edited());
    expect(saved.frames.map(f => f.composite)).toEqual(["dibujo-nuevo", "segundo", "tercero"]);
    expect(saved.frames.map(f => f.id)).toEqual(["f1", "f2", "f3"]);
    expect(saved.fps).toBe(8);
    expect(saved.loop).toBe(true);
  });

  it("sin dibujo no toca nada: la textura se queda como estaba", () => {
    const original = texture();
    const empty = edited({ frames: [{ id: "f9", layers: [], composite: "" }] });
    expect(applyEditedDrawing(original, empty)).toEqual(original);
    expect(applyEditedDrawing(original, edited({ frames: [] }))).toEqual(original);
  });
});
