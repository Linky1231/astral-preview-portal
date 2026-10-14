import { supabase } from "@/integrations/supabase/client";
import { cloudSaveProject, cloudListProjects, type CloudProject } from "@/lib/social/api";
import { pushProjectToDrive } from "./drive-sync";
import { pushProjectToFirebase } from "./firebase-sync";
import {
  saveProjectById,
  setProjectCloudId,
  getProjectCloudId,
  createProject,
  listProjects,
  loadProjectById,
  isPristineProject,
  isCloudProjectDeleted,
  hasProject,
  getCurrentProjectId,
  setCurrentProjectId,
} from "./storage";
import type { Project } from "./core";

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced push of a locally-saved project to the cloud (fire & forget). */
export function schedulePushToCloud(localId: string, project: Project) {
  if (typeof window === "undefined") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    // Si el proyecto se borró mientras el editor lo tenía abierto, no se sube a
    // ningún sitio: crearía una copia nueva que la siguiente sincronización
    // bajaría de vuelta a Borradores.
    if (!hasProject(localId)) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const cloudId = getProjectCloudId(localId);
        const saved = await cloudSaveProject({ id: cloudId, name: project.name || "Untitled Game", data: project });
        if (!cloudId) setProjectCloudId(localId, saved.id);
      }
    } catch { /* silent */ }
    // Los respaldos extra (Drive y Firebase) no dependen de la sesión de
    // Supabase: si la persona ya conectó alguno, se mantiene fresco con el mismo
    // autoguardado. Sin sesión válida no hacen nada: ni abren ventanas de Google
    // ni crean cuentas anónimas por su cuenta.
    void pushProjectToDrive(localId).catch(() => { /* sin red o sesión caducada */ });
    void pushProjectToFirebase(localId).catch(() => { /* sin red o sesión caducada */ });
  }, 1500);
}

/** Import all cloud projects that are not present locally. Returns newly created local ids. */
export async function importCloudMissing(): Promise<{ imported: number; total: number }> {
  const list = await cloudListProjects();
  let imported = 0;
  for (const c of list) {
    if (skipCloudImport(c)) continue;
    const localId = createProject(c.name);
    saveProjectById(localId, c.data as Project);
    setProjectCloudId(localId, c.id);
    imported++;
  }
  return { imported, total: list.length };
}

function existsLocalWithCloud(cloudId: string): boolean {
  try {
    const raw = localStorage.getItem("asternal:projects:index");
    if (!raw) return false;
    const arr = JSON.parse(raw) as Array<{ cloudId?: string }>;
    return arr.some(x => x.cloudId === cloudId);
  } catch { return false; }
}

/**
 * No se reimporta una copia de la nube si ya existe en este dispositivo o si
 * fue borrada aquí: sin esta segunda condición, borrar un borrador duraba lo
 * que tardara la siguiente sincronización en volver a bajarlo de la nube.
 */
function skipCloudImport(cloud: { id: string }): boolean {
  return isCloudProjectDeleted(cloud.id) || existsLocalWithCloud(cloud.id);
}

/**
 * Si el proyecto actual es el "Untitled Game" vacío recién creado (dispositivo
 * nuevo / sesión nueva), cambia al proyecto de la nube más reciente de la
 * cuenta — importándolo localmente si aún no existe — para que el editor abra
 * el juego real (con sus imágenes) en lugar de uno vacío. Devuelve el id local
 * activado o null.
 */
export async function activateCloudProjectIfBlank(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const curId = getCurrentProjectId();
    const cur = loadProjectById(curId);
    if (!cur || !isPristineProject(cur)) return null;
    // cloudListProjects ya viene ordenado por updated_at desc.
    const list = await cloudListProjects();
    if (!list.length) return null;
    // Una copia borrada aquí no vuelve a ser la elegida ni a reimportarse.
    const best = list.find(c => !isCloudProjectDeleted(c.id));
    if (!best) return null;
    let localId = listProjects().find(m => m.cloudId === best.id)?.id;
    if (!localId) {
      localId = createProject(best.name);
      saveProjectById(localId, best.data as Project);
      setProjectCloudId(localId, best.id);
    }
    setCurrentProjectId(localId);
    return localId;
  } catch { return null; }
}

export async function fetchCloudProjects(): Promise<CloudProject[]> {
  return cloudListProjects();
}

