import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PREFERENCES_STORAGE_KEY,
  applyPreferences,
  readPreferences,
  setTheme,
} from "./preferences";

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

describe("lectura de preferencias", () => {
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("usa los valores por defecto si no hay nada guardado", () => {
    installLocalStorage();
    expect(readPreferences()).toEqual({ theme: "light", language: "es" });
  });

  it("ignora un JSON corrupto sin lanzar", () => {
    installLocalStorage({ [PREFERENCES_STORAGE_KEY]: "no-es-json" });
    expect(readPreferences()).toEqual({ theme: "light", language: "es" });
  });

  it("normaliza valores desconocidos y mantiene el idioma fijo en es", () => {
    installLocalStorage({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: "neon", language: "fr" }),
    });
    expect(readPreferences()).toEqual({ theme: "light", language: "es" });
  });

  it("acepta el tema oscuro y descarta restos de la antigua preferencia de interfaz", () => {
    installLocalStorage({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: "dark", ui: "classic", language: "es" }),
    });
    expect(readPreferences()).toEqual({ theme: "dark", language: "es" });
  });
});

describe("escritura de preferencias", () => {
  let storage: ReturnType<typeof installLocalStorage>;

  beforeEach(() => {
    storage = installLocalStorage();
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("setTheme persiste el cambio y se lee de vuelta", () => {
    setTheme("dark");
    expect(readPreferences().theme).toBe("dark");
    expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) as string).theme).toBe("dark");
  });

  it("guarda solo tema e idioma: no persiste ninguna variante de interfaz", () => {
    // Dos cambios seguidos garantizan una escritura real (el estado del módulo
    // persiste entre tests, así que un solo valor podría ser el actual).
    setTheme("dark");
    setTheme("light");
    const saved = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) as string) as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(["language", "theme"]);
    expect(saved.ui).toBeUndefined();
    expect(readPreferences().language).toBe("es");
  });
});

describe("applyPreferences", () => {
  it("no lanza en entornos sin document (node)", () => {
    expect(() => applyPreferences({ theme: "dark", language: "es" })).not.toThrow();
  });

  it("aplica la clase .dark y el colorScheme del documento", () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
      style: {} as Record<string, string>,
    };
    const previous = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { documentElement: root };
    try {
      applyPreferences({ theme: "dark", language: "es" });
      expect(classes.has("dark")).toBe(true);
      expect(root.style.colorScheme).toBe("dark");

      applyPreferences({ theme: "light", language: "es" });
      expect(classes.has("dark")).toBe(false);
      expect(root.style.colorScheme).toBe("light");
    } finally {
      (globalThis as { document?: unknown }).document = previous;
    }
  });
});
