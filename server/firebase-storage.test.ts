import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FIREBASE_CONFIG,
  FIREBASE_ENV_KEYS,
  STORAGE_RULES,
  cleanEnvValue,
  firebaseErrorMessage,
  firebaseProjectMetadata,
  firebaseProjectPath,
  firebaseProjectsDir,
  isFirebaseConfigured,
  projectNameFromStorage,
  resolveFirebaseConfig,
  sanitizePathSegment,
} from "../src/lib/engine/firebase-app";
import { planBackupSync } from "../src/lib/engine/remote-backup";
import {
  createProject,
  deleteProjectById,
  getProjectFirebaseId,
  isFirebaseProjectDeleted,
  readDeletedCloudIds,
  saveProjectById,
  setProjectFirebaseId,
} from "../src/lib/engine/storage";

/**
 * Espacio extra en Firebase Storage.
 *
 * Se prueban las piezas que no necesitan red: la configuración resuelta, las
 * rutas del bucket (de las que depende que cada persona quede aislada en su
 * carpeta), los metadatos que viajan con cada copia, los mensajes de error y el
 * plan de sincronización compartido con Drive.
 */

describe("configuración del proyecto de Firebase", () => {
  it("usa el proyecto por defecto cuando Keys no define nada", () => {
    const config = resolveFirebaseConfig();
    expect(config.projectId).toBe(DEFAULT_FIREBASE_CONFIG.projectId);
    expect(config.storageBucket).toBe(DEFAULT_FIREBASE_CONFIG.storageBucket);
    expect(config.apiKey).toBe(DEFAULT_FIREBASE_CONFIG.apiKey);
    expect(isFirebaseConfigured()).toBe(true);
  });

  it("documenta los nombres de las variables que puede inyectar Keys", () => {
    expect(Object.values(FIREBASE_ENV_KEYS)).toEqual([
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_STORAGE_BUCKET",
      "VITE_FIREBASE_MESSAGING_SENDER_ID",
      "VITE_FIREBASE_APP_ID",
    ]);
  });

  it("ignora valores vacíos o con espacios", () => {
    expect(cleanEnvValue("  ")).toBeUndefined();
    expect(cleanEnvValue(undefined)).toBeUndefined();
    expect(cleanEnvValue("  proyecto  ")).toBe("proyecto");
  });
});

describe("rutas del bucket", () => {
  it("guarda cada usuario en su propia carpeta", () => {
    expect(firebaseProjectsDir("uid-1")).toBe("astUsers/uid-1/projects");
    expect(firebaseProjectPath("uid-1", "local-2")).toBe("astUsers/uid-1/projects/local-2.json");
  });

  it("limpia los segmentos que podrían escaparse de la carpeta", () => {
    expect(sanitizePathSegment("a/b")).toBe("a-b");
    expect(sanitizePathSegment("u\u0000id")).toBe("uid");
    expect(sanitizePathSegment("   ")).toBe("sin-id");
    expect(sanitizePathSegment("")).toBe("sin-id");
    // Lo importante: ni separadores ni «..» dentro de un segmento, así que
    // ningún id puede salirse de la carpeta del usuario.
    for (const entrada of ["../../otro", "x/y/z", "..", "a\\b"]) {
      const limpio = sanitizePathSegment(entrada);
      expect(limpio).not.toContain("/");
      expect(limpio).not.toContain("..");
    }
  });
});

describe("metadatos de cada copia", () => {
  it("lleva el id local y el nombre visible dentro del archivo", () => {
    const meta = firebaseProjectMetadata("Nivel 1", "local-7");
    expect(meta).toEqual({
      app: "asternal",
      kind: "project",
      localId: "local-7",
      projectName: "Nivel 1",
    });
  });

  it("recupera el nombre desde los metadatos y, si no está, desde el archivo", () => {
    expect(projectNameFromStorage("local-7.json", { projectName: "Nivel 1" })).toBe("Nivel 1");
    expect(projectNameFromStorage("local-7.json", undefined)).toBe("local-7");
    expect(projectNameFromStorage("", undefined)).toBe("Juego");
  });
});

