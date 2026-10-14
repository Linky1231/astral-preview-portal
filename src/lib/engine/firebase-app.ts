/**
 * Espacio extra en Firebase (Cloud Storage).
 *
 * El navegador solo guarda ~5 MB (localStorage). Con Firebase, cada persona
 * tiene su propio espacio en el bucket del proyecto: aquí viven los juegos como
 * un JSON por proyecto, no en el navegador.
 *
 * Cómo se resuelve la configuración, en el mismo orden que usa la app para
 * Supabase (src/integrations/supabase/client.ts):
 *   1. Variables de Vite (`VITE_FIREBASE_*`) inyectadas desde el tab Keys.
 *   2. Configuración por defecto incrustada: la `apiKey` web de Firebase es
 *      pública por diseño y así el espacio funciona en todos los dispositivos
 *      sin que nadie configure nada. La seguridad real la dan las reglas del
 *      bucket (ver STORAGE_RULES más abajo): cada usuario anónimo solo puede
 *      leer y escribir dentro de su propia carpeta.
 *
 * Identidad: Auth ANÓNIMA de Firebase. No pide correo ni contraseña: el primer
 * uso crea una cuenta anónima y el navegador la recuerda (persistencia local por
 * defecto), así que la misma persona vuelve a ver su espacio. Como contrapartida,
 * ese espacio es de ESE navegador: para compartir entre dispositivos hay que
 * usar la opción de Google Drive o iniciar sesión con una cuenta real.
 *
 * El SDK se carga con import() dinámico: `firebase` no entra en el paquete
 * inicial de la app, solo cuando alguien abre el panel o sincroniza.
 */
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { FirebaseStorage } from "firebase/storage";

/** Configuración web del proyecto (pública por diseño, como la anon key de Supabase). */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  databaseURL?: string;
};

/** Proyecto de Asternal. Se puede cambiar desde Keys sin tocar código. */
export const DEFAULT_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: "AIzaSyBXwm3QPNhAchxP6ubJNsEROMnvjZ_4_Zw",
  authDomain: "asternal-server-1-c9d1d.firebaseapp.com",
  databaseURL: "https://asternal-server-1-c9d1d-default-rtdb.firebaseio.com",
  projectId: "asternal-server-1-c9d1d",
  storageBucket: "asternal-server-1-c9d1d.firebasestorage.app",
  messagingSenderId: "833656843902",
  appId: "1:833656843902:web:3848b8b8264da5c723b22f",
  measurementId: "G-40PC64DG40",
};

/** Nombres de las variables de entorno equivalentes (tab Keys). */
export const FIREBASE_ENV_KEYS = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
} as const;

/** Carpeta de copias dentro del bucket. */
export const FIREBASE_ROOT = "astUsers";
export const FIREBASE_PROJECTS_DIR = "projects";
export const FIREBASE_JSON_TYPE = "application/json";

/**
 * Reglas del bucket que hacen falta una sola vez en la consola de Firebase
 * (Storage → Reglas). Se muestran en el panel cuando el permiso falla, porque
 * es el error que más se ve con una instalación nueva.
 */
export const STORAGE_RULES = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /${FIREBASE_ROOT}/{uid}/${FIREBASE_PROJECTS_DIR}/{file} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

// ─────────────── Configuración (puro, sin SDK) ───────────────

/** Limpia el valor de una variable de entorno (vacío = no definida). */
export function cleanEnvValue(raw: string | undefined): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/**
 * Configuración efectiva: lo que ponga el entorno (Keys) manda; lo que falte se
 * completa con el proyecto por defecto, campo a campo. Así una instalación
 * puede cambiar solo el bucket sin repetir el resto.
 *
 * Las variables se leen una a una (no con un índice dinámico) porque Vite las
 * sustituye en el build solo cuando aparecen escritas tal cual.
 */
