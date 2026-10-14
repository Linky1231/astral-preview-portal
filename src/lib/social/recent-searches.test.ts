import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_KEY,
  clearRecentSearches,
  forgetSearch,
  readRecentSearches,
  rememberSearch,
} from "./recent-searches";

function fakeStorage(seed?: string) {
  const data = new Map<string, string>();
  if (seed !== undefined) data.set(RECENT_SEARCHES_KEY, seed);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    raw: data,
  };
}

describe("historial de búsquedas recientes", () => {
  it("guarda la última consulta primero y evita duplicados", () => {
    const storage = fakeStorage();
    rememberSearch("astronave", storage);
    rememberSearch("dragón", storage);
    rememberSearch("Astronave", storage);
    expect(readRecentSearches(storage)).toEqual(["Astronave", "dragón"]);
  });

  it("limita el historial y normaliza espacios", () => {
    const storage = fakeStorage();
    for (let i = 0; i < MAX_RECENT_SEARCHES + 3; i += 1) {
      rememberSearch(`nivel   ${i}`, storage);
    }
    const list = readRecentSearches(storage);
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe(`nivel ${MAX_RECENT_SEARCHES + 2}`);
    expect(readRecentSearches(storage)).not.toContain(`nivel ${0}`);
  });

  it("ignora consultas demasiado cortas y datos corruptos", () => {
    const storage = fakeStorage("{no es json}");
    expect(rememberSearch("a", storage)).toEqual([]);
    expect(readRecentSearches(storage)).toEqual([]);
  });

  it("permite quitar una consulta o vaciar el historial", () => {
    const storage = fakeStorage();
    rememberSearch("castillo", storage);
    rememberSearch("bosque", storage);
    expect(forgetSearch("castillo", storage)).toEqual(["bosque"]);
    expect(clearRecentSearches(storage)).toEqual([]);
    expect(readRecentSearches(storage)).toEqual([]);
  });
});
