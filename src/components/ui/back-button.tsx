import { useSyncExternalStore } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import {
  getNavHistory,
  goBack as goBackRaw,
  subscribeNavHistory,
} from "@/lib/nav-history";
import { runNavGuard } from "@/lib/nav-guard";

/**
 * Capa del botón flotante «Volver» que se montaba en todas las pantallas.
 * El botón ya no existe (se retiró para no tapar el contenido en cada vista),
 * pero la capa se conserva como referencia de jerarquía: los paneles a
 * pantalla completa usan z-[90] y el menú lateral z-[101], así que los modales
 * (diálogos y alertas, z-[130]) tienen que quedar por encima de z-[120].
 */
export const FLOATING_BACK_BUTTON_LAYER = "z-[120]";

function useHistorySnapshot() {
  return useSyncExternalStore(subscribeNavHistory, getNavHistory, getNavHistory);
}

/** Botón «Volver» reutilizable: se oculta solo cuando no hay a dónde volver. */
export function BackButton({
  label = "Volver",
  showLabel = true,
  className = "",
  variant = "ghost",
  hideWithoutHistory = false,
}: {
  label?: string;
  showLabel?: boolean;
  className?: string;
  variant?: "ghost" | "solid";
  /**
   * Oculta el botón cuando no hay ninguna página anterior registrada. En la
   * pantalla principal (Inicio) un «Volver» inerte solo confunde: al pulsarlo
   * no ocurre nada porque el destino de respaldo es la propia Inicio.
   */
  hideWithoutHistory?: boolean;
}) {
  const router = useRouter();
  const history = useHistorySnapshot();

  if (hideWithoutHistory && history.length < 2) return null;

  const go = () => {
    const push = (href: string) => router.history.push(href);
    // Si la pantalla actual tiene cambios sin guardar, ella decide cuándo salir.
    if (runNavGuard(() => goBackRaw(push))) return;
    goBackRaw(push);
  };

  const base =
    variant === "solid"
      ? "border border-border/70 bg-card text-foreground hover:border-primary/40 hover:text-primary"
      : "text-ink-2 hover:text-foreground hover:bg-muted/60";

  return (
    <button
      type="button"
      onClick={go}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-xl transition active:scale-95 ${base} ${className}`}
    >
      <ArrowLeft size={17} />
      {showLabel && <span className="text-[13px] font-medium">{label}</span>}
    </button>
  );
}
