import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { fetchFeed, getMyProfile, isMod, type PostWithMeta, type Profile } from "@/lib/social/api";
import { PostComposer } from "@/components/social/PostComposer";
import { PostCard } from "@/components/social/PostCard";
import { GamePageSection } from "@/components/social/GamePageSection";
import { NotificationBell } from "@/components/social/NotificationBell";
import { Search, LogOut, Gamepad2, Palette, Sparkles, Inbox, X, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [{ title: "Publicaciones · Asternal" }] }),
  component: FeedPage,
});

type FilterCat = "all" | "game" | "artwork";

const CATEGORIES: { id: FilterCat; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "Todos", icon: <Sparkles size={13} /> },
  { id: "game", label: "Juegos", icon: <Gamepad2 size={13} /> },
  { id: "artwork", label: "Arte", icon: <Palette size={13} /> },
];

function FeedPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [mod, setMod] = useState(false);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [category, setCategory] = useState<FilterCat>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [gamePageId, setGamePageId] = useState<string | null>(null);

  // Categorías estáticas (sin píldora deslizante, sin refs ni medición): el
  // activo se pinta con el degradado por clases condicionales. Cero trabajo de
  // layout por frame → imposible que dé lag o se desalinee.
  const reload = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await fetchFeed({
        search: search || undefined,
        tag: tag || undefined,
        category: category === "all" ? undefined : category,
        includeGames: category === "game",
      });
      setPosts(data);
    } finally { if (showLoading) setLoading(false); }
  }, [search, tag, category]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setMyId(session.user.id);
      setMe(await getMyProfile());
      setMod(await isMod());
      await reload();
    })();
  }, [navigate, reload]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <>
    <div className="min-h-screen w-full flex flex-col bg-background">
      <header className="app-header sticky top-0 z-20 bg-background border-b border-border/70">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto flex items-center gap-2 px-3 py-2.5">
          {/* Monograma M3: contenedor primario relleno. Antes era un tinte del
              10 % con la letra en blanco encima: el texto no se leía. */}
          <Link to="/" aria-label="Volver al inicio"
            className="w-10 h-10 rounded-xl overflow-hidden ring-1 ring-line-strong shadow-sm active:scale-95 transition grid place-items-center bg-primary shrink-0">
            <span className="font-display text-base font-medium text-primary-foreground">A</span>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm font-semibold text-foreground leading-none tracking-wide">PUBLICACIONES</div>
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">@{me?.username ?? "..."}</div>
          </div>
          <button onClick={() => setShowFilters(s => !s)}
            className={`w-10 h-10 rounded-lg border grid place-items-center transition-colors duration-200 active:scale-95 shrink-0 ${showFilters ? "border-primary/40 bg-primary/10 text-primary" : "border-line-strong bg-card text-ink-2 hover:bg-muted/60 hover:text-foreground"}`}
            title="Búsqueda y filtros">
            <Search size={16} />
          </button>
          <span className="hidden text-[8px] font-mono text-muted-foreground/40 shrink-0" title="marcador feed">ast-feed-v1</span>
          <NotificationBell />
          <button onClick={logout} title="Cerrar sesión"
            className="w-10 h-10 rounded-lg border border-line-strong bg-card text-ink-2 grid place-items-center hover:bg-destructive/10 hover:text-destructive active:scale-95 transition shrink-0">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Filtros por categoría */}
      <div className="px-3 pt-3 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-1.5 m3-scroll-x no-scrollbar">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`m3-chip shrink-0 ${category === c.id ? "m3-chip-selected" : "text-muted-foreground hover:text-foreground"}`}>
              {c.icon}
              {c.label}
            </button>
          ))}
          <button onClick={() => setShowFilters(s => !s)}
            className={`m3-chip shrink-0 ${showFilters ? "m3-chip-selected" : "text-muted-foreground hover:text-foreground"}`}>
            <SlidersHorizontal size={13} />
            Filtros
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden">
              {/* Campos M3 con contorno: radio xs (4dp) y borde de contorno. */}
              <div className="m3-card m3-card-outlined mt-2 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-xs border border-line bg-transparent px-3 py-2 transition-colors focus-within:border-primary">
                  <Search size={14} className="text-muted-foreground shrink-0" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en publicaciones…"
                    className="flex-1 bg-transparent text-xs outline-none min-w-0" />
                  {search && <button onClick={() => setSearch("")} aria-label="Borrar búsqueda" className="m3-icon-btn h-6 w-6 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
                </label>
                <label className="flex items-center gap-2 rounded-xs border border-line bg-transparent px-3 py-2 transition-colors focus-within:border-primary">
                  <span className="text-primary text-sm shrink-0">#</span>
                  <input value={tag} onChange={e => setTag(e.target.value)} placeholder="Etiqueta…"
                    className="flex-1 bg-transparent text-xs outline-none min-w-0" />
                  {tag && <button onClick={() => setTag("")} aria-label="Borrar etiqueta" className="m3-icon-btn h-6 w-6 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
                </label>
                <button onClick={() => reload()} className="m3-btn sm:col-span-2">
                  Aplicar filtros
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="flex-1 p-3 space-y-3 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full pb-8 sm:pb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <PostComposer onCreated={reload} />
        </motion.div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="m3-card m3-card-outlined p-3 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full anim-shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 rounded-full anim-shimmer" />
                    <div className="h-2.5 w-1/4 rounded-full anim-shimmer" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded-full anim-shimmer" />
                  <div className="h-3 w-2/3 rounded-full anim-shimmer" />
                </div>
                <div className="h-48 rounded-xl anim-shimmer" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-lg border border-dashed border-line bg-card p-10 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-accent grid place-items-center">
              <Inbox size={24} className="text-accent-foreground" />
            </div>
            <div className="m3-title-medium">No hay publicaciones aún</div>
            <div className="m3-body-small text-muted-foreground max-w-xs mx-auto">Sé el primero en compartir algo con la comunidad — un juego, un dibujo o una idea.</div>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="m3-btn mt-2">
              CREAR PUBLICACIÓN
            </button>
          </motion.div>
        ) : (
          <>
            {posts.map((p, i) => (
              <div key={p.id} className="card-enter" style={{ animationDelay: `${Math.min(i * 25, 180)}ms` }}>
                <PostCard post={p} myId={myId} isMod={mod} onChange={() => reload(false)} onOpenGame={(id) => setGamePageId(id)} />
              </div>
            ))}
          </>
        )}
      </main>
    </div>

      {/* Full-screen game page */}
      {gamePageId && (
        <GamePageSection
          gameId={gamePageId}
          myId={myId}
          isMod={mod}
          onClose={() => setGamePageId(null)}
        />
      )}
    </>
  );
}
