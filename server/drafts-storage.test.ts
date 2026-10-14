import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  deleteProjectById,
  duplicateProject,
  getCurrentProjectId,
  isCloudProjectDeleted,
  listDraftProjects,
  listProjects,
  loadProjectById,
  peekCurrentProjectId,
  readDeletedCloudIds,
  saveProjectById,
  setProjectCloudId,
} from "../src/lib/engine/storage";

/**
 * Borradores = juegos de verdad, no marcadores vacíos.
 *
 * Antes, cualquier lectura de la lista (abrir Borradores, sincronizar, publicar)
 * creaba un «Untitled Game» vacío y lo guardaba como borrador, y borrar el
 * último borrador lo resucitaba al instante. Además `createProject` cambiaba el
 * proyecto abierto como efecto colateral: al sincronizar/importar/remezclar, el
 * siguiente guardado o publicación caía en otro juego (los juegos se mezclaban).
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

let store: Map<string, string>;

describe("borradores del editor", () => {
  beforeEach(() => {
    store = installEnv();
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("listar borradores no crea ningún juego", () => {
    expect(listDraftProjects()).toEqual([]);
    expect(listProjects()).toEqual([]);
    expect(store.get("asternal:projects:index")).toBeUndefined();
  });

  it("sigue habiendo un proyecto por defecto cuando el editor lo pide", () => {
    const id = getCurrentProjectId();
    expect(id).toBeTruthy();
    expect(listProjects()).toHaveLength(1);
    expect(getCurrentProjectId()).toBe(id);
  });

  it("el marcador vacío del editor no aparece en Borradores", () => {
    const placeholder = getCurrentProjectId();
    expect(listProjects().map(m => m.id)).toContain(placeholder);
    expect(listDraftProjects().map(d => d.id)).not.toContain(placeholder);
  });

  it("un juego sin cambios no entra en borradores, ni siquiera con nombre", () => {
    const id = createProject("Nivel 1");
    expect(listProjects().map(m => m.id)).toContain(id);
    expect(listDraftProjects().map(d => d.id)).not.toContain(id);
  });

  it("un juego con cambios reales sí es un borrador", () => {
    const id = createProject("Nivel 1");
    const project = loadProjectById(id);
    expect(project).not.toBeNull();
    const edited = {
      ...project!,
      scenes: project!.scenes.map(scene => ({
        ...scene,
        entities: scene.entities.map((entity, i) => (i === 0 ? { ...entity, x: entity.x + 40 } : entity)),
      })),
    };
    saveProjectById(id, edited);
    expect(listDraftProjects().map(d => d.id)).toContain(id);
  });

  it("añadir un sprite cuenta como cambio", () => {
    const id = createProject("Con sprite");
    const project = loadProjectById(id);
    const edited = {
      ...project!,
      assets: { sprites: [{ id: "s1", name: "hero", frames: [], fps: 8 } as never] },
    };
    saveProjectById(id, edited);
    expect(listDraftProjects().map(d => d.id)).toContain(id);
  });

  it("borrar el último borrador no lo resucita", () => {
    const id = createProject("Nivel 1");
    deleteProjectById(id);
    expect(listDraftProjects()).toEqual([]);
    expect(listProjects()).toEqual([]);
  });

  it("el autoguardado tardío de un proyecto borrado no lo devuelve a Borradores", () => {
    const id = createProject("Nivel 1");
    const project = loadProjectById(id);
    const edited = {
      ...project!,
      scenes: project!.scenes.map(scene => ({
        ...scene,
        entities: scene.entities.map((entity, i) => (i === 0 ? { ...entity, x: entity.x + 40 } : entity)),
      })),
    };
    saveProjectById(id, edited); // ahora sí es un borrador
    expect(listDraftProjects().map(m => m.id)).toContain(id);

    deleteProjectById(id);
    // El editor que seguía abierto vuelve a guardar (local y en la nube).
    saveProjectById(id, edited);
    expect(listProjects().map(m => m.id)).not.toContain(id);
    expect(listDraftProjects().map(m => m.id)).not.toContain(id);
  });

  it("duplicar un proyecto sí lo registra en la lista", () => {
    const id = createProject("Nivel 1");
    const copy = duplicateProject(id);
    expect(copy).toBeTruthy();
    expect(listProjects().map(m => m.id)).toContain(copy as string);
  });

  it("borrar un juego con copia en la nube deja constancia para no reimportarlo", () => {
    const id = createProject("Nivel 1");
    setProjectCloudId(id, "cloud-42");
    deleteProjectById(id);
    expect(isCloudProjectDeleted("cloud-42")).toBe(true);
    expect(readDeletedCloudIds()).toContain("cloud-42");
    // La copia local sigue borrada aunque la nube la conserve.
    expect(listProjects().map(m => m.id)).not.toContain(id);
  });

  it("borrar sin copia en la nube no llena el registro de borrados", () => {
    const id = createProject("Nivel 2");
    deleteProjectById(id);
    expect(readDeletedCloudIds()).toEqual([]);
    expect(isCloudProjectDeleted("cloud-otro")).toBe(false);
    expect(isCloudProjectDeleted(undefined)).toBe(false);
  });

  it("crear un juego no cambia el proyecto que está abierto", () => {
    const abierto = getCurrentProjectId();
    const nuevo = createProject("Otro juego");
    expect(nuevo).not.toBe(abierto);
    expect(peekCurrentProjectId()).toBe(abierto);
  });

  it("guardar un juego no toca los datos de otro", () => {
    const a = createProject("Juego A");
    const b = createProject("Juego B");
    const pa = loadProjectById(a);
    const pb = loadProjectById(b);
    expect(pa?.name).toBe("Juego A");
    if (pb) saveProjectById(b, { ...pb, name: "Juego B renombrado" });
    expect(loadProjectById(a)?.name).toBe("Juego A");
    expect(loadProjectById(b)?.name).toBe("Juego B renombrado");
  });
});
