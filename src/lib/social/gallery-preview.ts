export function galleryPreviewAuthor(username?: string | null): string {
  const normalized = username?.trim();
  return normalized ? `@${normalized}` : "Artista";
}

export function galleryPreviewPrice(value?: number | null): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.max(0, value ?? 0));
}

export type GalleryArtworkCandidate = {
  category?: string | null;
  asset_preset?: unknown | null;
};

/**
 * La antigua Tienda usaba la misma categoría que la Galería, pero guardaba un
 * preset del editor. Las obras de artistas no contienen ese preset y son las
 * únicas que deben aparecer en superficies de Galería.
 */
export function isArtistGalleryArtwork(candidate?: GalleryArtworkCandidate | null): boolean {
  return candidate?.category === "artwork" && candidate.asset_preset == null;
}
