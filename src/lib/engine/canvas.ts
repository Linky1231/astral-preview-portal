/**
 * Dimensionado del bitmap de un lienzo.
 *
 * `canvas.width` y `canvas.height` son enteros: si se comparan contra el tamaño
 * CSS por el DPR sin redondear (`clientWidth * dpr`), cualquier medida
 * fraccionaria —muy común, porque el alto del lienzo sale de restar cabecera,
 * barra de herramientas y navegación en un layout flexible— hace que la
 * comprobación no coincida nunca y el lienzo se redimensione en CADA fotograma.
 * Asignar width/height vacía el bitmap, así que el navegador puede presentar el
 * lienzo recién limpiado: el fondo parpadeaba al arrastrar una entidad.
 *
 * Redondeando una sola vez y comparando tamaños reales, el bitmap solo se
 * reasigna cuando la medida cambia de verdad (al girar el móvil o redimensionar
 * la ventana), que es justo lo que ya hace el runtime del juego.
 */

/** Tamaño real (px físicos) del bitmap para un tamaño CSS y un DPR dados. */
export function canvasPixelSize(
  cssW: number,
  cssH: number,
  dpr: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(cssW * dpr)),
    height: Math.max(1, Math.round(cssH * dpr)),
  };
}

/**
 * ¿Hay que reasignar el bitmap del lienzo?
 *
 * Solo cuando el tamaño ya asignado difiere del redondeado: reasignarlo limpia
 * el lienzo, así que hacerlo de más es exactamente lo que produce el parpadeo.
 */
export function needsCanvasResize(
  current: { width: number; height: number },
  next: { width: number; height: number },
): boolean {
  return current.width !== next.width || current.height !== next.height;
}
