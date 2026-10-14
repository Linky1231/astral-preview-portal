import { MAX_PAINT_ZOOM, MIN_PAINT_ZOOM } from "./paint-zoom";

/**
 * Geometría del lienzo de dibujo: su tamaño en píxeles, la escala de la vista y
 * el encuadre al cambiar de tamaño.
 *
 * La vista nunca deforma el dibujo: el marco conserva la proporción del lienzo
 * (una escala única para los dos ejes), así que un lienzo ancho se ve ancho y
 * un cuadrado se ve cuadrado.
 *
 * Cambiar el tamaño del lienzo tampoco deforma el contenido: el dibujo se
 * conserva a la misma escala, anclado arriba a la izquierda. Al agrandar se
 * añade superficie vacía y al reducir se recorta lo que sobra. Ver `keptArea`.
 */
export const CANVAS_MIN = 32;
export const CANVAS_MAX = 2048;

export interface CanvasSize {
  w: number;
  h: number;
}

/** Medida de lienzo válida: entera y dentro de los límites del editor. */
export function clampCanvasSide(value: number): number {
  if (!Number.isFinite(value)) return CANVAS_MIN;
  return Math.max(CANVAS_MIN, Math.min(CANVAS_MAX, Math.round(value)));
}

export function clampCanvasSize(size: CanvasSize): CanvasSize {
  return { w: clampCanvasSide(size.w), h: clampCanvasSide(size.h) };
}

/** Lado mayor: la referencia de «ajustar al área» (el lienzo entero cabe). */
export function canvasLongSide(size: CanvasSize): number {
  return Math.max(1, Math.max(size.w, size.h));
}

/** Píxeles de pantalla por píxel de dibujo. */
export function canvasScale(fitPx: number, zoom: number, size: CanvasSize): number {
  if (!(fitPx > 0) || !(zoom > 0)) return 1;
  return (fitPx * zoom) / canvasLongSide(size);
}

/** Marco del lienzo en pantalla: misma proporción que el dibujo. */
export function canvasBox(fitPx: number, zoom: number, size: CanvasSize): CanvasSize {
  const scale = canvasScale(fitPx, zoom, size);
  return { w: Math.max(1, Math.floor(scale * size.w)), h: Math.max(1, Math.floor(scale * size.h)) };
}

/**
 * Zoom que deja el lienzo con el mismo ancho en pantalla que tenía durante el
 * arrastre. Sin esto, al soltar el tirador el lienzo volvería de golpe a la
 * medida de «ajustar al área» y el dibujo daría un salto.
 */
export function zoomForBox(boxWidth: number, fitPx: number, size: CanvasSize): number {
  if (!(boxWidth > 0) || !(fitPx > 0)) return 1;
  const zoom = (boxWidth * canvasLongSide(size)) / (fitPx * Math.max(1, size.w));
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(MIN_PAINT_ZOOM, Math.min(MAX_PAINT_ZOOM, zoom));
}

/**
 * Área del dibujo que sobrevive al cambio de tamaño.
 *
 * El contenido está anclado arriba a la izquierda y NO se reescala: agrandar el
 * lienzo añade superficie vacía a la derecha y abajo, y reducirlo recorta lo que
 * sobra. Devuelve los píxeles de origen que siguen dentro del lienzo nuevo, en
 * píxeles del dibujo (nunca una escala).
 */
export function keptArea(from: CanvasSize, to: CanvasSize): { x: number; y: number; w: number; h: number } {
  const w = Math.max(0, Math.min(Math.round(from.w), Math.round(to.w)));
  const h = Math.max(0, Math.min(Math.round(from.h), Math.round(to.h)));
  return { x: 0, y: 0, w, h };
}
