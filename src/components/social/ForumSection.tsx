import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fileToDataURL } from "@/lib/engine/images";
import {
  initForumCategories, getForumCategories, getForumThreads, getForumThread,
  createForumThread, createForumPost, getForumPosts, deleteForumThread,
  deleteForumPost, editForumPost, voteForumPost, togglePinThread,
  toggleCloseThread, incrementThreadView, searchForumThreads,
  voteForumThread, getForumThreadsWithVotes,
  markAsSolution, unmarkSolution,
  type ForumCategory, type ForumThread, type ForumPost,
} from "@/lib/social/forum-storage";
import {
  MessageSquare, Pin, Lock, ArrowLeft, Plus, ThumbsUp, ThumbsDown,
  Reply, Quote, Trash2, Edit3, Send, Loader2, Eye, Clock, Hash,
  X, Check, MessageCircle, Search,
  Globe, LifeBuoy, Trophy, Coffee, MessageCircleMore, Tag,
  Image, FileText, Film, ChevronDown, Sparkles, Bookmark, MessageSquareText, AtSign,
  User, Calendar, Edit, CheckCircle,
} from "lucide-react";

/* ─── Motion variants ─── */
const stagger = {
  container: { initial: {}, animate: { transition: { staggerChildren: 0.02 } } },
  item: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
  },
};

// Transición de vistas: solo opacidad + desplazamiento mínimo (GPU, sin blur,
// sin reflow) para que el cambio entre categorías/hilos se sienta fluido.
const fadeSlide = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -3, transition: { duration: 0.1, ease: "easeOut" as const } },
};

/* ─── Time ago ─── */
function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

/* ─── Icon map ─── */
const CAT_ICONS: Record<string, React.ReactNode> = {
  "globe": <Globe size={18} />,
  "life-buoy": <LifeBuoy size={18} />,
  "trophy": <Trophy size={18} />,
  "message-circle-more": <MessageCircleMore size={18} />,
  "coffee": <Coffee size={18} />,
};

/* ─── Tag color map ─── */
const TAG_STYLES: Record<string, string> = {
  "Programación": "bg-blue-50/80 text-blue-600 border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40",
  "IA": "bg-purple-50/80 text-purple-600 border-purple-200/60 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40",
  "UI": "bg-cyan-50/80 text-cyan-600 border-cyan-200/60 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800/40",
  "Pixel Art": "bg-emerald-50/80 text-emerald-600 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40",
  "Música": "bg-rose-50/80 text-rose-600 border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/40",
  "Física": "bg-amber-50/80 text-amber-600 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40",
  "Animación": "bg-orange-50/80 text-orange-600 border-orange-200/60 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/40",
  "Assets": "bg-teal-50/80 text-teal-600 border-teal-200/60 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800/40",
  "Publicación": "bg-indigo-50/80 text-indigo-600 border-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/40",
  "Render": "bg-pink-50/80 text-pink-600 border-pink-200/60 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-800/40",
  "General": "bg-neutral-50/80 text-neutral-500 border-neutral-200/60 dark:bg-neutral-900/30 dark:text-neutral-400 dark:border-neutral-800/40",
};

const DEFAULT_TAG_STYLE = "bg-neutral-50/80 text-neutral-500 border-neutral-200/60 dark:bg-neutral-900/30 dark:text-neutral-400 dark:border-neutral-800/40";

/* ─── User avatar (100% opaque) ─── */
function AvatarMini({ username, size = "md" }: { username: string; size?: "sm" | "md" | "lg" }) {
  const sizeMap = { sm: "w-6 h-6 text-[9px]", md: "w-8 h-8 text-xs", lg: "w-10 h-10 text-sm" };
  const letter = username[0]?.toUpperCase() ?? "?";
  // Generate two deterministic hues from username
  const h1 = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const h2 = (h1 + 40) % 360;
  // Convert HSL to RGB for guaranteed 100% opaque solid colors
  const c1 = hslToRgb(h1, 65, 48);
  const c2 = hslToRgb(h2, 60, 38);
  return (
    <div
      className={`${sizeMap[size]} rounded-full grid place-items-center font-display font-semibold shrink-0`}
      style={{
        background: `linear-gradient(135deg, rgb(${c1.join(",")}), rgb(${c2.join(",")}))`,
        color: "rgb(255,255,255)",
        backgroundSize: "cover",
      }}
    >
      {letter}
    </div>
  );
}

