import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gamepad2, Sparkles, Check, ArrowRight, ExternalLink, Rocket, History, FlaskConical } from "lucide-react";

import { readLastEditorMode, type EditorMode } from "@/lib/engine/last-editor-mode";

const GDEVELOP_EDITOR_URL = "https://editor.gdevelop.io/";

const MINI_FEATURES = [
  "Escenas, objetos y capas con vista previa en vivo",
  "Animaciones, sprites y editor de pintura integrados",
  "Scripts propios y recursos guardados en tu navegador",
  "Publicación directa a la galería de Asternal",
];

const V2_FEATURES = [
  "Editor de eventos completo de GDevelop",
  "Comportamientos, extensiones y objetos prefabricados",
  "Previsualización de juego, consola de depuración y perfiles",
  "Internacionalización, capas y gestor de escenas avanzado",
];

/** Índice de cada editor dentro del carrusel. */
const SLIDES = ["mini", "beta", "v2"] as const;

const BETA_FEATURES = [
  "Todo lo del Editor de plataformas, sin recortes",
  "Tope de 120 FPS para juegos que lo aprovechan",
  "Ajustes de rejilla y ayudas todavía en pruebas",
  "Los juegos siguen guardándose en tu cuenta",
];

/** Nombre visible de cada editor, usado en el selector y en «continuar en». */
const MODE_LABELS: Record<EditorMode, string> = {
  mini: "Editor de plataformas",
  v2: "Asternal V2",
};

/**
 * Menú de editores: carrusel horizontal compacto con las dos opciones.
 *
 * En móvil se desliza una tarjeta a la vez (el carrusel ocupa solo el alto
 * disponible, así que la página no hace scroll vertical); en escritorio las
 * dos caben juntas y los puntos de navegación se ocultan.
 */