export function resolveFirebaseConfig(): FirebaseWebConfig {
  const env = import.meta.env;
  return {
    ...DEFAULT_FIREBASE_CONFIG,
    apiKey: cleanEnvValue(env.VITE_FIREBASE_API_KEY as string | undefined) ?? DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: cleanEnvValue(env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: cleanEnvValue(env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket:
      cleanEnvValue(env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ?? DEFAULT_FIREBASE_CONFIG.storageBucket,
    appId: cleanEnvValue(env.VITE_FIREBASE_APP_ID as string | undefined) ?? DEFAULT_FIREBASE_CONFIG.appId,
    messagingSenderId:
      cleanEnvValue(env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ??
      DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  };
}

/** ¿Hay proyecto configurado? (Con los valores por defecto, siempre sí.) */
export function isFirebaseConfigured(): boolean {
  const config = resolveFirebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.storageBucket && config.appId);
}

/** Ruta de la carpeta de copias de un usuario anónimo. */
export function firebaseProjectsDir(uid: string): string {
  return `${FIREBASE_ROOT}/${sanitizePathSegment(uid)}/${FIREBASE_PROJECTS_DIR}`;
}

/** Ruta de la copia de un proyecto: una por id local, sin nombres duplicables. */
export function firebaseProjectPath(uid: string, localId: string): string {
  return `${firebaseProjectsDir(uid)}/${sanitizePathSegment(localId)}.json`;
}

/** Limpia un segmento de ruta de Storage (no admite `/`, ni `..`, ni saltos). */
export function sanitizePathSegment(value: string): string {
  const clean = (value ?? "")
    .replace(/[/\\]/g, "-")
    .replace(/[\p{Cc}]/gu, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
  return clean || "sin-id";
}

/** Metadatos que acompañan a cada copia (el nombre visible viaja aquí). */
export function firebaseProjectMetadata(name: string, localId: string): Record<string, string> {
  return { app: "asternal", kind: "project", localId, projectName: name.slice(0, 200) };
}

/** Normaliza el nombre de archivo que informa Storage a un nombre de proyecto. */
export function projectNameFromStorage(name: string | undefined, custom: Record<string, string> | undefined): string {
  const fromMeta = custom?.projectName?.trim();
  if (fromMeta) return fromMeta;
  const base = (name ?? "").replace(/\.json$/i, "").trim();
  return base || "Juego";
}

// ─────────────── SDK (import() dinámico) ───────────────

let appPromise: Promise<{ app: FirebaseApp; auth: Auth; storage: FirebaseStorage }> | null = null;
/** Se pone en true en cuanto el SDK está cargado y hay cuenta en la pestaña. */
let sessionStarted = false;

/**
 * Inicializa la app, entra con Auth anónima (la primera vez la crea) y devuelve
 * el usuario y el Storage listos para usar. Es idempotente: el SDK se carga una
 * sola vez por pestaña.
 */
export async function getFirebaseSession(): Promise<{ uid: string; storage: FirebaseStorage }> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase no está configurado. Revisa VITE_FIREBASE_* en Keys.");
  }
  if (!appPromise) {
    appPromise = (async () => {
      const [{ initializeApp, getApps, getApp }, { getAuth, signInAnonymously }, { getStorage }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/storage"),
      ]);
      const app = getApps().length ? getApp() : initializeApp(resolveFirebaseConfig());
      const auth = getAuth(app);
      // Sin cuenta real no hay nada que pedir: la anónima da un uid estable por
      // navegador y las reglas del bucket la usan para aislar a cada persona.
      if (!auth.currentUser) await signInAnonymously(auth);
      return { app, auth, storage: getStorage(app) };
    })();
    // Si falla (sin red, proveedor anónimo sin activar), se reintenta en el
    // siguiente intento en vez de dejar la pestaña rota para siempre.
    appPromise.catch(() => {
      appPromise = null;
    });
  }
  const session = await appPromise;
  const uid = session.auth.currentUser?.uid;
  if (!uid) throw new Error("Firebase no pudo crear la sesión anónima. Activa «Anónimo» en Authentication → Proveedores.");
  sessionStarted = true;
  return { uid, storage: session.storage };
}

/**
 * ¿Se cargó ya el SDK y hay cuenta (anónima) en esta pestaña?
 *
 * El autoguardado del editor usa esto para no crear cuentas ni abrir red por su
 * cuenta: solo actualiza el respaldo de quien ya usó el panel de Firebase.
 */
export function hasStartedFirebaseSession(): boolean {
  return sessionStarted;
}

/** Mensaje en español para los errores típicos de Firebase. */
export function firebaseErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  switch (code) {
    case "storage/unauthorized":
      return "Las reglas del bucket no permiten guardar aquí. Despliégalas con «bun run deploy:rules» o cópialas en Storage → Reglas.";
    case "storage/unknown":
      return "Firebase rechazó la operación. Comprueba que el bucket existe y que las reglas están aplicadas.";
    case "auth/operation-not-allowed":
      return "La entrada anónima está desactivada. Actívala en Authentication → Proveedores → Anónimo.";
    case "auth/admin-restricted-operation":
      return "La entrada anónima está desactivada para este proyecto (Authentication → Proveedores → Anónimo).";
    case "auth/unauthorized-domain":
      return "Firebase no reconoce este dominio. Añádelo en Authentication → Configuración → Dominios autorizados.";
    case "auth/network-request-failed":
      return "Sin conexión con Firebase. Revisa tu red e inténtalo otra vez.";
    default:
      break;
  }
  if (error instanceof Error && error.message.includes("Failed to fetch")) {
    return "Sin conexión con Firebase. Revisa tu red e inténtalo otra vez.";
  }
  return error instanceof Error ? error.message : "Firebase devolvió un error inesperado.";
}
