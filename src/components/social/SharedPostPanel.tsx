import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { ExternalLink, FileText, Gamepad2, Image as ImageIcon, Play, Send, Video, X } from "lucide-react";
import type { PostSharePayload } from "@/lib/social/post-share";
import { SharedPostDetails } from "./SharedPostDetails";

const KIND_LABEL: Record<PostSharePayload["post"]["kind"], string> = {
  post: "Publicación",
  game: "Juego compartido",
  art: "Arte compartido",
  gallery: "Galería",
  image: "Imagen compartida",
  video: "Vídeo compartido",
  link: "Enlace compartido",
};

function PostKindIcon({ kind }: { kind: PostSharePayload["post"]["kind"] }) {
  if (kind === "game") return <Gamepad2 size={20} />;
  if (kind === "video") return <Video size={20} />;
  if (kind === "image" || kind === "art" || kind === "gallery") return <ImageIcon size={20} />;
  if (kind === "link") return <ExternalLink size={20} />;
  return <FileText size={20} />;
}

export function SharedPostPanel({ share, onClose }: { share: PostSharePayload; onClose: () => void }) {
  const { owner, post } = share;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const goToFeed = () => {
    if (!post.sourceUrl) return;
    window.location.assign(post.sourceUrl);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.section
          initial={{ opacity: 0, y: 22, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-0 h-[100dvh] overflow-y-auto bg-background sm:inset-x-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(86vh,86dvh)] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-border/70 sm:shadow-2xl"
        >
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/55 bg-background/90 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl sm:rounded-t-3xl">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Send size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-display font-bold">Publicación compartida</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Vista compartida desde un chat</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-muted/20 transition-colors hover:bg-muted/55" aria-label="Cerrar publicación compartida">
              <X size={17} />
            </button>
          </header>

          <main className="mx-auto w-full max-w-lg px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
            <article className="m3-card m3-card-outlined overflow-hidden text-card-foreground">
              <div className="h-1.5 grad-brand-fade" />
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    {owner.avatarUrl ? <img src={owner.avatarUrl} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="text-sm font-display font-bold">{owner.displayName.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-display font-bold">{owner.displayName}</p>
                    {owner.username && <p className="truncate text-[11px] font-mono text-primary/80">@{owner.username}</p>}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.11em] text-primary">
                    <PostKindIcon kind={post.kind} /> {KIND_LABEL[post.kind]}
                  </span>
                </div>

                <div className="mt-4"><SharedPostDetails post={post} /></div>

                {post.sourceUrl && (
                  <button type="button" onClick={goToFeed} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl grad-brand text-xs font-display font-semibold tracking-wide text-primary-foreground transition-transform active:scale-[0.98]">
                    <ExternalLink size={14} /> Abrir en el feed
                  </button>
                )}
              </div>
            </article>
          </main>
        </motion.section>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
