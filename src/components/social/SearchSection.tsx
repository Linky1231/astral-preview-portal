import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search, Gamepad2, Newspaper, Users,
  Palette, Loader2, ChevronRight, Image, Film,
  Sparkles, Heart, MessageCircle, Eye, History,
} from "lucide-react";
import { HaloSearchInput } from "@/components/ui/halo-search";
import { Avatar } from "./Avatar";
import { fetchGames, fetchFeed, fetchArtworks, type PostWithMeta, type Profile } from "@/lib/social/api";
import { searchUsers } from "@/lib/social/global-search";
import { coverFrameFromPreset, coverFrameStyle } from "@/lib/social/cover-frame";
import { searchResultRowClass } from "@/lib/social/search-presentation";
import { clearRecentSearches, readRecentSearches, rememberSearch } from "@/lib/social/recent-searches";
import { filterStateClass } from "@/lib/ui/filter-control";
import { GameIconPlaceholder } from "./GameIcon";

/* ─── Types ─── */
type Tab = "all" | "users" | "games" | "posts" | "gallery";

interface SearchResult {
  games: PostWithMeta[];
  posts: PostWithMeta[];
  users: Profile[];
  gallery: PostWithMeta[];
}

/* ─── Helpers ─── */
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function extractTitle(content: string): string {
  return (content.split("\n")[0] || "Sin título").replace(/^[🎮🎨]\s*/, "").trim() || "Sin título";
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-primary/15 text-primary rounded-sm px-0.5">{part}</mark>
      : part
  );
}

/* ═══════════ SECTION HEADER ═══════════ */
function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pt-5 pb-2.5 first:pt-0">
      <span className="text-primary shrink-0">{icon}</span>
      <span className="font-display text-[13px] font-bold text-foreground tracking-tight">{label}</span>
      <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-mono font-semibold">{count}</span>
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}

/* ═══════════ USER ROW ═══════════ */
function UserRow({ user, query }: { user: Profile; query: string }) {
  return (
    <Link
      to="/profile/$userId"
      params={{ userId: user.id }}
      className={`${searchResultRowClass} flex items-center gap-3.5 p-3`}
    >
      <div className="relative shrink-0">
        <Avatar p={user} size={40} className="ring-2 ring-border/30 group-hover:ring-primary/30 transition-all" />
        {user.is_plus && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card border border-border/50 grid place-items-center">
            <Sparkles size={8} className="text-primary" fill="currentColor" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {highlightMatch(user.display_name || user.username, query)}
        </div>
        <div className="text-[10px] font-mono text-muted-foreground truncate">
          @{highlightMatch(user.username, query)}
        </div>
        {user.bio && (
          <div className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1">{user.bio}</div>
        )}
      </div>
      {typeof user.orbes === "number" && user.show_orbes !== false && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/8 text-primary text-[10px] font-mono shrink-0 border border-primary/10">
          <Sparkles size={8} fill="currentColor" /> {user.orbes}
        </div>
      )}
      <ChevronRight size={14} className="text-muted-foreground/20 group-hover:text-primary/40 shrink-0 transition-colors" />
    </Link>
  );
}

