/**
 * Colocación de un sprite dibujado dentro de una escena del editor de niveles.
 *
 * El asset manda: el objeto entra con el tamaño del lienzo en el que se pintó
 * (no con una medida fija que lo encogía) y conserva su proporción, así que lo
 * que se dibuja es lo que aparece en el nivel. Solo se reduce si no cabe entero
 * en la escena, y nunca se amplía.
 */
export const MIN_PLACED_SIZE = 8;

export interface Size2D {
  w: number;
  h: number;
}

export function placedEntitySize(asset: Size2D, scene: Size2D, min: number = MIN_PLACED_SIZE): Size2D {
  const aw = Number.isFinite(asset.w) && asset.w > 0 ? asset.w : 1;
  const ah = Number.isFinite(asset.h) && asset.h > 0 ? asset.h : 1;
  const sceneOk = Number.isFinite(scene.w) && scene.w > 0 && Number.isFinite(scene.h) && scene.h > 0;
  const k = sceneOk ? Math.min(1, scene.w / aw, scene.h / ah) : 1;
  return {
    w: Math.max(min, Math.round(aw * k)),
    h: Math.max(min, Math.round(ah * k)),
  };
}
