/**
 * Alias de acceso: <nombre de usuario> → correo real de la cuenta.
 *
 * Supabase solo puede autenticar por correo, así que cuando alguien se
 * registra con un correo real (p. ej. Gmail) y además elige nombre de usuario,
 * guardamos aquí la correspondencia para que después pueda entrar solo con el
 * nombre. Se registra al crear la cuenta y también la primera vez que se
 * entra con el correo en este dispositivo.
 */

const STORAGE_KEY = "_ast_login_alias";

type AliasMap = Record<string, string>;

/** Normaliza un nombre de usuario a la forma segura (minúsculas, a-z0-9_). */
export function cleanUsername(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

/** ¿El identificador escrito tiene forma de correo (Gmail, etc.)? */
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function readLoginAlias(): AliasMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AliasMap)
      : {};
  } catch {
    return {};
  }
}

/** Guarda (o corrige) el enlace usuario → correo. Best-effort: nunca lanza. */
export function saveLoginAlias(username: string, email: string): void {
  const u = cleanUsername(username);
  const mail = email.trim().toLowerCase();
  if (!u || !mail.includes("@")) return;
  try {
    const map = readLoginAlias();
    if (map[u] === mail) return;
    map[u] = mail;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* modo privado o cuota llena: se omite sin romper el acceso */
  }
}

/** Devuelve el correo asociado a ese nombre de usuario, o null si no existe. */
export function lookupLoginEmail(username: string): string | null {
  const u = cleanUsername(username);
  if (!u) return null;
  return readLoginAlias()[u] ?? null;
}
