/**
 * Icono de Asternal Plus: la marca del producto, una estrella.
 *
 * Es un trazo (`fill="none"`), por lo que su contorno toma siempre el color
 * heredado (`currentColor`). Regla de uso:
 *   - sobre superficie normal → `text-[color:var(--plus)]` (el color M3 de Plus)
 *   - sobre relleno Plus       → `text-[color:var(--plus-on-primary)]`
 * Así el icono nunca hereda el color de texto por defecto (que en tema claro es
 * casi negro) y se mantiene legible en todos los tamaños.
 */
export function PlusIcon({
  size = 14,
  strokeWidth = 2,
  className = "",
  title,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {/* Estrella de cinco puntas */}
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}
