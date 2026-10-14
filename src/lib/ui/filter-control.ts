/**
 * Estado visual único para los filtros de la app (pestañas de secciones,
 * sub-pestañas de Inicio y filtros del buscador).
 *
 * Antes cada pantalla repetía su propia combinación de colores para el filtro
 * activo, así que el mismo control se veía distinto según dónde estuviera.
 * El tamaño y la forma sí cambian por contexto, por eso aquí solo vive el
 * estado: color de fondo, texto y borde.
 */
export function filterStateClass(active: boolean): string {
  return [
    "transition-colors duration-200 outline-none focus:outline-none",
    active
      ? "border-transparent grad-brand text-primary-foreground shadow-sm"
      : "border-line-strong bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
  ].join(" ");
}