describe("reglas y errores", () => {
  it("las reglas aíslan a cada cuenta anónima en su carpeta", () => {
    expect(STORAGE_RULES).toContain("request.auth.uid == uid");
    expect(STORAGE_RULES).toContain("astUsers/{uid}/projects/{file}");
    expect(STORAGE_RULES).toContain("request.auth != null");
  });

  it("el archivo storage.rules es el mismo que explica el panel y despliega firebase.json", () => {
    const rules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8").trim();
    expect(rules).toBe(STORAGE_RULES.trim());
    const firebaseJson = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8")) as {
      hosting?: { site?: string; public?: string; rewrites?: Array<{ source: string; destination: string }> };
      storage?: { rules?: string };
    };
    expect(firebaseJson.hosting?.site).toBe("asternal");
    // La app se publica desde el cliente compilado (vite.config.ts → dist/public).
    expect(firebaseJson.hosting?.public).toBe("dist/public");
    // Cualquier ruta del enrutador se resuelve en el HTML de la app.
    expect(firebaseJson.hosting?.rewrites).toEqual([{ source: "**", destination: "/index.html" }]);
    expect(firebaseJson.storage?.rules).toBe("storage.rules");
  });

  it("explica en español los fallos típicos", () => {
    expect(firebaseErrorMessage({ code: "storage/unauthorized" })).toContain("Reglas");
    expect(firebaseErrorMessage({ code: "auth/operation-not-allowed" })).toContain("Anónimo");
    expect(firebaseErrorMessage({ code: "auth/unauthorized-domain" })).toContain("Dominios autorizados");
    expect(firebaseErrorMessage(new Error("Failed to fetch"))).toContain("Sin conexión");
    expect(firebaseErrorMessage(new Error("vaya"))).toBe("vaya");
  });
});

describe("plan de respaldo compartido (usado por el bucket)", () => {
  const local = (over: { id: string; remoteId?: string; updatedAt?: number }) => ({
    name: "Juego",
    updatedAt: 1000,
    ...over,
  });

  it("sube lo que no tiene copia y baja lo que no está aquí", () => {
    const plan = planBackupSync(
      [local({ id: "a" })],
      [{ remoteId: "astUsers/u/projects/de-otro.json", name: "Otro", localId: "otro" }],
    );
    expect(plan.push.map((item) => item.id)).toEqual(["a"]);
    expect(plan.pull.map((file) => file.remoteId)).toEqual(["astUsers/u/projects/de-otro.json"]);
  });

  it("reenlaza la copia existente en vez de duplicarla", () => {
    const plan = planBackupSync(
      [local({ id: "a" })],
      [{ remoteId: "astUsers/u/projects/a.json", name: "Juego", localId: "a", updatedAt: 5000 }],
    );
    expect(plan.link).toEqual([{ localId: "a", remoteId: "astUsers/u/projects/a.json" }]);
    expect(plan.push).toEqual([]);
    expect(plan.pull).toEqual([]);
  });

  it("actualiza la copia cuando el juego se editó después", () => {
    const plan = planBackupSync(
      [local({ id: "a", remoteId: "astUsers/u/projects/a.json", updatedAt: 30_000 })],
      [{ remoteId: "astUsers/u/projects/a.json", name: "Juego", localId: "a", updatedAt: 5000 }],
    );
    expect(plan.push).toEqual([
      { id: "a", name: "Juego", remoteId: "astUsers/u/projects/a.json" },
    ]);
  });
});

describe("vínculo local con la copia del bucket", () => {
  function installEnv() {
    const store = new Map<string, string>();
    const noop = () => {};
    (globalThis as unknown as { window: unknown }).window = { addEventListener: noop, removeEventListener: noop };
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
    return store;
  }

  beforeEach(() => {
    installEnv();
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("recuerda la ruta del bucket aunque el editor siga autoguardando", () => {
    const id = createProject("Nivel 1");
    setProjectFirebaseId(id, "astUsers/u/projects/nivel.json");
    expect(getProjectFirebaseId(id)).toBe("astUsers/u/projects/nivel.json");
    saveProjectById(id, { name: "Nivel 1", scenes: [] } as never);
    expect(getProjectFirebaseId(id)).toBe("astUsers/u/projects/nivel.json");
  });

  it("borrar un juego con copia en el bucket evita que la sincronización la reimporte", () => {
    const id = createProject("Nivel 1");
    setProjectFirebaseId(id, "astUsers/u/projects/nivel.json");
    deleteProjectById(id);
    expect(isFirebaseProjectDeleted("astUsers/u/projects/nivel.json")).toBe(true);
    expect(readDeletedCloudIds()).toContain("astUsers/u/projects/nivel.json");
    expect(isFirebaseProjectDeleted(undefined)).toBe(false);
  });
});
