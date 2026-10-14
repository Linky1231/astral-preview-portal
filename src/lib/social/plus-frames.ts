/**
 * Marcos de perfil de Asternal Plus.
 *
 * Todos son colores SÓLIDOS de la paleta Material 3 de Plus (sin degradados):
 * el marco se pinta como un anillo de color plano alrededor de la foto. Los
 * cuatro tonos son claros pero distintos entre sí (cian, azul, hielo y neón),
 * para que el anillo se distinga de la foto tanto en tema claro como oscuro.
 */
export const PLUS_FRAMES = [
  { id: "aurora", label: "Aurora", color: "var(--plus-frame-aurora)" },
  { id: "ocean", label: "Océano", color: "var(--plus-frame-ocean)" },
  { id: "ice", label: "Hielo", color: "var(--plus-frame-ice)" },
  { id: "neon", label: "Neón", color: "var(--plus-frame-neon)" },
] as const;

/** Color sólido del marco, o `null` si no hay marco o el id no es válido. */
export function plusFrameColor(id: string | null | undefined): string | null {
  if (!id) return null;
  return PLUS_FRAMES.find((frame) => frame.id === id)?.color ?? null;
}
