import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Cabecera compartida de sub-páginas (Orbes, Historial, Plus, Perfil, Admin…).
 *
 * Sustituye las 7 cabeceras duplicadas que había: cada página re-implementaba
 * «sticky + panel + botón atrás + título degradado». Ahora hay una sola fuente.
 *
 * - Cabecera plana (sin panel flotante): hairline inferior + blur al hacer
 *   scroll. Título en tinta (no glow falso), subtítulo mono opcional.
 * - `right` recibe acciones (píldora de orbes, insignia ACTIVO, etc.).
 * - `below` recibe una segunda fila dentro de la misma cabecera fija: la usan
 *   las pantallas con pestañas propias (Moderación) para que el selector no se
 *   pierda al hacer scroll.
 */
export function SubPageHeader({
  title,
  icon,
  subtitle,
  right,
  below,
  onBack,
  backLabel = "Volver al menú principal",
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  below?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  const back = onBack ? (
    <button
      onClick={onBack}
      aria-label={backLabel}
      className="glass-control w-9 h-9 rounded-lg text-ink-2 grid place-items-center hover:text-foreground active:scale-95 shrink-0"
    >
      <ArrowLeft size={16} />
    </button>
  ) : (
    <Link
      to="/"
      aria-label={backLabel}
      className="glass-control w-9 h-9 rounded-lg text-ink-2 grid place-items-center hover:text-foreground active:scale-95 shrink-0"
    >
      <ArrowLeft size={16} />
    </Link>
  );

  return (
    <header className="app-header glass-header sticky top-0 z-20 border-b">
      <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto flex items-center gap-2.5 px-3 py-2.5">
        {back}
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm font-semibold text-foreground truncate flex items-center gap-2">
            {icon && <span className="text-primary shrink-0">{icon}</span>}
            <span className="truncate">{title}</span>
          </div>
          {subtitle && (
            <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
      {below && (
        <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full px-3 pb-2.5">
          {below}
        </div>
      )}
    </header>
  );
}
