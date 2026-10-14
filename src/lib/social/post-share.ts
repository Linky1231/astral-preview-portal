/** Marcador textual compatible con la columna `content` del chat actual. */
export const POST_SHARE_PREFIX = "[[asternal:post:v1:";
const POST_SHARE_RE = /\[\[asternal:post:v1:([A-Za-z0-9_-]+)\]\]/;

export type PostShareKind = "post" | "game" | "art" | "gallery" | "image" | "video" | "link";
export type PostShareMediaType = "none" | "image" | "video" | "link";

export type PostShareOwner = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type PostShareDocument = {
  name: string;
  url: string;
};

export type PostSharePinnedGame = {
  id: string;
  title: string;
  coverUrl: string;
};

export type PostSharePoll = {
  question: string;
  options: string[];
  votes: number[];
  total: number;
};

export type PostShareLockedContent = {
  isUnlocked: boolean;
  text: string;
  goal: number;
  current: number;
  unlockAt: string;
};

export type PostSharePreview = {
  id: string;
  content: string;
  kind: PostShareKind;
  imageUrl: string;
  sourceUrl: string;
  mediaUrls: string[];
  mediaType: PostShareMediaType;
  documents: PostShareDocument[];
  textColor: string;
  linkUrl: string;
  hasHtml: boolean;
  pinnedGame: PostSharePinnedGame | null;
  poll: PostSharePoll | null;
  locked: PostShareLockedContent | null;
  postTypes: string[];
  tags: string[];
};

export type PostSharePayload = {
  version: 1;
  owner: PostShareOwner;
  post: PostSharePreview;
};

export type PostShareInput = {
  owner: Partial<PostShareOwner> & { id: string };
  post: Partial<PostSharePreview> & { id: string };
};

const SAFE_KINDS = new Set<PostShareKind>(["post", "game", "art", "gallery", "image", "video", "link"]);
const SAFE_MEDIA_TYPES = new Set<PostShareMediaType>(["none", "image", "video", "link"]);
const SAFE_POST_TYPES = new Set(["update", "progress", "tutorial", "question", "resource", "achievement", "announcement"]);
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s,.%+-]+\))$/i;

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanId(value: unknown): string {
  return cleanText(value, 128).replace(/[^a-zA-Z0-9_:-]/g, "");
}

function cleanHttpUrl(value: unknown): string {
  const raw = cleanText(value, 900);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function cleanNumber(value: unknown, max = 1_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

function cleanColor(value: unknown): string {
  const color = cleanText(value, 36);
  return SAFE_COLOR.test(color) ? color : "";
}

function cleanUrls(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanHttpUrl).filter(Boolean).slice(0, max);
}

function cleanDocuments(value: unknown): PostShareDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((document) => {
      if (!document || typeof document !== "object") return null;
      const candidate = document as Partial<PostShareDocument>;
      const name = cleanText(candidate.name, 120);
      const url = cleanHttpUrl(candidate.url);
      return name && url ? { name, url } : null;
    })
    .filter((document): document is PostShareDocument => document !== null)
    .slice(0, 5);
}

function cleanPinnedGame(value: unknown): PostSharePinnedGame | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PostSharePinnedGame>;
  const id = cleanId(candidate.id);
  const title = cleanText(candidate.title, 100);
  return id && title ? { id, title, coverUrl: cleanHttpUrl(candidate.coverUrl) } : null;
}

function cleanPoll(value: unknown): PostSharePoll | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PostSharePoll>;
  const question = cleanText(candidate.question, 180);
  const options = Array.isArray(candidate.options)
    ? candidate.options.map((option) => cleanText(option, 100)).filter(Boolean).slice(0, 4)
    : [];
  if (!question || options.length < 2) return null;
  const votes = Array.isArray(candidate.votes) ? candidate.votes.slice(0, options.length).map((vote) => cleanNumber(vote)) : [];
  while (votes.length < options.length) votes.push(0);
  return { question, options, votes, total: Math.max(cleanNumber(candidate.total), votes.reduce((sum, vote) => sum + vote, 0)) };
}