// Helper: HSL → RGB (returns [r,g,b] 0-255, fully opaque)
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/* ─── Vote button ─── */
function VoteBtn({ dir, active, count, onClick }: { dir: "up" | "down"; active: boolean; count: number; onClick: () => void }) {
  const Icon = dir === "up" ? ThumbsUp : ThumbsDown;
  const activeColors = dir === "up"
    ? "text-primary bg-primary/15 border-primary/25 shadow-sm shadow-primary/10"
    : "text-rose-500 bg-rose-50 border-rose-200 shadow-sm shadow-rose-10 dark:text-rose-400 dark:bg-rose-950/30 dark:border-rose-800/40";
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 text-[11px] px-1.5 sm:px-2 sm:px-2.5 py-1.5 rounded-lg border transition-all duration-200 active:scale-90 hover:shadow-sm ${
        active
          ? activeColors
          : "text-muted-foreground/40 border-transparent hover:border-border/60 hover:text-foreground/60 hover:bg-muted/20"
      }`}>
      <Icon size={12} className={active ? "fill-current" : ""} />
      {count > 0 && <span className="tabular-nums font-medium">{count}</span>}
    </button>
  );
}

/* ─── Tag pill ─── */
function TagPill({ tag, small }: { tag: string; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium border ${
      TAG_STYLES[tag] ?? DEFAULT_TAG_STYLE
    } ${small ? "text-[9px] px-2 py-0.5" : "text-[10px] px-2.5 py-0.5"}`}>
      {tag}
    </span>
  );
}

