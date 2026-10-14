/**
 * Última sección usada en el menú de crear (/editor).
 *
 * Permite mostrar en el selector un botón para volver a la sección en la que
 * estabas (Editor de plataformas o Asternal V2) sin tener que elegir de nuevo.
 * Se guarda en localStorage y se sanea al leer: un valor desconocido o un
 * entorno sin localStorage simplemente devuelven null.
 */

export type EditorMode = "mini" | "v2";

export const LAST_EDITOR_MODE_KEY = "ast_last_editor_mode";

export function readLastEditorMode(): EditorMode | null {
  try {
    const value = localStorage.getItem(LAST_EDITOR_MODE_KEY);
    return value === "mini" || value === "v2" ? value : null;
  } catch {
    return null;
  }
}

export function writeLastEditorMode(mode: EditorMode): void {
  try {
    localStorage.setItem(LAST_EDITOR_MODE_KEY, mode);
  } catch {
    /* modo privado o cuota llena: no se recuerda, pero nada se rompe */
  }
}
