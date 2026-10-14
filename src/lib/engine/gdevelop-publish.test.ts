import { afterEach, describe, expect, it, vi } from "vitest";

import { GDEVELOP_PUBLISH_STORAGE_KEY } from "./gdevelop-publish";

/** Stub mínimo de localStorage para el entorno node de vitest. */
function installLocalStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const stub = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof stub }).localStorage = stub;
  return stub;
}

/** Importa una copia fresca de la lib con el localStorage ya instalado. */
async function freshStore(seed: Record<string, string> = {}) {
  installLocalStorage(seed);
  vi.resetModules();
  return await import("./gdevelop-publish");
}

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  vi.resetModules();
});

describe("normalizeGameUrl", () => {
  it("acepta enlaces de gd.games y añade https si falta", async () => {
    const store = await freshStore();
    expect(store.normalizeGameUrl("https://gd.games/abc-123")).toBe("https://gd.games/abc-123");
    expect(store.normalizeGameUrl("gd.games/abc-123")).toBe("https://gd.games/abc-123");
    expect(store.normalizeGameUrl("  https://juegos.ejemplo.com/juego  ")).toBe(
      "https://juegos.ejemplo.com/juego",
    );
  });

  it("rechaza enlaces vacíos, raros o sin dominio", async () => {
    const store = await freshStore();
    expect(store.normalizeGameUrl("")).toBeNull();
    expect(store.normalizeGameUrl("   ")).toBeNull();
    expect(store.normalizeGameUrl("javascript:alert(1)")).toBeNull();
    expect(store.normalizeGameUrl("mailto:hola@ejemplo.com")).toBeNull();
    expect(store.normalizeGameUrl("https://")).toBeNull();
    expect(store.normalizeGameUrl("esto no es un enlace")).toBeNull();
  });
});

describe("lista de juegos web guardados", () => {
  it("empieza vacía si no hay nada guardado", async () => {
    const store = await freshStore();
    expect(store.readWebGameLinks()).toEqual([]);
    expect(store.useWebGameLinks).toBeTypeOf("function");
  });

  it("ignora un JSON corrupto sin lanzar", async () => {
    const store = await freshStore({ [GDEVELOP_PUBLISH_STORAGE_KEY]: "no-es-json" });
    expect(store.readWebGameLinks()).toEqual([]);
  });

  it("descarta entradas inválidas y duplica saneando la lista", async () => {
    const store = await freshStore({
      [GDEVELOP_PUBLISH_STORAGE_KEY]: JSON.stringify([
        { id: "a", title: "Bueno", url: "https://gd.games/bueno", savedAt: 20 },
        { id: "b", title: "Duplicado", url: "gd.games/bueno", savedAt: 10 },
        { id: "c", title: "Roto", url: "javascript:alert(1)", savedAt: 30 },
        "no-objeto",
        { id: "d", title: "Otro", url: "https://gd.games/otro", savedAt: 5 },
      ]),
    });
    const links = store.readWebGameLinks();
    expect(links.map((l) => l.url)).toEqual(["https://gd.games/bueno", "https://gd.games/otro"]);
    expect(links[0].title).toBe("Bueno");
  });

  it("guarda un enlace nuevo, lo persiste y lo pone el primero", async () => {
    const store = await freshStore();
    const storage = (
      globalThis as unknown as { localStorage: { getItem: (k: string) => string | null } }
    ).localStorage;
    const first = store.addWebGameLink("Mi plataformas", "gd.games/mi-juego");
    expect(first).toHaveLength(1);
    expect(first![0]).toMatchObject({
      title: "Mi plataformas",
      url: "https://gd.games/mi-juego",
    });
    expect(first![0].savedAt).toBeGreaterThan(0);

    const second = store.addWebGameLink("Otro", "https://gd.games/otro");
    expect(second!.map((l) => l.title)).toEqual(["Otro", "Mi plataformas"]);

    // Persistido en localStorage.
    const raw = storage.getItem(GDEVELOP_PUBLISH_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(2);

    // Releer desde storage da la misma lista.
    expect(store.readWebGameLinks().map((l) => l.title)).toEqual(["Otro", "Mi plataformas"]);
  });

  it("actualiza la entrada si se guarda la misma URL otra vez", async () => {
    const store = await freshStore();
    store.addWebGameLink("Versión 1", "https://gd.games/mismo");
    const next = store.addWebGameLink("Versión 2", "gd.games/mismo");
    expect(next).toHaveLength(1);
    expect(next![0].title).toBe("Versión 2");
    expect(next![0].url).toBe("https://gd.games/mismo");
  });

  it("rechaza enlaces inválidos sin modificar la lista", async () => {
    const store = await freshStore();
    store.addWebGameLink("Válido", "https://gd.games/ok");
    expect(store.addWebGameLink("Inválido", "no es un enlace")).toBeNull();
    expect(store.readWebGameLinks()).toHaveLength(1);
  });

  it("elimina un enlace por su id", async () => {
    const store = await freshStore();
    const added = store.addWebGameLink("Borrar", "https://gd.games/borrar")!;
    store.removeWebGameLink(added[0].id);
    expect(store.readWebGameLinks()).toEqual([]);
  });
});
