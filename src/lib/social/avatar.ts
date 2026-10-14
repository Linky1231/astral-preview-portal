// ─────────────────────────────────────────────────────────────────────────────
// ID público de usuario (código AST-XXXXXX)
// ─────────────────────────────────────────────────────────────────────────────
// El código de usuario es DETERMINISTA: se deriva del UUID de la cuenta, así
// TODOS los usuarios (nuevos y antiguos) tienen su propio ID desde el primer
// momento sin necesidad de migración de base de datos.

export const AVATAR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I

/** ID público de usuario: AST-XXXXXX, estable y único por cuenta. */
export function getUserCode(userId: string): string {
  // Hash FNV-1a del UUID → 30 bits → 6 caracteres del alfabeto seguro.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < userId.length; i++) {
    const c = userId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  const bits = (h1 ^ (h2 << 1)) >>> 0;
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += AVATAR_ALPHABET[(bits >> (i * 5)) % 32];
  }
  return `AST-${code}`;
}
