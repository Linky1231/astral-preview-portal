import { afterEach, describe, expect, it } from "vitest";

import {
  LAST_EDITOR_MODE_KEY,
  readLastEditorMode,
  writeLastEditorMode,
} from "./last-editor-mode";

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

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("última sección del menú de crear", () => {
  it("devuelve null si no hay nada guardado", () => {
    installLocalStorage();
    expect(readLastEditorMode()).toBeNull();
  });

  it("guarda y devuelve la sección", () => {
    installLocalStorage();
    writeLastEditorMode("v2");
    expect(readLastEditorMode()).toBe("v2");
    writeLastEditorMode("mini");
    expect(readLastEditorMode()).toBe("mini");
  });

  it("ignora valores desconocidos guardados", () => {
    installLocalStorage({ [LAST_EDITOR_MODE_KEY]: "beta" });
    expect(readLastEditorMode()).toBeNull();
  });

  it("ignora el modo retirado star2d", () => {
    installLocalStorage({ [LAST_EDITOR_MODE_KEY]: "star2d" });
    expect(readLastEditorMode()).toBeNull();
  });

  it("no lanza si localStorage no está disponible", () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(readLastEditorMode()).toBeNull();
    expect(() => writeLastEditorMode("mini")).not.toThrow();
  });
});