// ───── Biblioteca de assets (imágenes/prefabs del editor) ─────
// Se guarda en una fila RESERVADA de user_projects (data.__kind =
// "asset-library") para sincronizarla entre dispositivos sin necesitar tablas
// nuevas: cloudListProjects la filtra y nunca la muestra como proyecto.
export const ASSET_LIBRARY_KIND = "asset-library";
export type AssetLibraryItem = { id: string; name: string; preset: unknown };

export function isAssetLibraryRow(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { __kind?: string }).__kind === ASSET_LIBRARY_KIND;
}

let libraryPushTimer: ReturnType<typeof setTimeout> | null = null;

/** Push diferido de la biblioteca de assets (mismo patrón que los proyectos). */
export function scheduleAssetLibraryPush(items: AssetLibraryItem[]) {
  if (typeof window === "undefined") return;
  if (libraryPushTimer) clearTimeout(libraryPushTimer);
  libraryPushTimer = setTimeout(() => { void pushAssetLibraryToCloud(items); }, 1500);
}

/** Sube la biblioteca completa como una única fila por cuenta (upsert). */
export async function pushAssetLibraryToCloud(items: AssetLibraryItem[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("user_projects").select("id,data").eq("user_id", user.id);
    const rows = (data ?? []) as Array<{ id: string; data?: unknown }>;
    const row = rows.find(r => isAssetLibraryRow(r.data));
    const payload = { name: "__asternal_assets__", data: { __kind: ASSET_LIBRARY_KIND, items } as never };
    if (row) {
      await supabase.from("user_projects")
        .update({ name: payload.name, data: payload.data })
        .eq("id", (row as { id: string }).id).eq("user_id", user.id);
    } else {
      await supabase.from("user_projects").insert({ user_id: user.id, ...payload } as never);
    }
  } catch { /* sin sesión, esquema sin crear o red caída: silencioso */ }
}

/** Descarga la biblioteca de la nube (null si no existe, sin sesión o error). */
export async function pullAssetLibraryFromCloud(): Promise<AssetLibraryItem[] | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("user_projects").select("data").eq("user_id", user.id);
    const rows = (data ?? []) as Array<{ data?: unknown }>;
    const row = rows.find(r => isAssetLibraryRow(r.data));
    if (!row) return null;
    const items = (row.data as { items?: AssetLibraryItem[] } | undefined)?.items;
    return Array.isArray(items) ? items : null;
  } catch { return null; }
}

/**
 * Sincronización completa en ambos sentidos:
 *  1. Sube a la nube los proyectos locales que aún no tienen cloudId (backup).
 *  2. Descarga e importa los proyectos de la nube que no existen en este
 *     dispositivo (para que aparezcan al entrar con la misma cuenta en otro
 *     dispositivo).
 * Devuelve cuántos se subieron y cuántos se importaron.
 */
export async function syncAllProjects(): Promise<{ pushed: number; imported: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pushed: 0, imported: 0 };

  // 1) Subir proyectos locales que todavía no están respaldados en la nube.
  // Se saltan los "Untitled Game" vacíos que storage crea automáticamente en
  // cada dispositivo: subirlos solo llenaría la nube de duplicados vacíos.
  let pushed = 0;
  for (const m of listProjects()) {
    if (getProjectCloudId(m.id)) continue; // ya respaldado
    const p = loadProjectById(m.id);
    if (!p) continue;
    if (isPristineProject(p)) continue; // el marcador vacío no es un juego
    try {
      const saved = await cloudSaveProject({ id: undefined, name: p.name || m.name, data: p });
      setProjectCloudId(m.id, saved.id);
      pushed++;
    } catch {
      /* sin sesión, esquema sin crear o red caída: se sigue con el siguiente */
    }
  }

  // 2) Importar proyectos de la nube que no existan en este dispositivo.
  let imported = 0;
  try {
    const list = await cloudListProjects();
    for (const c of list) {
      if (skipCloudImport(c)) continue;
      // createProject() ya no cambia el proyecto abierto: importar en segundo
      // plano no desvía el juego que la persona está editando.
      const localId = createProject(c.name);
      saveProjectById(localId, c.data as Project);
      setProjectCloudId(localId, c.id);
      imported++;
    }
    // En un dispositivo nuevo el proyecto actual es el "Untitled Game" vacío.
    // Si sigue sin tocar, activa el proyecto de la nube más reciente para que
    // el editor abra el juego real (con sus imágenes/sprites) y no uno vacío.
    await activateCloudProjectIfBlank();
  } catch {
    /* esquema sin crear / red caída: no se importa nada */
  }

  return { pushed, imported };
}
