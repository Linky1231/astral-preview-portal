export const MIN_PAINT_ZOOM = 0.25;
export const MAX_PAINT_ZOOM = 4;

/**
 * Margen (en tanto por uno de la distancia entre dedos) que hay que superar para
 * que el gesto empiece a hacer zoom.
 *
 * Un paneo de dos dedos nunca mantiene la distancia exacta: los dedos se juntan
 * y se separan unos píxeles mientras se desplazan. Sin este margen ese vaivén
 * cambiaba la escala unas décimas y el lienzo se reescalaba en cada cuadro —y la
 * retícula con él, que se veía temblar—. Separar los dedos un 6 % apenas se nota
 * al pellizcar y, en cambio, deja el desplazamiento totalmente quieto.
 */
export const PINCH_ZOOM_DEAD_ZONE = 0.06;

/**
 * ¿El gesto ya separa o junta los dedos lo suficiente como para hacer zoom?
 *
 * Hasta que no se supera el margen el gesto es solo paneo: el lienzo se mueve y
 * su escala (y su retícula) no cambia ni un píxel.
 */
export function pinchZoomArmed(startDistance: number, distance: number): boolean {
  if (!(startDistance > 0) || !Number.isFinite(startDistance) || !Number.isFinite(distance)) return false;
  return Math.abs(distance / startDistance - 1) > PINCH_ZOOM_DEAD_ZONE;
}

/** Distancias de dedos en coordenadas de pantalla, independientes del tamaño del lienzo. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (startDistance <= 0 || !Number.isFinite(startDistance) || !Number.isFinite(distance)) return startZoom;
  return Math.max(MIN_PAINT_ZOOM, Math.min(MAX_PAINT_ZOOM, startZoom * distance / startDistance));
}

/** Rectángulo en coordenadas de pantalla (basta con un `getBoundingClientRect`). */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Punto de la pantalla: el foco de un pellizco es la mitad entre los dos dedos. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Punto del dibujo que el gesto mantiene bajo los dedos, en el rango 0..1. */
export interface ZoomAnchor {
  u: number;
  v: number;
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * Punto del dibujo (0..1) que queda justo bajo el foco del pellizco. Si los
 * dedos caen fuera del lienzo (sobre el relleno del visor) se recorta al borde
 * más cercano: el ancla natural de un gesto que empieza fuera del dibujo.
 */
export function pinchAnchor(canvas: ScreenRect, focus: ScreenPoint): ZoomAnchor {
  if (!(canvas.width > 0) || !(canvas.height > 0)) return { u: 0.5, v: 0.5 };
  return {
    u: clamp01((focus.x - canvas.left) / canvas.width),
    v: clamp01((focus.y - canvas.top) / canvas.height),
  };
}

/**
 * Desplazamiento que hay que sumar al scroll del visor para que el punto
 * anclado vuelva a quedar bajo el foco del gesto. `canvas` es el rectángulo YA
 * reescalado (el visor todavía sin desplazar), así que el desplazamiento
 * compensa exactamente el cambio de tamaño: el visor no salta y el punto del
 * dibujo no se mueve de debajo de los dedos. Solo se desplaza el visor, nunca
 * el zoom, para que el gesto no acumule error.
 */
export function pinchScrollDelta(
  anchor: ZoomAnchor,
  canvas: ScreenRect,
  focus: ScreenPoint,
): { dx: number; dy: number } {
  const dx = canvas.left - (focus.x - anchor.u * canvas.width);
  const dy = canvas.top - (focus.y - anchor.v * canvas.height);
  return {
    dx: Number.isFinite(dx) ? dx : 0,
    dy: Number.isFinite(dy) ? dy : 0,
  };
}
