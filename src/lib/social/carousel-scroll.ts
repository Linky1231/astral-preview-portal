/**
 * Comportamiento común para las filas de contenido explorables en pantallas
 * táctiles. No añade controles artificiales: el desplazamiento es nativo y
 * mantiene una detención suave por tarjeta cuando el usuario termina el gesto.
 */
export const mobileCarouselScrollClassName =
  // El contenedor es un scroller horizontal, así que recorta en los dos ejes:
  // sin aire vertical la sombra de elevación de los iconos de juego se veía
  // cortada por arriba. `-mt-1` compensa el padding superior para que la fila
  // siga alineada con el resto del contenido.
  "flex gap-3 overflow-x-auto no-scrollbar -mx-3 -mt-1 scroll-px-3 px-3 pt-2 pb-1.5 snap-x snap-proximity overscroll-x-contain [&>*]:snap-start md:mt-0 md:flex-wrap md:overflow-visible md:justify-start md:snap-none";
