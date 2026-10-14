import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Gamepad2, Clock, BarChart3, Loader2, Flame, CalendarDays, TrendingUp, Award } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fetchGames, type PostWithMeta } from "@/lib/social/api";
import {
  getMyLikedPosts,
  getAggregatedPlayTime,
  getUsageStats,
  getTopGame,
  formatPlayTime,
  refreshPlayHistoryCovers,
} from "@/lib/social/history";
import { UserName } from "./UserName";
import { GameIconPlaceholder } from "./GameIcon";

type HistoryTab = "games" | "likes";

function PlayedGameThumbnail({ src, title, size = "md" }: { src: string | null; title: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "sm" ? "w-8 h-8 rounded-lg" : "w-14 aspect-square rounded-2xl";

  return (
    <div className={`${dimensions} bg-primary/10 shrink-0 overflow-hidden grid place-items-center ${src && !failed ? "" : "tile-blueprint"}`}>
      {src && !failed ? (
        <img src={src} alt={`Portada de ${title}`} onError={() => setFailed(true)} className="w-full h-full object-contain" />
      ) : (
        <GameIconPlaceholder iconSize={size === "sm" ? 13 : 18} />
      )}
    </div>
  );
}

/** Tarjeta compacta de estadística. */
function StatCard({ icon, label, value, sub, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "accent" | "emerald" | "rose";
}) {
  const toneCls =
    tone === "primary" ? "bg-primary/10 text-primary"
    : tone === "accent" ? "bg-accent/10 text-accent"
    : tone === "emerald" ? "bg-success/10 text-success"
    : "bg-destructive/10 text-destructive";
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-2.5 flex flex-col gap-1 min-w-0">
      <div className={`w-7 h-7 rounded-lg grid place-items-center ${toneCls}`}>
        {icon}
      </div>
      <div className="text-sm font-semibold font-display leading-tight truncate">{value}</div>
      <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider truncate">{label}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60 truncate">{sub}</div>}
    </div>
  );
}

