import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Copy, Check, Reply, SmilePlus, ImagePlus, Image as ImageIcon, Film, Loader2, Users, Users2, Settings2, UserPlus, UserMinus, Camera, Pencil, LogOut, MessageCircle, AtSign, BarChart3, Shield, ShieldCheck, ArrowLeft, WifiOff, RefreshCw, KeyRound, CheckCircle2, AlertTriangle, Mic, Play, Pause, Trash2, ArrowDown, ExternalLink, Megaphone, Gift, PartyPopper, Lock, Sparkles, Timer, Undo2, ChevronRight, Briefcase, ClipboardList, FolderOpen, MessagesSquare, Download, Paperclip, MessageSquarePlus, Search, Layers, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getCommunityChat,
  fetchChatMessages,
  sendChatMessage,
  subscribeToChat,
  uploadSticker,
  fetchMyStickers,
  deleteSticker,
  signMedia,
  isAudioMessage,
  isVideoMessage,
  isImageMessage,
  uploadChatMedia,
  fetchChatProfiles,
  isNetworkError,
  queuePendingMessage,
  flushPendingMessages,
  createAnnouncement,
  createOrbGift,
  claimOrbGift,
  fetchOrbGift,
  expireOrbGifts,
  subscribeToOrbGifts,
  isAnnouncement,
  isGiftMessage,
  isPollMessage,
  createPoll,
  fetchPoll,
  votePoll,
  closePoll,
  subscribeToPolls,
  setGroupRole,
  deleteGroupChat,
  getOrCreateDm,
  fetchMyDmChats,
  fetchMutualFollows,
  markDmRead,
  fetchChatReadAt,
  searchProfilesForMention,
  createGroupChat,
  fetchMyGroupChats,
  fetchGroupMembers,
  updateGroupChat,
  addGroupMember,
  removeGroupMember,
  leaveGroupChat,
  COMMUNITY_CHAT_NAME,
  CHAT_ERR,
  type ChatMessage,
  type ChatSticker,
  type OrbGift,
  type ChatPoll,
  type DmChat,
  type GroupChat,
  type GroupMember,
} from "@/lib/social/chat";
import {
  listWorkChats,
  markWorkChat,
  listThreads,
  listThreadMessages,
} from "@/lib/social/work";
import type { WorkThread } from "@/lib/social/work";
import { TaskManager, FileManager, ThreadsManager, ThreadView, ProjectsManager } from "./WorkChatPanel";
import { GlobalSearchPanel } from "./GlobalSearchPanel";
import { supabase, hasSupabaseConfig, saveSupabaseCredentials } from "@/integrations/supabase/client";
import { UserName } from "./UserName";
import { getMyProfile, getMyOrbes, isAdmin, pushNotification, uploadAvatar } from "@/lib/social/api";
import type { Profile } from "@/lib/social/api";
import { Avatar as SharedAvatar } from "./Avatar";
import { PortfolioPanel, getPortfolio } from "./PortfolioPanel";
import { SharedPostPanel } from "./SharedPostPanel";
import {
  parsePortfolioShare,
  serializePortfolioShare,
  stripPortfolioShare,
  type PortfolioSharePayload,
} from "@/lib/social/portfolio-share";
import {
  parsePostShare,
  stripPostShare,
  type PostSharePayload,
} from "@/lib/social/post-share";
import { SharedPostDetails } from "./SharedPostDetails";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

/** Mini etiqueta con icono para previsualizar el tipo de media de un mensaje. */
function MediaLabel({ m, muted }: { m: Pick<ChatMessage, "media_type" | "media_url"> & { content?: string | null }; muted?: boolean }) {
  const cls = `inline-flex items-center gap-1 ${muted ? "text-muted-foreground/80" : ""}`;
  if (isAudioMessage(m)) return <span className={cls}><Mic size={10} /> Audio de voz</span>;
  if (isVideoMessage(m)) return <span className={cls}><Film size={10} /> Vídeo</span>;
  if (isImageMessage(m)) return <span className={cls}><ImageIcon size={10} /> Foto</span>;
  if (m.media_type === "file" && m.media_url) return <span className={cls}><Paperclip size={10} /> Archivo</span>;
  if (m.media_url) return <span className={cls}><SmilePlus size={10} /> Sticker</span>;
  return <span>{m.content || "Mensaje"}</span>;
}

/** Convierte el error técnico del chat en una pista útil para el usuario. */
function connHint(msg: string): string {
  if (/invalid api key|apikey|401|invalid key/i.test(msg))
    return "La anon key guardada no es válida. Cópiala de Supabase → Project Settings → API Keys (empieza por eyJ… o sb_publishable_) y guárdala en ⋮ → Supabase → «Pegar claves». Si el error persiste, usa «Restablecer la conexión» en el login.";
  if (/infinite recursion|recursion detected|recursive/i.test(msg))
    return "Hay políticas de seguridad antiguas en las tablas del chat que causan un bucle. Revisa los permisos de la base de datos o contacta con el administrador.";
  if (/permission denied|row-level security|42501|PGRST301|new row violates|violates row-level/i.test(msg))
    return "Las tablas existen pero los permisos (RLS) bloquean el chat: revisa los permisos de la base de datos o entra de nuevo con tu cuenta.";
  if (/failed to fetch|networkerror|load failed|network request failed|ERR_/i.test(msg))
    return "El servidor de Supabase no respondió. No es necesariamente tu internet: puede ser un bloqueo temporal o del dominio en esta vista previa. Reintenta en unos segundos o revisa la URL y la anon key (⋮ → Supabase).";
  return "Revisa que la URL y la anon key sean correctas (Supabase → Project Settings → API Keys).";
}

/** Explica el motivo REAL de un fallo de envío, en lugar de culpar a la conexión del usuario. */
function sendErrorDetail(err: unknown): { title: string; desc: string; action?: "install" } {
  const msg = (err as Error)?.message ?? "";
  const code = (err as { code?: string })?.code;
  if (code === CHAT_ERR.AUTH_REQUIRED || code === CHAT_ERR.REAL_AUTH_REQUIRED) {
    return {
      title: "Inicia sesión para enviar mensajes",
      desc:
        code === CHAT_ERR.REAL_AUTH_REQUIRED
          ? "Tu base de datos está conectada pero esta cuenta es local. Entra con tu cuenta de Supabase (⋮ → Cerrar sesión → login) y vuelve."
          : "El chat necesita una sesión activa. Inicia sesión y vuelve.",
    };
  }
  if (/invalid api key|401|apikey|invalid key/i.test(msg))
    return {
      title: "La clave de Supabase no es válida",
      desc: "Revisa la anon key (empieza por eyJ… o sb_publishable_) en ⋮ → Supabase y guárdala de nuevo.",
    };
  if (/permission denied|row-level security|42501|pgrst301|new row violates|infinite recursion/i.test(msg))
    return {
      title: "Los permisos bloquean el envío",
      desc: "Revisa los permisos de la base de datos o entra con tu cuenta de Supabase.",
    };
  if (/schema cache/i.test(msg) || /could not find the .* column/i.test(msg) || code === "PGRST204")
    return {
      title: "La tabla del chat está desactualizada",
      desc: "La tabla del chat no está actualizada. Contacta con el administrador para actualizar el esquema.",
      action: "install",
    };
  if (/foreign key|23503|does not exist|undefined_table|42p01/i.test(msg))
    return {
      title: "Falta algo en la base de datos",
      desc: "Parece que tu cuenta no tiene perfil en la base o falta una tabla. Entra con tu cuenta de Supabase.",
    };
  if (isNetworkError(err))
    return {
      title: "El servidor del chat no respondió",
      desc: "No es un problema de tu internet: el servidor no respondió. Tu mensaje quedó guardado y se enviará solo cuando se restablezca.",
    };
  return { title: "No se pudo enviar el mensaje", desc: msg.slice(0, 220) || "Error desconocido. Reinténtalo." };
}

function Avatar({ p, name, size = 40 }: { p?: Profile | null; name?: string; size?: number }) {
  const label = (p?.display_name || p?.username || name || "?").trim().charAt(0).toUpperCase();
  return <SharedAvatar p={p} size={size} label={label} />;
}

function BubbleActions({ mine, copied, onCopy, onReply }: { mine: boolean; copied: boolean; onCopy: () => void; onReply: () => void }) {
  return (
    <div className={`absolute top-1/2 -translate-y-1/2 ${mine ? "-left-2" : "-right-2"} hidden group-hover:flex gap-0.5 bg-background border border-border rounded-lg p-0.5 shadow-md z-10`}>
      <button onClick={onCopy} title="Copiar" className="w-6 h-6 grid place-items-center rounded-md hover:bg-muted/70 text-muted-foreground">
        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
      </button>
      <button onClick={onReply} title="Responder" className="w-6 h-6 grid place-items-center rounded-md hover:bg-muted/70 text-muted-foreground">
        <Reply size={12} />
      </button>
    </div>
  );
}

/** Formatea segundos como m:ss (o ss) para la duración del audio. */
function fmtDur(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const secs = Math.round(s);
  const m = Math.floor(secs / 60);
  const r = secs % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

// Elemento de audio que está sonando en este momento (solo uno a la vez).
let currentAudio: HTMLAudioElement | null = null;

/** Burbuja de audio de voz: play/pausa, forma de onda animada y duración. */
function AudioBubble({ url, mine, duration }: { url: string; mine: boolean; duration: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(duration || 0);

  // Barras decorativas de la forma de onda (estáticas; el progreso las ilumina).
  const bars = useRef<number[]>([]);
  if (!bars.current.length) {
    bars.current = Array.from({ length: 22 }, () => 0.35 + Math.random() * 0.65);
  }

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      // Pausa cualquier otro audio que esté sonando.
      if (currentAudio && currentAudio !== el) {
        try {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        } catch { /* noop */ }
      }
      currentAudio = el;
      void el.play().catch(() => setPlaying(false));
    }
  };

  return (
    <div className={`flex items-center gap-2 min-w-[200px] max-w-[240px] ${mine ? "flex-row" : "flex-row-reverse"}`}>
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 transition active:scale-90 ${
          mine ? "bg-white/25 text-white hover:bg-white/30" : "grad-brand text-primary-foreground shadow-sm"
        }`}
      >
        {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        {/* Forma de onda */}
        <div className={`flex items-center gap-[2px] h-8 ${mine ? "justify-start" : "justify-end"}`}>
          {bars.current.map((h, i) => {
            const lit = progress * bars.current.length >= i;
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-colors duration-100 ${
                  mine ? "bg-white/25" : "bg-primary/20"
                } ${lit ? (mine ? "!bg-white" : "!bg-primary") : ""}`}
                style={{ height: `${Math.round(h * 32)}px` }}
              />
            );
          })}
        </div>
        {/* Progreso + duración */}
        <div className={`flex items-center gap-1.5 text-[9px] ${mine ? "text-white/70" : "text-muted-foreground/70"}`}>
          <span className="font-mono tabular-nums">{fmtDur(progress > 0 ? time : dur)}</span>
          <div className="flex-1 h-1 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
            <div
              className={`h-full rounded-full ${mine ? "bg-white/80" : "bg-primary"}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="font-mono tabular-nums">{fmtDur(dur)}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDur(d);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setTime(el.currentTime);
          if (isFinite(el.duration) && el.duration > 0) setProgress(el.currentTime / el.duration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setTime(0);
        }}
        className="hidden"
      />
    </div>
  );
}

/** URL lista para el <img>/<audio>: las URLs http se usan tal cual (legado);
 *  las rutas se resuelven con la firma cacheada (permanente). */
function resolveMediaUrl(u: string | null | undefined, cache: Map<string, string>): string | null {
  if (!u) return null;
  if (/^https?:/.test(u)) return u;
  return cache.get(u) ?? null;
}

/* ─── Tarjeta de perfil compartido: el enlace /profile/<id> se muestra con foto y bio ─── */
const profileCardCache = new Map<string, Profile | null>();

function extractProfileLink(content: string): string | null {
  const m = content.match(/\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

function ProfileLinkCard({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null | "loading">(() =>
    profileCardCache.has(userId) ? (profileCardCache.get(userId) ?? null) : "loading"
  );
  useEffect(() => {
    let alive = true;
    if (profileCardCache.has(userId)) return;
    fetchChatProfiles([userId])
      .then((map) => {
        profileCardCache.set(userId, map.get(userId) ?? null);
        if (alive) setProfile(map.get(userId) ?? null);
      })
      .catch(() => {
        if (alive) setProfile(null);
      });
    return () => { alive = false; };
  }, [userId]);

  if (profile === "loading") {
    return (
      <div className="mt-1.5 w-60 max-w-full rounded-xl border border-border bg-card shadow-sm p-2.5 animate-pulse">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-full bg-primary/15 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-1/3 rounded bg-primary/15" />
            <div className="h-2 w-2/3 rounded bg-primary/10" />
          </div>
        </div>
      </div>
    );
  }
  if (!profile) return null;

  return (
    <Link
      to="/profile/$userId"
      params={{ userId }}
      className="mt-1.5 block w-60 max-w-full rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-px active:scale-[0.99] group"
    >
      <div className="flex items-center gap-1.5 px-2.5 pt-2 text-[9px] font-display font-bold tracking-[0.16em] text-primary/90 uppercase">
        <ExternalLink size={10} /> Perfil compartido
      </div>
      <div className="flex items-center gap-2.5 p-2.5 pt-1.5">
        <Avatar p={profile} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[13px] font-display font-bold truncate text-foreground">
              {profile.display_name || profile.username || "Jugador"}
            </span>
            <span className="shrink-0 text-[10px] font-mono text-primary/90 truncate">@{profile.username ?? "?"}</span>
          </div>
          {profile.bio ? (
            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{profile.bio}</div>
          ) : (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">Toca para ver su perfil</div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-center gap-0.5 text-primary/80 group-hover:text-primary transition-colors">
          <ChevronRight size={15} />
        </div>
      </div>
    </Link>
  );
}

function PortfolioShareCard({ share, onOpen }: { share: PortfolioSharePayload; onOpen: () => void }) {
  const { owner, portfolio } = share;
  const shownSkills = portfolio.skills.slice(0, 4);
  return (
    <div className="m3-card m3-card-outlined mt-2 w-full max-w-[21rem] overflow-hidden text-card-foreground">
      <div className="border-b border-primary/20 bg-accent px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-1.5 text-[9px] font-display font-bold tracking-[0.16em] text-primary uppercase">
          <Briefcase size={10} /> Portafolio compartido
        </div>
        <div className="mt-2 flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${portfolio.accentColor}18`, color: portfolio.accentColor }}>
            <Trophy size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-display font-bold truncate">{owner.displayName}</div>
            {owner.username && <div className="text-[10px] font-mono text-primary/85 truncate">@{owner.username}</div>}
          </div>
        </div>
      </div>
      <div className="bg-card p-3">
        <div className="text-[13px] font-semibold leading-snug line-clamp-2">{portfolio.headline}</div>
        {portfolio.bio && <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">{portfolio.bio}</p>}
        {(shownSkills.length > 0 || portfolio.achievements.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
            {shownSkills.map((skill) => (
              <span key={skill} className="px-2 py-0.5 rounded-full border text-[9px] font-medium" style={{ borderColor: `${portfolio.accentColor}45`, color: portfolio.accentColor, background: `${portfolio.accentColor}10` }}>{skill}</span>
            ))}
            {portfolio.achievements.length > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Trophy size={10} style={{ color: portfolio.accentColor }} />{portfolio.achievements.length} logro{portfolio.achievements.length === 1 ? "" : "s"}</span>}
          </div>
        )}
        <button onClick={onOpen} className="mt-3 w-full h-8 rounded-lg grad-brand text-primary-foreground text-[10px] font-display font-semibold tracking-wide flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
          <Trophy size={12} /> Abrir portafolio
        </button>
      </div>
    </div>
  );
}

