import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DRIVE_FOLDER_MIME,
  DRIVE_PROJECT_SUFFIX,
  buildMultipartBody,
  driveAuthErrorMessage,
  driveChildrenQuery,
  driveFileToProject,
  driveFileToProjects,
  driveFolderQuery,
  escapeDriveQuery,
  formatBytes,
  projectDisplayName,
  quotaSummary,
  sanitizeDriveFileName,
} from "../src/lib/engine/drive";
import type { DriveFileResource } from "../src/lib/engine/drive";
import { planDriveSync, type LocalProjectRef } from "../src/lib/engine/drive-sync";
import {
  createProject,
  deleteProjectById,
  getProjectDriveId,
  isDriveProjectDeleted,
  isCloudProjectDeleted,
  readDeletedCloudIds,
  saveProjectById,
  setProjectDriveId,
} from "../src/lib/engine/storage";

/**
 * Espacio extra en Google Drive.
 *
 * Se prueban los ayudantes puros (nombres, consultas, multipart, cuota) y la
 * decisión de sincronización, que es donde estaban los riesgos reales: subir
 * duplicados, no volver a subir un juego cuya copia se borró en Drive, o
 * resucitar en Borradores un juego borrado aquí. Nada de esto necesita red.
 */

function installEnv() {
  const store = new Map<string, string>();
  const noop = () => {};
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: noop,
    removeEventListener: noop,
  };
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

describe("archivos de Drive: nombres y consultas", () => {
  it("limpia el nombre de caracteres prohibidos y añade el sufijo interno", () => {
    expect(sanitizeDriveFileName("Mi/Juego: épico?")).toBe(`MiJuego épico${DRIVE_PROJECT_SUFFIX}`);
    expect(sanitizeDriveFileName("   ")).toBe(`Juego${DRIVE_PROJECT_SUFFIX}`);
    expect(sanitizeDriveFileName("a".repeat(200)).length).toBeLessThanOrEqual(80 + DRIVE_PROJECT_SUFFIX.length);
  });

  it("muestra el nombre del juego sin el sufijo", () => {
    expect(projectDisplayName(`Mi Juego${DRIVE_PROJECT_SUFFIX}`)).toBe("Mi Juego");
    expect(projectDisplayName("otro.json")).toBe("otro.json");
    expect(projectDisplayName("")).toBe("Juego");
  });

  it("escapa comillas y barras en las consultas de la API", () => {
    expect(escapeDriveQuery("O'Brien\\x")).toBe("O\\'Brien\\\\x");
    expect(driveFolderQuery("Asternal")).toBe(
      `mimeType='${DRIVE_FOLDER_MIME}' and name='Asternal' and trashed=false`,
    );
    expect(driveFolderQuery("O'Brien")).toContain("name='O\\'Brien'");
    expect(driveChildrenQuery("folder-1")).toContain("'folder-1' in parents");
  });

  it("arma el cuerpo multipart con metadatos, contenido y cierre", () => {
    const body = buildMultipartBody("BOUND", { name: "juego" }, '{"a":1}');
    expect(body.startsWith("--BOUND\r\n")).toBe(true);
    expect(body).toContain('"name":"juego"');
    expect(body).toContain('{"a":1}');
    expect(body.endsWith("--BOUND--")).toBe(true);
    expect(body.split("--BOUND").length - 1).toBe(3);
  });

  it("convierte recursos de la API en copias utilizables", () => {
    const file = {
      id: "abc",
      name: `Nivel 1${DRIVE_PROJECT_SUFFIX}`,
      modifiedTime: "2026-10-01T10:00:00.000Z",
      size: "2048",
      appProperties: { localId: "local-7" },
    };
    expect(driveFileToProject(file)).toEqual({
      fileId: "abc",
      name: "Nivel 1",
      localId: "local-7",
      modifiedTime: Date.parse("2026-10-01T10:00:00.000Z"),
      size: 2048,
    });
    expect(driveFileToProject({ name: "sin id" })).toBeNull();
    expect(driveFileToProjects([file, { id: "x" } satisfies DriveFileResource])).toHaveLength(1);
  });
});

describe("cuota y tamaños legibles", () => {
  it("formatea bytes con coma decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1,0 KB");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(16106127360)).toBe("15,0 GB");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });

  it("resume la cuota de Drive con porcentaje y espacio libre", () => {
    const summary = quotaSummary({ limit: "16106127360", usageInDrive: "1073741824" });
    expect(summary.usedBytes).toBe(1073741824);
    expect(summary.limitBytes).toBe(16106127360);
    expect(summary.freeBytes).toBe(16106127360 - 1073741824);
    expect(summary.usedPercent).toBe(7);
  });

  it("no inventa porcentaje cuando Google no da límite", () => {
    const summary = quotaSummary({ usageInDrive: "100" });
    expect(summary.usedPercent).toBeNull();
    expect(summary.freeBytes).toBeUndefined();
  });
});