export function EditorChooser() {
  // Última sección visitada (se lee una sola vez al montar).
  const [lastMode] = useState(readLastEditorMode);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Sincroniza el punto activo con el desplazamiento horizontal del carrusel.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => {
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      Array.from(el.children).forEach((node, index) => {
        const item = node as HTMLElement;
        const distance = Math.abs(item.offsetLeft + item.clientWidth / 2 - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setActive(best);
    };
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, []);

  const goTo = (index: number) => {
    const el = scrollerRef.current;
    const item = el?.children[index] as HTMLElement | undefined;
    if (!el || !item) return;
    el.scrollTo({
      left: item.offsetLeft - (el.clientWidth - item.clientWidth) / 2,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background">
      {/* Fondo */}
      <div className="pointer-events-none fixed inset-0 select-none overflow-hidden">
        <div className="absolute inset-0 grad-brand-soft" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dot-grid-chooser" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.5" fill="oklch(0.55 0.15 262)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-grid-chooser)" />
        </svg>
      </div>

      {/* Cabecera compacta: marca + acceso directo a tu última sección */}
      <header className="relative z-10 flex w-full items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <Link to="/" className="group inline-flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl grad-brand shadow-lg shadow-primary/30">
            <Gamepad2 size={18} className="text-white" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-foreground">Asternal</span>
        </Link>

        {lastMode && (
          <Link
            to="/editor"
            search={{ mode: lastMode }}
            className="glass-control inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:text-primary active:scale-95"
          >
            <History size={12} className="text-primary" />
            Continuar en {MODE_LABELS[lastMode]}
          </Link>
        )}
      </header>

      {/* Título */}
      <div className="relative z-10 w-full max-w-2xl px-4 pb-3 pt-4 text-center sm:px-6">
        <div className="glass-control inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[10px] font-display font-medium tracking-wide text-primary/80">
          <Sparkles size={11} className="text-accent" />
          MENÚ DE EDITORES
        </div>
        <h1 className="mt-2.5 font-display text-[clamp(1.15rem,2.6vw,1.8rem)] font-bold leading-tight tracking-tight text-foreground">
          ¿Con qué editor quieres{" "}
          {/* M3: la jerarquía del titular se expresa con el color del rol
              primario, no con un degradado dentro del texto. */}
          <span className="text-primary">crear hoy?</span>
        </h1>          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted-foreground/75">
          Tres formas de crear: el Editor de plataformas para niveles rápido, la versión Beta con funciones en
          pruebas y el completo de GDevelop para proyectos grandes.
        </p>
      </div>

      {/* Carrusel: región acotada y recortada, para que las tarjetas nunca
          puedan pintarse encima del selector ni de la nota del motor. El
          recorte deja aire vertical/horizontal (py/px) para que la sombra de
          la tarjeta seleccionada no quede cortada por el overflow. */}
      <div className="relative z-10 mx-auto flex w-full min-h-0 max-w-5xl flex-1 items-center overflow-hidden py-3 md:items-stretch">
        <div
          ref={scrollerRef}
          className="no-scrollbar relative flex w-full px-[7%] sm:px-[16%] md:px-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth py-2 motion-reduce:scroll-auto"
        >
          {/* ─── Editor de plataformas (nativo) ─── */}
          <div className="w-full shrink-0 snap-center px-2 md:px-3 md:w-1/2">
            <section className="glass-surface no-scrollbar flex max-h-full flex-col overflow-y-auto rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/15 bg-primary/10">
                  <Gamepad2 size={19} className="text-primary" />
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[9px] font-display font-semibold tracking-wider text-primary">
                  PLATAFORMAS · NATIVO
                </span>
              </div>

              <h2 className="mt-3 font-display text-lg font-semibold tracking-tight text-foreground">Editor de plataformas</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/80">
                El editor nativo de plataformas, ligero e inmediato, pensado para construir niveles dentro de Asternal.
              </p>

              <ul className="mt-3 space-y-1.5">
                {MINI_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] leading-snug text-muted-foreground/85">
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-4">
                <Link
                  to="/editor"
                  search={{ mode: "mini" }}
                  className="btn-grad inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-display font-semibold tracking-wide active:scale-[0.98]"
                >
                  ABRIR EDITOR DE PLATAFORMAS
                  <ArrowRight size={14} />
                </Link>
              </div>
            </section>
          </div>

          {/* ─── Asternal Beta (motor propio en pruebas) ─── */}
          <div className="w-full shrink-0 snap-center px-2 md:px-3 md:w-1/2">
            <section className="glass-surface no-scrollbar flex max-h-full flex-col overflow-y-auto rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-accent/25 bg-accent/10">
                  <FlaskConical size={19} className="text-accent" />
                </div>
                <span className="rounded-full border border-accent/25 bg-accent/[0.08] px-2 py-0.5 text-[9px] font-display font-semibold tracking-wider text-accent">
                  MOTOR PROPIO · EN PRUEBAS
                </span>
              </div>

              <h2 className="mt-3 font-display text-lg font-semibold tracking-tight text-foreground">Asternal Beta</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/80">
                El mismo motor de Asternal con las funciones nuevas todavía en pruebas: pueden cambiar en la
                próxima versión.
              </p>

              <ul className="mt-3 space-y-1.5">
                {BETA_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] leading-snug text-muted-foreground/85">
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-4">
                <Link
                  to="/editor"
                  search={{ mode: "mini", beta: true }}
                  className="btn-grad inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-display font-semibold tracking-wide active:scale-[0.98]"
                >
                  ABRIR ASTERNAL BETA
                  <ArrowRight size={14} />
                </Link>
              </div>
            </section>
          </div>

          {/* ─── Asternal V2 (GDevelop) ─── */}
          <div className="w-full shrink-0 snap-center px-2 md:px-3 md:w-1/2">
            <section className="glass-surface no-scrollbar flex max-h-full flex-col overflow-y-auto rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-accent/25 bg-accent/15">
                  <Rocket size={19} className="text-accent" />
                </div>
                <span className="rounded-full border border-accent/25 bg-accent/[0.08] px-2 py-0.5 text-[9px] font-display font-semibold tracking-wider text-accent">
                  POWERED BY GDEVELOP
                </span>
              </div>

              <h2 className="mt-3 font-display text-lg font-semibold tracking-tight text-foreground">Asternal V2</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/80">
                El editor completo de GDevelop integrado: el mismo entorno oficial, sin recortes.
              </p>

              <ul className="mt-3 space-y-1.5">
                {V2_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] leading-snug text-muted-foreground/85">
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto space-y-2 pt-4">
                <Link
                  to="/editor"
                  search={{ mode: "v2" }}
                  className="btn-grad inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-display font-semibold tracking-wide active:scale-[0.98]"
                >
                  ABRIR ASTERNAL V2
                  <ArrowRight size={14} />
                </Link>
                <a
                  href={GDEVELOP_EDITOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-control inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium text-muted-foreground/85 transition-colors hover:text-foreground"
                >
                  Abrir el editor de GDevelop en una pestaña nueva
                  <ExternalLink size={11} />
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Selector del carrusel: barra propia con aire suficiente, separada de
          las tarjetas y de la nota del motor. */}
      <div className="relative z-10 mt-2 flex shrink-0 items-center justify-center gap-3 px-4 md:hidden">
        <div className="glass-control inline-flex items-center gap-2 rounded-full px-3 py-2">
          {SLIDES.map((slide, index) => (
            <button
              key={slide}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Ver editor ${index + 1} de ${SLIDES.length}`}
              aria-current={active === index ? "true" : undefined}
              className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${
                active === index ? "w-6 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground/60">Desliza para ver los demás editores</span>
      </div>

      <p className="relative z-10 w-full max-w-2xl shrink-0 px-4 pb-4 pt-4 text-center text-[10px] leading-relaxed text-muted-foreground/55 sm:px-6">
        Asternal V2 ejecuta el editor web de GDevelop (proyecto 4ian/GDevelop) integrado dentro de Asternal. Los
        proyectos de GDevelop se guardan en tu propio espacio de GDevelop; el Editor de plataformas guarda los suyos en
        tu cuenta de Asternal.
      </p>
    </div>
  );
}
