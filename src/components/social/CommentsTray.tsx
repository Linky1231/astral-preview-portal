import { useEffect, useId, useRef } from "react";
import { MessageCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { CommentSection } from "./CommentSection";

/**
 * Bandeja de comentarios.
 *
 * Pantalla propia (a todo lo alto) donde se leen y escriben los comentarios de
 * una publicación. Sustituye al antiguo recuadro desplegable dentro de la
 * tarjeta: al pulsar «comentar» en el pie de una publicación, el contenido se
 * abre aquí, con cabecera y botón de cierre propios.
 */

/** Evento con el que una bandeja nueva cierra la que estuviera abierta. */
const COMMENTS_TRAY_EVENT = "ast:comments-tray-open";

export function CommentsTray({
  postId,
  authorUsername,
  myId,
  isMod,
  onChange,
  onClose,
}: {
  postId: string;
  authorUsername?: string | null;
  myId: string | null;
  isMod: boolean;
  onChange: () => void;
  onClose: () => void;
}) {
  const token = useId();
  const onCloseRef = useRef(onClose);

  // Guarda siempre la última versión de onClose sin volver a suscribir efectos.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Solo puede haber una bandeja abierta: si otra publicación abre la suya,
  // esta se cierra para no apilar pantallas.
  useEffect(() => {
    const handleOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== token) onCloseRef.current();
    };
    window.addEventListener(COMMENTS_TRAY_EVENT, handleOpen);
    window.dispatchEvent(new CustomEvent<string>(COMMENTS_TRAY_EVENT, { detail: token }));
    return () => window.removeEventListener(COMMENTS_TRAY_EVENT, handleOpen);
  }, [token]);

  // Escape cierra; mientras la bandeja está abierta el fondo no hace scroll.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bandeja de comentarios"
      className="fixed inset-0 h-dvh z-[95] flex flex-col bg-background"
    >
      <header className="shrink-0 border-b border-border/60 bg-background">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2.5 px-4 py-3 md:max-w-3xl">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <MessageCircle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm sm:text-base font-semibold text-foreground">Bandeja de comentarios</h2>
            <p className="truncate text-xs text-muted-foreground">
              {authorUsername ? `Conversación en la publicación de @${authorUsername}` : "Conversación de la publicación"}
            </p>
          </div>
          <Button variant="outline" size="icon"
            type="button"
            onClick={onClose}
            aria-label="Cerrar la bandeja de comentarios"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted/60 hover:text-foreground active:scale-95"
          >
            <X size={16} />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 md:max-w-3xl">
          <CommentSection postId={postId} myId={myId} isMod={isMod} onChange={onChange} />
        </div>
      </div>
    </div>,
    document.body
  );
}
