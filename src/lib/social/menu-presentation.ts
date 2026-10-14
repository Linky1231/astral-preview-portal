import type { MenuEntry } from "./menu-sections";

/**
 * Estilo de las tarjetas del menú, elegido por la FUNCIÓN de cada opción y no
 * por su sección:
 *
 * - `restricted` (Moderación): superficie de aviso en color destructivo.
 * - `featured` (la opción principal de la sección): superficie e icono de marca.
 * - `accent: "plus"` (Centro Plus): acento cian propio del producto.
 * - resto: superficie e icono neutros, para que la tarjeta no grite.
 *
 * El BOTÓN de acceso es el mismo en TODAS las opciones —relleno de marca, en
 * azul—: dentro de una sección todos los accesos pesan lo mismo, en vez de
 * destacar sólo el primero. El aviso de Moderación se mantiene en la
 * superficie, el icono y la insignia RESTRINGIDO de su tarjeta.
 *
 * Vive aquí (y no en el marcado) para poder comprobarlo con pruebas.
 */

/** Superficie de la tarjeta. */
export function menuEntryCardClass(entry: MenuEntry): string {
  if (entry.restricted) return "border-destructive/25 bg-destructive/[0.04]";
  if (entry.featured) return "border-primary/25 bg-surface";
  return "border-border/70 bg-surface";
}

/** Recuadro del icono. */
export function menuEntryIconClass(entry: MenuEntry): string {
  if (entry.restricted) return "border-destructive/20 bg-destructive/10 text-destructive";
  if (entry.accent === "plus") return "border-[color:var(--plus-outline)] bg-[color:var(--plus-container)] text-[color:var(--plus-on-container)]";
  if (entry.featured) return "border-primary/20 bg-primary/10 text-primary";
  return "border-border/70 bg-muted/50 text-muted-foreground";
}

/** Botón que abre la opción: relleno de marca en todas las opciones. */
export function menuEntryCtaClass(): string {
  return "grad-brand text-primary-foreground shadow-sm hover:opacity-95";
}
