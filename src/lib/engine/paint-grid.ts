/**
 * Cuadrícula del lienzo de dibujo.
 *
 * El lado de cada cuadro es FIJO en píxeles del lienzo (`PAINT_GRID_CELL`) y la
 * retícula está ANCLADA en el origen, como el papel milimetrado: al agrandar el
 * canvas se AÑADEN cuadros en el borde y al reducirlo se quitan, pero ninguno se
 * estira ni se mueve de sitio.
 *
 * Antes la retícula repartía los cuadros entre el tamaño total, así que mientras
 * el lienzo cambiaba de medida el paso se recalculaba en cada cuadro y TODOS los
 * bordes se corrían: los cuadros respiraban y se veían temblar. Ahora el
 * enrejado se queda quieto y lo único que cambia es dónde acaba.
 *
 * El último cuadro cierra en el filo: si el lado no es múltiplo exacto del paso,
 * el último queda algo más corto (como el papel cortado a tijera), nunca partido
 * fuera del lienzo. Con las medidas del editor (128, 256, 512, 768, 1024) el
 * paso entra justo y todos los cuadros miden lo mismo.
 *
 * La retícula viaja con el dibujo (mismo bitmap), así que la cantidad de cuadros
 * no depende del zoom y al ampliar no se deforma ni se reorganiza.
 */

/** Lado de un cuadro, en píxeles del lienzo. Fijo: no depende del canvas. */
export const PAINT_GRID_CELL = 16;

/**
 * Cuadros que caben en un lado de `size` píxeles, contando el último.
 *
 * Se cuenta hacia arriba: el paso es exacto, así que el último cuadro puede
 * quedar más corto (hasta `cell - 1` píxeles) y así la retícula cubre el lienzo
 * entero sin dejar una franja sin cuadros en el borde.
 */
export function gridDivisions(size: number, cell: number = PAINT_GRID_CELL): number {
  const pitch = Math.max(1, cell || 1);
  const span = Math.max(1, Math.round(size) || 1);
  return Math.max(1, Math.ceil(span / pitch));
}

/**
 * Bordes de la retícula en píxeles ENTEROS del lienzo, de 0 a `size`.
 *
 * El paso es exactamente `cell` desde el origen: la lista empieza igual sin
 * importar lo grande que sea el lienzo, así que los cuadros que ya existen no se
 * mueven al cambiar de tamaño. El último borde cae en el filo, y los cuadros
 * cubren la superficie completa.
 */
export function gridEdges(size: number, cell: number = PAINT_GRID_CELL): number[] {
  const pitch = Math.max(1, cell || 1);
  const span = Math.max(1, Math.round(size) || 1);
  const edges: number[] = [0];
  for (let at = pitch; at < span; at += pitch) edges.push(at);
  edges.push(span);
  return edges;
}

/**
 * Los MISMOS bordes repartidos sobre una superficie de `span` píxeles reales
 * (los del bitmap de pantalla), con `scale` píxeles reales por píxel de dibujo.
 *
 * Los bordes se calculan en píxeles del lienzo y de ahí pasan a la pantalla, así
 * que el paso de la retícula es el mismo que el del dibujo: las líneas caen justo
 * sobre los cuadros y no se mueven mientras el lienzo crece. El último borde
 * cierra el bitmap, y nunca quedan dos bordes en el mismo píxel.
 */
export function gridEdgesScaled(
  size: number,
  span: number,
  scale: number,
  cell: number = PAINT_GRID_CELL,
): number[] {
  const last = Math.max(1, Math.round(span));
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const edges: number[] = [];
  for (const at of gridEdges(size, cell)) {
    const scaled = Math.round(at * factor);
    if (edges.length === 0 || scaled > edges[edges.length - 1]) edges.push(scaled);
  }
  edges[edges.length - 1] = last;
  return edges;
}

/** Cuadro `i` de un eje: dónde empieza y cuánto mide, en píxeles enteros. */
export function gridCell(edges: number[], i: number): { at: number; size: number } {
  const from = edges[i] ?? 0;
  const to = edges[i + 1] ?? from;
  return { at: from, size: Math.max(0, to - from) };
}

/**
 * Tablero de transparencia sobre una superficie de `w`×`h` píxeles reales, con
 * los bordes `cols`/`rows` ya repartidos sobre esa misma superficie.
 *
 * Se pinta dentro del mismo bitmap que el dibujo y con los MISMOS bordes que la
 * guía, así que los cuadros escalan junto con el dibujo al hacer zoom, nunca se
 * desincronizan y el último cuadro cierra en el filo. La cantidad de cuadros la
 * decide el tamaño del LIENZO (`gridDivisions`), no la escala de la vista.
 */
export function drawCanvasChecker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  light: string,
  dark: string,
  cols: number[],
  rows: number[],
): void {
  const columns = Math.max(1, cols.length - 1);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = dark;
  for (let j = 0; j < rows.length - 1; j++) {
    const row = gridCell(rows, j);
    if (row.size <= 0) continue;
    // El damero es la pareja de cuadros (patrón 2×2) de la misma retícula.
    for (let i = j % 2; i < columns; i += 2) {
      const col = gridCell(cols, i);
      if (col.size > 0) ctx.fillRect(col.at, row.at, col.size, row.size);
    }
  }
}
