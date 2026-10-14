/**
 * Espacio extra en Google Drive.
 *
 * Asternal guarda los juegos en el navegador (localStorage, ~5 MB). Este módulo
 * permite conectar la cuenta de Google de la persona y guardar una copia de
 * cada juego en una carpeta propia de su Drive («Asternal»), para tener más
 * espacio y abrir los mismos juegos desde otro dispositivo.
 *
 * Contrato real de la API usada (v3) y del flujo de autorización:
 *   · Autorización: Google Identity Services (GIS), cargado en el navegador.
 *     `google.accounts.oauth2.initTokenClient({ client_id, scope })` +
 *     `requestAccessToken()` entrega un access token de corta vida (≈1 h) para
 *     el permiso mínimo `drive.file`: la app SOLO ve los archivos que ella
 *     misma crea, nunca el resto del Drive de la persona.
 *   · Carpeta: se busca por nombre entre los archivos propios de la app y, si
 *     no existe, se crea (`POST /files`, mimeType folder).
 *   · Copias: se suben como JSON con `uploadType=multipart` (metadatos + cuerpo)
 *     y se actualizan con `PATCH /upload/files/<id>`.
 *   · Cuota: `GET /about?fields=user(emailAddress),storageQuota`.
 *   · `appProperties.localId` viaja dentro del archivo: permite reenlazar una
 *     copia con su proyecto local sin subirla otra vez.
 *
 * Este módulo no toca `window` ni `document` al importarse: todo el estado del
 * navegador se resuelve dentro de las funciones, para poder probar los ayudantes
 * puros en Node.
 */

/** Permiso mínimo: solo los archivos creados o abiertos por esta app. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FOLDER_NAME = "Asternal";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_JSON_MIME = "application/json";
/** Sufijo de las copias guardadas en Drive (se oculta al mostrar el nombre). */
export const DRIVE_PROJECT_SUFFIX = ".asternal.json";
/** Campos que se piden a la API: los mínimos para listar y reenlazar. */
export const DRIVE_FILE_FIELDS = "id,name,modifiedTime,size,appProperties";
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const GIS_SRC = "https://accounts.google.com/gsi/client";
/** Variable pública (Keys) con el Client ID de OAuth de Google. */
export const GOOGLE_CLIENT_ID_ENV = "VITE_GOOGLE_CLIENT_ID";
/** La sesión vive en sessionStorage: se cierra al cerrar la pestaña. */
export const DRIVE_SESSION_KEY = "asternal:drive:session";

export type DriveQuota = {
  /** Bytes totales del plan (Google One o 15 GB gratis). */
  limit?: string;
  /** Bytes usados en total en la cuenta de Google. */
  usage?: string;
  /** Bytes usados solo en Drive (lo que interesa mostrar aquí). */
  usageInDrive?: string;
  usageInDriveTrash?: string;
};

export type DriveQuotaSummary = {
  usedBytes?: number;
  limitBytes?: number;
  freeBytes?: number;
  /** 0–100 redondeado, o null cuando Google no informa del límite. */
  usedPercent: number | null;
};

export type DriveFileResource = {
  id?: string;
  name?: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string> | null;
};

/** Copia de un proyecto que vive en Drive, ya normalizada para la interfaz. */
export type DriveProject = {
  fileId: string;
  name: string;
  /** Id del proyecto local enlazado, si la copia se subió desde este navegador. */
  localId?: string;
  modifiedTime?: number;
  size?: number;
};

export type DriveSession = {
  accessToken: string;
  /** Epoch ms en que caduca (con 60 s de margen para no usarlo caducado). */
  expiresAt: number;
  email?: string;
};

export type DriveAccount = { email?: string; quota: DriveQuota };

// ─────────────── Ayudantes puros (probados sin red) ───────────────

/** Client ID público; vive en Keys como VITE_GOOGLE_CLIENT_ID. */
export function driveClientId(): string | undefined {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function isDriveConfigured(): boolean {
  return Boolean(driveClientId());
}

/** Escapa un valor para una consulta `q` de Drive (comillas y barras). */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Búsqueda de la carpeta propia de la app. */
export function driveFolderQuery(name: string = DRIVE_FOLDER_NAME): string {
  return `mimeType='${DRIVE_FOLDER_MIME}' and name='${escapeDriveQuery(name)}' and trashed=false`;
}

/** Búsqueda de las copias guardadas dentro de la carpeta. */
export function driveChildrenQuery(folderId: string): string {
  return `'${escapeDriveQuery(folderId)}' in parents and trashed=false and mimeType='${DRIVE_JSON_MIME}'`;
}

/** Nombre visible de una copia (sin el sufijo interno). */
export function projectDisplayName(fileName: string): string {
  const trimmed = (fileName ?? "").trim();
  if (!trimmed) return "Juego";
  return trimmed.endsWith(DRIVE_PROJECT_SUFFIX)
    ? trimmed.slice(0, -DRIVE_PROJECT_SUFFIX.length) || "Juego"
    : trimmed;
}

/**
 * Nombre de archivo seguro para Drive: sin caracteres prohibidos, sin espacios
 * repetidos y con un tope de longitud (Drive acepta más, pero mantenemos el
 * listado legible). Siempre termina en el sufijo de la app.
 */
export function sanitizeDriveFileName(name: string, maxLength = 80): string {
  const base = (name ?? "")
    // Caracteres prohibidos por Drive + controles Unicode (\p{Cc}), sin
    // escribir caracteres de control literales en la expresión.
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, maxLength)
    .trim();
  return (base || "Juego") + DRIVE_PROJECT_SUFFIX;
}

