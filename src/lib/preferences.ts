import { useSyncExternalStore } from "react";

/**
 * Preferencias de apariencia de Asternal.
 *
 * Se guardan en localStorage y se aplican sobre <html>, por lo que están
 * disponibles también antes de iniciar sesión:
 *   - theme: claro / oscuro → clase .dark
 *   - language: reservado, bloqueado hasta implementar la traducción.
 *
 * La interfaz no es una preferencia: la aplicación usa siempre Material 3
 * (ver src/glass.css), que se importa después de las utilidades base para
 * fijar los tokens y el aspecto de los componentes.
 */

export type ThemeMode = "light" | "dark";
export type LanguageCode = "es";

export interface Preferences {
  theme: ThemeMode;
  language: LanguageCode;
}

export const PREFERENCES_STORAGE_KEY = "ast_preferences";

const DEFAULTS: Preferences = { theme: "light", language: "es" };

function parsePreferences(raw: string | null): Preferences {
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: parsed.theme === "dark" ? "dark" : "light",
      language: "es", // siempre: bloqueado hasta implementar la traducción
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function readPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(PREFERENCES_STORAGE_KEY));
  } catch {
    return { ...DEFAULTS };
  }
}

/** Aplica las preferencias a <html> (idempotente). */
export function applyPreferences(prefs: Preferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", prefs.theme === "dark");
  root.style.colorScheme = prefs.theme;
}

let snapshot: Preferences =
  typeof localStorage === "undefined" ? { ...DEFAULTS } : readPreferences();

const listeners = new Set<() => void>();

function commit(next: Preferences): void {
  snapshot = next;
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* modo privado o cuota llena: seguimos aplicando en memoria */
  }
  applyPreferences(snapshot);
  listeners.forEach((notify) => notify());
}

export function setTheme(theme: ThemeMode): void {
  if (snapshot.theme === theme) return;
  commit({ ...snapshot, theme });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Preferences {
  return snapshot;
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
