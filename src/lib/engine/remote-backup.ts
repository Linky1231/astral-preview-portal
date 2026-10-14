/**
 * Respaldo remoto de juegos, independiente del proveedor.
 *
 * Asternal puede guardar una copia de cada proyecto en dos sitios: la carpeta
 * del Google Drive de la persona (`drive-sync.ts`) o Cloud Storage de Firebase
 * (`firebase-sync.ts`). El «qué subo y qué bajo» es idéntico en los dos casos,
 * así que vive aquí una sola vez y los proveedores solo traducen sus propios
 * nombres de campo.
 *
 * Reglas de la decisión (probadas sin red en server/drive-storage.test.ts):
 *   · Se sube lo que no tiene copia, lo que cambió después de la última copia y
 *     lo que perdió su copia (archivo borrado en Drive o en el bucket): sin lo
 *     segundo, el respaldo se quedaba viejo; sin lo tercero, un juego se quedaba
 *     sin respaldo para siempre porque el vínculo seguía apuntando a la nada.
 *   · Se reenlaza (`link`) cuando la copia existe pero este navegador perdió el
 *     vínculo: el id local viaja dentro del archivo, así que no hay que volver a
 *     subirlo ni bajarlo como duplicado.
 *   · Se baja lo que el remoto tiene y este navegador no.
 */

/** Proyecto local candidato a respaldarse. */
export type LocalBackupRef = {
  id: string;
  name: string;
  updatedAt: number;
  /** Id de su copia remota, si ya existe. `undefined` = nunca se subió. */
  remoteId?: string;
};

/** Copia que vive en el remoto, ya normalizada. */
export type RemoteBackup = {
  remoteId: string;
  name: string;
  /** Id del proyecto local que la subió (viaja en los metadatos del archivo). */
  localId?: string;
  updatedAt?: number;
  size?: number;
};

/** Copia que hay que crear o actualizar. */
export type BackupPush = { id: string; name: string; remoteId?: string };

export type BackupPlan = {
  push: BackupPush[];
  pull: RemoteBackup[];
  link: { localId: string; remoteId: string }[];
};

/** Margen para no resubir por simples diferencias de reloj entre dispositivos. */
export const BACKUP_CLOCK_SKEW_MS = 5_000;

export function planBackupSync(
  local: LocalBackupRef[],
  remote: RemoteBackup[],
  clockSkewMs: number = BACKUP_CLOCK_SKEW_MS,
): BackupPlan {
  const remoteById = new Map(remote.map((file) => [file.remoteId, file]));
  // Copia por id de proyecto: permite reenlazar cuando el vínculo local se
  // perdió (por ejemplo al limpiar el almacenamiento del navegador).
  const remoteByLocalId = new Map<string, RemoteBackup>();
  for (const file of remote) if (file.localId) remoteByLocalId.set(file.localId, file);

  const push: BackupPush[] = [];
  const link: { localId: string; remoteId: string }[] = [];

  for (const ref of local) {
    const direct = ref.remoteId ? remoteById.get(ref.remoteId) : undefined;
    // Sin vínculo directo: puede que la copia siga ahí con el mismo id local.
    const relink = direct ? undefined : remoteByLocalId.get(ref.id);
    const file = direct ?? relink;
    if (!file) {
      // Nunca se subió (o su copia se borró en el remoto): se crea una nueva.
      push.push({ id: ref.id, name: ref.name });
      continue;
    }
    if (relink) link.push({ localId: ref.id, remoteId: relink.remoteId });
    // La copia existe pero el juego se editó después: se actualiza el mismo
    // archivo en vez de crear otro.
    if (ref.updatedAt > (file.updatedAt ?? 0) + clockSkewMs) {
      push.push({ id: ref.id, name: ref.name, remoteId: file.remoteId });
    }
  }

  // Una copia reenlazada ya está respaldada: ni se descarga ni se sube otra vez.
  const coveredRemoteIds = new Set([
    ...local.map((ref) => ref.remoteId).filter((id): id is string => !!id),
    ...link.map((item) => item.remoteId),
  ]);
  const localIds = new Set(local.map((ref) => ref.id));
  const pull = remote.filter(
    (file) =>
      !coveredRemoteIds.has(file.remoteId) &&
      !(file.localId !== undefined && localIds.has(file.localId)),
  );

  return { push, pull, link };
}

/** Tamaño legible con coma decimal (es-ES), sin depender de Intl. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace(".", ",");
  return `${text} ${units[unit]}`;
}

/** Fecha corta y legible, en el idioma del navegador. */
export function formatBackupDate(at: number | undefined): string {
  if (!at || !Number.isFinite(at)) return "fecha desconocida";
  return new Date(at).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
