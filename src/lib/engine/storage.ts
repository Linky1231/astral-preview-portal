import type { Project } from "./core";
import { DEFAULT_SETTINGS, newProject, uid } from "./core";

const LEGACY_KEY = "asternal:project";
const INDEX_KEY = "asternal:projects:index";
const CURRENT_KEY = "asternal:projects:current";
const ITEM_PREFIX = "asternal:projects:item:";
const FPS_60_MIGRATION_KEY = "asternal:fps60-migration:v2";
/**
 * Copias remotas (nube de Supabase o Google Drive) borradas en este dispositivo:
 * la sincronización no debe volver a bajarlas. Una sola lista para las dos,
 * porque el problema es el mismo: el archivo remoto sobrevive y reimportarlo
 * resucitaría el borrador que la persona acaba de borrar.
 */
const DELETED_CLOUD_KEY = "asternal:projects:deleted-cloud";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  cloudId?: string;
  /** id del archivo de respaldo en Google Drive (carpeta «Asternal»). */
  driveId?: string;
  /** ruta del respaldo en Firebase Storage (`astUsers/{uid}/projects/…`). */
  firebaseId?: string;
  /** id del post publicado; si no está, el proyecto sigue en borradores. */
  publishedPostId?: string;
}

export function setProjectCloudId(id: string, cloudId: string) {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const i = idx.findIndex(m => m.id === id);
  if (i >= 0) {
    idx[i] = { ...idx[i], cloudId };
    writeIndex(idx);
  }
}

export function getProjectCloudId(id: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return readIndex().find(m => m.id === id)?.cloudId;
}

/**
 * Guarda qué archivo de Drive respalda a este proyecto. Cadena vacía = borrar el
 * vínculo (se usa al eliminar la copia de Drive desde el panel de espacio).
 */
export function setProjectDriveId(id: string, driveId: string) {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const i = idx.findIndex(m => m.id === id);
  if (i < 0) return;
  const meta: ProjectMeta = { ...idx[i] };
  if (driveId) meta.driveId = driveId;
  else delete meta.driveId;
  idx[i] = meta;
  writeIndex(idx);
}

export function getProjectDriveId(id: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return readIndex().find(m => m.id === id)?.driveId;
}

/** Igual que `setProjectDriveId`, para el respaldo de Firebase Storage. */
export function setProjectFirebaseId(id: string, firebaseId: string) {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const i = idx.findIndex(m => m.id === id);
  if (i < 0) return;
  const meta: ProjectMeta = { ...idx[i] };
  if (firebaseId) meta.firebaseId = firebaseId;
  else delete meta.firebaseId;
  idx[i] = meta;
  writeIndex(idx);
}

export function getProjectFirebaseId(id: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return readIndex().find(m => m.id === id)?.firebaseId;
}


function readIndex(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.id === "string");
  } catch { return []; }
}

function writeIndex(items: ProjectMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(items));
}

function normalize(p: Project): Project {
  if (!p.scenes?.length) return newProject();
  if (!p.assets) p.assets = { sprites: [] };
  if (!p.assets.sprites) p.assets.sprites = [];
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
  if (!p.settings.perfOptimized) p.settings = { ...p.settings, fpsCap: 60, perfOptimized: true };
  if (!p.settings.fpsDefault60Applied) p.settings = { ...p.settings, fpsCap: 60, fpsDefault60Applied: true };
  return p;
}

function migrateLegacy() {
  if (readIndex().length > 0) return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const p = normalize(JSON.parse(raw));
    const id = uid();
    localStorage.setItem(ITEM_PREFIX + id, JSON.stringify(p));
    writeIndex([{ id, name: p.name || "Untitled Game", updatedAt: Date.now() }]);
    localStorage.setItem(CURRENT_KEY, id);
  } catch { /* ignore */ }
}

function ensureAtLeastOne(): string {
  migrateLegacy();
  let idx = readIndex();
  if (idx.length === 0) {
    const id = uid();
    const p = newProject();
    localStorage.setItem(ITEM_PREFIX + id, JSON.stringify(p));
    idx = [{ id, name: p.name, updatedAt: Date.now() }];
    writeIndex(idx);
    localStorage.setItem(CURRENT_KEY, id);
  }
  let cur = localStorage.getItem(CURRENT_KEY);
  if (!cur || !idx.some(m => m.id === cur)) {
    cur = idx[0].id;
    localStorage.setItem(CURRENT_KEY, cur);
  }
  return cur;
}

/**
 * Lista de proyectos guardados. Es una LECTURA PURA: no crea nada. Antes
 * llamaba a `ensureAtLeastOne()`, así que abrir «Borradores» (o sincronizar)
 * guardaba un «Untitled Game» vacío que la persona nunca había creado, y
 * borrar el último borrador lo resucitaba al instante.
 */
