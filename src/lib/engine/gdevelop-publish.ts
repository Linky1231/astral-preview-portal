import { useSyncExternalStore } from "react";

/**
 * Publicación de juegos web de GDevelop (Asternal V2).
 *
 * El editor de GDevelop corre en un iframe de otro origen y su compilación
 * online la hacen los servidores de GDevelop con la cuenta de la persona
 * usuaria (Share → gd.games → Publish game), así que Asternal no puede
 * lanzarla por su cuenta. Lo que sí hacemos es:
 *   - guiar el proceso con el diálogo de publicación,
 *   - conservar el enlace resultante (gd.games/…) en localStorage.
 *
 * Enlaces guardados, en orden de guardado (más reciente primero), máximo 20.
 */

/** Editor web oficial de GDevelop (build publicada del editor de 4ian/GDevelop). */
export const GDEVELOP_EDITOR_URL = "https://editor.gdevelop.io/";

export const GDEVELOP_PUBLISH_STORAGE_KEY = "ast_gdevelop_publish";

export interface WebGameLink {
  id: string;
  title: string;
  url: string;
  savedAt: number;
}

const MAX_LINKS = 20;
const DEFAULT_TITLE = "Mi juego web";

/**
 * Normaliza y valida un enlace de juego web.
 * Añade https:// si falta, solo admite http(s) y exige un dominio con punto
 * (p. ej. gd.games). Devuelve null si no es un enlace utilizable.
 */
export function normalizeGameUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // «algo:…» solo cuenta como esquema si no va seguido de un puerto (dígitos),
  // para no rechazar dominios con puerto escritos sin https://.
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):(?!\d)/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return null;
  const candidate = scheme ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Convierte lo que haya en localStorage en una lista saneada (nunca lanza). */
function parseLinks(raw: string | null): WebGameLink[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const links: WebGameLink[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<WebGameLink>;
    const url = typeof candidate.url === "string" ? normalizeGameUrl(candidate.url) : null;
    if (!url) continue;
    links.push({
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : newId(),
      title:
        typeof candidate.title === "string" && candidate.title.trim()
          ? candidate.title.trim()
          : DEFAULT_TITLE,
      url,
      savedAt: typeof candidate.savedAt === "number" ? candidate.savedAt : 0,
    });
  }

  // Más reciente primero y sin repetir la misma URL.
  links.sort((a, b) => b.savedAt - a.savedAt);
  const seen = new Set<string>();
  return links
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .slice(0, MAX_LINKS);
}

/** Lee la lista guardada. Nunca lanza (JSON corrupto o localStorage ausente). */
export function readWebGameLinks(): WebGameLink[] {
  try {
    return parseLinks(localStorage.getItem(GDEVELOP_PUBLISH_STORAGE_KEY));
  } catch {
    return [];
  }
}

let snapshot: WebGameLink[] =
  typeof localStorage === "undefined" ? [] : readWebGameLinks();

const listeners = new Set<() => void>();

function commit(next: WebGameLink[]): void {
  snapshot = next;
  try {
    localStorage.setItem(GDEVELOP_PUBLISH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* modo privado o cuota llena: seguimos con la lista en memoria */
  }
  listeners.forEach((notify) => notify());
}

/**
 * Guarda (o actualiza) el enlace de un juego web publicado.
 * Devuelve la nueva lista, o null si el enlace no es válido.
 */
export function addWebGameLink(title: string, url: string): WebGameLink[] | null {
  const safeUrl = normalizeGameUrl(url);
  if (!safeUrl) return null;
  const entry: WebGameLink = {
    id: newId(),
    title: title.trim() || DEFAULT_TITLE,
    url: safeUrl,
    savedAt: Date.now(),
  };
  // Si la URL ya existía, se reemplaza (nueva fecha/título) y sube al inicio.
  const next = [entry, ...snapshot.filter((link) => link.url !== safeUrl)].slice(0, MAX_LINKS);
  commit(next);
  return next;
}

/** Elimina un enlace guardado por su id. */
export function removeWebGameLink(id: string): WebGameLink[] {
  const next = snapshot.filter((link) => link.id !== id);
  commit(next);
  return next;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): WebGameLink[] {
  return snapshot;
}

/** Hook reactivo con los enlaces de juegos web guardados. */
export function useWebGameLinks(): WebGameLink[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
