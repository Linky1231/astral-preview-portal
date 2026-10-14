/** Programa una tarea para el siguiente cuadro (`requestAnimationFrame`). */
export type RafSchedule = (callback: () => void) => number;

export interface RafCoalescer<T> {
  /** Guarda el valor más reciente; el callback corre como mucho una vez por cuadro. */
  push(value: T): void;
  /** Cancela el cuadro pedido sin aplicar nada. */
  cancel(): void;
  /** ¿Hay un cuadro pedido todavía sin ejecutar? */
  isPending(): boolean;
}

const defaultSchedule: RafSchedule = (callback) => requestAnimationFrame(callback);
const defaultCancel = (id: number) => cancelAnimationFrame(id);

/**
 * Agrupa una ráfaga de eventos en una sola actualización por cuadro.
 *
 * Un dedo en movimiento dispara muchos `pointermove` por fotograma, y cada uno
 * pedía volver a pintar el lienzo: el trabajo caro se repetía varias veces para
 * el mismo cuadro y el zoom se veía a tirones. Con esto solo se aplica el
 * último valor, una vez por cuadro (y sin tocar el resto del estado).
 */
export function createRafCoalescer<T>(
  apply: (value: T) => void,
  schedule: RafSchedule = defaultSchedule,
  cancel: (id: number) => void = defaultCancel,
): RafCoalescer<T> {
  let frame: number | null = null;
  let pending: { value: T } | null = null;
  return {
    push(value) {
      pending = { value };
      if (frame !== null) return;
      frame = schedule(() => {
        frame = null;
        const next = pending;
        pending = null;
        if (next) apply(next.value);
      });
    },
    cancel() {
      if (frame !== null) cancel(frame);
      frame = null;
      pending = null;
    },
    isPending: () => frame !== null,
  };
}
