export type PlayedGameMedia = {
  id: string;
  signed_cover?: string | null;
  signed_screenshots?: readonly string[] | null;
};

export type PlayedGameCoverSession = {
  gameId: string;
  coverUrl: string | null;
};

/** Prioriza la portada publicada y usa la primera captura solo como respaldo visual. */
export function resolvePlayedGameCover(game: PlayedGameMedia): string | null {
  return game.signed_cover ?? game.signed_screenshots?.[0] ?? null;
}

/**
 * Actualiza exclusivamente sesiones cuyo juego tenga una imagen real disponible.
 * No convierte en vacío una portada que ya existía si la consulta no devuelve media.
 */
export function refreshPlayedGameCoverSessions<T extends PlayedGameCoverSession>(
  sessions: readonly T[],
  games: readonly PlayedGameMedia[],
): { sessions: T[]; changed: boolean } {
  const covers = new Map(games.map((game) => [game.id, resolvePlayedGameCover(game)]));
  let changed = false;
  const next = sessions.map((session) => {
    const cover = covers.get(session.gameId);
    if (!cover || cover === session.coverUrl) return session;
    changed = true;
    return { ...session, coverUrl: cover };
  });

  return { sessions: next, changed };
}