function PostShareCard({ share, onOpen }: { share: PostSharePayload; onOpen: () => void }) {
  const { owner, post } = share;
  const kindLabel: Record<PostSharePayload["post"]["kind"], string> = {
    post: "Publicación compartida",
    game: "Juego compartido",
    art: "Arte compartido",
    gallery: "Galería compartida",
    image: "Imagen compartida",
    video: "Vídeo compartido",
    link: "Enlace compartido",
  };
  return (
    <div className="m3-card m3-card-outlined mt-2 w-full max-w-[21rem] overflow-hidden text-card-foreground">
      <div className="h-1 grad-brand-fade" />
      <div className="bg-card p-3">
        <div className="flex items-center gap-2 text-[9px] font-display font-bold uppercase tracking-[0.16em] text-primary"><Send size={10} /> {kindLabel[post.kind]}</div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/20 bg-primary/10 text-[11px] font-display font-bold text-primary">
            {owner.avatarUrl ? <img src={owner.avatarUrl} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : owner.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0"><div className="truncate text-[12px] font-display font-bold">{owner.displayName}</div>{owner.username && <div className="truncate text-[10px] font-mono text-primary/85">@{owner.username}</div>}</div>
        </div>
        <div className="mt-3"><SharedPostDetails post={post} compact /></div>
        <button type="button" onClick={onOpen} className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg grad-brand text-[10px] font-display font-semibold tracking-wide text-primary-foreground transition-transform active:scale-[0.98]"><ExternalLink size={12} /> Abrir publicación</button>
      </div>
    </div>
  );
}

/** Resalta las menciones @usuario dentro del texto (enlazando al perfil si se conoce). */
function renderContentWithMentions(content: string, mine: boolean, senders: Map<string, Profile>): ReactNode[] {
  const parts = content.split(/(@[\w.]+)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1 && part.startsWith("@") && part.length > 1) {
      const uname = part.slice(1).toLowerCase();
      const prof = Array.from(senders.values()).find((p) => (p.username ?? "").toLowerCase() === uname);
      const cls = mine
        ? "font-semibold text-primary-foreground underline decoration-white/50 underline-offset-2"
        : "font-semibold text-primary underline decoration-primary/40 underline-offset-2";
      if (prof) {
        return (
          <Link key={i} to="/profile/$userId" params={{ userId: prof.id }} className={cls} onClick={(e) => e.stopPropagation()}>
            {part}
          </Link>
        );
      }
      return (
        <span key={i} className={cls}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function MessageBubble({
  m,
  mine,
  sender,
  senders,
  reply,
  mediaUrl,
  copied,
  onCopy,
  onReply,
  onOpenPortfolio,
  onOpenPost,
}: {
  m: ChatMessage;
  mine: boolean;
  sender?: Profile | null;
  senders: Map<string, Profile>;
  reply?: ChatMessage | null;
  mediaUrl: string | null;
  copied: boolean;
  onCopy: () => void;
  onReply: () => void;
  onOpenPortfolio: (share: PortfolioSharePayload) => void;
  onOpenPost: (share: PostSharePayload) => void;
}) {
  const portfolioShare = parsePortfolioShare(m.content);
  const postShare = parsePostShare(m.content);
  const contentWithoutPortfolio = portfolioShare ? stripPortfolioShare(m.content) : m.content;
  const contentWithoutShares = postShare ? stripPostShare(contentWithoutPortfolio) : contentWithoutPortfolio;
  const contentProfileId = contentWithoutShares ? extractProfileLink(contentWithoutShares) : null;
  // Si el mensaje contiene un enlace de perfil, la URL cruda no se muestra: la tarjeta lo representa.
  const displayContent =
    contentProfileId && contentWithoutShares
      ? contentWithoutShares.replace(/[^\s]*\/profile\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[^\s]*/gi, "").trim()
      : contentWithoutShares;
  return (
    <div className={`group relative flex gap-2 ${mine ? "justify-end pl-10" : "justify-start pr-10"}`}>
      {!mine && (
        m.sender_id ? (
          <Link to="/profile/$userId" params={{ userId: m.sender_id }} className="shrink-0" onClick={e => e.stopPropagation()}>
            <Avatar p={sender} size={28} />
          </Link>
        ) : (
          <div className="shrink-0"><Avatar p={sender} size={28} /></div>
        )
      )}
      <div className={`flex flex-col min-w-0 max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
        <div className={`mb-0.5 ${mine ? "pr-1" : "pl-1"}`}>
          {m.sender_id ? (
            <Link to="/profile/$userId" params={{ userId: m.sender_id }} className="hover:opacity-80 transition-opacity">
              <UserName p={sender} size="xs" />
            </Link>
          ) : (
            <UserName p={sender} size="xs" />
          )}
        </div>
        <div
          className={
            mine
              ? "grad-brand text-primary-foreground rounded-xl rounded-br-md px-3 py-2 shadow-sm shadow-primary/25"
              : "bg-card border border-border/70 shadow-sm rounded-xl rounded-bl-md px-3 py-2"
          }
        >
          {reply && (
            <div className="mb-1.5 border-l-2 border-primary/50 pl-2 py-0.5 rounded-r-md bg-black/5 dark:bg-white/5 text-[11px] text-muted-foreground line-clamp-2">
              <MediaLabel m={reply} />
            </div>
          )}
          {displayContent && (
            <div className="text-[13px] leading-snug whitespace-pre-wrap break-words">
              {renderContentWithMentions(displayContent, mine, senders)}
            </div>
          )}
          {contentProfileId && <ProfileLinkCard userId={contentProfileId} />}
          {portfolioShare && <PortfolioShareCard share={portfolioShare} onOpen={() => onOpenPortfolio(portfolioShare)} />}
          {postShare && <PostShareCard share={postShare} onOpen={() => onOpenPost(postShare)} />}
          {mediaUrl && isAudioMessage(m) ? (
            <AudioBubble url={mediaUrl} mine={mine} duration={0} />
          ) : m.media_url && !mediaUrl ? (
            <div className="text-[10px] text-muted-foreground/70 py-1.5 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Cargando media…
            </div>
          ) : mediaUrl && isVideoMessage(m) ? (
            <video
              src={mediaUrl}
              controls
              playsInline
              className="max-w-72 max-h-72 rounded-xl mt-0.5 bg-black object-contain"
              preload="metadata"
            />
          ) : mediaUrl && isImageMessage(m) ? (
            <img src={mediaUrl} alt="Foto" className="max-w-72 max-h-72 rounded-xl mt-0.5 object-contain" draggable={false} />
          ) : mediaUrl && m.media_type === "file" ? (
            <a href={mediaUrl} target="_blank" rel="noopener noreferrer" download className="mt-2 flex items-center gap-2 rounded-lg border border-current/20 p-3 text-xs break-all" onClick={e => e.stopPropagation()}>
              <Paperclip size={18} className="shrink-0" />
              <span>{m.content || "Archivo adjunto"}</span>
              <Download size={16} className="shrink-0" />
            </a>
          ) : mediaUrl ? (
            <img src={mediaUrl} alt="Sticker" className="max-w-44 max-h-44 rounded-xl mt-0.5 object-contain" draggable={false} />
          ) : null}
          <div className={`text-[9px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground/70"} text-right`}>{fmtTime(m.created_at)}</div>
        </div>
      </div>
      {mine && (
        m.sender_id ? (
          <Link to="/profile/$userId" params={{ userId: m.sender_id }} className="shrink-0" onClick={e => e.stopPropagation()}>
            <Avatar p={sender} size={28} />
          </Link>
        ) : (
          <div className="shrink-0"><Avatar p={sender} size={28} /></div>
        )
      )}
      <BubbleActions mine={mine} copied={copied} onCopy={onCopy} onReply={onReply} />
    </div>
  );
}

/** Aísla cada mensaje: si uno falla al renderizar, muestra un hueco en vez de tumbar el chat entero. */
class SafeRow extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // Deja visible en consola la causa real del mensaje roto (F12).
    console.error("[chat] mensaje no renderizable:", error);
  }
  render() {
    if (this.state.failed) {
      return (
        <button
          onClick={() => this.setState({ failed: false })}
          title="Toca para reintentar"
          className="mx-auto flex justify-center py-2 group"
        >
          <span className="text-[10px] text-muted-foreground/60 px-3 py-1.5 rounded-lg border border-border bg-card group-hover:text-muted-foreground group-hover:border-primary/30 transition">
            No se pudo mostrar este mensaje · toca para reintentar
          </span>
        </button>
      );
    }
    return this.props.children;
  }
}

/** Aviso del grupo: solo lo publica el administrador y lo ve toda la comunidad. */
function AnnouncementCard({ m, sender }: { m: ChatMessage; sender?: Profile | null }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 grad-brand-soft px-3.5 py-3 shadow-sm">

      <div className="relative flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg grad-brand text-primary-foreground grid place-items-center shrink-0">
          <Megaphone size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-display tracking-[0.18em] text-primary font-bold">AVISO DE LA COMUNIDAD</span>
            <span className="text-[9px] text-muted-foreground/70">
              {sender?.display_name || sender?.username ? `${sender?.display_name || sender?.username} · ` : ""}
              {fmtDay(m.created_at)}
            </span>
          </div>
          <p className="text-[13px] leading-snug font-medium mt-1 whitespace-pre-wrap break-words">{m.content}</p>
        </div>
      </div>
    </div>
  );
}

/** Encuesta del chat: vota, recuento en vivo y cierre por el administrador. */
function PollCard({
  m,
  poll,
  sender,
  votingId,
  closingId,
  canClose,
  onVote,
  onClose,
}: {
  m: ChatMessage;
  poll?: ChatPoll | null;
  sender?: Profile | null;
  votingId: string | null;
  closingId: string | null;
  canClose: boolean;
  onVote: (optionIndex: number) => void;
  onClose: () => void;
}) {
  const voted = (poll?.my_votes ?? []).length > 0;
  const total = poll?.total_votes ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-card shadow-sm px-3.5 py-3">

      <div className="relative">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <div className="w-7 h-7 rounded-lg grad-brand text-primary-foreground grid place-items-center shrink-0">
            <BarChart3 size={13} />
          </div>
          <span className="text-[9px] font-display tracking-[0.18em] text-primary font-bold">ENCUESTA</span>
          <span className="text-[9px] text-muted-foreground/70 ml-auto">
            {poll?.status === "closed"
              ? `CERRADA · ${total} ${total === 1 ? "voto" : "votos"}`
              : total > 0
                ? `${total} ${total === 1 ? "voto" : "votos"}`
                : "Sin votos todavía"}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          {sender?.display_name || sender?.username ? `${sender?.display_name || sender?.username} · ` : ""}
          {fmtDay(m.created_at)}
        </div>
        <p className="text-[13px] leading-snug font-semibold mt-1 mb-2.5 whitespace-pre-wrap break-words">
          {m.content || poll?.question}
        </p>
        <div className="space-y-1.5">
          {(poll?.options ?? []).map((opt, i) => {
            const count = poll?.votes.find((v) => v.option_index === i)?.count ?? 0;
            const mine = (poll?.my_votes ?? []).includes(i);
            const closed = poll?.status === "closed";
            const disabled = closed || !!votingId || (voted && !mine);
            return (
              <button
                key={i}
                onClick={() => onVote(i)}
                disabled={disabled}
                className={`relative w-full text-left overflow-hidden rounded-xl border px-3 py-2 transition active:scale-[0.99] ${
                  closed
                    ? "border-border/60 bg-background/50"
                    : mine
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background hover:border-primary/40"
                } disabled:opacity-70`}
              >
                {total > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 bg-primary/10"
                    style={{ width: `${pct(count)}%` }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <span className="flex-1 text-[12px] font-medium truncate">{opt}</span>
                  {total > 0 && (
                    <span className="text-[11px] font-display tabular-nums text-muted-foreground shrink-0">
                      {count} · {pct(count)}%
                    </span>
                  )}
                  {mine && <ShieldCheck size={12} className="text-primary shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
        {poll?.status === "open" && !voted && (
          <div className="text-[10px] text-muted-foreground/70 mt-2 flex items-center gap-1">
            <Sparkles size={10} /> Toca una opción para votar · puedes cambiar tu voto
          </div>
        )}
        {poll?.status === "open" && canClose && (
          <button
            onClick={onClose}
            disabled={!!closingId}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-[10px] font-display tracking-widest text-muted-foreground hover:text-primary hover:border-primary/40 transition disabled:opacity-40"
          >
            {closingId ? <Loader2 size={11} className="animate-spin" /> : <Timer size={11} />}
            {closingId ? "CERRANDO…" : "CERRAR ENCUESTA"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Paquete de regalos de orbes: abre, cuenta atrás y animaciones al abrir/cerrar. */
function GiftCard({
  m,
  gift,
  claiming,
  expiring,
  claimedAmount,
  onClaim,
  onExpire,
}: {
  m: ChatMessage;
  gift?: OrbGift | null;
  claiming: boolean;
  expiring: boolean;
  claimedAmount?: number;
  onClaim: () => void;
  onExpire: () => void;
}) {
  const [burst, setBurst] = useState<"claim" | "close" | "expired" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prevStatus = useRef<string | undefined>(gift?.status);
  const celebratedClose = useRef(false);
  const expiredFired = useRef(false);

  // Tick cada segundo para el countdown de caducidad.
  useEffect(() => {
    if (!gift || gift.status !== "open") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [gift]);

  // Animación de cierre cuando el paquete pasa de abierto a cerrado en vivo.
  useEffect(() => {
    if (!gift) return;
    const prev = prevStatus.current;
    prevStatus.current = gift.status;
    if (gift.status === "closed" && prev === "open" && !celebratedClose.current && claimedAmount == null) {
      celebratedClose.current = true;
      setBurst("close");
      const t = setTimeout(() => setBurst(null), 2600);
      return () => clearTimeout(t);
    }
    if (gift.status === "expired" && prev === "open" && claimedAmount == null) {
      celebratedClose.current = true;
      setBurst("expired");
      const t = setTimeout(() => setBurst(null), 2600);
      return () => clearTimeout(t);
    }
  }, [gift, claimedAmount]);

  // Animación de apertura justo después de reclamar el regalo.
  useEffect(() => {
    if (claimedAmount != null) {
      setBurst("claim");
      const t = setTimeout(() => setBurst(null), 2600);
      return () => clearTimeout(t);
    }
  }, [claimedAmount]);

  if (!gift) {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-[11px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> Cargando regalo…
        </div>
      </div>
    );
  }

  const open = gift.status === "open";
  const expired = gift.status === "expired";
  const progress = Math.min(100, Math.round((gift.claims / Math.max(1, gift.max_claims)) * 100));
  const remaining = Math.max(0, gift.max_claims - gift.claims);
  const unclaimed = Math.max(0, gift.total_orbes - gift.claims * gift.amount_per_person);

  // Tiempo restante para que caduque el paquete (24 h desde su creación).
  const expiresAt = gift.expires_at ? new Date(gift.expires_at).getTime() : 0;
  const msLeft = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const expiredLocal = open && expiresAt > 0 && msLeft <= 0;
  const h = Math.floor(msLeft / 3_600_000);
  const min = Math.floor((msLeft % 3_600_000) / 60_000);
  const s = Math.floor((msLeft % 60_000) / 1000);
  const countdown = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  // Si el paquete superó las 24 h estando abierto, pedimos al servidor que lo
  // caduque y devuelva los orbes no reclamados (una sola vez).
  useEffect(() => {
    if (expiredLocal && !expiredFired.current) {
      expiredFired.current = true;
      onExpire();
    }
  }, [expiredLocal, onExpire]);

  return (
    <div className="flex justify-center px-1">
      <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-primary/25 grad-brand-soft px-3.5 py-3 shadow-sm">


        <div className="relative flex items-center gap-3">
          <motion.div
            animate={open ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ willChange: "transform" }}
            className="w-12 h-12 shrink-0 rounded-xl grad-brand text-primary-foreground grid place-items-center"
          >
            <Gift size={22} strokeWidth={2} />
            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20 pointer-events-none" />
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-display tracking-[0.18em] text-primary font-bold">
              PAQUETE DE REGALOS
            </div>
            <div className="text-[13px] font-semibold leading-tight mt-0.5">{m.content}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Sparkles size={11} className="text-primary" />
              <b>{gift.amount_per_person} orbes</b> por persona · {gift.max_claims} {gift.max_claims === 1 ? "regalo" : "regalos"}
            </div>
          </div>
        </div>

        {/* Progreso de aperturas */}
        <div className="relative mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{gift.claims} / {gift.max_claims} abiertos</span>
            <span className={open ? "text-primary font-semibold" : "text-muted-foreground"}>
              {open ? `${remaining} restan${remaining === 1 ? "" : "n"}` : "Cerrado"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {open && !expiredLocal && (
            <div className="flex items-center justify-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
              <Timer size={10} /> Caduca en {countdown}
            </div>
          )}
          {expired && (
            <div className="flex items-center justify-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
              <Undo2 size={10} /> Caducado · {unclaimed.toLocaleString("es")} orbes devueltos
            </div>
          )}
        </div>

        {/* Acción */}
        <div className="relative mt-3">
          {claimedAmount != null ? (
            <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-display tracking-wider">
              <CheckCircle2 size={13} /> ¡REGALO ABIERTO! +{claimedAmount} ORBES
            </div>
          ) : open && !expiredLocal ? (
            <button
              onClick={onClaim}
              disabled={claiming || expiring}
              className="w-full py-2.5 rounded-lg grad-brand text-primary-foreground text-[11px] font-display tracking-widest active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {claiming ? <Loader2 size={13} className="animate-spin" /> : <Gift size={13} />}
              {claiming ? "ABRIENDO…" : "ABRIR REGALO"}
            </button>
          ) : expired || expiredLocal ? (
            <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-black/[0.04] dark:bg-white/[0.05] text-muted-foreground text-[11px] font-display tracking-wider">
              <Undo2 size={11} /> PAQUETE CADUCADO
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-black/[0.04] dark:bg-white/[0.05] text-muted-foreground text-[11px] font-display tracking-wider">
              <Lock size={11} /> PAQUETE CERRADO
            </div>
          )}
        </div>

        {/* Animaciones: apertura (reclamé) y cierre (se llenó) */}
        <AnimatePresence>
          {burst && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/60 backdrop-blur-[2px]"
            >
              {burst === "claim" ? (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0, y: 14 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  style={{ willChange: "transform, opacity" }}
                  className="text-center px-4"
                >
                  <div className="w-14 h-14 mx-auto mb-2.5 rounded-xl grad-brand text-primary-foreground grid place-items-center">
                    <Sparkles size={26} />
                  </div>
                  <div className="text-sm font-bold text-white drop-shadow">¡+{claimedAmount ?? gift.amount_per_person} ORBES!</div>
                  <div className="text-[10px] text-white/80 mt-0.5">Ya están en tu cuenta</div>
                </motion.div>
              ) : burst === "expired" ? (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  style={{ willChange: "transform, opacity" }}
                  className="text-center px-4"
                >
                  <div className="w-14 h-14 mx-auto mb-2.5 rounded-xl bg-card border border-border text-muted-foreground grid place-items-center">
                    <Undo2 size={24} />
                  </div>
                  <div className="text-sm font-bold text-white drop-shadow">¡El paquete caducó!</div>
                  <div className="text-[10px] text-white/80 mt-0.5">Los orbes no reclamados se devolvieron al creador</div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  style={{ willChange: "transform, opacity" }}
                  className="text-center px-4"
                >
                  <div className="w-14 h-14 mx-auto mb-2.5 rounded-xl bg-card border border-border text-muted-foreground grid place-items-center">
                    <Lock size={24} />
                  </div>
                  <div className="text-sm font-bold text-white drop-shadow">¡Se acabó el paquete!</div>
                  <div className="text-[10px] text-white/80 mt-0.5">Todos los regalos fueron abiertos</div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ChatSection({ myId, onClose, initialText, initialView }: { myId: string | null; onClose: () => void; initialText?: string; initialView?: "group" | "dms" | "groups" }) {
  const [chatInfo, setChatInfo] = useState<{ id: string; name: string; memberCount: number; memberOk?: boolean; local?: boolean } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senders, setSenders] = useState<Map<string, Profile>>(new Map());
  const [sharedPortfolio, setSharedPortfolio] = useState<PortfolioSharePayload | null>(null);
  const [sharedPost, setSharedPost] = useState<PostSharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [myStickers, setMyStickers] = useState<ChatSticker[]>([]);
  const [signedStickers, setSignedStickers] = useState<Map<string, string>>(new Map());
  const [stickerUploading, setStickerUploading] = useState(false);
  // Foto / vídeo pendiente de enviar (subida previa + preview)
  const [pendingMedia, setPendingMedia] = useState<{ file: File; preview: string; kind: "image" | "video" | "file" } | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [sendingAudio, setSendingAudio] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState<boolean>(() => !hasSupabaseConfig());
  const [connecting, setConnecting] = useState(false);
  const [connectUrl, setConnectUrl] = useState("https://gxpgczwkovertezeydkt.supabase.co");
  const [connectKey, setConnectKey] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [initError, setInitError] = useState<"schema" | "conn" | "auth" | "rls" | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  // Paginación por cursor + scroll infinito
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unseen, setUnseen] = useState(0);
  // URLs firmadas de los media de los mensajes (cacheadas: nunca expiran en la base)
  const [signedMedia, setSignedMedia] = useState<Map<string, string>>(new Map());
  // ¿La tabla del chat está desactualizada (sin la columna media_type)?
  // Avisos del grupo y paquetes de regalo (solo el administrador puede crearlos)
  const [isOwner, setIsOwner] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceText, setAnnounceText] = useState("");
  const [announceBusy, setAnnounceBusy] = useState(false);
  const [announceErr, setAnnounceErr] = useState<string | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTitle, setGiftTitle] = useState("");
  const [giftAmount, setGiftAmount] = useState("200");
  const [giftPeople, setGiftPeople] = useState("5");
  const [giftBusy, setGiftBusy] = useState(false);
  const giftBusyRef = useRef(false); // guard síncrono contra dobles toques
  const [giftErr, setGiftErr] = useState<string | null>(null);
  const [myOrbes, setMyOrbes] = useState<number | null>(null);
  // Encuestas del chat (las crea el admin de la comunidad o el creador/admin del grupo)
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [polls, setPolls] = useState<Map<string, ChatPoll>>(new Map());
  const pollsRef = useRef<Map<string, ChatPoll>>(new Map());
  const [votingId, setVotingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  // Administración del grupo: roles (solo el creador) y eliminar grupo
  const [gRoleBusyId, setGRoleBusyId] = useState<string | null>(null);
  const [deleteArm, setDeleteArm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Chats de trabajo: tareas, archivos e hilos (marcador local por chat)
  const [workChatIds, setWorkChatIds] = useState<Set<string>>(() => new Set(listWorkChats()));
  const [cgIsWork, setCgIsWork] = useState(false);
  const [manager, setManager] = useState<"tasks" | "files" | "projects" | "threads" | null>(null);
  const [openThread, setOpenThread] = useState<WorkThread | null>(null);
  const [threads, setThreads] = useState<WorkThread[]>([]);
  // Búsqueda global (mensajes, usuarios, proyectos y archivos)
  const [searchOpen, setSearchOpen] = useState(false);
  const [gifts, setGifts] = useState<Map<string, OrbGift>>(new Map());
  const giftsRef = useRef<Map<string, OrbGift>>(new Map());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [expiringId, setExpiringId] = useState<string | null>(null);
  const [myClaims, setMyClaims] = useState<Map<string, number>>(new Map());
  // Chats individuales (DMs), grupos personalizados y menciones @usuario
  const [view, setView] = useState<"group" | "dms" | "groups">(initialView ?? "group");
  const [dmList, setDmList] = useState<DmChat[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [activeDm, setActiveDm] = useState<DmChat | null>(null);
  const activeDmRef = useRef<DmChat | null>(null);
  activeDmRef.current = activeDm;
  const [groupList, setGroupList] = useState<GroupChat[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null);
  const activeGroupRef = useRef<GroupChat | null>(null);
  activeGroupRef.current = activeGroup;
  // Diálogo: crear grupo
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [cgName, setCgName] = useState("");
  const [cgDesc, setCgDesc] = useState("");
  const [cgAvatarFile, setCgAvatarFile] = useState<File | null>(null);
  const [cgAvatarPreview, setCgAvatarPreview] = useState<string | null>(null);
  const [cgMutuals, setCgMutuals] = useState<Profile[]>([]);
  const [cgSelected, setCgSelected] = useState<Set<string>>(new Set());
  const [cgBusy, setCgBusy] = useState(false);
  const [cgErr, setCgErr] = useState<string | null>(null);
  // Diálogo: info del grupo
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [gInfoMutuals, setGInfoMutuals] = useState<Profile[]>([]);
  const [gInfoBusy, setGInfoBusy] = useState(false);
  const [gInfoErr, setGInfoErr] = useState<string | null>(null);
  // Editar grupo (dentro de info)
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [egName, setEgName] = useState("");
  const [egDesc, setEgDesc] = useState("");
  const [egAvatarFile, setEgAvatarFile] = useState<File | null>(null);
  const [egAvatarPreview, setEgAvatarPreview] = useState<string | null>(null);
  const [egBusy, setEgBusy] = useState(false);
  const [egErr, setEgErr] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCandidates, setMentionCandidates] = useState<Profile[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef<{ start: number; end: number } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cgAvatarRef = useRef<HTMLInputElement>(null);
  const egAvatarRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const sendersRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const prevScrollHeightRef = useRef(0);
  const signedMediaRef = useRef<Map<string, string>>(new Map());

  // Hilo activo: chat de la comunidad (grupo), chat individual (DM) o grupo personalizado.
  const currentChatId = activeGroup ? activeGroup.chat_id : activeDm ? activeDm.chat_id : (chatInfo?.id ?? null);
  const totalDmUnread = dmList.reduce((s, d) => s + (d.unread || 0), 0);
  const totalGroupUnread = groupList.reduce((s, g) => s + (g.unread || 0), 0);
  // Permisos de administración: en la comunidad → isOwner; en un grupo
  // personalizado → según el rol del usuario (owner/admin/moderator).
  const groupRole = activeGroup?.my_role ?? null;
  const canAnnounce =
    view === "group" ? isOwner : groupRole === "owner" || groupRole === "admin" || groupRole === "moderator";
  const canPoll = view === "group" ? isOwner : groupRole === "owner" || groupRole === "admin";
  const canManageMembers = groupRole === "owner" || groupRole === "admin";
  const canDeleteGroup = groupRole === "owner" || groupRole === "admin";
  const canManageRoles = groupRole === "owner";
  // Chat de trabajo: marcado localmente (no es el chat de la comunidad).
  const isWork = !!activeGroup && workChatIds.has(activeGroup.chat_id);
  const canAssignTasks =
    isWork && (groupRole === "owner" || groupRole === "admin" || groupRole === "moderator");
  const myName = myId
    ? senders.get(myId)?.display_name || senders.get(myId)?.username || "Yo"
    : "Yo";
  // Alcance inicial de la búsqueda según el chat en el que estés.
  const searchDefaultScope: "all" | "community" | "work" =
    view === "groups" && activeGroup && isWork
      ? "work"
      : view === "group" && !!chatInfo
        ? "community"
        : "all";

  // Load senders for a batch of messages
  const loadSenders = useCallback(async (msgs: ChatMessage[]) => {
    const ids = Array.from(new Set(msgs.map((m) => m.sender_id).filter(Boolean))) as string[];
    const missing = ids.filter((id) => !sendersRef.current.has(id));
    if (!missing.length) return;
    try {
      const pmap = await fetchChatProfiles(missing);
      for (const id of missing) sendersRef.current.add(id);
      setSenders((prev) => {
        const next = new Map(prev);
        for (const [id, p] of pmap) next.set(id, p);
        return next;
      });
    } catch {
      /* noop */
    }
  }, []);

  // Mi propio perfil siempre disponible (evita "anon" si la carga de perfiles falla)
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    (async () => {
      let p: Profile | null = null;
      try {
        p = await getMyProfile();
      } catch {
        /* noop */
      }
      if (!p) {
        // Cuenta local (o credenciales rotas): el perfil vive en localStorage.
        try {
          const rows = JSON.parse(localStorage.getItem("_local_data_profiles") || "[]") as Profile[];
          p = rows.find((x) => x.id === myId) ?? null;
        } catch {
          /* noop */
        }
      }
      if (cancelled || !p) return;
      sendersRef.current.add(p.id);
      setSenders((prev) => {
        if (prev.has(p.id)) return prev;
        const next = new Map(prev);
        next.set(p.id, p);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [myId]);

  const doConnect = useCallback(() => {
    const res = saveSupabaseCredentials(connectUrl.trim(), connectKey.trim());
    if (!res.ok) {
      setConnectError(res.error ?? "No se pudieron guardar las credenciales");
      return;
    }
    setConnectError(null);
    window.location.reload();
  }, [connectUrl, connectKey]);

  // Preparar el chat comunitario (solo grupo) + cargar mensajes del hilo activo
  useEffect(() => {
    let cancelled = false;
    setInitError(null);
    setErrorDetail("");
    setLoading(true);
    (async () => {
      try {
        if (!chatInfo && !activeDmRef.current && !activeGroupRef.current) {
          const info = await getCommunityChat();
          if (cancelled) return;
          setChatInfo(info);
          // El aviso de «modo local» depende del modo activo real del chat
          // (cuenta local + Supabase conectado también opera en local).
          setIsLocal(!hasSupabaseConfig() || !!info.local);
        }
        if (cancelled) return;
        const threadId = activeGroupRef.current ? activeGroupRef.current.chat_id : activeDmRef.current ? activeDmRef.current.chat_id : (chatInfo?.id ?? null);
        if (!threadId) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { messages: msgs, hasMore: more } = await fetchChatMessages(threadId);
        if (cancelled) return;
        setMessages(msgs);
        setHasMore(more);
        if (msgs.length) cursorRef.current = { created_at: msgs[0].created_at, id: msgs[0].id };
        stickToBottomRef.current = true;
        await loadSenders(msgs);
        if (activeDmRef.current) {
          // Chat individual: no leídos del badge y marcar como leído.
          const unread = activeDmRef.current.unread || 0;
          if (unread > 0) setUnseen(unread >= 100 ? 99 : unread);
          void markDmRead(threadId).catch(() => {});
          setDmList((prev) => prev.map((d) => (d.chat_id === threadId ? { ...d, unread: 0 } : d)));
        } else if (activeGroupRef.current) {
          // Grupo personalizado: marcar como leído y limpiar el badge.
          const unread = activeGroupRef.current.unread || 0;
          if (unread > 0) setUnseen(unread >= 100 ? 99 : unread);
          void markDmRead(threadId).catch(() => {});
          setGroupList((prev) => prev.map((g) => (g.chat_id === threadId ? { ...g, unread: 0 } : g)));
        } else {
          // Chat comunitario: no leídos sincronizados por cuenta (last_read_at),
          // con respaldo local (_chat_last_seen) para modo local/offline.
          try {
            const readAt = await fetchChatReadAt(threadId);
            const lastSeen = readAt ?? Number(localStorage.getItem("_chat_last_seen") ?? 0);
            const missed = msgs.filter((m) => m.sender_id !== myId && new Date(m.created_at).getTime() > lastSeen).length;
            if (missed > 0) setUnseen(missed);
            // Marca como leído en la cuenta (multi-dispositivo); en local solo localStorage.
            if (readAt !== null) void markDmRead(threadId).catch(() => {});
            localStorage.setItem("_chat_last_seen", String(Date.now()));
          } catch {
            /* noop */
          }
        }
      } catch (err) {
        if (cancelled) return;
        const code = (err as { code?: string })?.code;
        if (activeDmRef.current) {
          toast.error("No se pudo cargar el chat individual");
        } else if (code === CHAT_ERR.AUTH_REQUIRED || code === CHAT_ERR.REAL_AUTH_REQUIRED) {
          setInitError("auth");
        } else {
          const msg = (err as Error)?.message ?? "";
          if (/relation .* does not exist|could not find the table|undefined_table|42p01/i.test(msg)) {
            setInitError("schema");
          } else if (/infinite recursion|recursion detected|permission denied|row-level security|42501|PGRST301/i.test(msg)) {
            // Permisos (RLS) del chat desactualizados: se reparan reinstalando las tablas.
            setInitError("rls");
          } else {
            setInitError("conn");
          }
        }
        setErrorDetail((err as Error)?.message ?? "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSenders, retryKey, chatInfo, activeDm, activeGroup]);

  // Texto inicial: mensaje compartido (botón «Compartir en el chat» del perfil).
  useEffect(() => {
    if (!initialText) return;
    setDraft(initialText);
    const t = setTimeout(() => inputRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, [initialText]);

  // Suscripción en tiempo real: INSERT (nuevos), UPDATE (ediciones), DELETE (eliminaciones)
  useEffect(() => {
    if (!currentChatId) return;
    const unsub = subscribeToChat(currentChatId, (ev) => {
      if (ev.type === "INSERT") {
        setMessages((prev) => (prev.some((m) => m.id === ev.message.id) ? prev : [...prev, ev.message]));
        loadSenders([ev.message]);
        if (!stickToBottomRef.current) setUnseen((n) => n + 1);
        else {
          // Marca leído por cuenta (comunidad, DM o grupo) + respaldo local.
          void markDmRead(currentChatId).catch(() => {});
          try { localStorage.setItem("_chat_last_seen", String(Date.now())); } catch { /* noop */ }
        }
      } else if (ev.type === "UPDATE") {
        setMessages((prev) => prev.map((m) => (m.id === ev.message.id ? { ...m, ...ev.message } : m)));
      } else if (ev.type === "DELETE") {
        setMessages((prev) => prev.filter((m) => m.id !== ev.message.id));
      }
    });
    return unsub;
  }, [currentChatId, loadSenders]);

  // ¿Es administrador de la comunidad? La cuenta propietaria y cualquiera con
  // el rol admin pueden publicar avisos y crear paquetes de regalo; el
  // servidor lo refuerza (is_owner_admin).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email && user.email.toLowerCase() === "linkyteam989@gmail.com") {
          if (!cancelled) setIsOwner(true);
          return;
        }
        const ok = await isAdmin().catch(() => false);
        if (!cancelled) setIsOwner(ok);
      } catch {
        if (!cancelled) setIsOwner(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carga el estado de los paquetes de regalo referenciados en los mensajes.
  useEffect(() => {
    const ids = Array.from(new Set(messages.map((m) => m.gift_id).filter((x): x is string => !!x)));
    const need = ids.filter((id) => !giftsRef.current.has(id));
    if (!need.length) return;
    let cancelled = false;
    (async () => {
      for (const id of need) {
        try {
          const g = await fetchOrbGift(id);
          if (cancelled || !g) continue;
          giftsRef.current.set(id, g);
        } catch {
          /* noop */
        }
      }
      if (!cancelled) setGifts(new Map(giftsRef.current));
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  // Carga el estado de las encuestas referenciadas en los mensajes.
  useEffect(() => {
    const ids = Array.from(new Set(messages.map((m) => m.poll_id).filter((x): x is string => !!x)));
    const need = ids.filter((id) => !pollsRef.current.has(id));
    if (!need.length) return;
    let cancelled = false;
    (async () => {
      for (const id of need) {
        try {
          const p = await fetchPoll(id);
          if (cancelled || !p) continue;
          pollsRef.current.set(id, p);
        } catch {
          /* noop */
        }
      }
      if (!cancelled) setPolls(new Map(pollsRef.current));
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  // Realtime de los paquetes: aperturas y cierres en vivo para todos.
  useEffect(() => {
    if (!chatInfo) return;
    const unsub = subscribeToOrbGifts((type, g) => {
      setGifts((prev) => {
        const next = new Map(prev);
        if (type === "DELETE") next.delete(g.id);
        else next.set(g.id, { ...(next.get(g.id) ?? ({} as OrbGift)), ...g });
        return next;
      });
    });
    return unsub;
  }, [chatInfo]);

  // Realtime de las encuestas: votos y cierres llegan en vivo a todos.
  useEffect(() => {
    if (!currentChatId) return;
    const unsub = subscribeToPolls(currentChatId, (_type, pollId) => {
      void fetchPoll(pollId)
        .then((p) => {
          if (!p) return;
          pollsRef.current.set(p.id, p);
          setPolls(new Map(pollsRef.current));
        })
        .catch(() => {});
    });
    return unsub;
  }, [currentChatId]);

  // Hilos del chat de trabajo: recarga las tarjetas al cambiar de chat o gestor.
  useEffect(() => {
    if (activeGroup && workChatIds.has(activeGroup.chat_id)) {
      setThreads(listThreads(activeGroup.chat_id));
    } else {
      setThreads([]);
    }
  }, [activeGroup, workChatIds, manager, openThread]);

  // Reenvía automáticamente los mensajes que quedaron pendientes por un fallo de
  // red (el servidor no respondió) cuando el chat está listo o vuelve la conexión.
  useEffect(() => {
    if (!chatInfo) return;
    let cancelled = false;
    const flush = async () => {
      try {
        const sent = await flushPendingMessages();
        if (cancelled || !sent) return;
        toast.success(sent === 1 ? "Tu mensaje pendiente se envió ✓" : `Se enviaron ${sent} mensajes pendientes ✓`);
      } catch {
        /* noop */
      }
    };
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [chatInfo]);

  // Auto-scroll solo si el usuario está pegado al final (nunca al cargar histórico)
  useEffect(() => {
    if (stickToBottomRef.current && !loading) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, loading]);

  // Firma las rutas de media de los mensajes al cargarlos (cacheada). Los mensajes
  // guardan la RUTA del archivo (no una URL firmada que expira), así el media
  // permanece accesible siempre mientras se re-firma al abrir el chat.
  useEffect(() => {
    if (!messages.length) return;
    const paths = Array.from(
      new Set(messages.map((m) => m.media_url).filter((u): u is string => !!u && !/^https?:/.test(u)))
    );
    const need = paths.filter((p) => !signedMediaRef.current.has(p));
    if (!need.length) return;
    let cancelled = false;
    (async () => {
      try {
        const signed = await signMedia(need);
        if (cancelled) return;
        const fresh = new Map<string, string>();
        need.forEach((p, i) => {
          if (signed[i]) fresh.set(p, signed[i]);
        });
        if (!fresh.size) return;
        signedMediaRef.current = new Map([...signedMediaRef.current, ...fresh]);
        setSignedMedia(signedMediaRef.current);
      } catch {
        /* noop: se reintenta en el próximo cambio de mensajes */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  // Carga la página anterior (scroll infinito hacia arriba)
  const loadOlder = useCallback(async () => {
    if (!currentChatId || loadingMore || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    const el = listRef.current;
    prevScrollHeightRef.current = el?.scrollHeight ?? 0;
    try {
      const { messages: older, hasMore: more } = await fetchChatMessages(currentChatId, {
        before: cursorRef.current,
      });
      if (!older.length) {
        setHasMore(false);
        return;
      }
      cursorRef.current = { created_at: older[0].created_at, id: older[0].id };
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
      setHasMore(more);
      // Mantener la posición visual tras insertar mensajes antiguos arriba.
      requestAnimationFrame(() => {
        const el2 = listRef.current;
        if (el2) el2.scrollTop = el2.scrollHeight - prevScrollHeightRef.current;
      });
    } catch {
      toast.error("No se pudieron cargar mensajes anteriores");
    } finally {
      setLoadingMore(false);
    }
  }, [chatInfo, hasMore, loadingMore]);

  const onScrollList = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    if (nearBottom && unseen > 0) {
      setUnseen(0);
      if (currentChatId) void markDmRead(currentChatId).catch(() => {});
      try { localStorage.setItem("_chat_last_seen", String(Date.now())); } catch { /* noop */ }
    }
    if (el.scrollTop < 60 && hasMore && !loadingMore) void loadOlder();
  }, [hasMore, loadingMore, loadOlder, unseen]);

  const jumpToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    setUnseen(0);
    if (currentChatId) void markDmRead(currentChatId).catch(() => {});
    try { localStorage.setItem("_chat_last_seen", String(Date.now())); } catch { /* noop */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [currentChatId]);

  // Cargar stickers al abrir el panel
  useEffect(() => {
    if (!stickersOpen) return;
    (async () => {
      try {
        const st = await fetchMyStickers();
        setMyStickers(st);
        const paths = st.map((s) => s.path);
        const signed = await signMedia(paths);
        const map = new Map<string, string>();
        paths.forEach((p, i) => map.set(p, signed[i] ?? p));
        setSignedStickers(map);
      } catch {
        /* noop */
      }
    })();
  }, [stickersOpen]);

  /** Muestra el motivo real de un fallo de envío. */
  const reportSendError = useCallback((err: unknown) => {
    const detail = sendErrorDetail(err);
    toast.error(detail.title, { description: detail.desc });
  }, []);

  const handleSend = useCallback(
    async (mediaUrl?: string) => {
      const content = draft.trim();
      if (!currentChatId) {
        toast.error("El chat aún no está conectado", {
          description: "Reintenta en unos segundos.",
        });
        return;
      }
      if (!content && !mediaUrl) return;
      try {
        const sent = await sendChatMessage(currentChatId, {
          content: content || undefined,
          mediaUrl: mediaUrl ?? undefined,
          replyToId: replyTo?.id ?? null,
        });
        // Eco inmediato (el realtime lo confirmará; se deduplica por id).
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        setDraft("");
        setReplyTo(null);
        setStickersOpen(false);
        // En un chat individual: refrescar la lista (preview + último mensaje).
        if (activeDmRef.current) {
          setDmList((prev) => prev.map((d) => (d.chat_id === sent.chat_id ? { ...d, last_message: sent, last_at: sent.created_at, unread: 0 } : d)));
          void markDmRead(sent.chat_id).catch(() => {});
        } else if (activeGroupRef.current) {
          // Grupo personalizado: refrescar la lista (preview + último mensaje).
          setGroupList((prev) => prev.map((g) => (g.chat_id === sent.chat_id ? { ...g, last_message: sent, last_at: sent.created_at, unread: 0 } : g)));
          void markDmRead(sent.chat_id).catch(() => {});
        } else if (content) {
          // Grupo: avisar a los usuarios mencionados (@usuario).
          void notifyMentions(content);
        }
        if (inputRef.current) inputRef.current.style.height = "auto";
        // Si hay mensajes pendientes por un fallo de red anterior, la conexión
        // acaba de funcionar: los reenviamos ahora mismo.
        void flushPendingMessages()
          .then((n) => {
            if (n > 0)
              toast.success(n === 1 ? "Tu mensaje pendiente se envió ✓" : `Se enviaron ${n} mensajes pendientes ✓`);
          })
          .catch(() => {});
      } catch (err) {
        // Fallo de red: guardamos el mensaje en la cola local y se reenviará solo.
        if (isNetworkError(err) && currentChatId) {
          queuePendingMessage(currentChatId, {
            content: content || undefined,
            mediaUrl,
            mediaType: mediaUrl ? "image" : undefined,
            replyToId: replyTo?.id ?? null,
          });
        }
        reportSendError(err);
      }
    },
    [currentChatId, draft, replyTo]
  );

  const sharePortfolioInCurrentChat = useCallback(async () => {
    if (!currentChatId || !myId) {
      toast.error("Inicia sesión para compartir tu Portafolio");
      return;
    }
    const portfolio = getPortfolio(myId);
    if (!portfolio) {
      toast.error("Aún no tienes Portafolio", { description: "Créalo desde tu perfil para poder compartirlo." });
      return;
    }
    const profile = senders.get(myId) ?? await getMyProfile().catch(() => null);
    if (!profile) {
      toast.error("No se pudo identificar tu perfil", { description: "Reintenta en unos segundos." });
      return;
    }
    const content = serializePortfolioShare({
      owner: { id: profile.id, displayName: profile.display_name || profile.username, username: profile.username },
      portfolio,
    });
    try {
      const sent = await sendChatMessage(currentChatId, { content });
      setMessages((prev) => (prev.some((message) => message.id === sent.id) ? prev : [...prev, sent]));
      if (activeDmRef.current) {
        setDmList((prev) => prev.map((chat) => chat.chat_id === sent.chat_id ? { ...chat, last_message: sent, last_at: sent.created_at, unread: 0 } : chat));
        void markDmRead(sent.chat_id).catch(() => {});
      } else if (activeGroupRef.current) {
        setGroupList((prev) => prev.map((chat) => chat.chat_id === sent.chat_id ? { ...chat, last_message: sent, last_at: sent.created_at, unread: 0 } : chat));
        void markDmRead(sent.chat_id).catch(() => {});
      }
      toast.success("Portafolio compartido en este chat");
    } catch (error) {
      if (isNetworkError(error)) queuePendingMessage(currentChatId, { content });
      reportSendError(error);
    }
  }, [currentChatId, myId, reportSendError, senders]);

  const copyMessage = useCallback(async (m: ChatMessage) => {
    if (!m.content) return;
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1400);
    } catch {
      /* noop */
    }
  }, []);

  // ───── Enviar fotos y vídeos ─────

  /** Selecciona una foto o vídeo y lo deja pendiente (con preview). */
  const pickMedia = useCallback((file: File | null) => {
    if (!file || !currentChatId) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "file";
    if (file.size > 50 * 1024 * 1024) {
      toast.error("El archivo supera 50 MB", { description: "Comprime el vídeo o elige otro archivo." });
      return;
    }
    setPendingMedia((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return { file, preview: URL.createObjectURL(file), kind };
    });
  }, [currentChatId]);

  /** Sube y envía la foto/vídeo pendiente. */
  const sendPendingMedia = useCallback(async () => {
    if (!pendingMedia || !currentChatId || mediaUploading) return;
    setMediaUploading(true);
    try {
      const path = await uploadChatMedia(pendingMedia.file, myId ?? "me");
      const [signed] = await signMedia([path]);
      if (signed) {
        signedMediaRef.current = new Map(signedMediaRef.current).set(path, signed);
        setSignedMedia(signedMediaRef.current);
      }
      const caption = draft.trim();
      const sent = await sendChatMessage(currentChatId, {
        content: pendingMedia.kind === "file" ? `${pendingMedia.file.name}${caption ? `\n${caption}` : ""}` : caption || undefined,
        mediaUrl: path,
        mediaType: pendingMedia.kind,
        replyToId: replyTo?.id ?? null,
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setDraft("");
      setReplyTo(null);
      setStickersOpen(false);
      setPendingMedia((prev) => {
        if (prev) URL.revokeObjectURL(prev.preview);
        return null;
      });
      if (activeDmRef.current) {
        setDmList((prev) => prev.map((d) => (d.chat_id === sent.chat_id ? { ...d, last_message: sent, last_at: sent.created_at, unread: 0 } : d)));
        void markDmRead(sent.chat_id).catch(() => {});
      } else if (activeGroupRef.current) {
        setGroupList((prev) => prev.map((g) => (g.chat_id === sent.chat_id ? { ...g, last_message: sent, last_at: sent.created_at, unread: 0 } : g)));
        void markDmRead(sent.chat_id).catch(() => {});
      }
    } catch (err) {
      // Conservar el archivo pendiente para reintentar: su nombre no es una URL subida.
      reportSendError(err);
    } finally {
      setMediaUploading(false);
    }
  }, [pendingMedia, currentChatId, mediaUploading, myId, replyTo, draft]);

  const publishAnnouncement = useCallback(async () => {
    const text = announceText.trim();
    if (!chatInfo || !text) return;
    setAnnounceBusy(true);
    setAnnounceErr(null);
    const r = await createAnnouncement(chatInfo.id, text);
    setAnnounceBusy(false);
    if (!r.ok) {
      setAnnounceErr(r.error ?? "No se pudo publicar el aviso");
      return;
    }
    if (r.message) {
      const msg = r.message;
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      void loadSenders([msg]);
    }
    setAnnounceOpen(false);
    setAnnounceText("");
    toast.success("Aviso publicado para toda la comunidad");
  }, [chatInfo, announceText, loadSenders]);

  // Encuestas del chat: las crea el admin de la comunidad (chat grupal) o el
  // creador/admin de un grupo personalizado. Cualquier miembro vota una vez.
  const handleCreatePoll = useCallback(async () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!currentChatId) return;
    if (!question || options.length < 2) {
      setPollErr("Escribe la pregunta y al menos 2 opciones.");
      return;
    }
    setPollBusy(true);
    setPollErr(null);
    const r = await createPoll(currentChatId, { question, options, multiple: false });
    setPollBusy(false);
    if (!r.ok) {
      setPollErr(r.error ?? "No se pudo crear la encuesta");
      return;
    }
    if (r.message) {
      const msg = r.message;
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      void loadSenders([msg]);
    }
    setPollOpen(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    toast.success("Encuesta publicada en el chat");
  }, [currentChatId, pollQuestion, pollOptions, loadSenders]);

  const handleVotePoll = useCallback(
    async (poll: ChatPoll, optionIndex: number) => {
      if (votingId || poll.status !== "open") return;
      setVotingId(poll.id);
      const r = await votePoll(poll.id, optionIndex);
      if (r.ok) {
        const p = await fetchPoll(poll.id).catch(() => null);
        if (p) {
          pollsRef.current.set(p.id, p);
          setPolls(new Map(pollsRef.current));
        }
      } else {
        toast.error(r.error ?? "No se pudo registrar tu voto");
      }
      setVotingId(null);
    },
    [votingId]
  );

  const handleClosePoll = useCallback(async (poll: ChatPoll) => {
    if (closingId) return;
    setClosingId(poll.id);
    const r = await closePoll(poll.id);
    if (r.ok) {
      const p = await fetchPoll(poll.id).catch(() => null);
      if (p) {
        pollsRef.current.set(p.id, p);
        setPolls(new Map(pollsRef.current));
      }
      toast.success("Encuesta cerrada");
    } else {
      toast.error(r.error ?? "No se pudo cerrar la encuesta");
    }
    setClosingId(null);
  }, [closingId]);

  const createGiftPackage = useCallback(async () => {
    if (!chatInfo) return;
    // Guard síncrono: dos toques seguidos pasan el disabled={giftBusy} por el
    // cierre obsoleto de React y creaban paquetes duplicados (se triplicaba).
    if (giftBusyRef.current) return;
    const amount = Math.floor(Number(giftAmount) || 0);
    const people = Math.floor(Number(giftPeople) || 0);
    if (amount < 100 || amount % 2 !== 0) {
      setGiftErr("La cantidad por persona debe ser par y de mínimo 100 orbes.");
      return;
    }
    if (people < 1 || people > 1000) {
      setGiftErr("La cantidad de personas debe estar entre 1 y 1000.");
      return;
    }
    if (myOrbes != null && amount * people > myOrbes) {
      setGiftErr(`Necesitas ${amount * people} orbes y tienes ${myOrbes}.`);
      return;
    }
    giftBusyRef.current = true;
    setGiftBusy(true);
    setGiftErr(null);
    try {
      const r = await createOrbGift(chatInfo.id, {
        title: giftTitle.trim(),
        amountPerPerson: amount,
        maxClaims: people,
      });
      if (!r.ok) {
        setGiftErr(r.error ?? "No se pudo crear el paquete de regalos");
        return;
      }
      if (r.message) {
        const msg = r.message;
        setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
        void loadSenders([msg]);
      }
      if (r.giftId) {
        const g = await fetchOrbGift(r.giftId).catch(() => null);
        if (g) {
          giftsRef.current.set(g.id, g);
          setGifts(new Map(giftsRef.current));
        }
      }
      setGiftOpen(false);
      setGiftTitle("");
      setGiftAmount("200");
      setGiftPeople("5");
      setMyOrbes((o) => (o == null ? o : Math.max(0, o - amount * people)));
      toast.success("¡Paquete de regalos creado!", { description: `Se descontaron ${amount * people} orbes de tu cuenta` });
    } catch {
      // Nunca dejar el botón atascado: si la red falla tras confirmar en el
      // servidor, avisamos para que el usuario recargue el chat y lo vea.
      setGiftErr("Error de conexión al crear el paquete. Revisa tu red; si ya se creó, aparecerá al volver a abrir el chat.");
    } finally {
      giftBusyRef.current = false;
      setGiftBusy(false);
    }
  }, [chatInfo, giftTitle, giftAmount, giftPeople, myOrbes, loadSenders]);

  const handleClaimGift = useCallback(async (giftId: string) => {
    if (claimingId) return;
    setClaimingId(giftId);
    try {
      const r = await claimOrbGift(giftId);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo abrir el regalo");
        const g = await fetchOrbGift(giftId).catch(() => null);
        if (g) {
          giftsRef.current.set(giftId, g);
          setGifts(new Map(giftsRef.current));
        }
        return;
      }
      const amount = r.amount ?? 0;
      setMyClaims((prev) => new Map(prev).set(giftId, amount));
      const g = await fetchOrbGift(giftId).catch(() => null);
      if (g) {
        giftsRef.current.set(giftId, g);
        setGifts(new Map(giftsRef.current));
      }
      toast.success(`¡+${amount} orbes a tu cuenta!`);
    } catch {
      toast.error("Error de conexión al abrir el regalo. Inténtalo de nuevo.");
    } finally {
      setClaimingId(null);
    }
  }, [claimingId]);

  // Caduca un paquete que superó las 24 h: el servidor devuelve al creador
  // los orbes que nadie reclamó y el realtime avisa a todos los clientes.
  const handleExpireGift = useCallback(async (giftId: string) => {
    if (expiringId) return;
    setExpiringId(giftId);
    let closed: number | null = null;
    try {
      closed = await expireOrbGifts();
    } catch {
      /* noop */
    } finally {
      setExpiringId(null);
    }
    const g = await fetchOrbGift(giftId).catch(() => null);
    if (g) {
      giftsRef.current.set(giftId, g);
      setGifts(new Map(giftsRef.current));
    }
    if (closed != null && closed > 0) {
      const unclaimed = g ? Math.max(0, g.total_orbes - g.claims * g.amount_per_person) : 0;
      toast.info("Paquete caducado", { description: `${unclaimed.toLocaleString("es")} orbes no reclamados se devolvieron al creador` });
    }
  }, [expiringId]);

  // ───── Chats individuales (DMs) y menciones ─────

  /** Carga la lista de chats individuales (conversaciones + seguidos mutuos). */
  const loadDmList = useCallback(async () => {
    setDmLoading(true);
    try {
      const [chats, mutuals] = await Promise.all([fetchMyDmChats(), fetchMutualFollows()]);
      const map = new Map<string, DmChat>();
      for (const c of chats) if (c.other) map.set(c.other.id, c);
      for (const m of mutuals) {
        if (!map.has(m.id)) map.set(m.id, { chat_id: "", other: m, last_message: null, last_at: null, unread: 0 });
      }
      const list = Array.from(map.values()).sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
      setDmList(list);
    } catch {
      /* noop */
    } finally {
      setDmLoading(false);
    }
  }, []);

  /** Abre un chat individual (crea la conversación si aún no existe). */
  const openDm = useCallback(async (dm: DmChat) => {
    let chatId = dm.chat_id;
    if (!chatId) {
      setDmLoading(true);
      const r = await getOrCreateDm(dm.other?.id ?? "");
      setDmLoading(false);
      if (!r.ok || !r.chatId) {
        toast.error(r.error ?? "No se pudo abrir el chat individual");
        return;
      }
      chatId = r.chatId;
      setDmList((prev) => prev.map((d) => (d.other?.id === dm.other?.id ? { ...d, chat_id: r.chatId! } : d)));
    }
    setActiveDm({ ...dm, chat_id: chatId });
    setReplyTo(null);
    setStickersOpen(false);
    setMentionOpen(false);
  }, []);

  // ───── Grupos personalizados ─────

  /** Carga la lista de mis grupos personalizados. */
  const loadGroupList = useCallback(async () => {
    setGroupLoading(true);
    try {
      setGroupList(await fetchMyGroupChats());
    } catch {
      /* noop */
    } finally {
      setGroupLoading(false);
    }
  }, []);

  /** Abre un grupo personalizado (hilo de mensajes). */
  const openGroup = useCallback((g: GroupChat) => {
    setActiveGroup(g);
    setActiveDm(null);
    setReplyTo(null);
    setStickersOpen(false);
    setMentionOpen(false);
  }, []);

  /** Carga los miembros del grupo activo en el panel de info. */
  const loadGroupInfo = useCallback(async (chatId: string) => {
    setGInfoBusy(true);
    setGInfoErr(null);
    try {
      const [members, mutuals] = await Promise.all([fetchGroupMembers(chatId), fetchMutualFollows()]);
      setGroupMembers(members);
      const ids = new Set(members.map((m) => m.profile.id));
      setGInfoMutuals(mutuals.filter((m) => !ids.has(m.id)));
    } catch (e) {
      setGInfoErr((e as Error).message || "No se pudo cargar la info del grupo");
    } finally {
      setGInfoBusy(false);
    }
  }, []);

  /** Abre el panel de info del grupo activo y carga sus datos. */
  const openGroupInfo = useCallback(async () => {
    if (!activeGroup) return;
    setGroupInfoOpen(true);
    setEditGroupOpen(false);
    void loadGroupInfo(activeGroup.chat_id);
  }, [activeGroup, loadGroupInfo]);

  /** Crea un grupo personalizado con los amigos seleccionados. */
  const handleCreateGroup = useCallback(async () => {
    if (cgBusy) return;
    if (!cgName.trim()) {
      setCgErr("Ponle un nombre al grupo");
      return;
    }
    if (cgSelected.size === 0) {
      setCgErr("Elige al menos un amigo");
      return;
    }
    setCgBusy(true);
    setCgErr(null);
    try {
      let avatarUrl: string | null = null;
      if (cgAvatarFile) avatarUrl = await uploadAvatar(cgAvatarFile);
      const r = await createGroupChat({
        name: cgName.trim(),
        description: cgDesc.trim() || undefined,
        avatarUrl,
        memberIds: Array.from(cgSelected),
      });
      if (!r.ok || !r.chatId) {
        setCgErr(r.error ?? "No se pudo crear el grupo");
        return;
      }
      setCreateGroupOpen(false);
      setCgName("");
      setCgDesc("");
      setCgAvatarFile(null);
      setCgAvatarPreview(null);
      setCgSelected(new Set());
      if (cgIsWork && r.chatId) {
        markWorkChat(r.chatId, true);
        setWorkChatIds((prev) => new Set(prev).add(r.chatId!));
      }
      setCgIsWork(false);
      setView("groups");
      void loadGroupList();
      toast.success(cgIsWork ? "Chat de trabajo creado ✓" : "Grupo creado ✓");
    } catch (e) {
      setCgErr((e as Error).message || "No se pudo crear el grupo");
    } finally {
      setCgBusy(false);
    }
  }, [cgBusy, cgName, cgDesc, cgAvatarFile, cgSelected, cgIsWork, loadGroupList]);

  /** Guarda los cambios de edición del grupo (nombre, descripción, foto). */
  const handleEditGroup = useCallback(async () => {
    if (!activeGroup || egBusy) return;
    if (!egName.trim()) {
      setEgErr("Ponle un nombre al grupo");
      return;
    }
    setEgBusy(true);
    setEgErr(null);
    try {
      let avatarUrl: string | null = egAvatarPreview ?? activeGroup.avatar_url;
      if (egAvatarFile) avatarUrl = await uploadAvatar(egAvatarFile);
      const r = await updateGroupChat(activeGroup.chat_id, {
        name: egName.trim(),
        description: egDesc.trim() || undefined,
        avatarUrl,
      });
      if (!r.ok) {
        setEgErr(r.error ?? "No se pudo editar el grupo");
        return;
      }
      setGroupList((prev) => prev.map((g) => (g.chat_id === activeGroup.chat_id ? { ...g, name: egName.trim(), description: egDesc.trim() || null, avatar_url: avatarUrl } : g)));
      setActiveGroup((prev) => (prev ? { ...prev, name: egName.trim(), description: egDesc.trim() || null, avatar_url: avatarUrl } : prev));
      setEditGroupOpen(false);
      toast.success("Grupo actualizado ✓");
    } catch (e) {
      setEgErr((e as Error).message || "No se pudo editar el grupo");
    } finally {
      setEgBusy(false);
    }
  }, [activeGroup, egBusy, egName, egDesc, egAvatarFile, egAvatarPreview]);

  /** Añade a un amigo mutuo al grupo. */
  const handleAddMember = useCallback(async (userId: string) => {
    if (!activeGroup) return;
    setGInfoErr(null);
    const r = await addGroupMember(activeGroup.chat_id, userId);
    if (!r.ok) {
      setGInfoErr(r.error ?? "No se pudo añadir");
      return;
    }
    await loadGroupInfo(activeGroup.chat_id);
    setGroupList((prev) => prev.map((g) => (g.chat_id === activeGroup.chat_id ? { ...g, member_count: g.member_count + 1 } : g)));
    toast.success("Miembro añadido ✓");
  }, [activeGroup, loadGroupInfo]);

  /** Quita a un miembro del grupo. */
  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!activeGroup) return;
    setGInfoErr(null);
    const r = await removeGroupMember(activeGroup.chat_id, userId);
    if (!r.ok) {
      setGInfoErr(r.error ?? "No se pudo quitar");
      return;
    }
    await loadGroupInfo(activeGroup.chat_id);
    setGroupList((prev) => prev.map((g) => (g.chat_id === activeGroup.chat_id ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g)));
    toast.success("Miembro eliminado");
  }, [activeGroup, loadGroupInfo]);

  /** Sale del grupo (cualquier miembro). */
  const handleLeaveGroup = useCallback(async () => {
    if (!activeGroup) return;
    setGInfoBusy(true);
    setGInfoErr(null);
    try {
      const r = await leaveGroupChat(activeGroup.chat_id);
      if (!r.ok) {
        setGInfoErr(r.error ?? "No se pudo salir del grupo");
        return;
      }
      setGroupInfoOpen(false);
      setEditGroupOpen(false);
      setActiveGroup(null);
      setView("groups");
      void loadGroupList();
      toast.success("Saliste del grupo");
    } finally {
      setGInfoBusy(false);
    }
  }, [activeGroup, loadGroupList]);

  /** Cambia el rol de un miembro (solo el creador): admin, moderador o miembro. */
  const handleSetGroupRole = useCallback(
    async (userId: string, role: "admin" | "moderator" | "member") => {
      if (!activeGroup || gRoleBusyId) return;
      setGRoleBusyId(userId);
      const r = await setGroupRole(activeGroup.chat_id, userId, role);
      setGRoleBusyId(null);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo cambiar el rol");
        return;
      }
      toast.success(
        role === "member"
          ? "Quitado de la moderación"
          : role === "admin"
            ? "Ahora es administrador"
            : "Ahora es moderador"
      );
      await loadGroupInfo(activeGroup.chat_id);
    },
    [activeGroup, gRoleBusyId, loadGroupInfo]
  );

  /** Elimina el grupo y todo su contenido (solo creador/admin), con doble confirmación. */
  const handleDeleteGroup = useCallback(async () => {
    if (!activeGroup || deleteBusy) return;
    if (!deleteArm) {
      setDeleteArm(true);
      window.setTimeout(() => setDeleteArm(false), 3500);
      return;
    }
    setDeleteBusy(true);
    const r = await deleteGroupChat(activeGroup.chat_id);
    setDeleteBusy(false);
    setDeleteArm(false);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo eliminar el grupo");
      return;
    }
    toast.success("Grupo eliminado");
    setGroupInfoOpen(false);
    setEditGroupOpen(false);
    setActiveGroup(null);
    setView("groups");
    setGroupList((prev) => prev.filter((g) => g.chat_id !== activeGroup.chat_id));
    void loadGroupList();
  }, [activeGroup, deleteBusy, deleteArm, loadGroupList]);

  /** Búsqueda global: abre el chat al que pertenece un resultado. */
  const handleOpenSearchChat = useCallback(
    async (chatId: string) => {
      setSearchOpen(false);
      if (chatInfo && chatId === chatInfo.id) {
        setView("group");
        setActiveDm(null);
        setActiveGroup(null);
        return;
      }
      let dm = dmList.find((d) => d.chat_id === chatId);
      let g = groupList.find((gr) => gr.chat_id === chatId);
      if (!dm && !g) {
        try {
          const [dms, groups] = await Promise.all([fetchMyDmChats(), fetchMyGroupChats()]);
          setDmList(dms);
          setGroupList(groups);
          dm = dms.find((d) => d.chat_id === chatId);
          g = groups.find((gr) => gr.chat_id === chatId);
        } catch {
          /* noop */
        }
      }
      if (dm) {
        setView("dms");
        setActiveGroup(null);
        void openDm(dm);
        return;
      }
      if (g) {
        setView("groups");
        setActiveDm(null);
        openGroup(g);
        return;
      }
      toast.error("No se encontró ese chat");
    },
    [chatInfo, dmList, groupList, openDm, openGroup]
  );

  /** Inserta la mención @usuario en el cuadro de texto (en el cursor). */
  const insertMention = useCallback((p: Profile) => {
    const r = mentionRef.current;
    if (!r) return;
    const name = p.username || p.display_name || "usuario";
    const next = draft.slice(0, r.start) + "@" + name + " " + draft.slice(r.end);
    setDraft(next);
    setMentionOpen(false);
    mentionRef.current = null;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const pos = r.start + name.length + 2;
        el.setSelectionRange(pos, pos);
      }
    });
  }, [draft]);

  /** Notifica a los usuarios mencionados (@usuario) en el chat grupal. */
  const notifyMentions = useCallback(async (content: string) => {
    const names = Array.from(content.matchAll(/@([\w.]+)/g)).map((m) => m[1].toLowerCase());
    if (!names.length) return;
    for (const name of names) {
      try {
        const found = await searchProfilesForMention(name, 1);
        const p = found.find((x) => (x.username ?? "").toLowerCase() === name);
        if (p && p.id !== myId) void pushNotification({ userId: p.id, type: "mention" }).catch(() => {});
      } catch {
        /* noop */
      }
    }
  }, [myId]);

  // Carga la lista de DMs al entrar en la pestaña DIRECTOS.
  useEffect(() => {
    if (view === "dms" && !activeDm) void loadDmList();
  }, [view, activeDm, loadDmList]);

  // Carga la lista de grupos al entrar en la pestaña GRUPOS.
  useEffect(() => {
    if (view === "groups" && !activeGroup) void loadGroupList();
  }, [view, activeGroup, loadGroupList]);

  // Busca candidatos para las menciones @ mientras se escribe.
  useEffect(() => {
    if (!mentionOpen) return;
    let alive = true;
    searchProfilesForMention(mentionQuery, 8)
      .then((c) => {
        if (alive) {
          setMentionCandidates(c);
          setMentionIndex(0);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mentionOpen, mentionQuery]);

  const onPickStickerFile = useCallback(
    async (file: File | null) => {
      if (!file || !chatInfo) return;      setStickerUploading(true);
    try {
      const { path, id } = await uploadSticker(file);
      const [signed] = await signMedia([path]);
      // Aparece al instante en la biblioteca de stickers de la cuenta.
      if (id) setMyStickers((prev) => [{ id, path, title: "Sticker" }, ...prev.filter((s) => s.path !== path)]);
      setSignedStickers((prev) => new Map(prev).set(path, signed));
      signedMediaRef.current = new Map(signedMediaRef.current).set(path, signed);
      setSignedMedia(signedMediaRef.current);
      // Guardamos la RUTA (no una URL firmada que expira): el media es permanente.
      try {
        const sent = await sendChatMessage(chatInfo.id, { mediaUrl: path, replyToId: replyTo?.id ?? null });
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        setReplyTo(null);
      } catch (err) {
        if (isNetworkError(err)) {
          queuePendingMessage(chatInfo.id, { mediaUrl: path, mediaType: "image", replyToId: replyTo?.id ?? null });
        }
        reportSendError(err);
      }
    } catch (err) {
      toast.error("No se pudo subir el sticker", { description: sendErrorDetail(err).desc });
    } finally {
      setStickerUploading(false);
    }
  },
  [chatInfo, replyTo]
);

  const onDeleteSticker = useCallback(async (id: string) => {
    try {
      await deleteSticker(id);
      setMyStickers((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("No se pudo eliminar el sticker");
    }
  }, []);

  // ───── Audio de voz ─────
  const startRecording = useCallback(async () => {
    if (recording || sendingAudio) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSeconds(0);
      setStickersOpen(false);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("No se pudo acceder al micrófono", {
        description: "Permite el acceso al micrófono en el navegador e inténtalo de nuevo.",
      });
    }
  }, [recording, sendingAudio]);

  const stopRecording = useCallback(
    async (send: boolean) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        setRecording(false);
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        return;
      }
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      setRecording(false);
      if (!send) {
        try {
          rec.onstop = null;
          rec.stop();
        } catch { /* noop */ }
        recChunksRef.current = [];
        return;
      }

      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          rec.stream?.getTracks().forEach((t) => t.stop());
          // El último dataavailable se entrega justo antes de stop: leemos el ref aquí.
          const blob = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/webm" });
          recChunksRef.current = [];
          resolve(blob);
        };
      });
      rec.stop();
      const blob = await done;
      if (!blob.size || !chatInfo) {
        toast.error("La grabación quedó vacía");
        return;
      }
      setSendingAudio(true);
      let audioPath: string | null = null;
      try {
        const path = await uploadChatMedia(new File([blob], "voice.webm", { type: blob.type || "audio/webm" }), myId ?? "me");
        audioPath = path;
        const [signed] = await signMedia([path]);
        signedMediaRef.current = new Map(signedMediaRef.current).set(path, signed);
        setSignedMedia(signedMediaRef.current);
        // Guardamos la RUTA: la URL se firma en pantalla y nunca expira en la base.
        const sent = await sendChatMessage(chatInfo.id, {
          mediaUrl: path,
          mediaType: "audio",
          replyToId: replyTo?.id ?? null,
        });
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        setReplyTo(null);
      } catch (err) {
        if (audioPath && isNetworkError(err) && chatInfo) {
          queuePendingMessage(chatInfo.id, { mediaUrl: audioPath, mediaType: "audio", replyToId: replyTo?.id ?? null });
        }
        reportSendError(err);
      } finally {
        setSendingAudio(false);
      }
    },
    [chatInfo, replyTo, myId]
  );

  // Libera el objectURL del preview de media al desmontar.
  useEffect(() => {
    return () => {
      setPendingMedia((p) => {
        if (p) URL.revokeObjectURL(p.preview);
        return p;
      });
    };
  }, []);

  // Si cierras el chat grabando, detén el micrófono y el timer.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.onstop = null;
          recorderRef.current.stop();
        } catch { /* noop */ }
      }
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

  const textareaAutoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      aria-label="Chats a pantalla completa"
      className="fixed inset-x-0 top-0 z-[90] h-dvh w-full min-w-0 bg-background flex flex-col overflow-hidden"
    >
      {/* ───── Header ───── */}
      <div className="h-[3px] w-full grad-brand-fade shrink-0" />
      <header className="shrink-0 border-b border-border/60 bg-background">
        <div className="max-w-2xl md:max-w-full mx-auto flex items-center gap-2 px-4 py-3">
          {view === "groups" && activeGroup ? (
            <>
              <button
                onClick={() => setActiveGroup(null)}
                title="Volver a mis grupos"
                className="w-9 h-9 rounded-xl border border-border/70 bg-background grid place-items-center active:scale-95 transition shrink-0"
              >
                <ArrowLeft size={16} />
              </button>
              <Avatar p={null} name={activeGroup.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{activeGroup.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {activeGroup.member_count} {activeGroup.member_count === 1 ? "miembro" : "miembros"}
                  {isWork && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold">TRABAJO</span>
                  )}
                  {activeGroup.my_role === "owner" ? " · tú eres el creador" : ""}
                </div>
              </div>
              <button
                onClick={() => void openGroupInfo()}
                title="Info del grupo"
                className="w-9 h-9 rounded-xl border border-border/70 bg-background grid place-items-center active:scale-95 transition shrink-0 hover:border-primary/40 hover:text-primary"
              >
                <Settings2 size={15} />
              </button>
            </>
          ) : view === "dms" && activeDm ? (

            <>
              <button
                onClick={() => setActiveDm(null)}
                title="Volver a la lista de chats"
                className="w-9 h-9 rounded-xl border border-border/70 bg-background grid place-items-center active:scale-95 transition shrink-0"
              >
                <ArrowLeft size={16} />
              </button>
              <Avatar p={activeDm.other} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {activeDm.other?.display_name || activeDm.other?.username || "Chat individual"}
                </div>
                <div className="text-[10px] text-muted-foreground">Chat individual · se siguen mutuamente</div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="rounded-full grid place-items-center shrink-0 font-display font-semibold text-primary-foreground"
                style={{ width: 36, height: 36, fontSize: 15, background: "var(--gradient-asternal)" }}
              >
                {view === "dms" ? <MessageCircle size={16} /> : view === "groups" ? <Users2 size={16} /> : <Users size={16} />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {view === "dms" ? "Chats individuales" : view === "groups" ? "Mis grupos" : chatInfo?.name ?? COMMUNITY_CHAT_NAME}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {view === "dms"
                    ? "Solo con personas que se siguen mutuamente"
                    : view === "groups"
                      ? "Crea grupos con tus amigos (seguimiento mutuo)"
                    : chatInfo
                      ? chatInfo.memberOk === false
                        ? "chat compartido · permisos por reparar"
                        : `${chatInfo.memberCount} ${chatInfo.memberCount === 1 ? "miembro" : "miembros"} · chat compartido`
                      : loading
                        ? "Conectando…"
                        : initError
                          ? "Sin conexión"
                          : "Conectando…"}
                </div>
              </div>
            </div>
          )}
          {canAnnounce && (view === "group" || !!activeGroup) && (
            <button
              onClick={() => {
                setAnnounceErr(null);
                setAnnounceText("");
                setAnnounceOpen(true);
              }}
              title="Publicar aviso del grupo"
              className="w-9 h-9 rounded-xl border border-primary/40 bg-primary/10 text-primary grid place-items-center active:scale-95 transition shrink-0 hover:bg-primary/20"
            >
              <Megaphone size={15} />
            </button>
          )}
          {canPoll && (view === "group" || !!activeGroup) && (
            <button
              onClick={() => {
                setPollErr(null);
                setPollQuestion("");
                setPollOptions(["", ""]);
                setPollOpen(true);
              }}
              title="Crear encuesta"
              className="w-9 h-9 rounded-xl border border-primary/40 bg-primary/10 text-primary grid place-items-center active:scale-95 transition shrink-0 hover:bg-primary/20"
            >
              <BarChart3 size={15} />
            </button>
          )}
          {view === "group" && !isLocal && (
            <button
              onClick={() => {
                setGiftErr(null);
                setGiftAmount("200");
                setGiftPeople("5");
                setGiftOpen(true);
                void getMyOrbes()
                  .then(setMyOrbes)
                  .catch(() => setMyOrbes(null));
              }}
              title="Crear paquete de regalos"
              className="w-9 h-9 rounded-xl border border-primary/40 bg-primary/10 text-primary grid place-items-center active:scale-95 transition shrink-0 hover:bg-primary/20"
            >
              <Gift size={15} />
            </button>
          )}
          <button
            onClick={() => setSearchOpen(true)}
            title="Búsqueda global"
            className="w-9 h-9 rounded-xl border border-border/70 bg-background grid place-items-center active:scale-95 transition shrink-0 hover:border-primary/40 hover:text-primary"
          >
            <Search size={15} />
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-xl border border-border/70 bg-background grid place-items-center active:scale-95 transition shrink-0">
            <X size={16} />
          </button>
        </div>
        {/* Gestores del chat de trabajo (siempre visibles arriba) */}
        {isWork && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5">
            <button
              onClick={() => setManager("tasks")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-card text-[10px] font-display tracking-[0.14em] text-muted-foreground hover:text-primary hover:border-primary/40 transition active:scale-[0.98]"
            >
              <ClipboardList size={12} /> TAREAS
            </button>
            <button
              onClick={() => setManager("files")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-card text-[10px] font-display tracking-[0.14em] text-muted-foreground hover:text-primary hover:border-primary/40 transition active:scale-[0.98]"
            >
              <FolderOpen size={12} /> ARCHIVOS
            </button>
            <button
              onClick={() => setManager("threads")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-card text-[10px] font-display tracking-[0.14em] text-muted-foreground hover:text-primary hover:border-primary/40 transition active:scale-[0.98]"
            >
              <MessagesSquare size={12} /> HILOS
            </button>
            <button
              onClick={() => setManager("projects")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-card text-[10px] font-display tracking-[0.14em] text-muted-foreground hover:text-primary hover:border-primary/40 transition active:scale-[0.98]"
            >
              <Layers size={12} /> PROYECTOS
            </button>
          </div>
        )}

        {/* Pestañas: chat grupal ↔ chats individuales */}
        {!isLocal && (
          <div className="max-w-2xl md:max-w-full mx-auto flex items-center gap-1.5 px-4 pb-2.5">
            <button
              onClick={() => {
                setView("group");
                setActiveDm(null);
              }}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-display tracking-[0.14em] flex items-center justify-center gap-1.5 transition active:scale-[0.98] ${view === "group" ? "grad-brand text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Users size={12} /> GRUPO
            </button>
            <button
              onClick={() => {
                setView("groups");
                setActiveGroup(null);
                setActiveDm(null);
                void loadGroupList();
              }}
              className={`relative flex-1 py-1.5 rounded-xl text-[10px] font-display tracking-[0.14em] flex items-center justify-center gap-1.5 transition active:scale-[0.98] ${view === "groups" ? "grad-brand text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Users2 size={12} /> GRUPOS
              {totalGroupUnread > 0 && (
                <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full grad-brand text-primary-foreground text-[9px] font-display grid place-items-center">
                  {totalGroupUnread >= 100 ? "99" : totalGroupUnread}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setView("dms");
                setActiveDm(null);
                void loadDmList();
              }}

              className={`relative flex-1 py-1.5 rounded-xl text-[10px] font-display tracking-[0.14em] flex items-center justify-center gap-1.5 transition active:scale-[0.98] ${view === "dms" ? "grad-brand text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              <MessageCircle size={12} /> DIRECTOS
              {totalDmUnread > 0 && (
                <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full grad-brand text-primary-foreground text-[9px] font-display grid place-items-center">
                  {totalDmUnread >= 100 ? "99" : totalDmUnread}
                </span>
              )}
            </button>
          </div>
        )}
      </header>

      {/* Aviso de modo local */}
      {isLocal && (
        <div className="shrink-0 mx-3 mt-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center gap-2">
          <span className="flex-1 text-[11px] text-amber-700 dark:text-amber-300">
            {hasSupabaseConfig()
              ? "Chat local: tu cuenta actual no está en Supabase, así que los mensajes se guardan solo en este dispositivo. Entra con tu cuenta de Supabase (⋮ → Cerrar sesión → login) para compartirlos con la comunidad."
              : "Modo local: los mensajes no se comparten entre dispositivos. Conecta tu base de datos para el chat comunitario."}
          </span>
          {hasSupabaseConfig() ? (
            <Link
              to="/auth"
              className="shrink-0 px-2.5 py-1 rounded-lg grad-brand text-primary-foreground text-[10px] font-display tracking-widest active:scale-95 transition"
            >
              INICIAR SESIÓN
            </Link>
          ) : (
            <button
              onClick={() => setConnecting(true)}
              className="shrink-0 px-2.5 py-1 rounded-lg grad-brand text-primary-foreground text-[10px] font-display tracking-widest active:scale-95 transition"
            >
              CONECTAR
            </button>
          )}
        </div>
      )}

      {/* Error de conexión / esquema / sesión del chat */}
      {initError && !chatInfo && !loading && (
        <div className="shrink-0 mx-3 mt-2 px-3 py-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] space-y-2.5">
          <div className="flex items-start gap-2.5">
            <WifiOff size={15} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              {initError === "schema" ? (
                <>
                  <span className="font-semibold text-foreground">Faltan tablas del chat</span> en la base
                  de datos. Revisa la conexión de Supabase y reintenta.
                </>
              ) : initError === "rls" ? (
                <>
                  <span className="font-semibold text-foreground">Permisos del chat desactualizados</span>{" "}
                  (políticas antiguas que se bloquean entre sí). Revisa la configuración de permisos de la
                  base de datos.
                </>
              ) : initError === "auth" ? (
                <>
                  <span className="font-semibold text-foreground">Inicia sesión para usar el chat.</span>{" "}
                  {errorDetail.includes("base de datos está conectada")
                    ? "Tu base está conectada pero esta cuenta es local: los permisos de Supabase exigen la cuenta real. Entra con ella y vuelve."
                    : "El chat comunitario necesita una sesión activa."}
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">No se pudo conectar al chat.</span>{" "}
                  {connHint(errorDetail)}
                </>
              )}
            </div>
          </div>
          {(initError === "conn" || initError === "rls") && errorDetail && (
            <p className="text-[10px] font-mono text-muted-foreground/50 break-words bg-black/[0.03] dark:bg-white/[0.04] rounded-lg px-2 py-1.5">
              {errorDetail.slice(0, 220)}
            </p>
          )}
          <div className="flex gap-2">
            {initError === "auth" && (
              <Link
                to="/auth"
                className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-[10px] font-display tracking-widest active:scale-[0.98] transition flex items-center justify-center gap-1.5"
              >
                <KeyRound size={12} /> INICIAR SESIÓN
              </Link>
            )}
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="flex-1 py-2 rounded-xl border border-border bg-background text-[10px] font-display tracking-widest active:scale-[0.98] transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={12} /> REINTENTAR
            </button>
          </div>
        </div>
      )}

      {/* ───── Grupos personalizados: lista ───── */}
      {view === "groups" && !activeGroup ? (
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 min-h-0 no-scrollbar">
          <button
            onClick={() => {
              setCgErr(null);
              setCgName("");
              setCgDesc("");
              setCgAvatarFile(null);
              setCgAvatarPreview(null);
              setCgSelected(new Set());
              setCgIsWork(false);
              void fetchMutualFollows()
                .then((m) => setCgMutuals(m))
                .catch(() => setCgMutuals([]));
              setCreateGroupOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-primary text-[11px] font-display tracking-widest hover:bg-primary/10 active:scale-[0.99] transition mb-1"
          >
            <Users2 size={15} /> NUEVO GRUPO
          </button>
          {groupLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : groupList.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12 px-6 leading-relaxed">
              Aún no tienes grupos.
              <br />
              Crea uno con amigos que te <b>siguen mutuamente</b>: ponle nombre,
              una foto y una descripción.
            </div>
          ) : (
            groupList.map((g) => (
              <button
                key={g.chat_id}
                onClick={() => void openGroup(g)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition text-left group active:scale-[0.99]"
              >
                <Avatar p={null} name={g.name} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold truncate">{g.name}</span>
                      {workChatIds.has(g.chat_id) && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-bold">TRABAJO</span>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground/70 shrink-0">{g.last_at ? fmtDay(g.last_at) : ""}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {g.last_message ? <MediaLabel m={g.last_message} muted /> : g.description || `${g.member_count} ${g.member_count === 1 ? "miembro" : "miembros"}`}
                    </span>
                    {g.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full grad-brand text-primary-foreground text-[9px] font-display grid place-items-center">
                        {g.unread >= 100 ? "99" : g.unread}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      ) : view === "dms" && !activeDm ? (

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 min-h-0 no-scrollbar">
          {dmLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : dmList.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12 px-6 leading-relaxed">
              Aún no tienes chats individuales.
              <br />
              Cuando tú y otra persona se <b>siguen mutuamente</b>, su conversación aparece aquí automáticamente.
            </div>
          ) : (
            dmList.map((dm) => (
              <button
                key={dm.chat_id || dm.other?.id || dm.other?.username || Math.random()}
                onClick={() => void openDm(dm)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition text-left group active:scale-[0.99]"
              >
                <Avatar p={dm.other} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold truncate">{dm.other?.display_name || dm.other?.username}</span>
                    <span className="text-[9px] text-muted-foreground/70 shrink-0">{dm.last_at ? fmtDay(dm.last_at) : ""}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {dm.last_message ? <MediaLabel m={dm.last_message} muted /> : dm.chat_id ? "Sin mensajes todavía" : "Se siguen mutuamente · inicia la conversación"}
                    </span>
                    {dm.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full grad-brand text-primary-foreground text-[9px] font-display grid place-items-center">
                        {dm.unread >= 100 ? "99" : dm.unread}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      ) : (
        <>
      {/* ───── Mensajes ───── */}
            {/* No leídos: contador arriba, en azul (a partir de 100 se muestra 99) */}
      {unseen > 0 && (
        <div className="shrink-0 mx-3 mt-2">
          <button
            onClick={jumpToBottom}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl grad-brand text-primary-foreground text-[11px] font-display tracking-wide active:scale-[0.98] transition"
          >
            <ArrowDown size={12} /> {unseen >= 100 ? "99" : unseen} mensaje{unseen === 1 ? "" : "s"} nuevo{unseen === 1 ? "" : "s"}
          </button>
        </div>
      )}

<div ref={listRef} onScroll={onScrollList} className="relative flex-1 overflow-y-auto px-3 py-4 space-y-3 no-scrollbar min-h-0 bg-primary/[0.02]">
        {loadingMore && (
          <div className="flex justify-center py-1">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : !currentChatId ? null : !messages.length ? (
          <div className="text-center text-xs text-muted-foreground py-10 px-6">
            <MessageCircle size={20} className="mx-auto mb-2 text-muted-foreground/30" />
            {activeDm
              ? "Sin mensajes todavía · saluda a esta persona"
              : "Sé el primero en saludar a la comunidad"}
          </div>
        ) : (
          messages.map((m) => (
            <SafeRow key={m.id}>
              {isAnnouncement(m) ? (
                <AnnouncementCard m={m} sender={senders.get(m.sender_id)} />
              ) : isGiftMessage(m) ? (
                <GiftCard
                  m={m}
                  gift={m.gift_id ? gifts.get(m.gift_id) ?? null : null}
                  claiming={claimingId === m.gift_id}
                  expiring={expiringId === m.gift_id}
                  claimedAmount={m.gift_id ? myClaims.get(m.gift_id) : undefined}
                  onClaim={() => m.gift_id && void handleClaimGift(m.gift_id)}
                  onExpire={() => m.gift_id && void handleExpireGift(m.gift_id)}
                />
              ) : isPollMessage(m) ? (
                <PollCard
                  m={m}
                  poll={m.poll_id ? polls.get(m.poll_id) ?? null : null}
                  sender={senders.get(m.sender_id)}
                  votingId={votingId}
                  closingId={closingId}
                  canClose={!!m.poll_id && (view === "group" ? isOwner : groupRole === "owner" || groupRole === "admin")}
                  onVote={(oi) => {
                    const p = m.poll_id ? polls.get(m.poll_id) ?? null : null;
                    if (p) void handleVotePoll(p, oi);
                  }}
                  onClose={() => {
                    const p = m.poll_id ? polls.get(m.poll_id) ?? null : null;
                    if (p) void handleClosePoll(p);
                  }}
                />
              ) : (
                <MessageBubble
                  m={m}
                  mine={m.sender_id === myId}
                  sender={senders.get(m.sender_id)}
                  senders={senders}
                  reply={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) ?? null : null}
                  mediaUrl={resolveMediaUrl(m.media_url, signedMedia)}
                  copied={copiedId === m.id}
                  onCopy={() => void copyMessage(m)}
                  onReply={() => {
                    setReplyTo(m);
                    setStickersOpen(false);
                    inputRef.current?.focus();
                  }}
                  onOpenPortfolio={setSharedPortfolio}
                  onOpenPost={setSharedPost}
                />
              )}
            </SafeRow>
          ))
        )}
        {isWork && threads.length > 0 && (
          <div className="pt-1">
            <div className="text-[9px] font-display tracking-[0.18em] text-muted-foreground/70 mb-1.5 flex items-center gap-1.5">
              <MessagesSquare size={10} /> HILOS DEL CHAT
            </div>
            <div className="space-y-1.5">
              {threads.map((t) => {
                const tCount = listThreadMessages(t.id).length;
                return (
                  <button
                    key={t.id}
                    onClick={() => setOpenThread(t)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/70 bg-card hover:border-primary/40 hover:bg-primary/5 transition text-left active:scale-[0.99]"
                  >
                    <div className="w-8 h-8 rounded-lg grad-brand text-primary-foreground grid place-items-center shrink-0">
                      <MessagesSquare size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate flex items-center gap-1.5">
                        {t.title}
                        <span className="text-[9px] text-muted-foreground/70 shrink-0">
                          {tCount} {tCount === 1 ? "msg" : "msgs"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        por {t.created_by_name || "alguien"} · {fmtDay(t.created_at)}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/60 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div ref={endRef} />
        {unseen > 0 && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl grad-brand text-primary-foreground text-[11px] font-display tracking-wide shadow-lg active:scale-95 transition"
          >
            <ArrowDown size={12} /> {unseen >= 100 ? "99" : unseen} nuevo{unseen > 1 ? "s" : ""}
          </button>
        )}
      </div>
        </>
      )}

      {/* Preview de foto/vídeo pendiente */}
      {pendingMedia && (
        <div className="shrink-0 px-3 pt-2">
          <div className="relative inline-flex rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            {pendingMedia.kind === "video" ? (
              <video src={pendingMedia.preview} className="w-40 h-28 object-cover" muted />
            ) : pendingMedia.kind === "image" ? (
              <img src={pendingMedia.preview} alt="" className="w-40 h-28 object-cover" />
            ) : (
              <div className="flex w-64 max-w-full items-center gap-3 bg-muted p-4 pb-8">
                <Paperclip size={24} className="shrink-0 text-primary" />
                <div className="min-w-0"><p className="truncate text-xs font-medium">{pendingMedia.file.name}</p><p className="text-[10px] text-muted-foreground">{(pendingMedia.file.size / 1024 / 1024).toFixed(2)} MB</p></div>
              </div>
            )}
            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-display tracking-widest flex items-center gap-1">
              {pendingMedia.kind === "video" ? <Film size={9} /> : pendingMedia.kind === "image" ? <ImagePlus size={9} /> : <Paperclip size={9} />}
              {pendingMedia.kind === "video" ? "VÍDEO" : pendingMedia.kind === "image" ? "FOTO" : "ARCHIVO"}
            </span>
            <button
              onClick={() => {
                setPendingMedia((prev) => {
                  if (prev) URL.revokeObjectURL(prev.preview);
                  return null;
                });
              }}
              disabled={mediaUploading}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/60 text-white grid place-items-center active:scale-90 transition disabled:opacity-40"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      {/* ───── Barra de respuesta ───── */}
      {(view === "group" || activeDm || activeGroup) && (
      <>
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="mx-3 mb-1.5 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/25 bg-primary/5"
          >
            <Reply size={12} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-display tracking-wider text-primary">
                RESPONDIENDO A{" "}
                {senders.get(replyTo.sender_id)?.display_name?.toUpperCase() ||
                  senders.get(replyTo.sender_id)?.username?.toUpperCase() ||
                  ""}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                <MediaLabel m={replyTo} />
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} className="w-6 h-6 grid place-items-center rounded-md hover:bg-muted/70 text-muted-foreground shrink-0">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Barra de escritura ───── */}
      <div className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-1.5">
        <div className="relative flex items-end gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-sm">
          {recording ? (
            /* ── Grabando: timer + cancelar + enviar ── */
            <div className="flex-1 flex items-center gap-2 py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="font-mono tabular-nums text-sm">
                {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
              </span>
              <span className="text-[11px] text-muted-foreground truncate flex-1">Grabando… mantén cerca el teléfono</span>
              <button
                onClick={() => void stopRecording(false)}
                title="Descartar grabación"
                className="w-9 h-9 rounded-xl border border-border grid place-items-center text-muted-foreground active:scale-95 transition shrink-0"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => void stopRecording(true)}
                disabled={sendingAudio}
                className="w-10 h-10 rounded-xl bg-destructive text-white grid place-items-center active:scale-95 transition shrink-0 disabled:opacity-50"
                title="Enviar audio"
              >
                {sendingAudio ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          ) : (
            <>
          <button
            onClick={() => attachmentInputRef.current?.click()}
            disabled={mediaUploading}
            title="Adjuntar fotos, vídeos o archivos"
            aria-label="Adjuntar fotos, vídeos o archivos"
            className={`w-9 h-9 rounded-xl grid place-items-center active:scale-95 transition shrink-0 disabled:opacity-40 ${pendingMedia ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60"}`}
          >
            <Paperclip size={18} />
          </button>
          <button
            onClick={() => void sharePortfolioInCurrentChat()}
            title="Compartir Portafolio"
            className="w-9 h-9 rounded-xl grid place-items-center active:scale-95 transition shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <Briefcase size={17} />
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (f) pickMedia(f);
            }}
          />
          <button
            onClick={() => setStickersOpen((o) => !o)}
            className={`w-9 h-9 rounded-xl grid place-items-center active:scale-95 transition shrink-0 ${stickersOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60"}`}
          >
            <SmilePlus size={18} />
          </button>

          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              textareaAutoGrow(e.target);
              // Detectar @ antes del cursor para sugerir menciones
              const caret = e.target.selectionStart ?? v.length;
              const before = v.slice(0, caret);
              const m = before.match(/(?:^|\s)@([\w.]*)$/);
              if (m) {
                mentionRef.current = { start: caret - m[0].length + (m[0].startsWith("@") ? 0 : 1), end: caret };
                setMentionQuery(m[1]);
                setMentionOpen(true);
              } else {
                setMentionOpen(false);
                mentionRef.current = null;
              }
            }}
            onKeyDown={(e) => {
              if (mentionOpen && mentionCandidates.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionCandidates.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  const p = mentionCandidates[mentionIndex];
                  if (p) {
                    e.preventDefault();
                    insertMention(p);
                    return;
                  }
                }
                if (e.key === "Escape") {
                  setMentionOpen(false);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void (pendingMedia ? sendPendingMedia() : handleSend());
              }
            }}
            enterKeyHint="send"
            rows={1}
            placeholder="Escribe un mensaje… usa @ para mencionar"
            className="flex-1 resize-none bg-transparent outline-none text-sm leading-snug py-1.5 max-h-[120px] placeholder:text-muted-foreground/60"
          />
          {/* Sugerencias de menciones @usuario */}
          <AnimatePresence>
            {mentionOpen && mentionCandidates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-xl shadow-md p-1.5 z-20 max-h-56 overflow-y-auto"
              >
                <div className="px-2 py-1 text-[10px] font-display tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <AtSign size={11} /> MENCIONAR · @{mentionQuery || "…"}
                </div>
                {mentionCandidates.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => insertMention(p)}
                    onMouseEnter={() => setMentionIndex(i)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left transition ${i === mentionIndex ? "bg-primary/10" : "hover:bg-muted/60"}`}
                  >
                    <Avatar p={p} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate">{p.display_name || p.username}</div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">@{p.username ?? "?"}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => void (pendingMedia ? sendPendingMedia() : handleSend())}
            disabled={!draft.trim() && !pendingMedia}
            className="w-9 h-9 rounded-xl grad-brand text-primary-foreground grid place-items-center active:scale-95 transition shrink-0 disabled:opacity-40 disabled:active:scale-100"
          >
            <Send size={15} />
          </button>
          <button
            onClick={() => void startRecording()}
            disabled={sendingAudio}
            title="Grabar audio de voz"
            className="w-9 h-9 rounded-xl border border-border/70 grid place-items-center text-muted-foreground hover:text-rose-500 hover:border-rose-400/40 active:scale-95 transition shrink-0 disabled:opacity-40"
          >
            <Mic size={16} />
          </button>
            </>
          )}

          {/* Panel de stickers */}
          <AnimatePresence>
            {stickersOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-xl shadow-md p-3 z-20"
              >
                <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-2">
                  TUS STICKERS{myStickers.length > 0 ? ` (${myStickers.length})` : ""} · se guardan en tu cuenta
                </div>
                {myStickers.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground text-center py-4">
                    <SmilePlus size={16} className="mx-auto mb-1.5 text-muted-foreground/40" />
                    Aún no tienes stickers guardados. Sube el primero
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {myStickers.map((s) => (
                      <div
                        key={s.id}
                        className="relative aspect-square rounded-xl overflow-hidden border border-border hover:border-primary/50 group/st"
                      >
                        <button
                          onClick={() => void handleSend(signedStickers.get(s.path) ?? s.path)}
                          title={s.title}
                          className="w-full h-full active:scale-95 transition"
                        >
                          <img
                            src={signedStickers.get(s.path) ?? s.path}
                            alt={s.title}
                            className="w-full h-full object-cover group-hover/st:scale-105 transition-transform"
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteSticker(s.id);
                          }}
                          title="Eliminar sticker"
                          className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 text-white grid place-items-center opacity-0 group-hover/st:opacity-100 transition active:scale-90"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={stickerUploading}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-primary/40 text-primary text-[11px] font-display tracking-widest hover:bg-primary/5 active:scale-[0.98] transition disabled:opacity-40"
                >
                  {stickerUploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                  SUBIR STICKER
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onPickStickerFile(f);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </>
      )}

      {sharedPortfolio && (
        <PortfolioPanel
          userId={sharedPortfolio.owner.id}
          profile={senders.get(sharedPortfolio.owner.id) ?? {
            id: sharedPortfolio.owner.id,
            username: sharedPortfolio.owner.username || "creador",
            display_name: sharedPortfolio.owner.displayName,
            avatar_url: null,
            bio: null,
          }}
          viewingOwn={false}
          portfolioSnapshot={sharedPortfolio.portfolio}
          onClose={() => setSharedPortfolio(null)}
        />
      )}

      {sharedPost && <SharedPostPanel share={sharedPost} onClose={() => setSharedPost(null)} />}

      {/* Diálogo: crear grupo personalizado */}
      <AnimatePresence>
        {createGroupOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md grid place-items-center p-4"
            onClick={() => !cgBusy && setCreateGroupOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-md max-h-[85vh] overflow-y-auto"
            >
              <div className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                <Users2 size={15} className="text-primary" /> Crear grupo
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Un chat solo para ti y tus amigos. Solo pueden entrar personas que te siguen mutuamente.
              </p>

              {/* Foto del grupo */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => cgAvatarRef.current?.click()}
                  className="relative w-16 h-16 rounded-full overflow-hidden grid place-items-center shrink-0 font-display font-semibold text-primary-foreground active:scale-95 transition border-2 border-primary/30"
                  style={{ background: "var(--gradient-asternal)" }}
                >
                  {cgAvatarPreview ? (
                    <img src={cgAvatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (cgName.trim() || "G")[0]?.toUpperCase()
                  )}
                  <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-background border border-border grid place-items-center">
                    <Camera size={11} />
                  </span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium mb-1">Foto del grupo</div>
                  <button
                    onClick={() => cgAvatarRef.current?.click()}
                    className="text-[11px] text-primary underline underline-offset-2"
                  >
                    {cgAvatarPreview ? "Cambiar foto" : "Subir foto"}
                  </button>
                  {cgAvatarPreview && (
                    <button
                      onClick={() => {
                        setCgAvatarFile(null);
                        setCgAvatarPreview(null);
                      }}
                      className="text-[11px] text-muted-foreground underline underline-offset-2 ml-2"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <input
                  ref={cgAvatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (!f) return;
                    setCgAvatarFile(f);
                    setCgAvatarPreview(URL.createObjectURL(f));
                  }}
                />
              </div>

              <input
                value={cgName}
                onChange={(e) => {
                  setCgName(e.target.value);
                  setCgErr(null);
                }}
                maxLength={40}
                placeholder="Nombre del grupo (obligatorio)"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2"
              />
              <input
                value={cgDesc}
                onChange={(e) => setCgDesc(e.target.value)}
                maxLength={120}
                placeholder="Descripción (opcional) — p. ej. «Squad de juegos»"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2"
              />
              <button
                onClick={() => setCgIsWork((v) => !v)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition mb-3 ${
                  cgIsWork ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background hover:bg-muted/40"
                }`}
              >
                <Briefcase size={15} className={cgIsWork ? "text-primary" : "text-muted-foreground"} />
                <span className="flex-1 text-left">
                  <span className="block text-[12px] font-semibold">Chat de trabajo</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    Con gestor de tareas, archivos e hilos para el equipo.
                  </span>
                </span>
                <span className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 transition ${cgIsWork ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                  {cgIsWork && <Check size={12} />}
                </span>
              </button>

              <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <UserPlus size={11} /> AMIGOS (SEGUIMIENTO MUTUO)
              </div>
              {cgMutuals.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/70 py-3 text-center leading-relaxed">
                  No tienes amigos con seguimiento mutuo todavía.
                  <br />
                  Sigue a alguien y que te siga para poder crear un grupo.
                </div>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto no-scrollbar mb-2">
                  {cgMutuals.map((p) => {
                    const on = cgSelected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setCgSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          });
                          setCgErr(null);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl border transition text-left ${on ? "border-primary/50 bg-primary/10" : "border-border/50 bg-background hover:bg-muted/40"}`}
                      >
                        <Avatar p={p} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium truncate">{p.display_name || p.username}</div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">@{p.username ?? "?"}</div>
                        </div>
                        <span className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 transition ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                          {on && <Check size={12} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {cgErr && (
                <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{cgErr}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setCreateGroupOpen(false)}
                  disabled={cgBusy}
                  className="flex-1 py-2 rounded-xl border border-border bg-background text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => void handleCreateGroup()}
                  disabled={cgBusy}
                  className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {cgBusy ? <Loader2 size={13} className="animate-spin" /> : <Users2 size={13} />}
                  {cgBusy ? "CREANDO…" : "CREAR GRUPO"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo: info del grupo */}
      <AnimatePresence>
        {groupInfoOpen && activeGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md grid place-items-center p-4"
            onClick={() => setGroupInfoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-md max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start gap-3 mb-3">
                <Avatar p={null} name={activeGroup.name} size={52} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{activeGroup.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {activeGroup.description || "Sin descripción"}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                    <Users size={11} /> {activeGroup.member_count} {activeGroup.member_count === 1 ? "miembro" : "miembros"}
                    {activeGroup.my_role === "owner" && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">CREADOR</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setGroupInfoOpen(false)} className="w-8 h-8 rounded-lg border border-border grid place-items-center active:scale-95 shrink-0">
                  <X size={14} />
                </button>
              </div>

              {gInfoErr && (
                <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{gInfoErr}</span>
                </div>
              )}

              {editGroupOpen ? (
                <div className="space-y-2 mb-3">
                  <input
                    value={egName}
                    onChange={(e) => {
                      setEgName(e.target.value);
                      setEgErr(null);
                    }}
                    maxLength={40}
                    placeholder="Nombre del grupo"
                    className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                  />
                  <input
                    value={egDesc}
                    onChange={(e) => setEgDesc(e.target.value)}
                    maxLength={120}
                    placeholder="Descripción (opcional)"
                    className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => egAvatarRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11px] font-medium hover:bg-muted/40 transition active:scale-95"
                    >
                      <Camera size={12} /> {egAvatarPreview ? "Cambiar foto" : "Subir foto"}
                    </button>
                    {(egAvatarPreview || activeGroup.avatar_url) && (
                      <button
                        onClick={() => {
                          setEgAvatarFile(null);
                          setEgAvatarPreview(null);
                        }}
                        className="text-[11px] text-muted-foreground underline underline-offset-2"
                      >
                        Quitar foto
                      </button>
                    )}
                    <input
                      ref={egAvatarRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        if (!f) return;
                        setEgAvatarFile(f);
                        setEgAvatarPreview(URL.createObjectURL(f));
                      }}
                    />
                  </div>
                  {egErr && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      <span>{egErr}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditGroupOpen(false)}
                      disabled={egBusy}
                      className="flex-1 py-2 rounded-xl border border-border bg-background text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40"
                    >
                      CANCELAR
                    </button>
                    <button
                      onClick={() => void handleEditGroup()}
                      disabled={egBusy}
                      className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      {egBusy ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                      {egBusy ? "GUARDANDO…" : "GUARDAR"}
                    </button>
                  </div>
                </div>
              ) : (
                activeGroup.my_role === "owner" && (
                  <button
                    onClick={() => {
                      setEgName(activeGroup.name);
                      setEgDesc(activeGroup.description ?? "");
                      setEgAvatarFile(null);
                      setEgAvatarPreview(null);
                      setEgErr(null);
                      setEditGroupOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-[11px] font-display tracking-widest hover:bg-primary/10 active:scale-[0.98] transition mb-3"
                  >
                    <Pencil size={13} /> EDITAR GRUPO
                  </button>
                )
              )}

              {(activeGroup.my_role === "owner" || activeGroup.my_role === "admin") && (
                <button
                  onClick={() => {
                    const on = !workChatIds.has(activeGroup.chat_id);
                    markWorkChat(activeGroup.chat_id, on);
                    setWorkChatIds((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(activeGroup.chat_id);
                      else next.delete(activeGroup.chat_id);
                      return next;
                    });
                    toast.success(on ? "Marcado como chat de trabajo" : "Ya no es chat de trabajo");
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-[11px] font-display tracking-widest hover:bg-primary/10 active:scale-[0.98] transition mb-3"
                >
                  <Briefcase size={13} />{" "}
                  {workChatIds.has(activeGroup.chat_id) ? "QUITAR MODO TRABAJO" : "MARCAR COMO CHAT DE TRABAJO"}
                </button>
              )}

              <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Users size={11} /> MIEMBROS
              </div>
              {gInfoBusy ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto no-scrollbar mb-2">
                  {groupMembers.map((m) => (
                    <div key={m.profile.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-background border border-border/50">
                      <Avatar p={m.profile} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium truncate">{m.profile.display_name || m.profile.username}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">@{m.profile.username ?? "?"}</div>
                      </div>
                      {m.role === "owner" ? (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">CREADOR</span>
                      ) : activeGroup.my_role === "owner" ? (
                        <button
                          onClick={() => void handleRemoveMember(m.profile.id)}
                          title="Quitar del grupo"
                          className="shrink-0 w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-rose-300 grid place-items-center active:scale-95 transition"
                        >
                          <UserMinus size={12} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {activeGroup.my_role === "owner" && gInfoMutuals.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <UserPlus size={11} /> AÑADIR AMIGO
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto no-scrollbar">
                    {gInfoMutuals.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => void handleAddMember(p.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl border border-border/50 bg-background hover:bg-primary/5 hover:border-primary/30 transition text-left active:scale-[0.99]"
                      >
                        <Avatar p={p} size={26} />
                        <span className="min-w-0 flex-1 text-[12px] font-medium truncate">{p.display_name || p.username}</span>
                        <UserPlus size={13} className="text-primary shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canManageRoles && (
                <div className="mb-3">
                  <div className="text-[10px] font-display tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Shield size={11} /> MODERACIÓN
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mb-2">
                    Nombra administradores (editar, añadir miembros, avisos y encuestas) o
                    moderadores (avisos y encuestas). Toca el rol para asignarlo o quitarlo.
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto no-scrollbar">
                    {groupMembers
                      .filter((mem) => mem.role !== "owner")
                      .map((mem) => (
                        <div key={mem.profile.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-background border border-border/50">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium truncate">{mem.profile.display_name || mem.profile.username}</div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">@{mem.profile.username ?? "?"}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(["moderator", "admin"] as const).map((role) => (
                              <button
                                key={role}
                                onClick={() => void handleSetGroupRole(mem.profile.id, mem.role === role ? "member" : role)}
                                disabled={gRoleBusyId === mem.profile.id}
                                className={`px-2 py-1 rounded-lg text-[9px] font-display tracking-wider transition active:scale-95 disabled:opacity-40 ${
                                  mem.role === role
                                    ? "bg-primary/15 text-primary border border-primary/40"
                                    : "border border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                }`}
                              >
                                {role === "admin" ? "ADMIN" : "MOD"}
                              </button>
                            ))}
                            {gRoleBusyId === mem.profile.id && (
                              <Loader2 size={11} className="animate-spin text-primary shrink-0" />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {canDeleteGroup && (
                <button
                  onClick={() => void handleDeleteGroup()}
                  disabled={deleteBusy}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[11px] font-display tracking-widest transition active:scale-[0.98] disabled:opacity-40 mb-2 ${
                    deleteArm
                      ? "border-rose-500/60 bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : "border-rose-300/50 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  }`}
                >
                  {deleteBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {deleteBusy ? "ELIMINANDO…" : deleteArm ? "¿SEGURO? TOCA OTRA VEZ" : "ELIMINAR GRUPO"}
                </button>
              )}

              <button
                onClick={() => void handleLeaveGroup()}
                disabled={gInfoBusy}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-rose-300/50 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400 text-[11px] font-display tracking-widest hover:bg-rose-500/10 active:scale-[0.98] transition disabled:opacity-40"
              >
                <LogOut size={13} /> SALIR DEL GRUPO
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo de conexión (solo modo local) */}

      <AnimatePresence>
        {connecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md grid place-items-center p-4"
            onClick={() => setConnecting(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-md"
            >
              <div className="text-sm font-semibold mb-0.5">Conectar Supabase</div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Pega la URL y la anon key de tu proyecto (están en Keys como V1 y V2). Los mensajes y la comunidad se sincronizarán entre dispositivos.
              </p>
              <input
                value={connectUrl}
                onChange={(e) => setConnectUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2"
              />
              <input
                value={connectKey}
                onChange={(e) => {
                  setConnectKey(e.target.value);
                  setConnectError(null);
                }}
                placeholder="eyJhbGciOi… (anon key, no tu token sbp_…)"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2"
              />
              {connectError && (
                <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{connectError}</span>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed mb-3">
                ⚠️ <b>No pegues aquí tu token de acceso personal (sbp_…)</b> — la app espera la anon key (el JWT
                que empieza por{" "}<span className="font-mono">eyJ…</span>, Project Settings → API Keys) y un token
                sbp_ rompería la conexión con «Invalid API key».
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConnecting(false)}
                  className="flex-1 py-2 rounded-xl border border-border bg-background text-xs font-display tracking-widest active:scale-[0.98] transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={doConnect}
                  disabled={!connectUrl.trim() || !connectKey.trim()}
                  className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40"
                >
                  CONECTAR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo: publicar aviso del grupo (solo admin) */}
      <AnimatePresence>
        {announceOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md grid place-items-center p-4"
            onClick={() => setAnnounceOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-md"
            >
              <div className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                <Megaphone size={15} className="text-primary" /> Publicar aviso del grupo
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                El aviso aparece destacado para toda la comunidad en el chat. Solo tu cuenta de
                administrador puede publicar avisos.
              </p>
              <textarea
                value={announceText}
                onChange={(e) => {
                  setAnnounceText(e.target.value);
                  setAnnounceErr(null);
                }}
                rows={4}
                maxLength={500}
                placeholder="Escribe el aviso…"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2 resize-none"
              />
              {announceErr && (
                <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{announceErr}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setAnnounceOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-border bg-background text-xs font-display tracking-widest active:scale-[0.98] transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => void publishAnnouncement()}
                  disabled={announceBusy || !announceText.trim()}
                  className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {announceBusy ? <Loader2 size={13} className="animate-spin" /> : <Megaphone size={13} />}
                  {announceBusy ? "PUBLICANDO…" : "PUBLICAR AVISO"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo: crear paquete de regalos (solo admin) */}
      <AnimatePresence>
        {giftOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md grid place-items-center p-4"
            onClick={() => setGiftOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-md"
            >
              <div className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                <PartyPopper size={15} className="text-primary" /> Crear paquete de regalos
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Regala orbes a la comunidad: elige cuántos orbes por persona (par, mínimo 100) y
                cuántas personas pueden abrirlo. Al llenarse, el paquete se cierra con animación.
              </p>
              <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] flex items-center gap-2">
                <Sparkles size={12} className="text-primary" />
                <span className="flex-1 text-muted-foreground">Tu saldo actual</span>
                <b>${myOrbes == null ? "…" : myOrbes.toLocaleString()}</b> orbes
              </div>
              <input
                value={giftTitle}
                onChange={(e) => {
                  setGiftTitle(e.target.value);
                  setGiftErr(null);
                }}
                maxLength={80}
                placeholder="Título (opcional) — p. ej. ¡Regalo por el evento!"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2"
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">
                    Orbes por persona (par, mín. 100)
                  </label>
                  <input
                    type="number"
                    min={100}
                    step={2}
                    value={giftAmount}
                    onChange={(e) => {
                      setGiftAmount(e.target.value);
                      setGiftErr(null);
                    }}
                    className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Personas que pueden abrir</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={giftPeople}
                    onChange={(e) => {
                      setGiftPeople(e.target.value);
                      setGiftErr(null);
                    }}
                    className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                  />
                </div>
              </div>
              <div className="mb-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] flex items-center gap-1.5">
                <Gift size={12} className="text-primary" />
                <span className="flex-1 text-muted-foreground">Total a descontar de tu saldo</span>
                <b className="text-primary">
                  ${(Math.floor(Number(giftAmount) || 0) * Math.floor(Number(giftPeople) || 0)).toLocaleString()}
                </b>{" "}
                orbes
              </div>
              {giftErr && (
                <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{giftErr}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setGiftOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-border bg-background text-xs font-display tracking-widest active:scale-[0.98] transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => void createGiftPackage()}
                  disabled={giftBusy}
                  className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {giftBusy ? <Loader2 size={13} className="animate-spin" /> : <Gift size={13} />}
                  {giftBusy ? "CREANDO…" : "CREAR REGALOS"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diálogo: crear encuesta (admin de la comunidad / creador o admin del grupo) */}
      <AnimatePresence>
        {pollOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-md grid place-items-center p-4"
            onClick={() => setPollOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-xl p-4 shadow-md max-h-[85vh] overflow-y-auto"
            >
              <div className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                <BarChart3 size={15} className="text-primary" /> Crear encuesta del chat
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Pregunta a la comunidad o al grupo. Cualquier miembro vota una vez y puede cambiar su
                voto; los resultados se actualizan en vivo. Solo los administradores pueden crear y
                cerrar encuestas.
              </p>
              <input
                value={pollQuestion}
                onChange={(e) => {
                  setPollQuestion(e.target.value);
                  setPollErr(null);
                }}
                maxLength={160}
                placeholder="Pregunta — p. ej. ¿Qué juego quieren a continuación?"
                className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60 mb-2"
              />
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5 mb-1.5">
                  <input
                    value={opt}
                    onChange={(e) => {
                      setPollErr(null);
                      setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)));
                    }}
                    maxLength={80}
                    placeholder={`Opción ${i + 1}`}
                    className="flex-1 bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                      title="Quitar opción"
                      className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-destructive grid place-items-center active:scale-95 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  onClick={() => setPollOptions((prev) => [...prev, ""])}
                  className="mb-2 w-full py-1.5 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40 transition"
                >
                  + Añadir opción
                </button>
              )}
              {pollErr && (
                <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{pollErr}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setPollOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-border bg-background text-xs font-display tracking-widest active:scale-[0.98] transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => void handleCreatePoll()}
                  disabled={pollBusy || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                  className="flex-1 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {pollBusy ? <Loader2 size={13} className="animate-spin" /> : <BarChart3 size={13} />}
                  {pollBusy ? "PUBLICANDO…" : "PUBLICAR ENCUESTA"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gestores del chat de trabajo */}
      <AnimatePresence>
        {manager === "tasks" && activeGroup && isWork && (
          <TaskManager
            chatId={activeGroup.chat_id}
            myId={myId ?? ""}
            myName={myName}
            canAssign={canAssignTasks}
            onClose={() => setManager(null)}
          />
        )}
        {manager === "files" && activeGroup && isWork && (
          <FileManager
            chatId={activeGroup.chat_id}
            myId={myId ?? ""}
            canDelete={canAssignTasks}
            onClose={() => setManager(null)}
          />
        )}
        {manager === "threads" && activeGroup && isWork && (
          <ThreadsManager
            chatId={activeGroup.chat_id}
            myId={myId ?? ""}
            canDelete={canAssignTasks}
            onClose={() => setManager(null)}
            onOpen={(t) => {
              setManager(null);
              setOpenThread(t);
            }}
          />
        )}
        {manager === "projects" && activeGroup && isWork && (
          <ProjectsManager
            chatId={activeGroup.chat_id}
            myId={myId ?? ""}
            myName={myName}
            canManage={canAssignTasks}
            onClose={() => setManager(null)}
          />
        )}
        {openThread && activeGroup && isWork && (
          <ThreadView
            thread={openThread}
            chatId={activeGroup.chat_id}
            myId={myId ?? ""}
            senders={senders}
            onBack={() => setOpenThread(null)}
            onClose={() => setOpenThread(null)}
          />
        )}
      </AnimatePresence>

      {/* Búsqueda global */}
      <AnimatePresence>
        {searchOpen && (
          <GlobalSearchPanel
            defaultScope={searchDefaultScope}
            onClose={() => setSearchOpen(false)}
            onOpenMessage={(chatId) => void handleOpenSearchChat(chatId)}
          />
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