export function listProjects(): ProjectMeta[] {
  if (typeof window === "undefined") return [];
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Proyecto abierto, sin crear nada. Devuelve null si todavía no hay ninguno
 * (a diferencia de `getCurrentProjectId`, que sí materializa el proyecto por
 * defecto porque el editor lo necesita). Para lecturas de fondo —sincronización,
 * saber a qué juego volver— usa ésta.
 */
export function peekCurrentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  const idx = readIndex();
  const cur = localStorage.getItem(CURRENT_KEY);
  return cur && idx.some(m => m.id === cur) ? cur : null;
}

/** Proyecto por defecto garantizado: solo para abrir el editor o publicar. */
export function getCurrentProjectId(): string {
  if (typeof window === "undefined") return "";
  return ensureAtLeastOne();
}

export function setCurrentProjectId(id: string) {
  if (typeof window === "undefined") return;
  if (readIndex().some(m => m.id === id)) {
    localStorage.setItem(CURRENT_KEY, id);
  }
}

export function loadProjectById(id: string): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ITEM_PREFIX + id);
    if (!raw) return null;
    const p = normalize(JSON.parse(raw));
    if (!localStorage.getItem(FPS_60_MIGRATION_KEY)) {
      p.settings = { ...p.settings, fpsCap: 60 };
      localStorage.setItem(FPS_60_MIGRATION_KEY, "1");
    }
    return p;
  } catch { return null; }
}

export function loadProject(): Project {
  if (typeof window === "undefined") return newProject();
  const id = ensureAtLeastOne();
  return loadProjectById(id) ?? newProject();
}

export function saveProject(p: Project) {
  if (typeof window === "undefined") return;
  const id = ensureAtLeastOne();
  saveProjectById(id, p);
}

export function saveProjectById(id: string, p: Project) {
  if (typeof window === "undefined") return;
  try {
    const idx = readIndex();
    const i = idx.findIndex(m => m.id === id);
    // Un proyecto borrado no vuelve a entrar por la puerta trasera: el editor
    // que lo tenía abierto sigue autoguardando y, antes, este guardado lo
    // reinsertaba en Borradores con el siguiente autoguardado. Los proyectos
    // nuevos se dan de alta con `registerProjectMeta` (createProject, duplicar).
    if (i < 0) return;
    localStorage.setItem(ITEM_PREFIX + id, JSON.stringify(p));
    const prev = idx[i];
    const meta: ProjectMeta = {
      id,
      name: p.name || "Untitled Game",
      updatedAt: Date.now(),
      // Conserva cloudId, driveId y firebaseId: sin ellos, cada autoguardado del
      // editor rompería el vínculo con el respaldo y el siguiente push crearía un
      // duplicado (en la nube, en Drive y en el bucket).
      cloudId: prev.cloudId,
      driveId: prev.driveId,
      firebaseId: prev.firebaseId,
      publishedPostId: prev.publishedPostId,
    };
    idx[i] = meta;
    writeIndex(idx);
  } catch { /* quota */ }
}

/** Da de alta la entrada de un proyecto nuevo en el índice. */
function registerProjectMeta(id: string, name: string): void {
  try {
    const idx = readIndex();
    if (idx.some(m => m.id === id)) return;
    idx.push({ id, name, updatedAt: Date.now() });
    writeIndex(idx);
  } catch { /* almacenamiento no disponible */ }
}

/**
 * Crea un juego nuevo. NO cambia el proyecto abierto salvo que se pida con
 * `activate`: antes lo cambiaba siempre, así que sincronizar, importar o
 * remezclar en segundo plano desviaba el proyecto «actual» y el siguiente
 * guardado o publicación caía en otro juego (los juegos se mezclaban).
 */
export function createProject(name?: string, opts?: { activate?: boolean }): string {
  const id = uid();
  const p = newProject();
  if (name && name.trim()) p.name = name.trim();
  registerProjectMeta(id, p.name || "Untitled Game");
  saveProjectById(id, p);
  if (opts?.activate) setCurrentProjectId(id);
  return id;
}

/** ¿El proyecto sigue dado de alta en este dispositivo? */
export function hasProject(id: string | null | undefined): boolean {
  if (!id || typeof window === "undefined") return false;
  return readIndex().some(m => m.id === id);
}

/** Marca un proyecto como publicado (deja de aparecer en Borradores). */
export function markProjectPublished(id: string, postId: string): void {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const i = idx.findIndex(m => m.id === id);
  if (i < 0) return;
  idx[i] = { ...idx[i], publishedPostId: postId };
  writeIndex(idx);
}