export function HistorySection() {
  const [tab, setTab] = useState<HistoryTab>("games");
  const [likedPosts, setLikedPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [likesLoading, setLikesLoading] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);

  const { sortedGames, stats, topGame, max7 } = useMemo(() => {
    const agg = getAggregatedPlayTime();
    const nextStats = getUsageStats();
    return {
      sortedGames: Array.from(agg.entries()).sort((a, b) => b[1].lastPlayed.localeCompare(a[1].lastPlayed)),
      stats: nextStats,
      topGame: getTopGame("total"),
      max7: Math.max(1, ...nextStats.last7.map((day) => day.seconds)),
    };
  }, [historyRevision]);

  useEffect(() => {
    // Simulate loading time for the view transition
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  // Repara sesiones antiguas que se guardaron antes de resolver la primera captura como respaldo de portada.
  useEffect(() => {
    let active = true;
    fetchGames()
      .then((games) => {
        if (active && refreshPlayHistoryCovers(games)) setHistoryRevision((revision) => revision + 1);
      })
      .catch(() => {
        // El historial sigue disponible con lo almacenado localmente si no hay conexión.
      });
    return () => { active = false; };
  }, []);

  // Se cargan los likes al abrir el panel: el contador del encabezado
  // («N likes») es real desde el primer momento, no solo al entrar a la pestaña.
  // Se re-consultan al cambiar de pestaña para mantener el dato fresco.
  useEffect(() => {
    setLikesLoading(true);
    getMyLikedPosts()
      .then(setLikedPosts)
      .catch(() => {})
      .finally(() => setLikesLoading(false));
  }, [tab]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="rounded-lg border border-border/70 bg-surface p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary grid place-items-center">
            <BarChart3 size={18} />
          </div>
          <div>
            <div className="font-display text-sm font-semibold">Historial</div>
            <div className="text-[11px] text-muted-foreground">
              {sortedGames.length} juegos jugados · {likedPosts.length} likes
            </div>
          </div>
        </div>

        {/* Estadísticas de uso */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <StatCard
            icon={<Flame size={13} />}
            label="Hoy"
            value={formatPlayTime(stats.today.seconds)}
            sub={`${stats.today.sessions} sesión${stats.today.sessions !== 1 ? "es" : ""} · ${stats.today.uniqueGames} juego${stats.today.uniqueGames !== 1 ? "s" : ""}`}
            tone="primary"
          />
          <StatCard
            icon={<CalendarDays size={13} />}
            label="7 días"
            value={formatPlayTime(stats.week.seconds)}
            sub={`${stats.week.sessions} sesiones · ${stats.week.uniqueGames} juegos`}
            tone="accent"
          />
          <StatCard
            icon={<TrendingUp size={13} />}
            label="30 días"
            value={formatPlayTime(stats.month.seconds)}
            sub={`${stats.month.sessions} sesiones · ${stats.month.uniqueGames} juegos`}
            tone="emerald"
          />
          <StatCard
            icon={<CalendarDays size={13} />}
            label="Este año"
            value={formatPlayTime(stats.year.seconds)}
            sub={`${stats.year.sessions} sesiones · ${stats.year.uniqueGames} juegos`}
            tone="accent"
          />
          <StatCard
            icon={<BarChart3 size={13} />}
            label="Total"
            value={formatPlayTime(stats.total.seconds)}
            sub={`${stats.total.sessions} sesiones · ${stats.total.uniqueGames} juegos`}
            tone="primary"
          />
          <StatCard
            icon={<Flame size={13} />}
            label="Racha"
            value={`${stats.streakDays} día${stats.streakDays !== 1 ? "s" : ""}`}
            sub={stats.bestDay ? `Mejor día: ${stats.bestDay.seconds >= 3600 ? formatPlayTime(stats.bestDay.seconds) : `${Math.floor(stats.bestDay.seconds / 60)}m`}` : "Sin actividad"}
            tone="rose"
          />
        </div>

        {/* Mini gráfica de los últimos 7 días + top juego */}
        <div className="flex gap-3 items-end">
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Últimos 7 días</div>
            <div className="flex items-end gap-1 h-12">
              {stats.last7.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div
                    className="w-full rounded-md bg-primary/80 transition-colors hover:bg-primary"
                    style={{ height: `${Math.max(6, (d.seconds / max7) * 100)}%`, minHeight: 4 }}
                    title={formatPlayTime(d.seconds)}
                  />
                  <span className="text-[7px] font-mono text-muted-foreground/60 truncate w-full text-center">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
          {topGame && (
            <div className="shrink-0 max-w-[38%]">
              <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Más jugado</div>
              <div className="rounded-lg border border-border/70 bg-surface px-2.5 py-2 flex items-center gap-2">
                <PlayedGameThumbnail src={topGame.coverUrl} title={topGame.title} size="sm" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium truncate">{topGame.title}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">{formatPlayTime(topGame.seconds)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="relative flex bg-muted/40 rounded-xl p-0.5 mt-3">
          <button
            onClick={() => setTab("games")}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-display tracking-widest transition-colors ${
              tab === "games" ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Gamepad2 size={13} /> JUEGOS
          </button>
          <button
            onClick={() => setTab("likes")}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-display tracking-widest transition-colors ${
              tab === "likes" ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Heart size={13} /> LIKES
          </button>
          <div
            className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-lg grad-brand shadow-sm transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${tab === "games" ? "0%" : "calc(100% + 4px)"})` }}
          />
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === "games" ? (
          <motion.div
            key="games"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 size={16} className="animate-spin mr-2" />
                <span className="text-xs">Cargando historial…</span>
              </div>
            ) : sortedGames.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
                <Gamepad2 size={24} className="mx-auto mb-2 text-muted-foreground/40" />
                <div className="text-sm text-muted-foreground">Aún no has jugado ningún juego</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">
                  ¡Explora juegos en la sección JUEGOS!
                </div>
              </div>
            ) : (
              sortedGames.map(([gameId, data], i) => (
                <motion.div
                  key={gameId}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  className="panel rounded-2xl border border-border/50 overflow-hidden hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Cover thumbnail */}
                    <PlayedGameThumbnail src={data.coverUrl} title={data.title} />
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-sm font-medium truncate">{data.title}</div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} /> {formatPlayTime(data.totalSeconds)}
                        </span>
                        <span>{data.sessions} sesión{data.sessions !== 1 ? "es" : ""}</span>
                      </div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground/60 font-mono">
                        Última vez: {new Date(data.lastPlayed).toLocaleDateString("es", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-20 hidden sm:block">
                      <div className="text-[9px] font-mono text-muted-foreground text-right mb-1">
                        {formatPlayTime(data.totalSeconds)}
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, (data.totalSeconds / 3600) * 50)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="likes"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {likesLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 size={16} className="animate-spin mr-2" />
                <span className="text-xs">Cargando likes…</span>
              </div>
            ) : likedPosts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
                <Heart size={24} className="mx-auto mb-2 text-muted-foreground/40" />
                <div className="text-sm text-muted-foreground">No has dado like a ninguna publicación</div>
                <div className="text-[11px] text-muted-foreground/60 mt-1">
                  ¡Explora y da like a las publicaciones que te gusten!
                </div>
              </div>
            ) : (
              likedPosts.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  className="panel rounded-2xl border border-border/50 overflow-hidden hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* Author avatar */}
                    <Link
                      to="/profile/$userId"
                      params={{ userId: p.author_id }}
                      className="w-9 h-9 rounded-full bg-primary/10 grid place-items-center overflow-hidden shrink-0"
                    >
                      <Avatar p={p.author} size={36} />
                    </Link>
                    {/* Content preview */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs">
                        <UserName p={p.author} />
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(p.created_at).toLocaleDateString("es")}
                        </span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2 text-muted-foreground/90">
                        {p.content.replace(/^[🎮🎨]\s*/, "").trim()}
                      </p>
                      {p.media_type === "image" && p.signed_media[0] && (
                        <img
                          src={p.signed_media[0]}
                          alt=""
                          className="mt-2 w-full h-32 object-cover rounded-xl bg-muted/30"
                        />
                      )}
                    </div>
                    <Heart size={14} className="text-rose-400 shrink-0 mt-1" fill="currentColor" />
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
