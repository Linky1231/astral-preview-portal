import { describe, expect, it } from "vitest";
import { refreshPlayedGameCoverSessions, resolvePlayedGameCover } from "../src/lib/social/history-cover";

describe("portadas de juegos en Historial", () => {
  it("prioriza la portada publicada y usa una captura solo como respaldo", () => {
    expect(resolvePlayedGameCover({ id: "juego-1", signed_cover: "cover-real", signed_screenshots: ["captura"] })).toBe("cover-real");
    expect(resolvePlayedGameCover({ id: "juego-2", signed_cover: null, signed_screenshots: ["captura-real"] })).toBe("captura-real");
  });

  it("repara sesiones históricas sin imagen sin borrar una portada ya existente", () => {
    const result = refreshPlayedGameCoverSessions(
      [
        { gameId: "juego-1", coverUrl: null },
        { gameId: "juego-2", coverUrl: "portada-previa" },
      ],
      [
        { id: "juego-1", signed_cover: null, signed_screenshots: ["captura-real"] },
        { id: "juego-2", signed_cover: null, signed_screenshots: [] },
      ],
    );

    expect(result.changed).toBe(true);
    expect(result.sessions).toEqual([
      { gameId: "juego-1", coverUrl: "captura-real" },
      { gameId: "juego-2", coverUrl: "portada-previa" },
    ]);
  });
});
