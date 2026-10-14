import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Loader2, Maximize2, RefreshCw, Rocket, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { GDEVELOP_EDITOR_URL, useWebGameLinks } from "@/lib/engine/gdevelop-publish";

import { PublishGDevelopDialog } from "./PublishGDevelopDialog";

export { GDEVELOP_EDITOR_URL };

/**
 * Asternal V2 · powered by GDevelop.
 *
 * Muestra el editor completo de GDevelop embebido a pantalla completa, con una
 * barra propia para volver al menú de editores, recargarlo o abrirlo aparte.
 * El editor se sirve desde su propio origen (editor.gdevelop.io) porque su
 * build web es una aplicación independiente; el iframe permite embebido (no
 * envía X-Frame-Options ni Content-Security-Policy que lo impidan).
 */
export function GDevelopV2Editor() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  // El contenedor (p. ej. un iframe de vista previa) puede no autorizar
  // pantalla completa mediante permissions policy; en ese caso ni se ofrece.
  // Es constante durante la vida de la página, así que se lee al montar.
  const [canFullscreen] = useState(() =>
    typeof document === "undefined" ? false : Boolean(document.fullscreenEnabled),
  );
  const [publishOpen, setPublishOpen] = useState(false);
  // Enlaces de juegos web publicados (gd.games) guardados en este navegador.
  const savedLinks = useWebGameLinks();

  const reload = useCallback(() => {
    setLoading(true);
    const frame = frameRef.current;
    if (frame) frame.src = GDEVELOP_EDITOR_URL;
  }, []);

  /**
   * Pantalla completa a prueba de bloqueos: nunca lanza, porque las políticas
   * de permisos del contenedor pueden rechazar la petición (TypeError
   * "Disallowed by permissions policy") y ese error rompería la app.
   */
  const goFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }
      const frame = frameRef.current;
      if (!frame || !document.fullscreenEnabled) return;
      if (typeof frame.requestFullscreen !== "function") return;
      await frame.requestFullscreen();
    } catch {
      /* Sin permiso de pantalla completa: se ignora en silencio. */
    }
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background" style={{ height: "100dvh" }}>
      <header className="flex items-center gap-2 border-b border-border/50 bg-background/85 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          to="/editor"
          className="glass-control inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/85 hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          Editores
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden sm:grid h-7 w-7 shrink-0 place-items-center rounded-lg grad-brand">
            <Rocket size={14} className="text-white" />
          </span>
          <span className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
            Asternal V2
          </span>
          <span className="hidden shrink-0 rounded-full border border-accent/25 bg-accent/[0.08] px-2 py-0.5 text-[9px] font-display font-semibold tracking-wider text-accent sm:inline">
            POWERED BY GDEVELOP
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            title="Publicar como juego web (gd.games)"
            className="glass-control relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/85 hover:text-foreground transition-colors"
          >
            <Upload size={13} />
            <span className="hidden sm:inline font-display font-semibold tracking-widest">PUBLICAR</span>
            {savedLinks.length > 0 && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
            )}
          </button>
          <button
            type="button"
            onClick={reload}
            title="Recargar el editor"
            className="glass-control grid h-8 w-8 place-items-center rounded-lg text-muted-foreground/80 hover:text-foreground transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          {canFullscreen && (
            <button
              type="button"
              onClick={() => void goFullscreen()}
              title="Pantalla completa"
              className="glass-control grid h-8 w-8 place-items-center rounded-lg text-muted-foreground/80 hover:text-foreground transition-colors"
            >
              <Maximize2 size={14} />
            </button>
          )}
          <a
            href={GDEVELOP_EDITOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en una pestaña nueva"
            className="glass-control inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/85 hover:text-foreground transition-colors"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">Pestaña nueva</span>
          </a>
        </div>
      </header>

      <div className="relative flex-1 bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 size={22} className="animate-spin text-primary" />
              <p className="font-display text-sm font-medium text-foreground">Cargando el editor de GDevelop…</p>
              <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground/70">
                La primera carga descarga el editor completo (unos segundos).
              </p>
            </div>
          </div>
        )}
        <iframe
          ref={frameRef}
          title="Asternal V2 · powered by GDevelop"
          src={GDEVELOP_EDITOR_URL}
          className="absolute inset-0 h-full w-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setLoading(false)}
        />
      </div>

      {publishOpen && (
        <PublishGDevelopDialog open={publishOpen} onOpenChange={setPublishOpen} />
      )}
    </div>
  );
}
