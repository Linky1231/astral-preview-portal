import { memo, useEffect, useRef, useState } from "react";
import { plusFrameColor } from "@/lib/social/plus-frames";
import { toast } from "sonner";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { type PostWithMeta, toggleReaction, toggleRepost, deletePost, updatePost, reportContent, votePoll, isPlusActive } from "@/lib/social/api";
import { CommentsTray } from "./CommentsTray";
import { SharePostModal } from "./SharePostModal";
import { UserName } from "./UserName";
import { GameAiBadge } from "./GameAiBadge";
import { CardMenu, CardMenuItem, useCardMenuAnchor } from "./CardMenu";
import { nextExclusiveFooterAction, postFooterActionIsActive, socialActionStateClass, type FooterActionSelection } from "@/lib/social/interaction-state";
import { mergePostInteractionSnapshot, toggleReactionSnapshot, toggleRepostSnapshot, type PostInteractionSnapshot } from "@/lib/social/post-interaction";
import { documentDisplayMeta } from "@/lib/social/document-display";
import { postSurfaceClass } from "@/lib/social/post-surface";
import type { PostShareInput } from "@/lib/social/post-share";
import {
  Heart, Star, MessageCircle, Repeat2, MoreHorizontal, Pencil, Trash2, Flag, Share2,
  FileText, Download, Lock, Gamepad2, Code2, Link2, Play,
} from "lucide-react";

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

