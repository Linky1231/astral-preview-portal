import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const layers: symbol[] = [];
let originalOverflow = "";

/** Viewport dialogs shared by profile tools, including nested history panels. */
export function ProfileOverlay({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const id = Symbol(label);
    const previous = document.activeElement;
    if (!layers.length) originalOverflow = document.body.style.overflow;
    layers.push(id);
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return;
      if (event.key === "Escape") { event.stopImmediatePropagation(); close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea, select, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => {
      const index = layers.indexOf(id);
      if (index >= 0) layers.splice(index, 1);
      if (!layers.length) document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKey, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[150] h-dvh overflow-hidden outline-none">{children}</div>, document.body);
}