/* ═══════════ GAME ROW ═══════════ */
function GameRow({ post, query }: { post: PostWithMeta; query: string }) {
  const title = extractTitle(post.content);
  const visualUrl = post.signed_cover ?? post.signed_screenshots[0] ?? null;
  const coverFrame = coverFrameFromPreset(post.asset_preset);
  return (
    <Link
      to="/"
      className={`${searchResultRowClass} flex items-center gap-3.5 p-3`}
    >
      <div className={`relative w-14 aspect-square shrink-0 rounded-2xl overflow-hidden border border-border/40 bg-surface group-hover:border-primary/20 transition-all ${visualUrl ? "" : "tile-blueprint"}`}>
        {visualUrl ? (
          <img src={visualUrl} alt="" className="w-full h-full object-contain" style={coverFrameStyle(coverFrame)} />
        ) : (
          <GameIconPlaceholder iconSize={20} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {highlightMatch(title, query)}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/50">
          <span className="font-mono">@{post.author?.username ?? "jugador"}</span>
          <span className="text-border/60">·</span>
          <span className="flex items-center gap-0.5"><Heart size={8} /> {post.likes}</span>
          {post.comments_count > 0 && (
            <>
              <span className="text-border/60">·</span>
              <span className="flex items-center gap-0.5"><MessageCircle size={8} /> {post.comments_count}</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight size={14} className="text-muted-foreground/20 group-hover:text-primary/40 shrink-0 transition-colors" />
    </Link>
  );
}

/* ═══════════ POST ROW ═══════════ */
function PostRow({ post, query }: { post: PostWithMeta; query: string }) {
  return (
    <Link
      to="/"
      className={`${searchResultRowClass} flex items-start gap-3.5 p-3`}
    >
      <Avatar p={post.author} size={36} className="shrink-0 mt-0.5 ring-2 ring-border/20" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground/80 truncate">
            {highlightMatch(post.author?.display_name || post.author?.username || "", query)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/40">@{post.author?.username}</span>
          <span className="text-[9px] text-muted-foreground/30">{timeAgo(post.created_at)}</span>
        </div>
        <p className="text-[12px] text-foreground/65 mt-1 line-clamp-2 leading-relaxed">
          {highlightMatch(post.content, query)}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/40">
          {post.likes > 0 && <span className="flex items-center gap-0.5"><Heart size={9} /> {post.likes}</span>}
          {post.comments_count > 0 && <span className="flex items-center gap-0.5"><MessageCircle size={9} /> {post.comments_count}</span>}
          {post.media_type === "image" && <Image size={9} className="text-primary/40" />}
          {post.media_type === "video" && <Film size={9} className="text-primary/40" />}
        </div>
      </div>
    </Link>
  );
}

/* ═══════════ GALLERY ROW ═══════════ */
function GalleryRow({ post, query }: { post: PostWithMeta; query: string }) {
  const title = extractTitle(post.content);
  return (
    <Link
      to="/"
      className={`${searchResultRowClass} flex items-center gap-3.5 p-3`}
    >
      <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-border/40 bg-surface group-hover:border-primary/20 transition-all">
        {post.signed_media?.[0] ? (
          <img src={post.signed_media[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center bg-muted/45">
            <Palette size={18} className="text-primary/45" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {highlightMatch(title, query)}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/50">
          <span className="font-mono">@{post.author?.username}</span>
          <span className="text-border/60">·</span>
          <span className="flex items-center gap-0.5"><Heart size={8} /> {post.likes}</span>
          {post.media_type === "image" && <Image size={8} className="text-primary/40" />}
        </div>
      </div>
      <Eye size={13} className="text-muted-foreground/20 group-hover:text-primary/40 shrink-0 transition-colors" />
    </Link>
  );
}

/* ═══════════ SEARCH SECTION ═══════════ */
export function SearchSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());

  const [results, setResults] = useState<SearchResult>({
    games: [], posts: [], users: [], gallery: [],
  });
  const [counts, setCounts] = useState<Record<Tab, number>>({
    all: 0, users: 0, games: 0, posts: 0, gallery: 0,
  });

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Run search — only 4 categories
  const doSearch = useCallback(async (query: string) => {
    if (!query) {
      setResults({ games: [], posts: [], users: [], gallery: [] });
      setCounts({ all: 0, users: 0, games: 0, posts: 0, gallery: 0 });
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    // Solo se recuerdan las consultas que realmente llegan a buscarse.
    setRecent(rememberSearch(query));

    try {
      const [games, posts, users, gallery] = await Promise.all([
        fetchGames({ search: query }).catch(() => [] as PostWithMeta[]),
        fetchFeed({ search: query }).catch(() => [] as PostWithMeta[]),
        searchUsers(query).catch(() => [] as Profile[]),
        fetchArtworks({ search: query }).catch(() => [] as PostWithMeta[]),
      ]);

      const newResults = { games, posts, users, gallery };
      setResults(newResults);

      const total = games.length + posts.length + users.length + gallery.length;
      setCounts({ all: total, games: games.length, posts: posts.length, users: users.length, gallery: gallery.length });
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { doSearch(debounced); }, [debounced, doSearch]);

  const applyRecent = useCallback((value: string) => {
    setQ(value);
    inputRef.current?.focus();
  }, []);

  const filtered = (() => {
    if (tab === "all") return results;
    return {
      games: tab === "games" ? results.games : [],
      posts: tab === "posts" ? results.posts : [],
      users: tab === "users" ? results.users : [],
      gallery: tab === "gallery" ? results.gallery : [],
    };
  })();

  const hasAny = counts.all > 0;

  const tabs: { id: Tab; icon: React.ReactNode; label: string; count: number }[] = [
    { id: "all", icon: <Search size={11} />, label: "Todo", count: counts.all },
    { id: "users", icon: <Users size={11} />, label: "Usuarios", count: counts.users },
    { id: "games", icon: <Gamepad2 size={11} />, label: "Juegos", count: counts.games },
    { id: "posts", icon: <Newspaper size={11} />, label: "Publicaciones", count: counts.posts },
    { id: "gallery", icon: <Palette size={11} />, label: "Tienda", count: counts.gallery },
  ];

  const recentPanel = recent.length > 0 ? (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 pt-1">
        <History size={12} className="text-primary/60 shrink-0" />
        <span className="font-display text-[11px] font-bold tracking-wide text-muted-foreground/70">
          BÚSQUEDAS RECIENTES
        </span>
        <div className="flex-1 h-px bg-border/30" />
        <button
          onClick={() => setRecent(clearRecentSearches())}
          className="text-[10px] font-semibold text-muted-foreground/50 hover:text-primary transition-colors"
        >
          Borrar
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recent.map(value => (
          <button
            key={value}
            onClick={() => applyRecent(value)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-border/50 bg-card text-[11px] text-foreground/70 hover:border-primary/30 hover:text-primary transition-all active:scale-[0.97]"
          >
            <History size={10} className="text-muted-foreground/50" />
            <span className="max-w-[160px] truncate">{value}</span>
          </button>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground/35 leading-relaxed">
        Guardadas solo en este dispositivo para repetirlas con un toque.
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {/* Search input: mismo campo M3 que el resto de la app. */}
      <HaloSearchInput
        ref={inputRef}
        aria-label="Buscar en Asternal"
        autoComplete="off"
        isLoading={loading}
        loadingText="Buscando…"
        onChange={e => setQ(e.target.value)}
        onClear={() => { setQ(""); inputRef.current?.focus(); }}
        placeholder="Buscar usuarios, juegos, publicaciones, arte…"
        value={q}
      />

      {/* Category tabs */}
      <div className="flex gap-1.5 m3-scroll-x no-scrollbar -mx-1 px-1 pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 h-8 rounded-lg border text-[11px] font-semibold tracking-wide whitespace-nowrap shrink-0 ${filterStateClass(tab === t.id)}`}
          >
            {t.icon} {t.label}
            {t.count > 0 && (
              <span className={`ml-0.5 px-1 py-0 rounded text-[8px] font-mono font-bold ${
                tab === t.id ? "bg-white/20" : "bg-muted/50 text-muted-foreground/50"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2.5 py-10">
          <Loader2 size={18} className="animate-spin text-primary/40" />
          <span className="text-[12px] text-muted-foreground/50 font-medium">Buscando…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !searched && (
        <div className="space-y-6">
          {recentPanel}
          <div className="text-center py-12 space-y-4">
            {/* M3: contenedor plano (surface-container-high), sin degradado. */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-muted border border-line grid place-items-center">
              <Search size={26} className="text-ink-3" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground/70">¿Qué estás buscando?</div>
              <div className="text-[11px] text-muted-foreground/40 mt-1 max-w-[240px] mx-auto">
                Usuarios, juegos, publicaciones o arte de la galería
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && searched && !hasAny && (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-muted/30 border border-border/30 grid place-items-center">
            <Search size={20} className="text-muted-foreground/25" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground/60 font-medium">Sin resultados para «{q}»</div>
            <div className="text-[11px] text-muted-foreground/35 mt-1">Prueba con otros términos</div>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && hasAny && (
        <div>
          {/* Games */}
          {filtered.games.length > 0 && (
            <div>
              <SectionHeader icon={<Gamepad2 size={13} />} label="Juegos" count={filtered.games.length} />
              <div className="space-y-1.5">
                {filtered.games.slice(0, tab === "all" ? 4 : 30).map(g => (
                  <GameRow key={g.id} post={g} query={q} />
                ))}
              </div>
            </div>
          )}

          {/* Users */}
          {filtered.users.length > 0 && (
            <div>
              <SectionHeader icon={<Users size={13} />} label="Usuarios" count={filtered.users.length} />
              <div className="space-y-1.5">
                {filtered.users.slice(0, tab === "all" ? 4 : 30).map(u => (
                  <UserRow key={u.id} user={u} query={q} />
                ))}
              </div>
            </div>
          )}

          {/* Posts */}
          {filtered.posts.length > 0 && (
            <div>
              <SectionHeader icon={<Newspaper size={13} />} label="Publicaciones" count={filtered.posts.length} />
              <div className="space-y-1.5">
                {filtered.posts.slice(0, tab === "all" ? 4 : 30).map(p => (
                  <PostRow key={p.id} post={p} query={q} />
                ))}
              </div>
            </div>
          )}

          {/* Tienda (obras de artistas) */}
          {filtered.gallery.length > 0 && (
            <div>
              <SectionHeader icon={<Palette size={13} />} label="Tienda" count={filtered.gallery.length} />
              <div className="space-y-1.5">
                {filtered.gallery.slice(0, tab === "all" ? 4 : 30).map(a => (
                  <GalleryRow key={a.id} post={a} query={q} />
                ))}
              </div>
            </div>
          )}

          {/* "See more" hint */}
          {tab === "all" && counts.all > 16 && (
            <div className="text-center pt-5 text-[11px] text-muted-foreground/35 font-medium">
              Selecciona una categoría para ver todos los resultados
            </div>
          )}
        </div>
      )}
    </div>
  );
}
