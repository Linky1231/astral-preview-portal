/**
 * Sincronización de juegos con Google Drive.
 *
 * Es el puente entre el almacenamiento local (src/lib/engine/storage.ts) y el
 * cliente de Drive (src/lib/engine/drive.ts). Aquí vive la lógica de «qué hay
 * que subir y qué hay que bajar», aislada como función pura para poder probarla
 * sin red ni navegador — igual que `cloud-sync` hace con Supabase.
 *
 * Reglas:
 *   · Se sube lo que no tiene copia o cuya copia ya no está en Drive (para que
 *     borrar la carpeta no deje los juegos sin respaldo), y lo que cambió
 *     después de la última copia (la copia no se queda vieja).
 *   · Se enlaza (sin volver a subir) cuando la copia existe pero este navegador
 *     perdió el vínculo: `appProperties.localId` lo permite.
 *   · Se baja lo que Drive tiene y este navegador no, salvo que la persona ya
 *     lo hubiera borrado aquí (registro compartido con la nube de Supabase).
 *   · Los «Untitled Game» vacíos nunca se suben: no son juegos.
 */
import * as driveClient from "./drive";
import { planBackupSync, type LocalBackupRef } from "./remote-backup";
import type { Project } from "./core";
import {
  createProject,
  getProjectDriveId,
  isDriveProjectDeleted,
  isPristineProject,
  listProjects,
  loadProjectById,
  saveProjectById,
  setProjectDriveId,
} from "./storage";

const FOLDER_KEY = "asternal:drive:folder";

/** Proyecto local candidato a sincronizarse. */
export type LocalProjectRef = LocalBackupRef & { driveId?: string };

/** Copia que hay que crear o actualizar en Drive. */
export type DrivePush = { id: string; name: string; fileId?: string };

export type DriveSyncPlan = {
  /** Subidas a crear/actualizar. */
  push: DrivePush[];
  /** Copias que existen en Drive pero no en este navegador → descargar. */
  pull: driveClient.DriveProject[];
  /** Copias que ya existen y solo hay que reenlazar con su proyecto local. */
  link: { localId: string; fileId: string }[];
};

/**
 * Decide la sincronización con Drive sin tocar la red.
 *
 * Solo traduce los nombres de Drive (`fileId`, `modifiedTime`) a los genéricos
 * del plan compartido (`remote-backup.ts`), que es donde vive la lógica y donde
 * está probada.
 */
export function planDriveSync(local: LocalProjectRef[], remote: driveClient.DriveProject[]): DriveSyncPlan {
  const plan = planBackupSync(
    local.map(({ id, name, updatedAt, driveId }) => ({ id, name, updatedAt, remoteId: driveId })),
    remote.map((file) => ({
      remoteId: file.fileId,
      name: file.name,
      localId: file.localId,
      updatedAt: file.modifiedTime,
      size: file.size,
    })),
  );
  return {
    push: plan.push.map((item) => ({ id: item.id, name: item.name, fileId: item.remoteId })),
    pull: plan.pull.map((file) => ({
      fileId: file.remoteId,
      name: file.name,
      localId: file.localId,
      modifiedTime: file.updatedAt,
      size: file.size,
    })),
    link: plan.link.map((item) => ({ localId: item.localId, fileId: item.remoteId })),
  };
}

// ─────────────── Carpeta y conexión ───────────────

export function driveFolderId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}

export function setDriveFolderId(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FOLDER_KEY, id);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Carpeta del usuario en Drive (la crea si hace falta). */
export async function ensureDriveFolder(token: string): Promise<string> {
  const stored = driveFolderId();
  if (stored) return stored;
  const folderId = await driveClient.driveEnsureFolder(token, driveClient.DRIVE_FOLDER_NAME);
  setDriveFolderId(folderId);
  return folderId;
}

export type DriveOverview = {
  email?: string;
  folderId: string;
  quota: driveClient.DriveQuota;
  files: driveClient.DriveProject[];
  usedBytes?: number;
  limitBytes?: number;
  freeBytes?: number;
  usedPercent: number | null;
};

/**
 * Estado actual de la conexión: cuenta, cuota y copias.
 *
 * Usa SOLO la sesión ya guardada: si no hay ninguna, devuelve null sin abrir
 * ventanas de Google. Pedir el permiso es una acción con interfaz y la hace
 * `connectDriveAccount` con un clic de la persona por delante.
 */
