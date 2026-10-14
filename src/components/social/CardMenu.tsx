import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Menú flotante (⋮) de tarjetas, renderizado en document.body vía portal:
 *
 * - Se abre al instante, sin animación, en una capa propia fuera de la tarjeta.
 *   Así nunca se recorta (overflow), nunca se despega por transforms/stacking de
 *   la tarjeta y no fuerza repintados de la tarjeta al montarse.
 * - Un backdrop de pantalla completa traga el toque y cierra el menú al tocar
 *   fuera (evita que el toque traspase y dispare efectos de la tarjeta detrás).
 * - Cierra con la tecla Escape.
 *
 * Uso:
 *   const menu = useCardMenuAnchor<HTMLButtonElement>();
 *   <button ref={menu.anchorRef} onClick={menu.toggle}>⋮</button>
 *   <CardMenu rect={menu.rect} onClose={menu.close}>…items…</CardMenu>
 */
export function useCardMenuAnchor<T extends HTMLElement>() {
  const anchorRef = useRef<T | null>(null);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  const open = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.right });
  }, []);

  const close = useCallback(() => setRect(null), []);

  const toggle = useCallback(() => {
    setRect(prev => {
      if (prev) return null;
      const el = anchorRef.current;
      if (!el) return prev;
      const r = el.getBoundingClientRect();
      return { top: r.bottom + 6, left: r.right };
    });
  }, []);

  return { anchorRef, rect, open, close, toggle };
}

export function CardMenu({
  rect,
  onClose,
  children,
  width = 168,
}: {
  rect: { top: number; left: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rect, onClose]);

  if (!rect) return null;

  // Nunca se sale de la ventana (bordes derecho e inferior).
  const left = Math.max(8, Math.min(rect.left - width + 14, window.innerWidth - width - 8));
  const maxTop = Math.max(8, window.innerHeight - 280);
  const top = Math.min(rect.top, maxTop);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[85]" onClick={onClose} />
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[86] panel border border-border rounded-xl p-1 text-xs shadow-md"
        style={{
          top,
          left,
          width,
          maxHeight: "min(320px, calc(100dvh - 16px))",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/** Item estándar del menú (icono + texto). */
export function CardMenuItem({
  onClick,
  icon,
  children,
  danger = false,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-150 ${
        danger
          ? "text-destructive pointer-fine:hover:bg-destructive/10"
          : "text-foreground/90 pointer-fine:hover:bg-muted/50"
      }`}
    >
      {/* Iconos del menú con el azul de la app; rojo solo para acciones destructivas. */}
      {icon && <span className={`shrink-0 ${danger ? "text-destructive" : "text-primary-glow"}`}>{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
}
