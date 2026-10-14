import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Package } from "lucide-react";

export function StoreOverlay({ children, onClose, label, foreground = false }: { children: ReactNode; onClose: () => void; label: string; foreground?: boolean }) {
  const closeRef = useRef(onClose);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    container.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      if (dialogs.some(dialog => dialog !== container.current && Number(getComputedStyle(dialog).zIndex) > Number(container.current ? getComputedStyle(container.current).zIndex : 0))) return;
      if (event.key === "Escape") { event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return createPortal(<div ref={container} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`fixed inset-0 h-dvh outline-none ${foreground ? "z-[150]" : "z-[140]"}`}>{children}</div>, document.body);
}

export function StoreImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt={alt} className={className} onError={() => setFailed(true)} /> :
    <div className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-muted-foreground">
      <Package size={28} className="shrink-0" />
      <span className="text-center text-xs">Imagen no disponible</span>
    </div>;
}