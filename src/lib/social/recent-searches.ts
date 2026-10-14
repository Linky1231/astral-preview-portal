/**
 * Historial local de búsquedas.
 *
 * El buscador reejecutaba una consulta desde cero cada vez que se entraba a la
 * pantalla. Guardamos las últimas consultas en el dispositivo para poder
 * repetirlas con un toque, sin sincronizarlas con la cuenta: es una comodidad
 * del dispositivo, no un dato del perfil.
 */

export const RECENT_SEARCHES_KEY = "ast_recent_searches";

/** Cuántas consultas se conservan antes de descartar la más antigua. */
export const MAX_RECENT_SEARCHES = 8;

type SearchStorage = Pick<Storage, "getItem" | "setItem"> | null;

function defaultStorage(): SearchStorage {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    /* modo privado bloqueado: el buscador sigue funcionando sin historial */
    return null;
  }
}

export function readRecentSearches(storage?: SearchStorage): string[] {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(RECENT_SEARCHES_KEY) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function writeRecentSearches(list: string[], storage?: SearchStorage): string[] {
  const target = storage === undefined ? defaultStorage() : storage;
  try {
    target?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    /* cuota llena o almacenamiento no disponible */
  }
  return list;
}

/** Guarda una búsqueda (sin duplicados y con las más recientes primero). */
export function rememberSearch(query: string, storage?: SearchStorage): string[] {
  const clean = query.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return readRecentSearches(storage);
  const rest = readRecentSearches(storage).filter(
    (value) => value.toLowerCase() !== clean.toLowerCase(),
  );
  return writeRecentSearches([clean, ...rest].slice(0, MAX_RECENT_SEARCHES), storage);
}

/** Quita una consulta concreta del historial. */
export function forgetSearch(query: string, storage?: SearchStorage): string[] {
  const clean = query.trim().toLowerCase();
  return writeRecentSearches(
    readRecentSearches(storage).filter((value) => value.toLowerCase() !== clean),
    storage,
  );
}

export function clearRecentSearches(storage?: SearchStorage): string[] {
  return writeRecentSearches([], storage);
}
