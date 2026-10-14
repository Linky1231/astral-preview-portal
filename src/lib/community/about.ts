export type CommunitySettings = {
  title: string;
  about: string;
  rules: string;
  privacy: string;
  moderationEnabled: boolean;
  personalizedRecommendations: boolean;
};

export type StoredCommunitySettings = CommunitySettings & {
  id?: string;
  updatedAt?: string | null;
};

export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = {
  title: "Acerca de Asternal",
  about: "Asternal reúne a creadores, jugadores y proyectos independientes en una comunidad creativa.",
  rules: "Respeta a la comunidad. No publiques contenido ilegal, dañino, engañoso ni que vulnere los derechos de otras personas.",
  privacy: "Usamos la información necesaria para operar tu cuenta, mostrar tus publicaciones y proteger la comunidad. Ajusta la visibilidad de tu perfil desde tu configuración personal.",
  moderationEnabled: true,
  personalizedRecommendations: true,
};

function cleanText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\u0000/g, "").trim().slice(0, maxLength);
  return normalized || fallback;
}

/** Convierte datos almacenados en un documento público, acotado y seguro para renderizar. */
export function normalizeCommunitySettings(value: unknown): CommunitySettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    title: cleanText(source.title, DEFAULT_COMMUNITY_SETTINGS.title, 80),
    about: cleanText(source.about, DEFAULT_COMMUNITY_SETTINGS.about, 1_200),
    rules: cleanText(source.rules, DEFAULT_COMMUNITY_SETTINGS.rules, 4_000),
    privacy: cleanText(source.privacy, DEFAULT_COMMUNITY_SETTINGS.privacy, 4_000),
    moderationEnabled: source.moderationEnabled !== false,
    personalizedRecommendations: source.personalizedRecommendations !== false,
  };
}

export function parseCommunitySettings(content: string | null | undefined): CommunitySettings {
  if (!content) return DEFAULT_COMMUNITY_SETTINGS;
  try {
    return normalizeCommunitySettings(JSON.parse(content));
  } catch {
    return DEFAULT_COMMUNITY_SETTINGS;
  }
}

export function serializeCommunitySettings(settings: CommunitySettings): string {
  return JSON.stringify(normalizeCommunitySettings(settings));
}
