import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Control segmentado con píldora de pestaña activa (patrón estable de Asternal).
 *
 * Centraliza la implementación que estaba duplicada en el inicio (/), el panel
 * de perfil y admin: la píldora se mide por la posición REAL de cada botón y se
 * anima solo con transform en px → nunca se desalinea, nunca mide por frame y
 * nunca produce layout shift al abrirse.
 *
 * Uso:
 *   <SegmentedControl
 *     items={[{ id: "games", label: "JUEGOS", icon: <Gamepad2 size={14}/> }, …]}
 *     value={tab}
 *     onChange={setTab}
 *   />
 */
export type SegItem<T extends string> = {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
};

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className = "",
  pillClassName = "",
  buttonClassName = "",
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  pillClassName?: string;
  buttonClassName?: string;
}) {
  const idx = Math.max(0, items.findIndex(i => i.id === value));
  const rowRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const row = rowRef.current;
    const btn = btnRefs.current[idx];
    if (!row || !btn) return;
    const r = row.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    setPill(p =>
      p && Math.abs(p.left - (b.left - r.left)) < 0.5 && Math.abs(p.width - b.width) < 0.5
        ? p
        : { left: b.left - r.left, width: b.width }
    );
  }, [idx]);

  useLayoutEffect(() => { measure(); }, [measure]);

  useLayoutEffect(() => {
    window.addEventListener("resize", measure);
    const t = window.setTimeout(measure, 150);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
    };
  }, [measure]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      className={`relative flex bg-muted/50 rounded-xl p-0.5 ${className}`}
    >
      {items.map((it, i) => {
        const active = value === it.id;
        return (
          <button
            key={it.id}
            ref={el => { btnRefs.current[i] = el; }}
            role="tab"
            aria-selected={active}
            title={it.title}
            onClick={() => onChange(it.id)}
            className={`relative z-10 flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-[10px] text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap transition-colors duration-200 ${
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            } ${buttonClassName}`}
          >
            {it.icon && <span className="shrink-0">{it.icon}</span>}
            <span className="truncate">{it.label}</span>
          </button>
        );
      })}
      <div
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 rounded-[10px] grad-brand shadow-sm transition-[transform,width] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none will-change-transform ${pillClassName}`}
        style={{
          left: 0,
          width: pill?.width ?? 0,
          transform: `translate3d(${pill?.left ?? 0}px, 0, 0)`,
        }}
      />
    </div>
  );
}
