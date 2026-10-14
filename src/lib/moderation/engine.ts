import {
  CATEGORY_LABEL,
  CATEGORY_SEVERITY,
  PATTERNS,
  STRICT_ORIGINAL,
  TERMS,
  type ModerationCategory,
} from "./wordlists";

/**
 * Motor de moderación 100 % en código: sin IA, sin red y sin coste.
 *
 * Detecta groserías, contenido sexual explícito, insultos de odio, amenazas,
 * contenido peligroso, estafas, spam y datos personales, incluidas las
 * variaciones habituales para esquivar filtros:
 *
 *   «púta»        tildes
 *   «p.u.t.a»     separadores
 *   «p u t a»     letras espaciadas
 *   «puuuta»      letras repetidas
 *   «put@ / put4» leetspeak
 *   «put4s»       sufijos (plural, diminutivo, aumentativo)
 *
 * Nunca coincide dentro de otra palabra («computadora» no es «puta»).
 */

export type ModerationSeverity = "none" | "low" | "medium" | "high";

export type ModerationMatch = {
  term: string;
  category: ModerationCategory;
  /** Fragmento exacto del texto que disparó la coincidencia. */
  found: string;
  note?: string;
};

export type ModerationVerdict = {
  allowed: boolean;
  severity: ModerationSeverity;
  categories: ModerationCategory[];
  matches: ModerationMatch[];
  /** Mensaje listo para mostrar a la persona. */
  reason: string;
  /** Resumen corto para registros. */
  summary: string;
};

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g",
  "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "€": "e", "!": "i",
  "|": "i", "+": "t", "(": "c", "¡": "i", "ç": "c", "æ": "ae", "ø": "o",
};

/** Sufijos que no cambian el significado ofensivo de un término. */
const SUFFIXES = [
  "", "s", "es", "o", "a", "os", "as", "ito", "ita", "itos", "itas",
  "azo", "aza", "azos", "azas", "ada", "adas", "ote", "ota", "otes", "otas",
  "illo", "illa", "illos", "illas", "isimo", "isima", "isimos", "isimas",
  "udo", "uda", "udos", "udas",
];

const SUFFIX_RE = new RegExp(`^(?:${SUFFIXES.filter(Boolean).join("|")})$`);

/** minúsculas + sin tildes + leetspeak + sin letras repetidas de más. */
export function normalizeForModeration(text: string): string {
  const folded = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let out = "";
  for (const char of folded) {
    out += LEET[char] ?? char;
  }
  // «puuuta» → «puta» (las repeticiones de 3+ no aportan nada al significado).
  return out
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(.)\1{2,}/g, "$1");
}

/** Colapsa cualquier letra repetida: «putaa» → «puta». */
function collapseRuns(token: string): string {
  return token.replace(/(.)\1+/g, "$1");
}

function tokenMatchesTerm(token: string, term: string): boolean {
  if (token === term) return true;
  if (!token.startsWith(term)) return false;
  return SUFFIX_RE.test(token.slice(term.length));
}

type Candidate = { token: string; source: "direct" | "dedup" | "joined" };

/**
 * Genera las formas en las que puede aparecer una palabra en el texto:
 * la propia, la de letras repetidas colapsadas y la unión de fragmentos
 * cortos consecutivos («p u t a» / «pu ta»).
 */
function candidates(tokens: string[]): Candidate[] {
  const list: Candidate[] = [];
  for (const token of tokens) list.push({ token, source: "direct" });
  for (const token of tokens) {
    const collapsed = collapseRuns(token);
    if (collapsed !== token) list.push({ token: collapsed, source: "dedup" });
  }
  for (let i = 0; i < tokens.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(tokens.length, i + 8); j++) {
      const piece = tokens[j];
      if (piece.length > 2) break;
      joined += piece;
      if (joined.length >= 3) list.push({ token: joined, source: "joined" });
    }
  }
  return list;
}

