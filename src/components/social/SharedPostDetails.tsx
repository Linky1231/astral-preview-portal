import {
  BarChart3,
  CalendarClock,
  Code2,
  Download,
  FileText,
  Gamepad2,
  Image as ImageIcon,
  Link2,
  Lock,
  Play,
  Tag,
  Video,
} from "lucide-react";
import type { PostSharePreview } from "@/lib/social/post-share";
import { documentDisplayMeta } from "@/lib/social/document-display";
import { postSurfaceClass } from "@/lib/social/post-surface";

const POST_TYPE_LABELS: Record<string, string> = {
  update: "Actualización",
  progress: "Progreso",
  tutorial: "Tutorial",
  question: "Pregunta",
  resource: "Recurso",
  achievement: "Logro",
  announcement: "Anuncio",
};

function formatUnlockDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function SharedPostDetails({
  post,
  compact = false,
}: {
  post: PostSharePreview;
  compact?: boolean;
}) {
  const media = post.mediaUrls.length > 0 ? post.mediaUrls : post.imageUrl ? [post.imageUrl] : [];
  const visibleTypes = post.postTypes.map((type) => POST_TYPE_LABELS[type] ?? type);
  const detailClass = compact ? "max-h-[22rem] overflow-y-auto pr-0.5" : "";

  return (
    <div className={`space-y-3 ${detailClass}`}>
      {visibleTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleTypes.map((type) => (
            <span key={type} className="rounded-full border border-primary/20 bg-primary/[0.07] px-2 py-0.5 text-[9px] font-semibold text-primary">
              {type}
            </span>
          ))}
        </div>
      )}

      {post.content && (
        <p
          className={compact ? "whitespace-pre-wrap break-words text-[12px] leading-snug line-clamp-5" : "whitespace-pre-wrap break-words text-sm leading-relaxed"}
          style={post.textColor ? { color: post.textColor } : undefined}
        >
          {post.content}
        </p>
      )}

      {media.length > 0 && (
        <div className={`grid gap-1.5 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {media.map((url, index) => post.mediaType === "video" ? (
            <video
              key={url}
              src={url}
              controls
              playsInline
              preload="metadata"
              className={`w-full rounded-xl border border-border/60 bg-black object-cover ${compact ? "max-h-32" : "max-h-72"}`}
            />
          ) : (
            <div key={url} className={`relative overflow-hidden rounded-xl border border-border/60 bg-muted/25 ${compact ? "max-h-32" : "max-h-72"}`}>
              <img src={url} alt={`Adjunto ${index + 1} de la publicación`} className={`w-full object-cover ${compact ? "max-h-32" : "max-h-72"}`} loading="lazy" />
              {media.length > 1 && index === media.length - 1 && (
                <span className="absolute bottom-1.5 right-1.5 rounded-md bg-foreground/70 px-1.5 py-0.5 text-[9px] font-semibold text-background">{media.length} adjuntos</span>
              )}
            </div>
          ))}
        </div>
      )}

      {post.documents.length > 0 && (
        <div className="space-y-1.5">
          {post.documents.map((document) => {
            const file = documentDisplayMeta(document.name);
            return (
              <div key={`${document.name}-${document.url}`} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-2.5 py-2 text-left">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/[0.07] text-primary"><FileText size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-foreground">{document.name}</span>
                  <span className="block text-[8px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{file.label} · {file.format}</span>
                </span>
                <a href={document.url} target="_blank" rel="noreferrer" aria-label={`Descargar ${document.name}`} title={`Descargar ${document.name}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground transition-[border-color,color,background-color,transform] duration-150 hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary active:scale-95">
                  <Download size={13} />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {post.hasHtml && (
        <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/25 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <Code2 size={14} className="mt-0.5 shrink-0 text-primary" />
          <span><strong className="font-semibold text-foreground">Incluye contenido HTML.</strong> Se abrirá de forma aislada desde la publicación original.</span>
        </div>
      )}

      {post.pinnedGame && (
        <div className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left ${postSurfaceClass("game")}`}>
          {post.pinnedGame.coverUrl ? (
            <img src={post.pinnedGame.coverUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-primary/15 bg-primary/[0.07] object-contain" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/[0.07] text-primary"><Gamepad2 size={14} /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Juego fijado</p>
            <p className="truncate text-[11px] font-semibold text-foreground">{post.pinnedGame.title}</p>
          </div>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground" aria-hidden="true"><Play size={12} /></span>
        </div>
      )}

      {post.poll && (
        <section className="rounded-2xl border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary"><BarChart3 size={13} /> Encuesta</div>
          <p className="mt-1.5 text-[12px] font-medium leading-snug">{post.poll.question}</p>
          <div className="mt-2 space-y-1.5">
            {post.poll.options.map((option, index) => {
              const votes = post.poll?.votes[index] ?? 0;
              const percentage = post.poll && post.poll.total > 0 ? Math.min(100, Math.round((votes / post.poll.total) * 100)) : 0;
              return (
                <div key={`${option}-${index}`} className="relative overflow-hidden rounded-lg border border-border/55 bg-card px-2 py-1.5 text-[10px]">
                  <span className="absolute inset-y-0 left-0 bg-primary/[0.08]" style={{ width: `${percentage}%` }} />
                  <span className="relative flex gap-2"><span className="min-w-0 flex-1 truncate">{option}</span><span className="tabular-nums text-muted-foreground">{votes}</span></span>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[9px] text-muted-foreground">{post.poll.total} voto{post.poll.total === 1 ? "" : "s"} · resumen compartido</p>
        </section>
      )}

      {post.locked && (
        <section className={`rounded-2xl border p-2.5 ${post.locked.isUnlocked ? "border-primary/30 bg-primary/[0.05]" : "border-dashed border-border bg-muted/20"}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary"><Lock size={12} /> {post.locked.isUnlocked ? "Contenido desbloqueado" : "Contenido bloqueado"}</div>
          {post.locked.isUnlocked ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-snug">{post.locked.text}</p>
          ) : (
            <div className="mt-2 space-y-1.5 text-[10px] text-muted-foreground">
              {post.locked.goal > 0 && (
                <div className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((post.locked.current / post.locked.goal) * 100))}%` }} /></span><span className="tabular-nums">{post.locked.current}/{post.locked.goal}</span></div>
              )}
              {post.locked.unlockAt && <p className="flex items-center gap-1.5"><CalendarClock size={11} /> Disponible el {formatUnlockDate(post.locked.unlockAt)}</p>}
            </div>
          )}
        </section>
      )}

      {post.linkUrl && (
        <a href={post.linkUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all text-[11px] font-medium text-primary hover:underline">
          <Link2 size={13} className="shrink-0" /> {post.linkUrl}
        </a>
      )}

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-muted/30 px-2 py-0.5 text-[9px] font-medium text-muted-foreground"><Tag size={9} />#{tag}</span>)}
        </div>
      )}

      {!post.content && media.length === 0 && post.documents.length === 0 && !post.hasHtml && !post.pinnedGame && !post.poll && !post.locked && !post.linkUrl && post.tags.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Publicación compartida desde Asternal.</p>
      )}
    </div>
  );
}
