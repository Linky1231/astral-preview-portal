/**
 * Efectos de nombre de Asternal Plus.
 *
 * Único origen del catálogo: el Centro Plus pinta la rejilla de selección a
 * partir de esta lista y el perfil / las publicaciones aplican las clases CSS
 * con `nameEffectClass`. Antes la pantalla de Plus tenía su propia copia de los
 * ids, así que un id podía existir en la interfaz y no tener estilos (o al
 * revés) sin que nada lo detectara.
 */
export const NAME_EFFECTS = [
  { id: "glow", label: "Brillo", hint: "Resplandor cian alrededor del nombre" },
  { id: "rainbow", label: "Arcoíris", hint: "Colores en movimiento continuo" },
  { id: "gradient", label: "Degradado", hint: "Azules de la paleta de marca" },
  { id: "pulse", label: "Pulso", hint: "Latido suave y constante" },
  { id: "shadow", label: "Sombra", hint: "Sombra sólida desplazada" },
  { id: "neon", label: "Neón", hint: "Tubo de luz azul" },
] as const;

export type NameEffectId = (typeof NAME_EFFECTS)[number]["id"];

/** ¿Es un efecto del catálogo? Evita clases `name-fx-<basura>` desde la base. */
export function isNameEffectId(value: string | null | undefined): value is NameEffectId {
  return !!value && NAME_EFFECTS.some((effect) => effect.id === value);
}

/** Etiqueta legible del efecto guardado, o `null` si no hay ninguno válido. */
export function nameEffectLabel(value: string | null | undefined): string | null {
  return NAME_EFFECTS.find((effect) => effect.id === value)?.label ?? null;
}

/**
 * Clases CSS que aplican el efecto de nombre, o `null` cuando no hay efecto
 * (o el valor guardado ya no pertenece al catálogo).
 */
export function nameEffectClass(value: string | null | undefined): string | null {
  return isNameEffectId(value) ? `name-fx name-fx-${value}` : null;
}
