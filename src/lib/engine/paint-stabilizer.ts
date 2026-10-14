/**
 * Estabilizador del lápiz (anti-vibración del trazo).
 *
 * El trazo se suaviza con una media móvil exponencial: cada punto dibujado se
 * acerca al cursor una fracción (`alpha`) del camino que le queda. Cuanto menor
 * es `alpha`, más suave —y más rezagado— va el pincel. Antes el valor estaba
 * fijo a la mitad y se activaba o desactivaba con un interruptor; ahora es un
 * nivel de 0 a 100 que el usuario regula con una barra.
 *
 * El módulo es puro (sin canvas ni React) para poder fijar su calibración con
 * pruebas y reutilizarlo tanto en el editor de sprites como en el lienzo de la
 * galería.
 */

export const STABILIZE_MIN = 0;
export const STABILIZE_MAX = 100;
/** Punto medio: suaviza sin que el trazo parezca ir a la zaga. */
export const STABILIZE_DEFAULT = 50;

export interface Point {
  x: number;
  y: number;
}

/** Nivel usable: entero dentro de 0-100 (un valor inválido vuelve al punto medio). */
export function clampStabilizeLevel(level: number): number {
  if (!Number.isFinite(level)) return STABILIZE_DEFAULT;
  return Math.max(STABILIZE_MIN, Math.min(STABILIZE_MAX, Math.round(level)));
}

/**
 * Fracción del camino que el trazo recorre hacia el cursor en cada punto.
 * 1 = sigue el cursor exactamente (sin estabilización); a mayor nivel, el pincel
 * se mueve menos por punto y el trazo sale más suave y regular.
 */
export function stabilizeAlpha(level: number): number {
  const clamped = clampStabilizeLevel(level);
  return 1 - (clamped / STABILIZE_MAX) * 0.88;
}

/** Punto suavizado: acerca el último punto dibujado a la posición del cursor. */
export function stabilizePoint(last: Point, target: Point, level: number): Point {
  const alpha = stabilizeAlpha(level);
  return {
    x: last.x + (target.x - last.x) * alpha,
    y: last.y + (target.y - last.y) * alpha,
  };
}
