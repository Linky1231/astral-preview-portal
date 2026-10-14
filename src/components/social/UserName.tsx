import type { Profile } from "@/lib/social/api";
import { isPlusActive } from "@/lib/social/api";
import { nameEffectClass } from "@/lib/social/name-effects";
import { PlusIcon } from "./PlusIcon";

/**
 * Renders a user's display name with their Plus effect (if any and Plus is active).
 * Effects: glow, rainbow, gradient, pulse, shadow, neon (ver name-effects.ts).
 */
export function UserName({
  p, size = "sm", showBadge = true, className = "",
}: {
  p: Profile | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  showBadge?: boolean;
  className?: string;
}) {
  const name = p?.display_name || p?.username || "Jugador";
  const plusActive = !!p && isPlusActive(p);
  const effectClass = plusActive ? nameEffectClass(p?.name_effect) : null;
  const badge = plusActive && (p?.show_plus_badge ?? true);

  const sizeCls =
    size === "xs" ? "text-[11px]" :
    size === "md" ? "text-base" :
    size === "lg" ? "text-lg" : "text-sm";

  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      <span
        className={`font-display ${sizeCls} truncate ${effectClass ?? ""} ${effectClass ? "max-w-[220px] sm:max-w-[320px]" : ""}`}
        data-effect={effectClass ? p?.name_effect ?? undefined : undefined}
      >
        {name}
      </span>
      {showBadge && badge && (
        <span
          className="inline-flex items-center px-1 py-0.5 rounded shrink-0"
          style={{ background: "var(--plus)", color: "var(--plus-on-primary)" }}
          title="Asternal Plus"
        >
          <PlusIcon size={9} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );
}
