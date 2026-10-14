import { useEffect, useState } from "react";
import { Sparkles, Lock } from "lucide-react";
import { FaGamepad } from "react-icons/fa";
import type { PostWithMeta } from "@/lib/social/api";
import { coverFrameFromPreset, coverFrameStyle } from "@/lib/social/cover-frame";

function extractTitle(content: string): string {
  const line = content.split("\n")[0] || "Juego";
  return line.replace(/^🎮\s*/, "").trim() || "Juego";
}

/**
 * App-icon style game tile. Square, rounded, with cover image cropped from center.
 * Tap fires onOpen — the parent decides whether to open a play sheet, GameCard modal, etc.
 *
 * Portada: cover del juego → primera captura → si no hay (o la imagen falla),
 * tile «blueprint» (cuadrícula técnica sobre blanco) con icono de juego de
 * trazo fino y ticks de esquina. Sin morado ni emojis: cobalto sobre blanco.
 */
export function GameIcon({
  post,
  onOpen,
  size = "md",
  showTitle = true,
}: {
  post: PostWithMeta;
  onOpen: () => void;
  size?: "sm" | "md" | "lg";
  showTitle?: boolean;
}) {
  const title = extractTitle(post.content);
  const price = post.price_orbes ?? 0;
  const owned = post.owned ?? price <= 0;
  const needsPurchase = !owned && price > 0;

  const coverUrl = post.signed_cover ?? post.signed_screenshots[0] ?? null;
  const [imgFailed, setImgFailed] = useState(false);
  // Al cambiar la URL (o aparecer) se reintenta la imagen.
  useEffect(() => {
    setImgFailed(false);
  }, [coverUrl]);
  const hasCover = !!coverUrl && !imgFailed;
  const coverFrame = coverFrameFromPreset(post.asset_preset);

  const dims = size === "sm" ? "w-16" : size === "lg" ? "w-24" : "w-20";
  const radius = size === "lg" ? "rounded-[22px]" : "rounded-2xl";

  return (
    <button
      onClick={onOpen}
      className={`group flex flex-col items-center gap-1.5 ${dims} shrink-0 active:scale-[0.94] transition-transform`}
      title={title}
    >
      <div
        className={`relative aspect-square w-full ${radius} overflow-hidden ${
          hasCover
            ? "border border-white/60  transition-shadow group-hover:"
            : "tile-blueprint"
        }`}
      >
        {hasCover ? (
          <img
            src={coverUrl}
            alt={title}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
            style={coverFrameStyle(coverFrame)}
          />
        ) : (
          <TileMark />
        )}
        {/* subtle top gloss like iOS icons */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/15 via-transparent to-black/[0.06]" />
        {/* ticks de esquina: detalle técnico del tile blueprint */}
        {!hasCover && <CornerTicks />}
        {needsPurchase ? (
          <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-white/95 grid place-items-center shadow">
            <Lock size={11} className="text-primary" />
          </div>
        ) : price > 0 && owned ? (
          <div className="absolute bottom-1 right-1 px-1.5 h-5 rounded-full bg-emerald-500/95 grid place-items-center shadow">
            <Sparkles size={10} className="text-white" fill="currentColor" />
          </div>
        ) : null}
      </div>
      {showTitle && (
        <div className="text-[10.5px] font-medium leading-tight text-center w-full line-clamp-2 min-h-[24px]">
          {title}
        </div>
      )}
    </button>
  );
}

/** Marcador compartido para juegos que aún no tienen portada ni capturas. */
export function GameIconPlaceholder({ iconSize = 46 }: { iconSize?: number }) {
  return (
    <>
      <TileMark iconSize={iconSize} prominent={iconSize >= 80} />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/15 via-transparent to-black/[0.06]" />
      <CornerTicks />
    </>
  );
}

/** Marca del tile sin portada: icono de juego de trazo fino sobre la cuadrícula blueprint. */
function TileMark({ iconSize = 46, prominent = false }: { iconSize?: number; prominent?: boolean }) {
  return (
    <span className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden>
      {/* halo suave: profundidad sin caja ni recuadro genérico */}
      <span className={prominent
        ? "absolute w-28 h-28 rounded-full bg-primary/[0.08] dark:bg-primary/[0.05] blur-2xl"
        : "absolute w-14 h-14 rounded-full bg-primary/[0.06] dark:bg-primary/[0.04] blur-xl"
      } />
      <FaGamepad
        size={iconSize}
        className={prominent
          ? "relative text-primary/[0.38] dark:text-primary/[0.30]"
          : "relative text-primary/[0.28] dark:text-primary/[0.20]"
        }
      />
    </span>
  );
}

/** Esquinas suaves: puntos sutiles en las 4 esquinas del borde. */
function CornerTicks() {
  return (
    <span className="absolute inset-0 pointer-events-none" aria-hidden>
      {/* Esquina superior-izquierda */}
      <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-primary/20 dark:border-primary/10 rounded-tl-sm" />
      {/* Esquina superior-derecha */}
      <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-primary/20 dark:border-primary/10 rounded-tr-sm" />
      {/* Esquina inferior-izquierda */}
      <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-primary/20 dark:border-primary/10 rounded-bl-sm" />
      {/* Esquina inferior-derecha */}
      <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-primary/20 dark:border-primary/10 rounded-br-sm" />
    </span>
  );
}
