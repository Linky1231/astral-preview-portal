import { describe, expect, it } from "vitest";
import { createRafCoalescer } from "./raf-coalesce";

/** Reloj de cuadros de mentira: controla cuándo «pasa» cada fotograma. */
function fakeFrames() {
  const queued = new Map<number, () => void>();
  let nextId = 1;
  return {
    schedule: (callback: () => void) => {
      const id = nextId++;
      queued.set(id, callback);
      return id;
    },
    cancel: (id: number) => { queued.delete(id); },
    /** Ejecuta los cuadros pedidos (los que siguen vivos). */
    tick() {
      const running = [...queued.entries()];
      queued.clear();
      for (const [, callback] of running) callback();
    },
    pending: () => queued.size,
  };
}

describe("agrupador por cuadro", () => {
  it("una ráfaga de eventos se convierte en una sola actualización", () => {
    const clock = fakeFrames();
    const applied: number[] = [];
    const coalescer = createRafCoalescer<number>(v => applied.push(v), clock.schedule, clock.cancel);
    // Un dedo en movimiento: muchos eventos por cuadro.
    for (let i = 1; i <= 12; i++) coalescer.push(i);
    expect(clock.pending()).toBe(1);   // un solo cuadro pedido
    expect(applied).toEqual([]);       // y nada aplicado todavía
    clock.tick();
    expect(applied).toEqual([12]);     // solo el último valor, una vez
  });

  it("vuelve a pedir cuadro si siguen llegando eventos", () => {
    const clock = fakeFrames();
    const applied: number[] = [];
    const coalescer = createRafCoalescer<number>(v => applied.push(v), clock.schedule, clock.cancel);
    coalescer.push(1);
    clock.tick();
    coalescer.push(2);
    coalescer.push(3);
    clock.tick();
    expect(applied).toEqual([1, 3]);
  });

  it("avisa de si hay un cuadro pedido", () => {
    const clock = fakeFrames();
    const coalescer = createRafCoalescer<number>(() => {}, clock.schedule, clock.cancel);
    expect(coalescer.isPending()).toBe(false);
    coalescer.push(1);
    expect(coalescer.isPending()).toBe(true);
    clock.tick();
    expect(coalescer.isPending()).toBe(false);
  });

  it("cancelar descarta lo pendiente sin aplicarlo", () => {
    const clock = fakeFrames();
    const applied: number[] = [];
    const coalescer = createRafCoalescer<number>(v => applied.push(v), clock.schedule, clock.cancel);
    coalescer.push(7);
    coalescer.cancel();
    expect(clock.pending()).toBe(0);
    clock.tick();
    expect(applied).toEqual([]);
    // Y después de cancelar se puede seguir usando.
    coalescer.push(9);
    clock.tick();
    expect(applied).toEqual([9]);
  });
});