export const PostCard = memo(function PostCard({
  post, myId, isMod, onChange, onOpenGame,
}: {
  post: PostWithMeta; myId: string | null; isMod: boolean; onChange: () => void; onOpenGame?: (gameId: string) => void;
}) {
  const [openComments, setOpenComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showHtml, setShowHtml] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [activeFooterAction, setActiveFooterAction] = useState<FooterActionSelection>(null);
  const [interactions, setInteractions] = useState<PostInteractionSnapshot>(() => ({
    likes: post.likes,
    favorites: post.favorites,
    reposts: post.reposts_count,
    liked: post.my_like,
    favorited: post.my_favorite,
    reposted: post.my_repost,
  }));
  const [commentsCount, setCommentsCount] = useState(post.comments_count);
  const [poll, setPoll] = useState(post.poll);
  const interactionVersion = useRef({ like: 0, favorite: 0, repost: 0, poll: 0 });
  const personalInteractionOverride = useRef({ liked: false, favorited: false, reposted: false });
  const interactionPostId = useRef(post.id);
  const menu = useCardMenuAnchor<HTMLButtonElement>();

  useEffect(() => {
    if (interactionPostId.current !== post.id) {
      interactionPostId.current = post.id;
      personalInteractionOverride.current = { liked: false, favorited: false, reposted: false };
    }
    const incoming: PostInteractionSnapshot = {
      likes: post.likes,
      favorites: post.favorites,
      reposts: post.reposts_count,
      liked: post.my_like,
      favorited: post.my_favorite,
      reposted: post.my_repost,
    };
    setInteractions(current => mergePostInteractionSnapshot(current, incoming, personalInteractionOverride.current));
    setCommentsCount(post.comments_count);
    setPoll(post.poll);
    interactionVersion.current = { like: 0, favorite: 0, repost: 0, poll: 0 };
  }, [post.id, post.likes, post.favorites, post.reposts_count, post.my_like, post.my_favorite, post.my_repost, post.comments_count, post.poll]);

  const mine = myId === post.author_id;
  const canDelete = mine || isMod;
  const author = post.author;
  const authorPlus = isPlusActive(author);
  // Marco Plus: color sólido de la paleta Material 3 de Plus (sin degradado).
  const frame = authorPlus ? plusFrameColor(author?.avatar_frame) : null;

  // Entrance effect only during the first ~30s after publishing.
  const ageMs = Date.now() - new Date(post.created_at).getTime();
  const showEntrance = !!post.entrance_effect && authorPlus && ageMs < 30_000;
  const entranceClass = showEntrance ? `post-fx-${post.entrance_effect}` : "";

  const react = async (type: "like" | "favorite") => {
    const before = interactions;
    const version = ++interactionVersion.current[type];
    const activeKey = type === "like" ? "liked" : "favorited";
    personalInteractionOverride.current[activeKey] = true;
    setInteractions(current => toggleReactionSnapshot(current, type));
    try {
      const active = await toggleReaction({ postId: post.id, type });
      if (interactionVersion.current[type] === version) {
        setInteractions(current => {
          if (current[activeKey] === active) return current;
          return toggleReactionSnapshot(current, type);
        });
      }
    } catch (error) {
      if (interactionVersion.current[type] === version) {
        personalInteractionOverride.current[activeKey] = false;
        setInteractions(before);
      }
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la reacción");
    }
  };
  const repost = async () => {
    const before = interactions;
    const version = ++interactionVersion.current.repost;
    personalInteractionOverride.current.reposted = true;
    setInteractions(current => toggleRepostSnapshot(current));
    try {
      const active = await toggleRepost(post.id);
      if (interactionVersion.current.repost === version) {
        setInteractions(current => current.reposted === active ? current : toggleRepostSnapshot(current));
      }
    } catch (error) {
      if (interactionVersion.current.repost === version) {
        personalInteractionOverride.current.reposted = false;
        setInteractions(before);
      }
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la republicación");
    }
  };
  const chooseFooterAction = (next: Exclude<FooterActionSelection, null>) => {
    setActiveFooterAction(current => {
      const selected = nextExclusiveFooterAction(current, next);
      setOpenComments(selected === "comments");
      return selected;
    });
  };
  const remove = () => {
    toast("¿Eliminar publicación?", {
      description: "Esta acción no se puede deshacer.",
      action: {
        label: "Eliminar",
        onClick: async () => {
          setDeleting(true);
          try {
            await deletePost(post.id);
            toast.success("Publicación eliminada");
            onChange();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error al borrar");
          } finally {
            setDeleting(false);
          }
        },
      },
    });
  };
  const saveEdit = async () => { await updatePost(post.id, { content: editContent }); setEditing(false); onChange(); };
  const report = () => {
    menu.close();
    toast("Reportar publicación", {
      description: "Señalará esta publicación a los moderadores.",
      action: {
        label: "Reportar",
        onClick: async () => {
          try {
            await reportContent({ postId: post.id, reason: "Reporte desde el feed" });
            toast.success("Reporte enviado");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error al reportar");
          }
        },
      },
    });
  };
  const share = () => { setShowShare(true); menu.close(); };
  const vote = async (i: number) => {
    if (!poll || poll.my_vote !== null) return;
    const before = poll;
    const version = ++interactionVersion.current.poll;
    setPoll(current => current ? {
      ...current,
      my_vote: i,
      total: current.total + 1,
      votes: current.votes.map((count, index) => index === i ? count + 1 : count),
    } : current);
    try {
      await votePoll(poll.id, i);
    } catch (error) {
      if (interactionVersion.current.poll === version) setPoll(before);
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el voto");
    }
  };

  const avatarInner = <Avatar p={author} className="w-full h-full" />;

  const categoryChip = post.category ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
      {post.category}
    </span>
  ) : null;

  const postType = (post as Record<string, unknown>).post_type as string | undefined;
  // Insignias de tipo: el texto usa un tono de 600 en claro y uno de 300/400 en
  // oscuro. Con el tono de 600 fijo, sobre las tarjetas oscuras de Inicio el
  // rótulo quedaba casi invisible.
  const postTypeLabels: Record<string, { label: string; color: string }> = {
    update: { label: "Actualización", color: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20" },
    progress: { label: "Progreso", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20" },
    tutorial: { label: "Tutorial", color: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20" },
    question: { label: "Pregunta", color: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20" },
    resource: { label: "Recurso", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20" },
    achievement: { label: "Logro", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border-yellow-500/20" },
    announcement: { label: "Anuncio", color: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20" },
  };
  const postTypeInfo = postType && postType !== "general" ? postTypeLabels[postType] : null;
  const postTypeLabel = postTypeInfo ? (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${postTypeInfo.color}`}>
      {postTypeInfo.label}
    </div>
  ) : null;
  const shareKind: PostShareInput["post"]["kind"] = post.pinned_game
    ? "game"
    : post.media_type === "video"
      ? "video"
      : post.signed_media.length > 0 || post.signed_cover
        ? "image"
        : post.category?.toLowerCase() === "galería"
          ? "gallery"
          : "post";
  const postShare: PostShareInput = {
    owner: {
      id: post.author_id,
      displayName: author?.display_name ?? author?.username ?? "Creador de Asternal",
      username: author?.username ?? "",
      avatarUrl: author?.avatar_url ?? "",
    },
    post: {
      id: post.id,
      content: post.content,
      kind: shareKind,
      imageUrl: post.signed_media[0] ?? post.signed_cover ?? post.pinned_game?.cover_url ?? "",
      sourceUrl: "",
      mediaUrls: post.signed_media,
      mediaType: post.media_type,
      documents: post.signed_documents ?? [],
      textColor: post.text_color ?? "",
      linkUrl: post.link_url ?? "",
      hasHtml: Boolean(post.html_content),
      pinnedGame: post.pinned_game ? {
        id: post.pinned_game.id,
        title: post.pinned_game.title,
        coverUrl: post.pinned_game.cover_url ?? "",
      } : null,
      poll: post.poll ? {
        question: post.poll.question,
        options: post.poll.options,
        votes: post.poll.votes,
        total: post.poll.total,
      } : null,
      locked: post.locked_content ? {
        isUnlocked: post.is_unlocked === true,
        text: post.locked_content,
        goal: post.unlock_reactions_goal ?? 0,
        current: interactions.likes + interactions.favorites,
        unlockAt: post.unlock_at ?? "",
      } : null,
      postTypes: (post.post_type ?? "").split(","),
      tags: post.tags,
    },
  };

  return (
    <article className={`post-card group panel relative isolate min-w-0 overflow-hidden rounded-2xl border border-border/60 transition-[border-color,box-shadow] duration-200 ease-out pointer-fine:hover:border-primary/30 pointer-fine:hover:shadow-sm ${entranceClass}`}>
      {/* Hairline degradado superior */}
      <div aria-hidden="true" className="absolute inset-x-4 top-0 h-px rounded-full grad-brand-fade opacity-35 pointer-fine:group-hover:opacity-50 transition-opacity duration-200" />

      <div className="p-3 space-y-3">
        <header className="flex items-center gap-2.5">
          <Link to="/profile/$userId" params={{ userId: post.author_id }}
            className="relative shrink-0 transition-transform duration-150 ease-out active:scale-95 pointer-fine:group-hover:scale-[1.06]">
            {frame ? (
              <div className="w-10 h-10 rounded-full p-[2px] ring-1 ring-line-strong" style={{ background: frame }}>
                <div className="w-full h-full rounded-full overflow-hidden bg-background font-display text-xs text-primary-glow">
                  {avatarInner}
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-line-strong shadow-xs">
                {avatarInner}
              </div>
            )}
          </Link>
          <Link to="/profile/$userId" params={{ userId: post.author_id }} className="flex-1 min-w-0 pointer-fine:hover:opacity-80 transition-opacity duration-300">
            <div className="flex flex-wrap items-center gap-1.5">
              <UserName p={author} size="sm" className="max-w-full" />
              {categoryChip}
            </div>
            <div className="truncate text-[10px] font-mono text-ink-3 mt-0.5">
              @{author?.username ?? "?"} · <span className="text-primary font-medium">{timeAgo(post.created_at)}</span>
            </div>
          </Link>
          <Button variant="ghost" size="icon" type="button" ref={menu.anchorRef} onClick={menu.toggle}
            className="shrink-0 w-9 h-9 rounded-lg border border-border text-primary-glow grid place-items-center transition-[transform,background-color,color] duration-150 ease-out pointer-fine:hover:bg-primary/10 pointer-fine:hover:text-primary active:scale-[0.94]"
            aria-label="Menú de la publicación">
            <MoreHorizontal size={15} />
          </Button>
          <CardMenu rect={menu.rect} onClose={menu.close} width={164}>
            {mine && <CardMenuItem onClick={() => { setEditing(true); menu.close(); }} icon={<Pencil size={13} />}>Editar</CardMenuItem>}
            {canDelete && <CardMenuItem onClick={remove} danger icon={<Trash2 size={13} />}>Borrar</CardMenuItem>}
            {!mine && <CardMenuItem onClick={report} icon={<Flag size={13} />}>Reportar</CardMenuItem>}
            <CardMenuItem onClick={share} icon={<Share2 size={13} />}>Compartir</CardMenuItem>
          </CardMenu>
        </header>

        {postTypeLabel}

        {post.category === "game" && (
          <GameAiBadge
            preset={(post as { asset_preset?: Record<string, unknown> | null }).asset_preset}
            isAuthor={mine}
            postId={post.id}
            onRefresh={() => onChange?.()}
          />
        )}

        {editing ? (
          <div className="space-y-2">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3}
              aria-label="Editar publicación" className="min-w-0 w-full bg-input/40 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" type="button" onClick={() => setEditing(false)}
                className="text-xs px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted/40 transition-colors duration-200">Cancelar</Button>
              {/* `text-primary-foreground` en lugar de blanco fijo: en modo
                  oscuro el primary es claro y el texto blanco no se leía. */}
              <Button variant="ghost" type="button" onClick={saveEdit}
                className="text-xs px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground active:scale-[0.96] transition-transform duration-300 ease-out">Guardar</Button>
            </div>
          </div>
        ) : (
          post.content && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words"
              style={post.text_color ? { color: post.text_color } : undefined}>
              {post.content}
            </p>
          )
        )}

        {post.signed_media.length > 0 && (
          <div className={`grid gap-1.5 ${post.signed_media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {post.signed_media.map((url, i) => post.media_type === "video" ? (
              <div key={i} className="relative rounded-xl overflow-hidden bg-black border border-border/60">
                <video src={url} controls className="w-full max-h-[420px] bg-black" />
              </div>
            ) : (
              <div key={i} className="relative rounded-xl overflow-hidden bg-muted/40 border border-border/60 group/media">
                <img src={url} alt="" className="w-full max-h-[420px] object-cover transition-transform duration-500 ease-out pointer-fine:group-hover/media:scale-[1.02]" loading="lazy" />
              </div>
            ))}
          </div>
        )}

        {/* Documentos */}
        {post.signed_documents && post.signed_documents.length > 0 && (
          <div className="space-y-1.5">
            {post.signed_documents.map((d, i) => {
              const file = documentDisplayMeta(d.name);
              return (
                <div key={i} className="m3-card m3-card-outlined flex items-center gap-2.5 px-3 py-2.5 text-xs">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                    <FileText size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">{d.name}</span>
                    <span className="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{file.label} · {file.format}</span>
                  </span>
                  <a href={d.url} target="_blank" rel="noreferrer" download={d.name}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground transition-[border-color,color,background-color,transform] duration-150 ease-out hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary active:scale-95"
                    aria-label={`Descargar ${d.name}`} title={`Descargar ${d.name}`}>
                    <Download size={14} />
                  </a>
                </div>
              );
            })}
          </div>
        )}

        {/* HTML embebido */}
        {post.html_content && (
          <div className={`rounded-xl overflow-hidden ${postSurfaceClass("html")}`}>
            <Button variant="ghost" type="button" onClick={() => setShowHtml(s => !s)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs bg-primary/[0.055] pointer-fine:hover:bg-primary/[0.09] transition-colors duration-300">
              <Code2 size={13} className="text-primary" />
              <span className="flex-1 text-left font-medium">Contenido HTML {showHtml ? "(ocultar)" : "(mostrar)"}</span>
              <span className="text-muted-foreground transition-transform duration-300 ease-out" style={{ transform: showHtml ? "rotate(180deg)" : "none" }}>▼</span>
            </Button>
            {showHtml && (
              <>
                <iframe srcDoc={post.html_content} sandbox="" className="w-full h-64 bg-white" title="html-content" />
                <div className="text-[9px] text-muted-foreground px-2 py-1 bg-primary/[0.035]">Contenido de terceros · sandbox seguro</div>
              </>
            )}
          </div>
        )}

        {/* Juego fijado */}
        {post.pinned_game && (
          <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-xs ${postSurfaceClass("game")}`}>
            {post.pinned_game.cover_url ? (
              <img src={post.pinned_game.cover_url} alt="" className="h-9 w-9 shrink-0 rounded-xl border border-primary/15 bg-primary/[0.07] object-contain" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                <Gamepad2 size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Juego fijado</div>
              <div className="mt-0.5 truncate font-semibold text-foreground">{post.pinned_game.title}</div>
            </div>
            <Button variant="ghost"
              type="button"
              onClick={() => { if (post.pinned_game) onOpenGame?.(post.pinned_game.id); }}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground transition-[border-color,color,background-color,transform] duration-150 ease-out hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary active:scale-95"
              aria-label={`Jugar ${post.pinned_game.title}`}
              title={`Jugar ${post.pinned_game.title}`}
            >
              <Play size={14} className="ml-0.5" fill="currentColor" />
            </Button>
          </div>
        )}

        {/* Encuesta */}
        {post.poll && <PollView poll={post.poll} onVote={vote} />}

        {/* Contenido desbloqueable */}
        {post.locked_content && (
          <div className={`rounded-2xl p-3.5 transition-[border-color,background-color] duration-500 ease-out ${post.is_unlocked ? "border border-primary/40 bg-primary/[0.07]" : `${postSurfaceClass("locked")} border-dashed`}`}>
            <div className="flex items-center gap-2 text-[11px] font-display tracking-[0.15em] mb-2">
              <span className={`w-6 h-6 rounded-full grid place-items-center ${post.is_unlocked ? "bg-primary/15 text-primary-glow" : "bg-muted text-muted-foreground"}`}>
                <Lock size={11} />
              </span>
              {post.is_unlocked ? "DESBLOQUEADO" : "CONTENIDO OCULTO"}
            </div>
            {post.is_unlocked ? (
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{post.locked_content}</p>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1.5">
                {post.unlock_reactions_goal && (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <span className="block h-full bg-primary rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.min(100, Math.round(((post.likes + post.favorites) / post.unlock_reactions_goal) * 100))}%` }} />
                    </span>
                      <span className="tabular-nums">{interactions.likes + interactions.favorites} / {post.unlock_reactions_goal}</span>
                  </div>
                )}
                {post.unlock_at && (
                  <div className="flex items-center gap-1.5">🔓 Se desbloquea el {new Date(post.unlock_at).toLocaleString()}</div>
                )}
              </div>
            )}
          </div>
        )}

        {post.link_url && (
          <a href={post.link_url} target="_blank" rel="noreferrer"
            className="min-w-0 flex items-center gap-2 text-xs text-primary-glow hover:underline break-all transition-colors duration-300">
            <Link2 size={13} className="shrink-0" /><span className="min-w-0 break-all">{post.link_url}</span>
          </a>
        )}

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map(t => (
              <span key={t}
                className="max-w-full break-all text-[10px] font-mono px-2 py-1 rounded-full bg-muted/40 text-muted-foreground border border-border/40 transition-[color,border-color] duration-300 ease-out pointer-fine:hover:text-primary-glow pointer-fine:hover:border-primary/30">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center border-t border-border/50 bg-muted/15 px-1 py-0.5 text-[11px] text-muted-foreground">
        <Button variant="ghost" type="button" onClick={() => { chooseFooterAction("like"); void react("like"); }}
          aria-label="Me gusta" aria-pressed={interactions.liked}
          className={`min-w-0 h-11 flex-1 flex items-center justify-center gap-1.5 px-1 py-2 rounded-lg border transition-[transform,color,border-color] duration-150 ease-out active:scale-[0.93] ${socialActionStateClass(postFooterActionIsActive("like", { ...interactions, commentsOpen: openComments }))}`}>
          <motion.span
            key={interactions.liked ? "liked" : "unliked"}
            initial={{ scale: 0.4, rotate: -18 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 17 }}
            className="inline-flex"
          >
            <Heart size={15} className={interactions.liked ? "fill-current" : ""} />
          </motion.span>
          <span className="min-w-0 truncate tabular-nums font-medium">{interactions.likes}</span>
        </Button>
        <Button variant="ghost" type="button" onClick={() => { chooseFooterAction("favorite"); void react("favorite"); }}
          aria-label="Guardar en favoritos" aria-pressed={interactions.favorited}
          className={`min-w-0 h-11 flex-1 flex items-center justify-center gap-1.5 px-1 py-2 rounded-lg border transition-[transform,color,border-color] duration-150 ease-out active:scale-[0.93] ${socialActionStateClass(postFooterActionIsActive("favorite", { ...interactions, commentsOpen: openComments }))}`}>
          <motion.span
            key={interactions.favorited ? "favd" : "unfavd"}
            initial={{ scale: 0.4, rotate: 18 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 17 }}
            className="inline-flex"
          >
            <Star size={15} className={interactions.favorited ? "fill-current" : ""} />
          </motion.span>
          <span className="min-w-0 truncate tabular-nums font-medium">{interactions.favorites}</span>
        </Button>
        <Button variant="ghost" type="button" onClick={() => chooseFooterAction("comments")}
          aria-haspopup="dialog"
          aria-label="Abrir la bandeja de comentarios"
          className={`min-w-0 h-11 flex-1 flex items-center justify-center gap-1.5 px-1 py-2 rounded-lg border transition-[transform,color,border-color] duration-150 ease-out active:scale-[0.93] ${socialActionStateClass(postFooterActionIsActive("comments", { ...interactions, commentsOpen: openComments }))}`}>
          <MessageCircle size={15} className={openComments ? "fill-current/10" : ""} />
          <span className="min-w-0 truncate tabular-nums font-medium">{commentsCount}</span>
        </Button>
        <Button variant="ghost" type="button" onClick={() => { chooseFooterAction("repost"); void repost(); }}
          aria-label="Republicar" aria-pressed={interactions.reposted}
          className={`min-w-0 h-11 flex-1 flex items-center justify-center gap-1.5 px-1 py-2 rounded-lg border transition-[transform,color,border-color] duration-150 ease-out active:scale-[0.93] ${socialActionStateClass(postFooterActionIsActive("repost", { ...interactions, commentsOpen: openComments }))}`}>
          <motion.span
            key={interactions.reposted ? "reposted" : "unreposted"}
            initial={{ scale: 0.6, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 16 }}
            className="inline-flex"
          >
            <Repeat2 size={15} />
          </motion.span>
          <span className="min-w-0 truncate tabular-nums font-medium">{interactions.reposts}</span>
        </Button>
      </footer>

      {openComments && (
        <CommentsTray
          postId={post.id}
          authorUsername={author?.username}
          myId={myId}
          isMod={isMod}
          onChange={() => setCommentsCount(current => current + 1)}
          onClose={() => {
            setOpenComments(false);
            setActiveFooterAction(current => (current === "comments" ? null : current));
          }}
        />
      )}

      <SharePostModal post={postShare} open={showShare} onClose={() => setShowShare(false)} />
    </article>
  );
});


function PollView({ poll, onVote }: { poll: NonNullable<PostWithMeta["poll"]>; onVote: (i: number) => void }) {
  const voted = poll.my_vote !== null;
  return (
    <div className={`rounded-2xl p-3.5 space-y-2.5 ${postSurfaceClass("poll")}`}>
      <div className="flex items-start gap-2">
        <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary grid place-items-center shrink-0 mt-0.5">
          <span className="text-[11px]">📊</span>
        </span>
        <div className="min-w-0 break-words text-sm font-display leading-snug">{poll.question}</div>
      </div>
      {poll.options.map((opt, i) => {
        const count = poll.votes[i] ?? 0;
        const pct = poll.total ? Math.round((count / poll.total) * 100) : 0;
        const mine = poll.my_vote === i;
        return (
          <Button variant="ghost" key={i} onClick={() => onVote(i)}
            className={`relative h-auto min-w-0 w-full p-0 whitespace-normal text-left rounded-xl overflow-hidden border transition-[transform,border-color,box-shadow] duration-300 ease-out active:scale-[0.98] ${mine ? "border-primary/50 shadow-sm" : "border-border/60 pointer-fine:hover:border-primary/30"}`}>
            {voted && (
              <div className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }} />
            )}
            <div className="relative w-full min-w-0 flex items-center justify-between px-3 py-2.5 text-xs gap-2">
              <span className={`min-w-0 flex-1 flex items-center gap-2 ${mine ? "font-semibold text-primary-glow" : ""}`}>
                {mine && <span className="w-4 h-4 rounded-full bg-primary grid place-items-center"><span className="w-1.5 h-1.5 rounded-full bg-white" /></span>}
                <span className="min-w-0 break-words">{opt}</span>
              </span>
              {voted && <span className="shrink-0 tabular-nums text-muted-foreground font-medium">{pct}% · {count}</span>}
            </div>
          </Button>
        );
      })}
      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-2 items-center justify-between">
        <span>{poll.total} votos</span>
        {!voted && <span className="text-primary-glow/70">toca una opción para votar</span>}
      </div>
    </div>
  );
}
