import { describe, expect, it, vi } from "vitest";
import {
  drawCanvasChecker,
  gridCell,
  gridDivisions,
  gridEdges,
  gridEdgesScaled,
  PAINT_GRID_CELL,
} from "./paint-grid";

function context() {
  return { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
}

/** Bordes de la retícula de un lado, tal como los reparte el lienzo. */
function edgesOf(size: number): number[] {
  return gridEdges(size);
}

/** Medidas típicas del lienzo (todas por encima del mínimo del editor). */
const SIZES = [128, 256, 512, 617, 733, 768, 1024, 1440];

describe("cuadrícula del lienzo", () => {
  it("mantiene el tamaño del cuadro: al cambiar el canvas se añaden o quitan cuadros", () => {
    // El doble de lienzo, el doble de cuadros: ninguno se estira.
    expect(gridDivisions(128)).toBe(8);
    expect(gridDivisions(512)).toBe(32);
    expect(gridDivisions(1024)).toBe(64);
    // Y con las medidas del editor el paso entra justo: cuadros idénticos.
    for (const size of SIZES.filter(s => s % PAINT_GRID_CELL === 0)) {
      expect(size / gridDivisions(size)).toBe(PAINT_GRID_CELL);
    }
  });

  it("los cuadros que ya existen NO se mueven al cambiar el lienzo", () => {
    // La retícula está anclada en el origen: la de un lienzo pequeño es el
    // comienzo exacto de la de uno grande (sin repartos ni redondeos). Esta es
    // la propiedad que impide que la retícula tiemble al arrastrar el tirador.
    const pairs: [number, number][] = [[128, 512], [512, 1024], [500, 617], [733, 1440]];
    for (const [small, large] of pairs) {
      const before = gridEdges(small);
      const after = gridEdges(large);
      expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, before.length - 1));
    }
  });

  it("cierra la retícula en el filo: ningún cuadro queda cortado en la esquina", () => {
    for (const size of SIZES) {
      const edges = edgesOf(size);
      expect(edges[0]).toBe(0);
      expect(edges[edges.length - 1]).toBe(size);
      expect(edges.every(Number.isInteger)).toBe(true);
      expect(edges.every((value, i) => i === 0 || value > edges[i - 1])).toBe(true);
    }
  });

  it("todos los cuadros miden el paso exacto; solo el último cierra en el filo", () => {
    for (const size of SIZES) {
      const edges = edgesOf(size);
      const cells = edges.slice(1).map((edge, i) => edge - edges[i]);
      // Ni uno se estira ni se atrofia para cuadrar con el borde.
      expect(cells.every(cell => cell <= PAINT_GRID_CELL)).toBe(true);
      expect(cells.slice(0, -1).every(cell => cell === PAINT_GRID_CELL)).toBe(true);
      // El último cierra la superficie, aunque le falte un trozo de cuadro.
      expect(cells[cells.length - 1]).toBe(size % PAINT_GRID_CELL || Math.min(PAINT_GRID_CELL, size));
    }
  });

  it("no depende del zoom: la vista reparte los mismos cuadros en menos píxeles", () => {
    // Un lienzo de 512 visto al 50 % (256 px de superficie reales): los mismos
    // cuadros del dibujo, cada uno con la mitad de píxeles de pantalla.
    const scale = 0.5;
    const scaled = gridEdgesScaled(512, 512 * scale, scale);
    const cells = scaled.slice(1).map((value, i) => value - scaled[i]);
    expect(new Set(cells)).toEqual(new Set([PAINT_GRID_CELL * scale]));
    expect(scaled[scaled.length - 1]).toBe(256);
    expect(scaled.map(value => value / scale)).toEqual(gridEdges(512));
  });

  it("lleva los bordes al bitmap de pantalla con el paso del dibujo", () => {
    // Lienzo de 512 px vistos al 130 % en una pantalla de 2 px reales por píxel.
    const scale = 1.3 * 2;
    const cols = gridEdgesScaled(512, 512 * scale, scale);
    expect(cols).toHaveLength(gridEdges(512).length);
    const cells = cols.slice(1).map((value, i) => value - cols[i]);
    // El paso es el del dibujo llevado a la pantalla (el redondeo de un píxel
    // real es lo único que lo desvía).
    expect(cells.every(cell => Math.abs(cell - PAINT_GRID_CELL * scale) <= 1)).toBe(true);
    expect(cols[cols.length - 1]).toBe(Math.round(512 * scale));
  });

  it("mientras el lienzo crece los bordes de la pantalla no se mueven: solo cambia el filo", () => {
    // El gesto del tirador: mismo zoom todo el rato, lienzo cada vez más grande.
    // Cada borde se queda clavado donde estaba (antes se corrían todos).
    const scale = 1.3 * 2;
    const before = gridEdgesScaled(512, 512 * scale, scale);
    for (const size of [520, 544, 600, 768, 900]) {
      const now = gridEdgesScaled(size, size * scale, scale);
      expect(now.slice(0, before.length - 1)).toEqual(before.slice(0, before.length - 1));
      expect(now[now.length - 1]).toBe(Math.round(size * scale));
    }
  });

  it("gridCell devuelve el cuadro con su borde y su medida", () => {
    const edges = edgesOf(64);
    expect(edges).toHaveLength(5);
    expect(gridCell(edges, 0)).toEqual({ at: 0, size: 16 });
    expect(gridCell(edges, 3)).toEqual({ at: 48, size: 16 });
    // Un índice fuera de rango no inventa cuadros.
    expect(gridCell(edges, 4).size).toBe(0);
  });

  it("el tablero añade cuadros en lugar de estirarlos", () => {
    const narrow = context();
    const wide = context();
    drawCanvasChecker(narrow as unknown as CanvasRenderingContext2D, 64, 64, "#fff", "#eee", edgesOf(64), edgesOf(64));
    drawCanvasChecker(wide as unknown as CanvasRenderingContext2D, 128, 64, "#fff", "#eee", edgesOf(128), edgesOf(64));
    const rects = (ctx: ReturnType<typeof context>) => ctx.fillRect.mock.calls as number[][];
    // Primero el fondo claro: toda la superficie.
    expect(rects(narrow)[0]).toEqual([0, 0, 64, 64]);
    expect(rects(wide)[0]).toEqual([0, 0, 128, 64]);
    // El damero es la mitad de la retícula: 4×4 y 8×4 cuadros.
    expect(rects(narrow).slice(1)).toHaveLength((4 * 4) / 2);
    expect(rects(wide).slice(1)).toHaveLength((8 * 4) / 2);
    // Y el cuadro mide lo mismo en los dos: se añaden, no se estiran.
    const widths = rects(wide).slice(1).map(([, , w]) => w);
    expect(new Set(widths)).toEqual(new Set([PAINT_GRID_CELL]));
  });

  it("el tablero cierra la última fila y la última columna en el filo", () => {
    const ctx = context();
    drawCanvasChecker(ctx as unknown as CanvasRenderingContext2D, 64, 64, "#fff", "#eee", edgesOf(64), edgesOf(64));
    const dark = (ctx.fillRect.mock.calls as number[][]).slice(1);
    expect(dark.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 64 && y + h <= 64)).toBe(true);
    expect(dark.some(([x, , w]) => x + w === 64)).toBe(true);
    expect(dark.some(([, y, , h]) => y + h === 64)).toBe(true);
  });
});