export async function loadDriveOverview(): Promise<DriveOverview | null> {
  const session = driveClient.readDriveSession();
  if (!session) return null;
  const token = session.accessToken;
  const folderId = await ensureDriveFolder(token);
  const [account, files] = await Promise.all([
    driveClient.driveAccount(token),
    driveClient.driveListProjectFiles(token, folderId),
  ]);
  const summary = driveClient.quotaSummary(account.quota);
  return {
    email: account.email,
    folderId,
    quota: account.quota,
    files,
    usedBytes: summary.usedBytes,
    limitBytes: summary.limitBytes,
    freeBytes: summary.freeBytes,
    usedPercent: summary.usedPercent,
  };
}

/** Conecta la cuenta por primera vez (abre la ventana de Google). */
export async function connectDriveAccount(): Promise<DriveOverview> {
  const session = await driveClient.requestDriveAccess();
  const folderId = await ensureDriveFolder(session.accessToken);
  const [account, files] = await Promise.all([
    driveClient.driveAccount(session.accessToken),
    driveClient.driveListProjectFiles(session.accessToken, folderId),
  ]);
  const summary = driveClient.quotaSummary(account.quota);
  return {
    email: account.email ?? session.email,
    folderId,
    quota: account.quota,
    files,
    usedBytes: summary.usedBytes,
    limitBytes: summary.limitBytes,
    freeBytes: summary.freeBytes,
    usedPercent: summary.usedPercent,
  };
}

/** Cierra la sesión de Drive en este dispositivo (no borra nada del Drive). */
export function disconnectDrive(): void {
  driveClient.clearDriveSession();
}

/** Enlace a la carpeta en la web de Drive (null si aún no existe). */
export function driveFolderLink(): string | null {
  const id = driveFolderId();
  return id ? driveClient.driveFolderUrl(id) : null;
}

/** Proyectos locales que merecen respaldo (excluye el marcador vacío). */
function backupCandidates(): LocalProjectRef[] {
  return listProjects()
    .filter((meta) => !isPristineProject(loadProjectById(meta.id)))
    .map((meta) => ({ id: meta.id, name: meta.name, updatedAt: meta.updatedAt, driveId: getProjectDriveId(meta.id) }));
}

export type DriveSyncResult = { pushed: number; pulled: number; linked: number; total: number };

/**
 * Sincronización en ambos sentidos. Devuelve cuántas copias se subieron, cuántas
 * se descargaron y cuántas se reenlazaron.
 */
export async function syncProjectsToDrive(): Promise<DriveSyncResult> {
  const token = await driveClient.getDriveAccessToken();
  const folderId = await ensureDriveFolder(token);
  const remote = await driveClient.driveListProjectFiles(token, folderId);
  const plan = planDriveSync(backupCandidates(), remote);

  // 1) Reenlazar lo que ya está en Drive: evita subir un duplicado.
  let linked = 0;
  for (const item of plan.link) {
    setProjectDriveId(item.localId, item.fileId);
    linked += 1;
  }

  // 2) Subir los juegos sin copia (o cuya copia desapareció del Drive).
  let pushed = 0;
  for (const item of plan.push) {
    const project = loadProjectById(item.id);
    if (!project) continue;
    const file = await driveClient.driveUploadProject(token, folderId, {
      fileId: item.fileId,
      localId: item.id,
      name: project.name || item.name,
      project,
    });
    setProjectDriveId(item.id, file.fileId);
    pushed += 1;
  }

  // 3) Bajar lo que existe en Drive y no en este navegador.
  let pulled = 0;
  for (const file of plan.pull) {
    if (isDriveProjectDeleted(file.fileId)) continue;
    const data = await driveClient.driveDownloadProject(token, file.fileId);
    const localId = createProject(file.name);
    saveProjectById(localId, data as Project);
    setProjectDriveId(localId, file.fileId);
    pulled += 1;
  }

  return { pushed, pulled, linked, total: remote.length };
}

/**
 * Sube un único proyecto sin pedir permiso: lo llama el autoguardado del editor.
 * Si no hay sesión de Drive (o caducó) no hace nada — abrir la ventana de Google
 * en medio de un autoguardado sería un fastidio — y devuelve null.
 */
export async function pushProjectToDrive(localId: string): Promise<driveClient.DriveProject | null> {
  const project = loadProjectById(localId);
  if (!project || isPristineProject(project)) return null;
  const session = driveClient.readDriveSession();
  if (!session) return null;
  const token = session.accessToken;
  const folderId = await ensureDriveFolder(token);
  const existing = getProjectDriveId(localId);
  const file = await driveClient.driveUploadProject(token, folderId, {
    fileId: existing,
    localId,
    name: project.name || "Untitled Game",
    project,
  });
  setProjectDriveId(localId, file.fileId);
  return file;
}