/** Cuerpo `multipart/related`: metadatos + contenido, con el cierre correcto. */
export function buildMultipartBody(
  boundary: string,
  metadata: Record<string, unknown>,
  media: string,
  mediaType: string = DRIVE_JSON_MIME,
): string {
  return [
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    `${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\n`,
    `Content-Type: ${mediaType}; charset=UTF-8\r\n\r\n`,
    `${media}\r\n`,
    `--${boundary}--`,
  ].join("");
}

/** Convierte un recurso de la API en la copia que usa la interfaz. */
export function driveFileToProject(file: DriveFileResource | null | undefined): DriveProject | null {
  if (!file?.id) return null;
  return {
    fileId: file.id,
    name: projectDisplayName(file.name ?? ""),
    localId: file.appProperties?.localId || undefined,
    modifiedTime: file.modifiedTime ? Date.parse(file.modifiedTime) : undefined,
    size: file.size !== undefined && file.size !== "" ? Number(file.size) : undefined,
  };
}

export function driveFileToProjects(files: DriveFileResource[] | null | undefined): DriveProject[] {
  return (files ?? [])
    .map(driveFileToProject)
    .filter((file): file is DriveProject => file !== null && !!file.localId);
}

// El tamaño legible lo comparten los dos respaldos remotos (Drive y Firebase):
// vive en remote-backup.ts y se reexporta aquí para no cambiar sus llamadas.
export { formatBytes } from "./remote-backup";

/** Resumen de la cuota de Drive: usado, libre y porcentaje. */
export function quotaSummary(quota: DriveQuota | null | undefined): DriveQuotaSummary {
  const toNumber = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const usedBytes = toNumber(quota?.usageInDrive);
  const limitBytes = toNumber(quota?.limit);
  const freeBytes =
    usedBytes !== undefined && limitBytes !== undefined ? Math.max(0, limitBytes - usedBytes) : undefined;
  const usedPercent =
    usedBytes !== undefined && limitBytes !== undefined && limitBytes > 0
      ? Math.min(100, Math.round((usedBytes / limitBytes) * 100))
      : null;
  return { usedBytes, limitBytes, freeBytes, usedPercent };
}

/** Mensaje en español para cada error del flujo de autorización de Google. */
export function driveAuthErrorMessage(code?: string): string {
  switch (code) {
    case "access_denied":
      return "Cancelaste el permiso de Google Drive.";
    case "popup_closed":
      return "Se cerró la ventana de Google antes de dar el permiso.";
    case "popup_failed_to_open":
      return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.";
    case "idpiframe_initialization_failed":
      return "Google rechazó este origen. Añádelo en «Orígenes autorizados de JavaScript» del Client ID.";
    case "interaction_required":
      return "Google necesita que confirmes el permiso otra vez.";
    case undefined:
      return "Google no devolvió el permiso para Drive.";
    default:
      return `Google rechazó el permiso (${code}).`;
  }
}

// ─────────────── Sesión del navegador ───────────────

export function readDriveSession(): DriveSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DriveSession>;
    if (typeof parsed.accessToken !== "string" || !parsed.accessToken) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
}

export function writeDriveSession(session: DriveSession): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* modo privado o cuota llena: la sesión queda solo en memoria */
  }
}

export function clearDriveSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(DRIVE_SESSION_KEY);
  } catch {
    /* nada que limpiar */
  }
}

// ─────────────── Autorización (Google Identity Services) ───────────────

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

type GoogleOauth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GoogleTokenClient;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2 } };
  }
}

let gisLoad: Promise<void> | null = null;

/** Carga el script de GIS una sola vez (idempotente). */
function loadGoogleIdentityServices(): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Google Drive solo está disponible en el navegador."));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoad) return gisLoad;
  gisLoad = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const done = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error("Google Identity Services no está disponible."));
    };
    script.addEventListener("load", done, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("No se pudo cargar Google Identity Services.")),
      { once: true },
    );
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return gisLoad;
}

/**
 * Pide permiso a Google y devuelve la sesión. Es una llamada con interfaz
 * (Google muestra su propia ventana la primera vez); el resto de la app usa
 * `getDriveAccessToken()`, que reutiliza la sesión hasta que caduca.
 */
