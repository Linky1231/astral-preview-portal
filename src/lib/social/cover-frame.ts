export type CoverFrame = {
  x: number;
  y: number;
  zoom: number;
};

export const DEFAULT_COVER_FRAME: CoverFrame = { x: 50, y: 50, zoom: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normaliseCoverFrame(value: unknown): CoverFrame {
  const frame = typeof value === "object" && value !== null ? value as Partial<CoverFrame> : null;
  return {
    x: clamp(typeof frame?.x === "number" ? frame.x : DEFAULT_COVER_FRAME.x, 0, 100),
    y: clamp(typeof frame?.y === "number" ? frame.y : DEFAULT_COVER_FRAME.y, 0, 100),
    zoom: clamp(typeof frame?.zoom === "number" ? frame.zoom : DEFAULT_COVER_FRAME.zoom, 1, 2.4),
  };
}

export function coverFrameFromPreset(preset?: Record<string, unknown> | null): CoverFrame {
  return normaliseCoverFrame(preset?.cover_frame);
}

export function withCoverFrame(preset: Record<string, unknown> | null | undefined, frame: CoverFrame): Record<string, unknown> {
  return { ...(preset ?? {}), cover_frame: normaliseCoverFrame(frame) };
}

/**
 * Mantiene la imagen completa por defecto. Al ampliar, el desplazamiento elegido
 * por el creador mueve el área ampliada sin cambiar el marco que ve la comunidad.
 */
export function coverFrameStyle(frame: CoverFrame): { objectPosition: string; transform: string; transformOrigin: string } {
  const safe = normaliseCoverFrame(frame);
  const offsetX = ((50 - safe.x) / 50) * (safe.zoom - 1) * 18;
  const offsetY = ((50 - safe.y) / 50) * (safe.zoom - 1) * 18;
  return {
    objectPosition: `${safe.x}% ${safe.y}%`,
    transform: `translate(${offsetX}%, ${offsetY}%) scale(${safe.zoom})`,
    transformOrigin: `${safe.x}% ${safe.y}%`,
  };
}
