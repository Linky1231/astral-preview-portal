import type { SpriteAsset } from "./core";

/**
 * Guarda un dibujo editado dentro de la textura que se estaba editando.
 *
 * Seguir editando no crea copias: la textura conserva su identidad (mismo id, y
 * el nombre solo cambia si el editor trae uno nuevo) y el dibujo nuevo entra en
 * su primer fotograma. Si la textura tenía más fotogramas —una animación
 * añadida— los demás se quedan exactamente como estaban, así que editar nunca
 * pierde nada. Con un editor sin dibujo (no debería pasar) devuelve la misma
 * textura intacta.
 */
export function applyEditedDrawing(sprite: SpriteAsset, edited: SpriteAsset): SpriteAsset {
  const drawing = edited.frames[0]?.composite;
  if (!drawing) return sprite;
  return {
    ...sprite,
    name: edited.name.trim() || sprite.name,
    width: edited.width,
    height: edited.height,
    frames: sprite.frames.length > 0
      ? sprite.frames.map((f, i) => (i === 0 ? { ...f, composite: drawing } : f))
      : edited.frames,
  };
}
