/**
 * Sincronización de juegos con Firebase Storage.
 *
 * Mismo contrato que el respaldo de Drive (ver remote-backup.ts), pero los
 * archivos viven en el bucket del proyecto bajo
 * `astUsers/{uid}/projects/{idLocal}.json`: una copia por proyecto, con el
 * nombre visible y el id local en los metadatos.
 *
 * Detalles que importan:
 *   · El `remoteId` es la ruta completa del objeto (estable y única): con ella
 *     se actualiza, se descarga y se reenlaza sin ambigüedad.
 *   · La ruta se deriva del id local del proyecto, así que renombrar un juego no
 *     crea un archivo nuevo: se reescribe el mismo y el nombre viaja en los
 *     metadatos.
 *   · Nada de descargar por URL pública: `getBytes` trae el contenido con la
 *     misma autenticación, sin exponer el bucket ni depender de CORS extra.
 */
import type { FirebaseStorage } from "firebase/storage";
import * as fb from "./firebase-app";
import { planBackupSync, type RemoteBackup } from "./remote-backup";
import type { Project } from "./core";
import {
  createProject,
  getProjectFirebaseId,
  isFirebaseProjectDeleted,
  isPristineProject,
  listProjects,
  loadProjectById,
  saveProjectById,
  setProjectFirebaseId,
} from "./storage";

/** Copia que ya está en el bucket, tal como la ve el panel. */
export type FirebaseBackup = RemoteBackup;

export type FirebaseOverview = {
  uid: string;
  files: FirebaseBackup[];
  /** Bytes que ocupan estas copias (Firebase no expone la cuota desde el cliente). */
  usedBytes: number;
};

type StorageSdk = Awaited<ReturnType<typeof loadStorageSdk>>;

async function loadStorageSdk() {
  const storage = await import("firebase/storage");
  return {
    ref: storage.ref,
    listAll: storage.listAll,
    getMetadata: storage.getMetadata,
    uploadString: storage.uploadString,
    getBytes: storage.getBytes,
  };
}

/** Lista las copias del usuario, ya normalizadas. */
export async function listFirebaseBackups(uid: string, sdk: StorageSdk, storage: FirebaseStorage): Promise<FirebaseBackup[]> {
  const dirRef = sdk.ref(storage, fb.firebaseProjectsDir(uid));
  const listing = await sdk.listAll(dirRef);
  const files = await Promise.all(
    listing.items.map(async (item): Promise<FirebaseBackup | null> => {
      try {
        const meta = await sdk.getMetadata(item);
        return {
          remoteId: item.fullPath,
          name: fb.projectNameFromStorage(meta.name, meta.customMetadata),
          localId: meta.customMetadata?.localId || undefined,
          updatedAt: meta.updated ? Date.parse(meta.updated) : undefined,
          size: typeof meta.size === "number" ? meta.size : undefined,
        };
      } catch {
        // Un objeto sin permiso o borrado a mitad de listado no rompe el panel.
        return null;
      }
    }),
  );
  return files.filter((file): file is FirebaseBackup => file !== null);
}

/** Estado del espacio: cuenta anónima, copias y bytes ocupados. */
export async function loadFirebaseOverview(): Promise<FirebaseOverview | null> {
  if (!fb.isFirebaseConfigured()) return null;
  const { uid, storage } = await fb.getFirebaseSession();
  const sdk = await loadStorageSdk();
  const files = await listFirebaseBackups(uid, sdk, storage);
  const usedBytes = files.reduce((total, file) => total + (file.size ?? 0), 0);
  return { uid, files, usedBytes };
}

/** Proyectos locales que merecen respaldo (excluye el marcador vacío). */
function backupCandidates() {
  return listProjects()
    .filter((meta) => !isPristineProject(loadProjectById(meta.id)))
    .map((meta) => ({
      id: meta.id,
      name: meta.name,
      updatedAt: meta.updatedAt,
      remoteId: getProjectFirebaseId(meta.id),
    }));
}

export type FirebaseSyncResult = { pushed: number; pulled: number; linked: number; total: number };

/** Sincronización en ambos sentidos con el bucket. */
export async function syncProjectsToFirebase(): Promise<FirebaseSyncResult> {
  const { uid, storage } = await fb.getFirebaseSession();
  const sdk = await loadStorageSdk();
  const remote = await listFirebaseBackups(uid, sdk, storage);
  const plan = planBackupSync(backupCandidates(), remote);

  let linked = 0;
  for (const item of plan.link) {
    setProjectFirebaseId(item.localId, item.remoteId);
    linked += 1;
  }

  let pushed = 0;
  for (const item of plan.push) {
    const project = loadProjectById(item.id);
    if (!project) continue;
    const file = await uploadProject(uid, storage, sdk, {
      localId: item.id,
      name: project.name || item.name,
      project,
    });
    setProjectFirebaseId(item.id, file.remoteId);
    pushed += 1;
  }

  let pulled = 0;
  for (const file of plan.pull) {
    if (isFirebaseProjectDeleted(file.remoteId)) continue;
    const bytes = await sdk.getBytes(sdk.ref(storage, file.remoteId));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Project;
    const localId = createProject(file.name);
    saveProjectById(localId, data);
    setProjectFirebaseId(localId, file.remoteId);
    pulled += 1;
  }

  return { pushed, pulled, linked, total: remote.length };
}

/** Sube (o reescribe) la copia de un proyecto. */
async function uploadProject(
  uid: string,
  storage: FirebaseStorage,
  sdk: StorageSdk,
  args: { localId: string; name: string; project: Project },
): Promise<FirebaseBackup> {
  const path = fb.firebaseProjectPath(uid, args.localId);
  const result = await sdk.uploadString(sdk.ref(storage, path), JSON.stringify(args.project), "raw", {
    contentType: fb.FIREBASE_JSON_TYPE,
    customMetadata: fb.firebaseProjectMetadata(args.name, args.localId),
  });
  const meta = result.metadata;
  return {
    remoteId: result.ref.fullPath,
    name: args.name,
    localId: args.localId,
    updatedAt: meta.updated ? Date.parse(meta.updated) : Date.now(),
    size: typeof meta.size === "number" ? meta.size : undefined,
  };
}

/**
 * Sube un único proyecto sin crear cuentas ni abrir red por su cuenta: lo llama
 * el autoguardado del editor y solo actúa si la persona ya usó el panel de
 * Firebase en esta pestaña.
 */
export async function pushProjectToFirebase(localId: string): Promise<FirebaseBackup | null> {
  if (!fb.hasStartedFirebaseSession()) return null;
  const project = loadProjectById(localId);
  if (!project || isPristineProject(project)) return null;
  const { uid, storage } = await fb.getFirebaseSession();
  const sdk = await loadStorageSdk();
  const file = await uploadProject(uid, storage, sdk, {
    localId,
    name: project.name || "Untitled Game",
    project,
  });
  setProjectFirebaseId(localId, file.remoteId);
  return file;
}
