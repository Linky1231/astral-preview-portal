import type { Portfolio, PortfolioAchievement, PortfolioLink } from "@/components/social/PortfolioPanel";

/** Marcador textual compatible con la columna `content` actual de chat. */
export const PORTFOLIO_SHARE_PREFIX = "[[asternal:portfolio:v1:";
const PORTFOLIO_SHARE_RE = /\[\[asternal:portfolio:v1:([A-Za-z0-9_-]+)\]\]/;
const SAFE_ACCENT_RE = /^#[0-9a-f]{6}$/i;
const SAFE_ICONS = new Set<PortfolioAchievement["icon"]>([
  "trophy",
  "star",
  "award",
  "zap",
  "target",
  "gem",
  "flame",
  "rocket",
  "heart",
  "crown",
]);

export type PortfolioShareOwner = {
  id: string;
  displayName: string;
  username: string;
};

export type PortfolioSharePayload = {
  version: 1;
  owner: PortfolioShareOwner;
  portfolio: Portfolio;
};

export type PortfolioShareInput = {
  owner: Partial<PortfolioShareOwner> & { id: string };
  portfolio: Portfolio;
};

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanId(value: unknown): string {
  return cleanText(value, 128).replace(/[^a-zA-Z0-9_:-]/g, "");
}

function cleanUrl(value: unknown): string {
  const raw = cleanText(value, 320);
  if (!raw) return "";
  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeLinks(value: unknown): PortfolioLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Partial<PortfolioLink>;
    const label = cleanText(link.label, 64);
    const url = cleanUrl(link.url);
    if (!label || !url) return [];
    return [{ id: cleanId(link.id) || `shared-link-${index + 1}`, label, url }];
  });
}

function normalizeAchievements(value: unknown): PortfolioAchievement[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const achievement = item as Partial<PortfolioAchievement>;
    const title = cleanText(achievement.title, 80);
    if (!title) return [];
    const icon = SAFE_ICONS.has(achievement.icon as PortfolioAchievement["icon"])
      ? (achievement.icon as PortfolioAchievement["icon"])
      : "trophy";
    return [{
      id: cleanId(achievement.id) || `shared-achievement-${index + 1}`,
      title,
      description: cleanText(achievement.description, 240),
      date: cleanText(achievement.date, 24),
      icon,
    }];
  });
}

/**
 * Normaliza el snapshot antes de enviarlo o mostrarlo. De esta manera un
 * mensaje recibido nunca puede inyectar URLs, estilos o volúmenes de datos
 * inesperados en la tarjeta o la pantalla aislada.
 */
export function normalizePortfolioShare(input: unknown): PortfolioSharePayload | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<PortfolioSharePayload>;
  if (candidate.version !== 1 || !candidate.owner || !candidate.portfolio) return null;

  const ownerId = cleanId(candidate.owner.id);
  if (!ownerId) return null;
  const displayName = cleanText(candidate.owner.displayName, 60) || "Creador de Asternal";
  const username = cleanText(candidate.owner.username, 40).replace(/^@+/, "");
  const rawPortfolio = candidate.portfolio as Partial<Portfolio>;
  const skills = Array.isArray(rawPortfolio.skills)
    ? Array.from(new Set(rawPortfolio.skills.map((skill) => cleanText(skill, 32)).filter(Boolean))).slice(0, 12)
    : [];
  const accentCandidate = cleanText(rawPortfolio.accentColor, 7);

  return {
    version: 1,
    owner: { id: ownerId, displayName, username },
    portfolio: {
      userId: ownerId,
      headline: cleanText(rawPortfolio.headline, 100) || `Portafolio de ${displayName}`,
      bio: cleanText(rawPortfolio.bio, 600),
      accentColor: SAFE_ACCENT_RE.test(accentCandidate) ? accentCandidate : "#3b82f6",
      skills,
      links: normalizeLinks(rawPortfolio.links),
      achievements: normalizeAchievements(rawPortfolio.achievements),
      layout: "list",
      updatedAt: cleanText(rawPortfolio.updatedAt, 40),
    },
  };
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Serializa el Portafolio normalizado en un único marcador de mensaje. */
export function serializePortfolioShare(input: PortfolioShareInput | PortfolioSharePayload): string {
  const payload = normalizePortfolioShare({ ...input, version: 1 });
  if (!payload) throw new Error("El Portafolio no contiene datos válidos para compartir");
  return `${PORTFOLIO_SHARE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}]]`;
}

/** Extrae el primer snapshot de Portafolio compartido de un mensaje de chat. */
export function parsePortfolioShare(content: string | null | undefined): PortfolioSharePayload | null {
  if (!content) return null;
  const match = content.match(PORTFOLIO_SHARE_RE);
  if (!match?.[1]) return null;
  const decoded = decodeBase64Url(match[1]);
  if (!decoded) return null;
  try {
    return normalizePortfolioShare(JSON.parse(decoded));
  } catch {
    return null;
  }
}

/** Oculta el transporte interno del texto visible del mensaje. */
export function stripPortfolioShare(content: string | null | undefined): string {
  return (content ?? "").replace(PORTFOLIO_SHARE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}