describe("mensajes de error de la autorización", () => {
  it("explica en español qué pasó", () => {
    expect(driveAuthErrorMessage("access_denied")).toContain("Cancelaste");
    expect(driveAuthErrorMessage("idpiframe_initialization_failed")).toContain("Orígenes autorizados");
    expect(driveAuthErrorMessage(undefined)).toContain("no devolvió");
    expect(driveAuthErrorMessage("otro")).toContain("otro");
  });
});

describe("plan de sincronización con Drive", () => {
  const local = (over: Partial<LocalProjectRef> & { id: string }): LocalProjectRef => ({
    name: "Juego",
    updatedAt: 1000,
    ...over,
  });

  it("sube los juegos que todavía no tienen copia", () => {
    const plan = planDriveSync([local({ id: "a" })], []);
    expect(plan.push.map((p) => p.id)).toEqual(["a"]);
    expect(plan.pull).toEqual([]);
    expect(plan.link).toEqual([]);
  });

  it("no resube lo que ya está al día en Drive", () => {
    const plan = planDriveSync(
      [local({ id: "a", driveId: "f1", updatedAt: 1000 })],
      [{ fileId: "f1", name: "Juego", localId: "a", modifiedTime: 5000 }],
    );
    expect(plan.push).toEqual([]);
    expect(plan.pull).toEqual([]);
  });

  it("actualiza el mismo archivo cuando el juego se editó después", () => {
    const plan = planDriveSync(
      [local({ id: "a", driveId: "f1", updatedAt: 20_000 })],
      [{ fileId: "f1", name: "Juego", localId: "a", modifiedTime: 5000 }],
    );
    expect(plan.push).toEqual([{ id: "a", name: "Juego", fileId: "f1" }]);
  });

  it("vuelve a subir el juego si su copia desapareció del Drive", () => {
    const plan = planDriveSync([local({ id: "a", driveId: "f1" })], []);
    expect(plan.push).toEqual([{ id: "a", name: "Juego" }]);
    expect(plan.link).toEqual([]);
  });

  it("reenlaza una copia existente en vez de descargarla como duplicado", () => {
    const plan = planDriveSync(
      [local({ id: "a" })],
      [{ fileId: "f1", name: "Juego", localId: "a", modifiedTime: 5000 }],
    );
    expect(plan.link).toEqual([{ localId: "a", fileId: "f1" }]);
    expect(plan.pull).toEqual([]);
  });

  it("descarga lo que existe en Drive y no en este dispositivo", () => {
    const plan = planDriveSync(
      [local({ id: "a" })],
      [{ fileId: "f9", name: "Otro juego", localId: "de-otro-dispositivo", modifiedTime: 5000 }],
    );
    expect(plan.pull.map((f) => f.fileId)).toEqual(["f9"]);
    expect(plan.push.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("vínculo local con la copia de Drive", () => {
  beforeEach(() => {
    installEnv();
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("recuerda el archivo de Drive aunque el editor siga autoguardando", () => {
    const id = createProject("Nivel 1");
    setProjectDriveId(id, "drive-1");
    expect(getProjectDriveId(id)).toBe("drive-1");
    const project = { name: "Nivel 1", scenes: [] } as never;
    saveProjectById(id, project);
    expect(getProjectDriveId(id)).toBe("drive-1");
  });

  it("permite soltar el vínculo con una cadena vacía", () => {
    const id = createProject("Nivel 1");
    setProjectDriveId(id, "drive-1");
    setProjectDriveId(id, "");
    expect(getProjectDriveId(id)).toBeUndefined();
  });

  it("borrar un juego con copia en Drive evita que la sincronización la reimporte", () => {
    const id = createProject("Nivel 1");
    setProjectDriveId(id, "drive-42");
    deleteProjectById(id);
    expect(isDriveProjectDeleted("drive-42")).toBe(true);
    expect(readDeletedCloudIds()).toContain("drive-42");
    // El registro es compartido con la nube: basta con no repetir el archivo.
    expect(isCloudProjectDeleted("drive-42")).toBe(true);
    expect(isDriveProjectDeleted(undefined)).toBe(false);
  });
});