function cleanLocked(value: unknown): PostShareLockedContent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PostShareLockedContent>;
  const text = cleanText(candidate.text, 600);
  if (!text) return null;
  const rawDate = cleanText(candidate.unlockAt, 64);
  const date = rawDate ? new Date(rawDate) : null;
  return {
    isUnlocked: candidate.isUnlocked === true,
    text,
    goal: cleanNumber(candidate.goal),
    current: cleanNumber(candidate.current),
    unlockAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : "",
  };
}

function cleanPostTypes(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values
    .map((type) => cleanText(type, 24).toLowerCase())
    .filter((type) => SAFE_POST_TYPES.has(type))
    .filter((type, index, all) => all.indexOf(type) === index)
    .slice(0, 7);
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => cleanText(tag, 30).replace(/^#+/, ""))
    .filter((tag) => /^[a-zA-Z0-9_\u00c0-\u017f]+$/.test(tag))
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 8);
}

/** Normaliza el snapshot antes de enviarlo o dibujarlo dentro del chat. */
export function normalizePostShare(input: unknown): PostSharePayload | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<PostSharePayload>;
  if (candidate.version !== 1 || !candidate.owner || !candidate.post) return null;

  const ownerId = cleanId(candidate.owner.id);
  const postId = cleanId(candidate.post.id);
  if (!ownerId || !postId) return null;

  const displayName = cleanText(candidate.owner.displayName, 60) || "Creador de Asternal";
  const username = cleanText(candidate.owner.username, 40).replace(/^@+/, "");
  const requestedKind = cleanText(candidate.post.kind, 16) as PostShareKind;
  const requestedMediaType = cleanText(candidate.post.mediaType, 16) as PostShareMediaType;

  return {
    version: 1,
    owner: {
      id: ownerId,
      displayName,
      username,
      avatarUrl: cleanHttpUrl(candidate.owner.avatarUrl),
    },
    post: {
      id: postId,
      content: cleanText(candidate.post.content, 480),
      kind: SAFE_KINDS.has(requestedKind) ? requestedKind : "post",
      imageUrl: cleanHttpUrl(candidate.post.imageUrl),
      sourceUrl: cleanHttpUrl(candidate.post.sourceUrl),
      mediaUrls: cleanUrls(candidate.post.mediaUrls, 4),
      mediaType: SAFE_MEDIA_TYPES.has(requestedMediaType) ? requestedMediaType : "none",
      documents: cleanDocuments(candidate.post.documents),
      textColor: cleanColor(candidate.post.textColor),
      linkUrl: cleanHttpUrl(candidate.post.linkUrl),
      hasHtml: candidate.post.hasHtml === true,
      pinnedGame: cleanPinnedGame(candidate.post.pinnedGame),
      poll: cleanPoll(candidate.post.poll),
      locked: cleanLocked(candidate.post.locked),
      postTypes: cleanPostTypes(candidate.post.postTypes),
      tags: cleanTags(candidate.post.tags),
    },
  };
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
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

/** Serializa una publicación compartida como un marcador único compatible con `ChatMessage.content`. */
export function serializePostShare(input: PostShareInput | PostSharePayload): string {
  const payload = normalizePostShare({ ...input, version: 1 });
  if (!payload) throw new Error("La publicación no contiene datos válidos para compartir");
  return `${POST_SHARE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}]]`;
}

/** Extrae una publicación compartida y valida todos sus campos. */
export function parsePostShare(content: string | null | undefined): PostSharePayload | null {
  if (!content) return null;
  const match = content.match(POST_SHARE_RE);
  if (!match?.[1]) return null;
  const decoded = decodeBase64Url(match[1]);
  if (!decoded) return null;
  try {
    return normalizePostShare(JSON.parse(decoded));
  } catch {
    return null;
  }
}

/** Oculta el marcador técnico del contenido visible del mensaje. */
export function stripPostShare(content: string | null | undefined): string {
  return (content ?? "").replace(POST_SHARE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}