export async function requestDriveAccess(options?: { prompt?: string }): Promise<DriveSession> {
  const clientId = driveClientId();
  if (!clientId) {
    throw new Error(
      `Falta el Client ID de Google. Añade ${GOOGLE_CLIENT_ID_ENV} en Keys para activar el espacio en Drive.`,
    );
  }
  await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services no está disponible.");

  return await new Promise<DriveSession>((resolve, reject) => {
    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response?.error || !response?.access_token) {
            reject(new Error(driveAuthErrorMessage(response?.error)));
            return;
          }
          const seconds = Number(response.expires_in);
          const session: DriveSession = {
            accessToken: response.access_token,
            // 60 s de margen: un token a punto de caducar se considera agotado.
            expiresAt: Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000 - 60_000,
          };
          writeDriveSession(session);
          resolve(session);
        },
        error_callback: (error) => reject(new Error(driveAuthErrorMessage(error?.type))),
      });
      client.requestAccessToken({ prompt: options?.prompt ?? "" });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Token válido: reutiliza la sesión guardada o pide permiso de nuevo. */
export async function getDriveAccessToken(): Promise<string> {
  const session = readDriveSession();
  if (session) return session.accessToken;
  const fresh = await requestDriveAccess();
  return fresh.accessToken;
}

// ─────────────── Llamadas a la API de Drive ───────────────

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      /* respuesta sin JSON: nos quedamos con el código */
    }
    if (response.status === 401) {
      clearDriveSession();
      throw new Error("La sesión de Google Drive caducó. Vuelve a conectar tu cuenta.");
    }
    throw new Error(detail || `Google Drive respondió ${response.status}.`);
  }
  return response;
}

/** Carpeta «Asternal» del usuario: id si existe, null si hay que crearla. */
export async function driveFindFolder(token: string, name: string = DRIVE_FOLDER_NAME): Promise<string | null> {
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(driveFolderQuery(name))}&fields=${encodeURIComponent(
    "files(id,name)",
  )}&spaces=drive&pageSize=1`;
  const response = await driveFetch(token, url);
  const body = (await response.json()) as { files?: Array<{ id?: string }> };
  return body.files?.[0]?.id ?? null;
}

/** Carpeta «Asternal» del usuario, creándola si todavía no existe. */
export async function driveEnsureFolder(token: string, name: string = DRIVE_FOLDER_NAME): Promise<string> {
  const existing = await driveFindFolder(token, name);
  if (existing) return existing;
  const response = await driveFetch(token, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME }),
  });
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error("Google Drive no pudo crear la carpeta Asternal.");
  return body.id;
}

/** Todas las copias guardadas dentro de la carpeta (con paginación). */
export async function driveListProjectFiles(token: string, folderId: string): Promise<DriveProject[]> {
  const files: DriveProject[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: driveChildrenQuery(folderId),
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
      spaces: "drive",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await driveFetch(token, `${DRIVE_API}/files?${params.toString()}`);
    const body = (await response.json()) as {
      nextPageToken?: string;
      files?: DriveFileResource[];
    };
    files.push(...driveFileToProjects(body.files));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return files;
}

/**
 * Sube (o actualiza) la copia de un proyecto. `fileId` presente → actualiza ese
 * archivo; ausente → crea uno nuevo dentro de la carpeta.
 */
export async function driveUploadProject(
  token: string,
  folderId: string,
  args: { name: string; localId: string; project: unknown; fileId?: string },
): Promise<DriveProject> {
  const boundary = `asternal${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = {
    name: sanitizeDriveFileName(args.name),
    mimeType: DRIVE_JSON_MIME,
    // `localId` viaja en el archivo: al volver a entrar con la misma cuenta se
    // reenlaza la copia con su proyecto en vez de descargarla como duplicado.
    appProperties: { app: "asternal", kind: "project", localId: args.localId },
  };
  if (!args.fileId) metadata.parents = [folderId];
  const body = buildMultipartBody(boundary, metadata, JSON.stringify(args.project));
  const fields = encodeURIComponent(DRIVE_FILE_FIELDS);
  const url = args.fileId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(args.fileId)}?uploadType=multipart&fields=${fields}&supportsAllDrives=true`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${fields}&supportsAllDrives=true`;
  const response = await driveFetch(token, url, {
    method: args.fileId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const mapped = driveFileToProject((await response.json()) as DriveFileResource);
  if (!mapped) throw new Error("Google Drive no devolvió el archivo guardado.");
  return mapped;
}

/** Descarga el contenido de una copia (el proyecto tal cual se guardó). */
export async function driveDownloadProject(token: string, fileId: string): Promise<unknown> {
  const response = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  );
  return await response.json();
}

/** Cuenta conectada y cuota de almacenamiento. */
export async function driveAccount(token: string): Promise<DriveAccount> {
  const response = await driveFetch(
    token,
    `${DRIVE_API}/about?fields=${encodeURIComponent("user(emailAddress),storageQuota")}`,
  );
  const body = (await response.json()) as {
    user?: { emailAddress?: string };
    storageQuota?: DriveQuota;
  };
  return { email: body.user?.emailAddress, quota: body.storageQuota ?? {} };
}

/** Enlace a la carpeta del usuario en la web de Drive. */
export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}