/** Vuelve a marcar un proyecto como borrador (p. ej. si se borra el post). */
export function markProjectUnpublished(id: string): void {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const i = idx.findIndex(m => m.id === id);
  if (i < 0) return;
  const meta: ProjectMeta = { ...idx[i] };
  delete meta.publishedPostId;
  idx[i] = meta;
  writeIndex(idx);
}

/**
 * ¿Es el proyecto por defecto que storage crea automáticamente (un
 * «Untitled Game» sin escenas tocadas ni sprites)? No es un juego: no debe
 * listarse como borrador ni subirse a la nube.
 */
export function isPristineProject(p: Project | null): boolean {
  if (!p) return true;
  // El nombre NO cuenta como cambio: un juego recién creado y sin tocar no es
  // un borrador, aunque se haya nombrado. Solo cuentan los cambios de contenido.
  if ((p.assets?.sprites?.length ?? 0) > 0) return false;
  const fresh = newProject();
  const scenes = p.scenes ?? [];
  if (scenes.length !== fresh.scenes.length) return false;
  return scenes.every((scene, i) => sceneSignature(scene) === sceneSignature(fresh.scenes[i]));
}

/**
 * Huella del contenido de una escena para saber si sigue intacta. Ignora los
 * ids (cambian en cada partida) y las capas: el editor añade la capa por
 * defecto al abrir, sin que la persona haya tocado nada.
 */
function sceneSignature(scene: Project["scenes"][number]): string {
  return JSON.stringify(scene, (key, value) =>
    key === "id" || key === "layers" ? undefined : value,
  );
}

/**
 * Borradores: proyectos guardados que todavía no se han publicado. En
 * «Borradores» solo aparecen juegos de verdad; el marcador vacío del editor no
 * cuenta (no se ha creado ningún juego todavía).
 */
export function listDraftProjects(): ProjectMeta[] {
  return listProjects().filter(m => !m.publishedPostId && !isPristineProject(loadProjectById(m.id)));
}

export function deleteProjectById(id: string) {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const meta = idx.find(m => m.id === id);
  // Borrar aquí también suprime la reentrada: tanto la nube como Drive
  // conservan sus copias y, sin este registro, la siguiente sincronización las
  // volvía a importar y el borrador reaparecía.
  if (meta?.cloudId) rememberDeletedCloudId(meta.cloudId);
  if (meta?.driveId) rememberDeletedCloudId(meta.driveId);
  if (meta?.firebaseId) rememberDeletedCloudId(meta.firebaseId);
  localStorage.removeItem(ITEM_PREFIX + id);
  writeIndex(idx.filter(m => m.id !== id));
  if (localStorage.getItem(CURRENT_KEY) === id) {
    localStorage.removeItem(CURRENT_KEY);
  }
  // Sin `ensureAtLeastOne()`: borrar el último borrador se quedaba en nada
  // porque se recreaba un «Untitled Game» vacío. El proyecto por defecto solo
  // se materializa cuando el editor lo pide (getCurrentProjectId).
}

/** Anota una copia remota (nube o Drive) como borrada en este dispositivo. */
function rememberDeletedCloudId(cloudId: string): void {
  try {
    const list = readDeletedCloudIds();
    if (list.includes(cloudId)) return;
    localStorage.setItem(DELETED_CLOUD_KEY, JSON.stringify([cloudId, ...list].slice(0, 300)));
  } catch { /* almacenamiento no disponible */ }
}

/** Copias de la nube que la sincronización no debe volver a bajar. */
export function readDeletedCloudIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DELETED_CLOUD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, 300);
  } catch { return []; }
}

/** ¿Esta copia de la nube fue borrada en este dispositivo? */
export function isCloudProjectDeleted(cloudId: string | null | undefined): boolean {
  if (!cloudId) return false;
  return readDeletedCloudIds().includes(cloudId);
}

/** ¿Esta copia de Drive fue borrada en este dispositivo? */
export function isDriveProjectDeleted(fileId: string | null | undefined): boolean {
  if (!fileId) return false;
  return readDeletedCloudIds().includes(fileId);
}

/** ¿Esta copia de Firebase fue borrada en este dispositivo? */
export function isFirebaseProjectDeleted(remoteId: string | null | undefined): boolean {
  if (!remoteId) return false;
  return readDeletedCloudIds().includes(remoteId);
}

export function renameProject(id: string, name: string) {
  const p = loadProjectById(id);
  if (!p) return;
  p.name = name.trim() || p.name;
  saveProjectById(id, p);
}

export function duplicateProject(id: string): string | null {
  const p = loadProjectById(id);
  if (!p) return null;
  const copy: Project = JSON.parse(JSON.stringify(p));
  copy.name = (p.name || "Untitled") + " copy";
  const newId = uid();
  registerProjectMeta(newId, copy.name);
  saveProjectById(newId, copy);
  return newId;
}