/** Texto en minúsculas y sin tildes, conservando la puntuación. */
function foldText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Solo letras, números y ñ: para comprobar grafías exactas (coño vs cono). */
function compactText(text: string): string {
  return foldText(text).replace(/[^a-z0-9ñ]/g, "");
}

/** Términos de una sola palabra y expresiones de varias («orbes gratis»). */
const SINGLE_TERMS: { term: string; category: ModerationCategory }[] = [];
const PHRASE_TERMS: { term: string; category: ModerationCategory; regex: RegExp }[] = [];
for (const [category, terms] of Object.entries(TERMS) as [ModerationCategory, string[]][]) {
  for (const term of terms) {
    if (term.includes(" ")) {
      const pattern = term
        .split(" ")
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[\\s._*+\\-]+");
      PHRASE_TERMS.push({ term, category, regex: new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`) });
    } else {
      SINGLE_TERMS.push({ term, category });
    }
  }
}

function matchTerms(text: string): ModerationMatch[] {
  const compact = compactText(text);
  const normalized = normalizeForModeration(text);
  const tokens = normalized ? normalized.split(" ") : [];
  const found: ModerationMatch[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates(tokens)) {
    for (const { term, category } of SINGLE_TERMS) {
      if (!tokenMatchesTerm(candidate.token, term)) continue;
      const strict = STRICT_ORIGINAL[term];
      // Coincidencias que necesitan la grafía original (evita «cono» de helado).
      if (strict && !strict.test(compact)) continue;
      // Un fragmento unido de una sola letra repetida («aa») no es una palabra.
      if (candidate.source === "joined" && candidate.token.length < 4) continue;
      const key = `${category}:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ term, category, found: candidate.token });
    }
  }

  for (const { term, category, regex } of PHRASE_TERMS) {
    const match = regex.exec(normalized);
    if (!match) continue;
    const key = `${category}:${term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ term, category, found: match[0].trim() });
  }

  return found;
}

function matchPatterns(text: string): ModerationMatch[] {
  // Los patrones se prueban sobre el texto normalizado (para las evasiones) y
  // sobre el texto original sin tildes (para correos, teléfonos y enlaces, que
  // necesitan su puntuación).
  const variants = [normalizeForModeration(text), foldText(text)];
  const found: ModerationMatch[] = [];
  for (const { category, regex, note } of PATTERNS) {
    for (const variant of variants) {
      const match = regex.exec(variant);
      if (!match) continue;
      found.push({ term: note, category, note, found: match[0].trim().slice(0, 60) });
      break;
    }
  }
  return found;
}

/** Reglas blandas: mucho enlace, mayúsculas de grito o relleno repetido. */
function matchSpamHeuristics(text: string): ModerationMatch[] {
  const found: ModerationMatch[] = [];
  const links = text.match(/https?:\/\/\S+/gi) ?? [];
  if (links.length > 5) {
    found.push({ term: "muchos enlaces", category: "spam", found: `${links.length} enlaces`, note: "muchos enlaces" });
  }
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  const caps = text.replace(/[^A-ZÁÉÍÓÚÑ]/g, "");
  if (letters.length >= 40 && caps.length / letters.length > 0.7) {
    found.push({ term: "mayusculas", category: "spam", found: "texto en mayúsculas", note: "gritos" });
  }
  if (/(.)\1{9,}/.test(text)) {
    found.push({ term: "repeticion", category: "spam", found: "carácter repetido", note: "relleno" });
  }
  return found;
}

function severityOf(matches: ModerationMatch[]): ModerationSeverity {
  if (!matches.length) return "none";
  const order: ModerationSeverity[] = ["none", "low", "medium", "high"];
  return matches.reduce<ModerationSeverity>((acc, match) => {
    const current = CATEGORY_SEVERITY[match.category];
    return order.indexOf(current) > order.indexOf(acc) ? current : acc;
  }, "low");
}

function describe(matches: ModerationMatch[]): string {
  const labels = [...new Set(matches.map(match => CATEGORY_LABEL[match.category]))];
  const terms = [...new Set(matches.map(match => match.term))].slice(0, 3);
  const extra = terms.length ? ` Detectado: ${terms.join(", ")}.` : "";
  return `No se puede publicar: ${labels.join(" y ")}. Quita ese texto e inténtalo de nuevo.${extra}`;
}

export type ModerationOptions = {
  /** Bloquea a partir de esta gravedad (por defecto, cualquier coincidencia). */
  minSeverity?: ModerationSeverity;
};

/** Revisa un texto suelto (contenido, título, mensaje…). */
export function reviewText(text: string, options: ModerationOptions = {}): ModerationVerdict {
  const clean = (text ?? "").toString();
  const matches = [...matchTerms(clean), ...matchPatterns(clean), ...matchSpamHeuristics(clean)];
  const severity = severityOf(matches);
  const min = options.minSeverity ?? "low";
  const order: ModerationSeverity[] = ["none", "low", "medium", "high"];
  const blocked = matches.length > 0 && order.indexOf(severity) >= order.indexOf(min);
  return {
    allowed: !blocked,
    severity,
    categories: [...new Set(matches.map(match => match.category))],
    matches,
    reason: blocked ? describe(matches) : "",
    summary: blocked
      ? `bloqueado (${severity}): ${matches.map(match => match.term).slice(0, 6).join(", ")}`
      : "sin problemas",
  };
}

/** Revisa varios campos y devuelve el primer veredicto bloqueante. */
export function reviewFields(
  fields: { label: string; text: string | null | undefined }[],
  options: ModerationOptions = {},
): ModerationVerdict {
  const all: ModerationMatch[] = [];
  for (const field of fields) {
    if (!field.text) continue;
    all.push(...reviewText(field.text, options).matches);
  }
  const severity = severityOf(all);
  const min = options.minSeverity ?? "low";
  const order: ModerationSeverity[] = ["none", "low", "medium", "high"];
  const blocked = all.length > 0 && order.indexOf(severity) >= order.indexOf(min);
  return {
    allowed: !blocked,
    severity,
    categories: [...new Set(all.map(match => match.category))],
    matches: all,
    reason: blocked ? describe(all) : "",
    summary: blocked
      ? `bloqueado (${severity}): ${all.map(match => match.term).slice(0, 6).join(", ")}`
      : "sin problemas",
  };
}

export type PostLikeReviewInput = {
  content: string;
  tags?: string[];
  linkUrl?: string;
  html?: string;
  documentNames?: string[];
  pollQuestion?: string;
  lockedContent?: string;
};

/** Revisión de una publicación del feed. Reemplaza a la revisión con IA. */
export function reviewPost(input: PostLikeReviewInput, options: ModerationOptions = {}): ModerationVerdict {
  return reviewFields([
    { label: "contenido", text: input.content },
    { label: "etiquetas", text: (input.tags ?? []).join(" ") },
    { label: "enlace", text: input.linkUrl },
    { label: "html", text: input.html },
    { label: "documentos", text: (input.documentNames ?? []).join(" ") },
    { label: "encuesta", text: input.pollQuestion },
    { label: "contenido desbloqueable", text: input.lockedContent },
  ], options);
}

export type GameLikeSubmission = {
  kind: "game" | "artwork";
  title: string;
  description?: string;
  tags?: string[];
  genre?: string;
  textSamples?: string[];
};

/** Revisión de un juego u obra antes de publicarlo. Reemplaza a la IA. */
export function reviewSubmission(input: GameLikeSubmission, options: ModerationOptions = {}): ModerationVerdict {
  return reviewFields([
    { label: "título", text: input.title },
    { label: "descripción", text: input.description },
    { label: "etiquetas", text: (input.tags ?? []).join(" ") },
    { label: "género", text: input.genre },
    // Nombres de entidades, textos de interfaz y scripts del proyecto.
    { label: "proyecto", text: (input.textSamples ?? []).join(" \n ") },
  ], options);
}