/* ─── Skeleton loading ─── */
function SkeletonCard() {
  return (
    <div className="animate-pulse p-4 rounded-xl border border-border/30 bg-white/40 space-y-3">
      <div className="h-4 bg-muted/40 rounded w-3/4" />
      <div className="h-3 bg-muted/30 rounded w-1/2" />
      <div className="h-3 bg-muted/30 rounded w-1/4" />
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border/30 grid place-items-center text-muted-foreground/30 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-display font-semibold text-foreground/70 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground/50 max-w-xs">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

/* ─── Main Component ─── */
type View = { type: "categories" } | { type: "threads"; categoryId: string; categoryName: string } | { type: "thread"; threadId: string };

export function ForumSection({ isAdmin: isAdminProp, isMod: isModProp }: { isAdmin?: boolean; isMod?: boolean }) {
  const [view, setView] = useState<View>({ type: "categories" });
  const [myId, setMyId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState("");
  const adminOrMod = !!(isAdminProp || isModProp);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: d }) => {
      if (d?.session?.user) {
        setMyId(d.session.user.id);
        const user = d.session.user;
        const meta = (user as Record<string, unknown>)?.user_metadata as Record<string, string> | undefined;
        if (meta?.username) {
          setMyUsername(meta.username);
        } else {
          try {
            const users = JSON.parse(localStorage.getItem('_local_auth_users') || '[]');
            const u = users.find((u: Record<string, unknown>) => u.id === user.id);
            setMyUsername((u?.username as string) ?? user.email?.split("@")[0] ?? "user");
          } catch {
            setMyUsername(user.email?.split("@")[0] ?? "user");
          }
        }
      }
    });
  }, []);

  const handleCategorySelect = useCallback((id: string, name: string) => {
    setView({ type: "threads", categoryId: id, categoryName: name });
  }, []);

  const handleThreadSelect = useCallback((threadId: string) => {
    setView({ type: "thread", threadId });
  }, []);

  const handleBackCategories = useCallback(() => {
    setView({ type: "categories" });
  }, []);

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {view.type === "categories" && (
          <motion.div key="categories" {...fadeSlide}>
            <CategoryListView onSelect={handleCategorySelect} />
          </motion.div>
        )}
        {view.type === "threads" && (
          <motion.div key="threads" {...fadeSlide}>
            <ThreadListView
              categoryId={view.categoryId}
              categoryName={view.categoryName}
              myId={myId}
              myUsername={myUsername}
              adminOrMod={adminOrMod}
              onBack={handleBackCategories}
              onSelect={handleThreadSelect}
            />
          </motion.div>
        )}
        {view.type === "thread" && (
          <motion.div key="thread" {...fadeSlide}>
            <ThreadDetailView
              threadId={view.threadId}
              myId={myId}
              myUsername={myUsername}
              adminOrMod={adminOrMod}
              onBack={handleBackCategories}
              onCategoryBack={(catId, catName) => setView({ type: "threads", categoryId: catId, categoryName: catName })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Category List ─── */
function CategoryListView({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [cats, setCats] = useState<ForumCategory[]>([]);
  useEffect(() => { initForumCategories().then(setCats); }, []);
  return (
    <motion.div initial="initial" animate="animate" variants={stagger.container} className="space-y-3">
      {/* Header */}
      <motion.div variants={stagger.item} className="flex items-center gap-3 px-1">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/10 grid place-items-center">
          <Hash size={15} className="text-primary/60" />
        </div>
        <div>
          <h2 className="text-sm font-display font-semibold">Foros de la comunidad</h2>
          <p className="text-[10px] text-muted-foreground/50">Explora las categorías y únete a la conversación</p>
        </div>
      </motion.div>

      {/* Category grid */}
      <div className="grid gap-2 sm:grid-cols-2">
        {cats.map(cat => (
          <motion.button key={cat.id} variants={stagger.item}
            onClick={() => onSelect(cat.id, cat.name)}
            className="group w-full text-left p-3.5 sm:p-4 rounded-xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-200"
          >
            <div className="flex items-start gap-3.5">
              {/* Icon bubble */}
              <span className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/10 grid place-items-center shrink-0 text-primary group-hover:scale-110 group-hover:bg-primary/15 transition-all duration-300">
                {CAT_ICONS[cat.icon] ?? <MessageSquare size={20} />}
              </span>

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-display font-semibold text-foreground/90 group-hover:text-primary transition-colors">
                    {cat.name}
                  </h3>
                  {/* Thread count badge */}
                  <div className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/40 text-[10px] text-muted-foreground/60 border border-border/30">
                    <MessageSquareText size={10} />
                    <span className="tabular-nums font-medium">{cat.threadCount}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-1 line-clamp-2 leading-relaxed">
                  {cat.description}
                </p>
              </div>

              {/* Arrow indicator */}
              <div className="shrink-0 pt-1 text-muted-foreground/20 group-hover:text-primary/40 transition-colors duration-300">
                <ArrowLeft size={14} className="rotate-180" />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── Thread List ─── */
function ThreadListView({
  categoryId, categoryName, myId, myUsername, adminOrMod, onBack, onSelect,
}: {
  categoryId: string; categoryName: string; myId: string | null; myUsername: string; adminOrMod: boolean;
  onBack: () => void; onSelect: (threadId: string) => void;
}) {
  const [threads, setThreads] = useState<(ForumThread & { myVote: "up" | "down" | null })[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const load = () => { getForumThreadsWithVotes(categoryId, myId).then(setThreads); };
  useEffect(load, [categoryId, myId]);

  useEffect(() => {
    const urls = mediaFiles.map(f => URL.createObjectURL(f));
    setMediaPreviews(urls);
    return () => { urls.forEach(URL.revokeObjectURL); };
  }, [mediaFiles]);

  const filtered = searchQ.trim()
    ? threads.filter(t => t.title.toLowerCase().includes(searchQ.toLowerCase()) || t.content.toLowerCase().includes(searchQ.toLowerCase()))
    : threads;

  const create = async () => {
    if (!title.trim() || !content.trim() || !myId) return;
    setBusy(true);
    try {
      const processed: { mediaUrls: string[]; mediaType: "image" | "video" | "none"; documentUrls: string[]; documentNames: string[] } = {
        mediaUrls: [], mediaType: "none", documentUrls: [], documentNames: [],
      };
      if (mediaFiles.length > 0) {
        processed.mediaType = mediaFiles[0].type.startsWith("video") ? "video" : "image";
        processed.mediaUrls = await Promise.all(mediaFiles.map(f => fileToDataURL(f)));
      }
      if (docFiles.length > 0) {
        processed.documentUrls = await Promise.all(docFiles.map(f => fileToDataURL(f)));
        processed.documentNames = docFiles.map(f => f.name);
      }
      await createForumThread(categoryId, title, content, { id: myId, username: myUsername }, undefined, processed);
      setTitle(""); setContent(""); setMediaFiles([]); setDocFiles([]); setShowNew(false);
    } finally { setBusy(false); load(); }
  };

  const handleThreadVote = (threadId: string, vote: "up" | "down") => {
    if (!myId) return;
    voteForumThread(threadId, myId, vote).then(load);
  };

  return (
    <div className="space-y-3">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2.5">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack}
          className="w-9 h-9 rounded-lg border border-border/50 bg-surface grid place-items-center shrink-0 hover:bg-muted transition-all"
        >
          <ArrowLeft size={15} />
        </motion.button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="hidden min-[400px]:grid w-8 h-8 rounded-xl bg-primary/10 border border-primary/10 place-items-center shrink-0">
            {CAT_ICONS[
              categoryId === "general" ? "globe" :
              categoryId === "help" ? "life-buoy" :
              categoryId === "showcase" ? "trophy" :
              categoryId === "feedback" ? "message-circle-more" : "coffee"
            ] ?? <MessageSquare size={16} className="text-primary" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-display font-semibold truncate">{categoryName}</h2>
            <p className="text-[10px] text-muted-foreground/50">{filtered.length} hilos</p>
          </div>
        </div>

        {myId && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowNew(s => !s)}
            className="flex items-center gap-1.5 h-9 px-2.5 sm:px-4 rounded-lg bg-primary text-primary-foreground text-[10px] sm:text-[11px] font-display tracking-wider active:scale-[0.97] transition shrink-0"
          >
            <Plus size={14} /> NUEVO HILO
          </motion.button>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className="flex items-center gap-2.5 bg-surface rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 border border-border/50 focus-within:border-primary/30 transition-all duration-200">
        <Search size={14} className="text-muted-foreground/40 shrink-0" />
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="Buscar hilos por título o contenido…"
          className="flex-1 bg-transparent text-sm outline-none py-0.5 placeholder:text-muted-foreground/40" />
        {searchQ && (
          <button onClick={() => setSearchQ("")} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors p-1">
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── New thread form ── */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
            className="p-3.5 sm:p-5 rounded-2xl border border-primary/20 bg-primary/[0.02] shadow-sm space-y-3.5"
            >
              <div className="flex items-center gap-2.5 mb-1">
                <Sparkles size={14} className="text-primary/60" />
                <span className="text-[10px] font-display tracking-wider text-muted-foreground/60 uppercase">Nuevo hilo</span>
              </div>

              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del hilo…"
                maxLength={120} autoFocus
                className="w-full bg-surface rounded-lg px-4 py-3 text-sm outline-none border border-border/50 focus:border-primary/40 transition-all placeholder:text-muted-foreground/40" />

              <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Escribe tu mensaje…"
                rows={4} maxLength={5000}
                className="w-full bg-surface rounded-lg px-4 py-3 text-sm outline-none border border-border/50 focus:border-primary/40 resize-none transition-all placeholder:text-muted-foreground/40" />

              {/* Media previews */}
              {mediaPreviews.length > 0 && (
                <div className={`grid gap-2 ${mediaPreviews.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {mediaPreviews.map((url, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden bg-muted/20 border border-border/40 group">
                      {mediaFiles[i]?.type.startsWith("video") ? (
                        <video src={url} className="w-full rounded-xl" controls muted />
                      ) : (
                        <img src={url} alt="" className="w-full rounded-xl" loading="lazy" />
                      )}
                      <button onClick={() => setMediaFiles(f => f.filter((_, idx) => idx !== i))}
                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 text-white grid place-items-center opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all active:scale-90"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Document previews */}
              {docFiles.length > 0 && (
                <div className="space-y-1.5">
                  {docFiles.map((d, i) => (
                    <div key={i} className="flex items-center gap-2.5 bg-surface rounded-lg px-3.5 py-2.5 text-xs border border-border/40">
                      <FileText size={14} className="text-primary/60 shrink-0" />
                      <span className="flex-1 truncate font-medium text-foreground/80">{d.name}</span>
                      <span className="text-muted-foreground/50 tabular-nums text-[10px]">{(d.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setDocFiles(f => f.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground/30 hover:text-destructive transition-colors p-0.5">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload buttons */}
              <div className="flex items-center gap-2">
                <input ref={mediaInputRef} type="file" hidden accept="image/*,image/gif,video/*" multiple onChange={e => {
                  const list = Array.from(e.target.files ?? []);
                  if (list.length) { setMediaFiles(prev => [...prev, ...list]); }
                  e.target.value = "";
                }} />
                <button onClick={() => mediaInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/50 text-[10px] text-muted-foreground/60 hover:text-primary hover:border-primary/30 hover:bg-primary/[0.03] transition-all active:scale-95"
                >
                  <Image size={12} /> Imagen / Video
                </button>
                <input ref={docInputRef} type="file" hidden multiple accept=".pdf,.doc,.docx,.txt,.zip,.json" onChange={e => {
                  const list = Array.from(e.target.files ?? []);
                  if (list.length) { setDocFiles(prev => [...prev, ...list]); }
                  e.target.value = "";
                }} />
                <button onClick={() => docInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/50 text-[10px] text-muted-foreground/60 hover:text-primary hover:border-primary/30 hover:bg-primary/[0.03] transition-all active:scale-95"
                >
                  <FileText size={12} /> Documento
                </button>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => { setShowNew(false); setMediaFiles([]); setDocFiles([]); }}
                  className="px-4 py-2 rounded-xl border border-border/50 text-[11px] hover:bg-muted/20 transition-colors"
                >
                  Cancelar
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  disabled={busy || !title.trim() || !content.trim()} onClick={create}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-display tracking-wider disabled:opacity-40 transition-all shadow-sm shadow-primary/20 flex items-center gap-1.5"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} PUBLICAR HILO
                </motion.button>
              </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* ── Thread list ── */}
      <motion.div initial="initial" animate="animate" variants={stagger.container} className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title={searchQ ? "Sin resultados" : "Aún no hay hilos"}
            subtitle={searchQ ? "Prueba con otros términos de búsqueda." : "Inicia sesión y sé el primero en crear un hilo."}
            action={myId && !searchQ ? (
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowNew(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-display tracking-wider shadow-md shadow-primary/25"
              >
                <Plus size={13} /> CREAR PRIMER HILO
              </motion.button>
            ) : undefined}
          />
        ) : filtered.map((t, idx) => (
          <motion.button key={t.id} variants={stagger.item} layout
            onClick={() => onSelect(t.id)}
            className="group w-full text-left p-3 sm:p-4 rounded-xl border border-border/40 bg-card hover:border-primary/15 transition-all duration-200"
          >
            <div className="flex items-start gap-3.5">
              {/* ── Vote column ── */}
              <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                <VoteBtn dir="up" active={t.myVote === "up"} count={t.upvotes} onClick={() => handleThreadVote(t.id, "up")} />
                <VoteBtn dir="down" active={t.myVote === "down"} count={t.downvotes} onClick={() => handleThreadVote(t.id, "down")} />
              </div>

              {/* ── Content ── */}
              <div className="flex-1 min-w-0">
                {/* Title row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {t.pinned && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-semibold tracking-wider border border-primary/20">
                      <Pin size={9} /> FIJADO
                    </span>
                  )}
                  {t.closed && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500 text-[8px] font-semibold tracking-wider border border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40">
                      <Lock size={9} /> CERRADO
                    </span>
                  )}
                  <span className="text-sm font-display font-semibold text-foreground/90 group-hover:text-primary transition-colors leading-snug">
                    {t.title}
                  </span>
                </div>

                {/* Content preview */}
                <p className="text-xs text-muted-foreground/50 mt-1.5 line-clamp-1 leading-relaxed">
                  {t.content.length > 80 ? t.content.slice(0, 80) + "…" : t.content}
                </p>

                {/* Tags */}
                {t.tags && t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.tags.map(tag => <TagPill key={tag} tag={tag} small />)}
                  </div>
                )}

                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[10px] text-muted-foreground/50">
                  <span className="flex items-center gap-1.5 font-medium text-foreground/60">
                    <User size={10} /> @{t.authorUsername}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={9} /> {timeAgo(t.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquareText size={9} /> {t.postCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye size={9} /> {t.views}
                  </span>
                  {t.lastPostAt !== t.createdAt && (
                    <span className="text-muted-foreground/30">
                      · Último: {timeAgo(t.lastPostAt)} por @{t.lastPostAuthor}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Right meta (desktop) ── */}
              {t.mediaUrls && t.mediaUrls.length > 0 && (
                <div className="shrink-0 hidden sm:flex items-center text-muted-foreground/30 mt-0.5">
                  {t.mediaType === "video" ? <Film size={12} /> : <Image size={12} />}
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Thread Detail ─── */
function ThreadDetailView({
  threadId, myId, myUsername, adminOrMod, onBack, onCategoryBack,
}: {
  threadId: string; myId: string | null; myUsername: string; adminOrMod: boolean;
  onBack: () => void; onCategoryBack: (catId: string, catName: string) => void;
}) {
  const [thread, setThread] = useState<(ForumThread & { myVote: "up" | "down" | null }) | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [replyContent, setReplyContent] = useState("");
  const [quotePost, setQuotePost] = useState<{ id: string; content: string; author: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const load = () => {
    getForumThread(threadId).then(t => setThread(t));
    getForumPosts(threadId).then(setPosts);
  };
  useEffect(() => {
    incrementThreadView(threadId);
    load();
  }, [threadId]);

  const sendReply = async () => {
    if (!replyContent.trim() || !myId || thread?.closed) return;
    setBusy(true);
    await createForumPost(
      threadId,
      replyContent,
      { id: myId, username: myUsername },
      { postId: quotePost?.id ?? null, content: quotePost?.content ?? null, author: quotePost?.author ?? null },
    );
    setReplyContent("");
    setQuotePost(null);
    setBusy(false);
    load();
  };

  const handlePostVote = (postId: string, vote: "up" | "down") => {
    if (!myId) return;
    voteForumPost(postId, myId, vote).then(() => getForumPosts(threadId).then(setPosts));
  };

  const handleThreadVote = (vote: "up" | "down") => {
    if (!myId || !thread) return;
    voteForumThread(threadId, myId, vote).then(() => getForumThread(threadId).then(setThread));
  };

  const handleEdit = (postId: string) => {
    const p = posts.find(po => po.id === postId);
    if (!p) return;
    setEditingPost(postId);
    setEditContent(p.content);
  };

  const saveEdit = async (postId: string) => {
    if (!editContent.trim()) return;
    await editForumPost(postId, editContent);
    setEditingPost(null);
    getForumPosts(threadId).then(setPosts);
  };

  const handleDelete = (postId: string) => {
    if (!confirm("¿Borrar este mensaje?")) return;
    deleteForumPost(postId).then(() => getForumPosts(threadId).then(setPosts));
  };

  const handleQuote = (p: ForumPost) => {
    setQuotePost({ id: p.id, content: p.content.slice(0, 300), author: p.authorUsername });
    replyRef.current?.focus();
  };

  const handleMarkSolution = (postId: string) => {
    markAsSolution(threadId, postId).then(load);
  };

  const handleUnmarkSolution = () => {
    unmarkSolution(threadId).then(load);
  };

  const [cats, setCats] = useState<ForumCategory[]>([]);
  useEffect(() => { getForumCategories().then(setCats); }, []);
  const cat = cats.find(c => c.id === thread?.categoryId);
  const catIcon = cat ? CAT_ICONS[cat.icon] ?? <MessageSquare size={14} /> : <MessageSquare size={14} />;
  const isOwner = myId === thread?.authorId;
  const isClosed = thread?.closed ?? false;
  const canPin = adminOrMod;

  if (!thread) return (
    <EmptyState
      icon={<MessageSquare size={28} />}
      title="Hilo no encontrado"
      subtitle="Este hilo puede haber sido eliminado o no existe."
      action={
        <button onClick={onBack} className="text-xs text-primary underline hover:no-underline transition-colors">
          Volver a categorías
        </button>
      }
    />
  );

  return (
    <div className="space-y-3">
      {/* ── Navigation bar ── */}
      <div className="flex items-center gap-2.5">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack}
          className="w-9 h-9 rounded-lg border border-border/50 bg-surface grid place-items-center shrink-0 hover:bg-muted transition-all"
        >
          <ArrowLeft size={15} />
        </motion.button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {thread.pinned && <Pin size={11} className="text-primary shrink-0" />}
            {thread.closed && <Lock size={11} className="text-rose-500 shrink-0" />}
            <h3 className="text-sm font-display font-semibold truncate">{thread.title}</h3>
          </div>
          <motion.button whileHover={{ x: 3 }} onClick={() => onCategoryBack(thread.categoryId, cat?.name ?? "Foros")}
            className="text-[10px] text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-1 mt-0.5"
          >
            <ArrowLeft size={10} /> {catIcon} Volver a {cat?.name ?? "Foros"}
          </motion.button>
        </div>

        {/* Admin actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {canPin && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { togglePinThread(threadId).then(load); }}
              className={`h-8 w-8 sm:w-auto sm:px-3 rounded-xl border text-[10px] font-medium flex items-center justify-center gap-1.5 transition-all ${
                thread.pinned
                  ? "border-primary/25 bg-primary/8 text-primary shadow-sm"
                  : "border-border/50 text-muted-foreground/60 hover:text-primary hover:border-primary/25"
              }`}>
              <Pin size={11} /> <span className="hidden sm:inline">{thread.pinned ? "FIJADO" : "FIJAR"}</span>
            </motion.button>
          )}
          {isOwner && !isClosed && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { toggleCloseThread(threadId).then(load); }}
              className="h-8 w-8 sm:w-auto sm:px-3 rounded-xl border border-border/50 text-[10px] font-medium flex items-center justify-center gap-1.5 hover:text-rose-500 hover:border-rose-200 transition-all">
              <Lock size={11} /> <span className="hidden sm:inline">CERRAR</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Thread body + replies ── */}
      <motion.div initial="initial" animate="animate" variants={stagger.container} className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1.5 no-scrollbar">
        {/* ── Original post (featured) ── */}
        <motion.div variants={stagger.item} className="p-3.5 sm:p-5 rounded-xl border border-border/40 bg-card">
          {/* Author header */}
          <div className="flex items-start gap-3 mb-4">
            <AvatarMini username={thread.authorUsername} size="lg" />
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-display font-semibold">@{thread.authorUsername}</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/8 text-primary/70 text-[8px] font-semibold tracking-wider border border-primary/15">
                  AUTOR
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/50">
                <Calendar size={9} />
                <span>{new Date(thread.createdAt).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
            {/* Thread vote buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <VoteBtn dir="up" active={thread.myVote === "up"} count={thread.upvotes} onClick={() => handleThreadVote("up")} />
              <VoteBtn dir="down" active={thread.myVote === "down"} count={thread.downvotes} onClick={() => handleThreadVote("down")} />
            </div>
          </div>

          {/* Tags */}
          {thread.tags && thread.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {thread.tags.map(tag => <TagPill key={tag} tag={tag} />)}
            </div>
          )}

          {/* Content */}
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/85">
            {thread.content}
          </div>

          {/* Media */}
          {thread.mediaUrls && thread.mediaUrls.length > 0 && (
            <div className={`grid gap-2.5 mt-4 ${thread.mediaUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {thread.mediaUrls.map((url, i) => (
                thread.mediaType === "video" ? (
                  <video key={i} src={url} controls muted className="rounded-xl w-full bg-black shadow-sm" />
                ) : (
                  <div key={i} className="rounded-xl overflow-hidden border border-border/20 shadow-sm">
                    <img src={url} alt="" className="w-full" loading="lazy" />
                  </div>
                )
              ))}
            </div>
          )}

          {/* Documents */}
          {thread.documentUrls && thread.documentUrls.length > 0 && (
            <div className="space-y-1.5 mt-4">
              {thread.documentUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" download={thread.documentNames[i]}
                  className="flex items-center gap-3 bg-muted/20 hover:bg-muted/40 rounded-xl px-4 py-3 text-xs transition border border-border/20 group"
                >
                  <FileText size={16} className="text-primary/60 shrink-0" />
                  <span className="flex-1 truncate font-medium text-foreground/70 group-hover:text-foreground transition-colors">
                    {thread.documentNames[i] ?? `Documento ${i + 1}`}
                  </span>
                  <span className="text-[10px] text-primary/60 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Descargar →
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* Stats footer */}
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/20 text-[10px] text-muted-foreground/40">
            <span className="flex items-center gap-1"><Eye size={10} /> {thread.views} vistas</span>
            <span className="flex items-center gap-1"><MessageSquareText size={10} /> {thread.postCount} respuestas</span>
          </div>
        </motion.div>

        {/* ── Replies ── */}
        {posts.filter(p => p.id !== posts[0]?.id).length === 0 ? (
          <motion.div variants={stagger.item}>
            <div className="text-center py-10 border border-dashed border-border/30 rounded-2xl bg-white/30">
              <MessageSquare size={22} className="mx-auto mb-2.5 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/50">Sin respuestas aún</p>
              <p className="text-[10px] text-muted-foreground/30 mt-0.5">¡Sé el primero en comentar!</p>
            </div>
          </motion.div>
        ) : posts.filter(p => p.id !== posts[0]?.id).map((p, idx) => {
          const isSolution = thread.solutionPostId === p.id;
          return (
          <motion.div key={p.id} variants={stagger.item} layout
            className={`group/post p-3 sm:p-4 rounded-2xl border transition-all duration-200 ${
              isSolution
                ? "border-emerald-300/40 bg-emerald-50/30 hover:bg-emerald-50/60 dark:bg-emerald-950/10 dark:border-emerald-800/30"
                : "border-border/25 bg-white/50 hover:bg-surface hover:border-border/40"
            }`}
          >
            {/* Solution badge */}
            {isSolution && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 mb-3 text-emerald-600 dark:text-emerald-400"
              >
                <CheckCircle size={14} className="fill-emerald-500 text-white dark:fill-emerald-400 dark:text-emerald-950" />
                <span className="text-[10px] font-display font-semibold tracking-wider uppercase">Solución</span>
              </motion.div>
            )}
            {/* Quote */}
            {p.quoteContent && (
              <div className="mb-3 pl-4 border-l-[3px] border-primary/30 bg-primary/[0.02] rounded-r-lg py-2.5 px-3 text-xs">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold text-primary/60 uppercase tracking-wider mb-1">
                  <Quote size={10} /> @{p.quoteAuthor} escribió:
                </div>
                <p className="italic text-muted-foreground/70 line-clamp-2 text-[11px] leading-relaxed">{p.quoteContent}</p>
              </div>
            )}

            <div className="flex gap-3">
              <AvatarMini username={p.authorUsername} size="md" />
              <div className="flex-1 min-w-0">
                {/* Author line */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12px] font-display font-semibold text-foreground/80">@{p.authorUsername}</span>
                  <span className="text-[9px] text-muted-foreground/40">{timeAgo(p.createdAt)}</span>
                  {p.editedAt && (
                    <span className="text-[7px] text-muted-foreground/30 uppercase tracking-wider flex items-center gap-0.5">
                      <Edit size={7} /> editado
                    </span>
                  )}
                  {myId === p.authorId && (
                    <span className="text-[7px] text-muted-foreground/30 uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted/20 border border-border/20">
                      TÚ
                    </span>
                  )}
                </div>

                {/* Content / Edit */}
                {editingPost === p.id ? (
                  <div className="space-y-2">
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                      rows={3}
                      className="m3-text-field m3-text-field-outlined w-full text-sm resize-none" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingPost(null)}
                        className="text-[10px] px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted/20 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={() => saveEdit(p.id)}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground active:scale-95 transition flex items-center gap-1 shadow-sm">
                        <Check size={11} /> Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/80">
                    {p.content}
                  </div>
                )}

                {/* Action bar: visible siempre en táctil (sin hover); en escritorio aparece al pasar el cursor */}
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-2.5 opacity-100 sm:opacity-0 sm:group-hover/post:opacity-100 transition-all duration-200">
                  <button onClick={() => handlePostVote(p.id, "up")}
                    className={`flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border transition-all active:scale-90 ${
                      p.myVote === "up"
                        ? "text-primary bg-primary/10 border-primary/20 shadow-sm"
                        : "text-muted-foreground/40 border-transparent hover:text-primary hover:border-border/50"
                    }`}>
                    <ThumbsUp size={10} className={p.myVote === "up" ? "fill-current" : ""} />
                    {p.upvotes > 0 && <span className="tabular-nums font-medium">{p.upvotes}</span>}
                  </button>
                  <button onClick={() => handlePostVote(p.id, "down")}
                    className={`flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border transition-all active:scale-90 ${
                      p.myVote === "down"
                        ? "text-rose-500 bg-rose-50 border-rose-200 shadow-sm dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40"
                        : "text-muted-foreground/40 border-transparent hover:text-rose-500 hover:border-border/50"
                    }`}>
                    <ThumbsDown size={10} />
                    {p.downvotes > 0 && <span className="tabular-nums font-medium">{p.downvotes}</span>}
                  </button>

                  {!isClosed && myId && (
                    <>
                      <div className="w-px h-4 bg-border/30 mx-0.5" />
                      <button onClick={() => handleQuote(p)}
                        className="flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border border-transparent text-muted-foreground/40 hover:text-primary hover:border-border/50 transition-all active:scale-90">
                        <Quote size={10} /> Citar
                      </button>
                      {/* Mark as solution button — only for thread author */}
                      {myId === thread.authorId && (
                        isSolution ? (
                          <button onClick={() => handleUnmarkSolution()}
                            className="flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border border-emerald-200/60 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-all active:scale-90">
                            <CheckCircle size={10} /> Solución
                          </button>
                        ) : (
                          <button onClick={() => handleMarkSolution(p.id)}
                            className="flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border border-transparent text-muted-foreground/40 hover:text-emerald-600 hover:border-emerald-200 transition-all active:scale-90">
                            <CheckCircle size={10} /> Marcar solución
                          </button>
                        )
                      )}
                      {myId === p.authorId && (
                        <>
                          <button onClick={() => handleEdit(p.id)}
                            className="flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border border-transparent text-muted-foreground/40 hover:text-primary hover:border-border/50 transition-all active:scale-90">
                            <Edit3 size={10} /> Editar
                          </button>
                          <button onClick={() => handleDelete(p.id)}
                            className="flex items-center gap-1 text-[10px] px-2 sm:px-2.5 py-1 rounded-lg border border-transparent text-muted-foreground/40 hover:text-rose-500 hover:border-rose-200 transition-all active:scale-90">
                            <Trash2 size={10} /> Borrar
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
          );
        })}
      </motion.div>

      {/* ── Reply box ── */}
      {myId && !isClosed ? (
        <div className="space-y-2.5 pt-1">
          {/* Quote indicator */}
          <AnimatePresence>
            {quotePost && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/[0.03] border border-primary/20 text-xs"
              >
                <Quote size={13} className="text-primary/50 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-primary/60 text-[9px] uppercase tracking-wider">@{quotePost.author}</span>
                  <p className="text-muted-foreground/70 truncate mt-0.5 text-[11px]">{quotePost.content}</p>
                </div>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => setQuotePost(null)}
                  className="text-muted-foreground/30 hover:text-rose-500 shrink-0 transition-colors p-0.5"
                >
                  <X size={13} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <div className="relative">
            <textarea ref={replyRef} value={replyContent} onChange={e => setReplyContent(e.target.value)}
              placeholder={quotePost ? "Escribe tu respuesta a esta cita…" : "Escribe un comentario…"}
              rows={2} maxLength={5000}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); } }}
              className="w-full bg-surface rounded-xl px-4 py-3 text-sm outline-none border border-border/40 focus:border-primary/30 transition-all resize-none placeholder:text-muted-foreground/40"
            />
            {/* Bottom actions */}
            <div className="flex justify-between items-center px-1 py-1.5">
              <span className="hidden sm:inline-flex text-[8px] text-muted-foreground/30 uppercase tracking-wider items-center gap-1">
                <AtSign size={8} /> Cmd/Ctrl + Enter para enviar
              </span>
              <motion.button whileTap={{ scale: 0.95 }}
                disabled={busy || !replyContent.trim()} onClick={sendReply}
                className="flex items-center gap-1.5 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-[11px] font-display tracking-wider disabled:opacity-40 transition-all shadow-sm shadow-primary/25 hover:shadow-md"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} ENVIAR
              </motion.button>
            </div>
          </div>
        </div>
      ) : !myId ? (
        <div className="flex items-center justify-center gap-2 py-5 border border-dashed border-border/30 rounded-2xl bg-white/30">
          <MessageSquare size={14} className="text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground/50">Inicia sesión para participar en la conversación.</span>
        </div>
      ) : isClosed && (
        <div className="flex items-center gap-2.5 py-4 px-4 border border-border/30 rounded-2xl bg-muted/10 text-[11px] text-muted-foreground/60">
          <Lock size={13} className="shrink-0 text-rose-400" />
          Este hilo está cerrado. No se pueden añadir nuevos mensajes.
        </div>
      )}
    </div>
  );
}
