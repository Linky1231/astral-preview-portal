import { describe, expect, it } from "vitest";
import { CREATE_GAME_FIELD_CLASS } from "../src/lib/engine/create-game-field";

/** Tokens de tamaño de letra que aplican en móvil (sin prefijo de breakpoint). */
function mobileFontTokens(className: string): string[] {
  return className
    .split(" ")
    .filter((token) => token.startsWith("text-") && !token.includes(":"));
}

describe("campos del diálogo de creación de juegos", () => {
  it("usa 16px en móvil (text-base): con menos, iOS acerca la pantalla al enfocar", () => {
    // iOS Safari hace zoom automático sobre un campo enfocado de menos de 16px.
    expect(mobileFontTokens(CREATE_GAME_FIELD_CLASS)).toEqual(["text-base"]);
  });

  it("no encoge el campo por debajo de 16px en móvil", () => {
    expect(CREATE_GAME_FIELD_CLASS).not.toMatch(/(^| )text-(xs|sm)( |$)/);
  });

  it("mantiene el tamaño de escritorio a partir de md", () => {
    expect(CREATE_GAME_FIELD_CLASS).toContain("md:text-sm");
  });
});
