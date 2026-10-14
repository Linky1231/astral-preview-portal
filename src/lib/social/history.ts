// Play history and likes tracking (localStorage-based)
import { supabase } from "@/integrations/supabase/client";
import type { PostWithMeta, PostRow, Profile } from "./api";
import { signMediaUrls } from "./api";
import { refreshPlayedGameCoverSessions, type PlayedGameMedia } from "./history-cover";

export type PlaySession = {
  gameId: string;
  gameTitle: string;
  coverUrl: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

/** Log a play session to localStorage */
export function logPlaySession(session: PlaySession): void {
  try {
    const raw = localStorage.getItem("play_history");
    const history: PlaySession[] = raw ? JSON.parse(raw) : [];
    history.unshift(session);
    if (history.length > 500) history.length = 500;
    localStorage.setItem("play_history", JSON.stringify(history));
  } catch { /* ignore quota errors */ }
}

/** Get all play sessions, newest first */
export function getPlayHistory(): PlaySession[] {
  try {
    const raw = localStorage.getItem("play_history");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** Sincroniza las portadas de sesiones previas con los metadatos reales del juego publicado. */
export function refreshPlayHistoryCovers(games: readonly PlayedGameMedia[]): boolean {
  const current = getPlayHistory();
  const refreshed = refreshPlayedGameCoverSessions(current, games);
  if (!refreshed.changed) return false;

  try {
    localStorage.setItem("play_history", JSON.stringify(refreshed.sessions));
    return true;
  } catch {
    return false;
  }
}

/** Get aggregated play time per game (total seconds) */
export function getAggregatedPlayTime(): Map<string, {
  title: string;
  coverUrl: string | null;
  totalSeconds: number;
  lastPlayed: string;
  sessions: number;
}> {
  const sessions = getPlayHistory();
  const agg = new Map<string, {
    title: string;
    coverUrl: string | null;
    totalSeconds: number;
    lastPlayed: string;
    sessions: number;
  }>();
  for (const s of sessions) {
    if (agg.has(s.gameId)) {
      const existing = agg.get(s.gameId)!;
      existing.totalSeconds += s.durationSeconds;
      existing.sessions += 1;
      if (s.startedAt > existing.lastPlayed) existing.lastPlayed = s.startedAt;
    } else {
      agg.set(s.gameId, {
        title: s.gameTitle,
        coverUrl: s.coverUrl,
        totalSeconds: s.durationSeconds,
        lastPlayed: s.startedAt,
        sessions: 1,
      });
    }
  }
  return agg;
}

/** Format seconds to human-readable string */
export function formatPlayTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m`;
  return `${Math.floor(totalSeconds)}s`;
}

// ───────────────────────── ESTADÍSTICAS DE USO ─────────────────────────

export type PeriodStats = {
  sessions: number;
  seconds: number;
  games: number;
  uniqueGames: number;
};

export type UsageStats = {
  today: PeriodStats;
  week: PeriodStats;   // últimos 7 días
  month: PeriodStats;  // últimos 30 días
  year: PeriodStats;   // últimos 365 días
  total: PeriodStats;
  streakDays: number;          // racha de días seguidos jugando
  bestDay: { date: string; seconds: number } | null;
  last7: { label: string; seconds: number }[];
  avgSessionSeconds: number;
};

function emptyPeriod(): PeriodStats {
  return { sessions: 0, seconds: 0, games: 0, uniqueGames: 0 };
}

function addPeriod(a: PeriodStats, s: PlaySession): PeriodStats {
  return {
    sessions: a.sessions + 1,
    seconds: a.seconds + s.durationSeconds,
    games: a.games + 1,
    uniqueGames: a.uniqueGames,
  };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Estadísticas de uso a partir del historial de partidas. */
export function getUsageStats(): UsageStats {
  const sessions = getPlayHistory();
  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  const stats: UsageStats = {
    today: emptyPeriod(),
    week: emptyPeriod(),
    month: emptyPeriod(),
    year: emptyPeriod(),
    total: emptyPeriod(),
    streakDays: 0,
    bestDay: null,
    last7: [],
    avgSessionSeconds: 0,
  };

  const uniqueTotal = new Set<string>();
  const uniqueToday = new Set<string>();
  const uniqueWeek = new Set<string>();
  const uniqueMonth = new Set<string>();
  const uniqueYear = new Set<string>();

  const daySeconds = new Map<string, number>();
  const activeDays = new Set<string>();

  const weekStart = now.getTime() - 6 * 24 * 3600 * 1000; // hoy + 6 previos
  const monthStart = now.getTime() - 29 * 24 * 3600 * 1000;
  const yearStart = now.getTime() - 364 * 24 * 3600 * 1000;

  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (Number.isNaN(t)) continue;
    const dk = dayKey(s.startedAt);
    activeDays.add(dk);
    daySeconds.set(dk, (daySeconds.get(dk) ?? 0) + s.durationSeconds);

    stats.total = addPeriod(stats.total, s);
    uniqueTotal.add(s.gameId);

    if (dk === todayKey) {
      stats.today = addPeriod(stats.today, s);
      uniqueToday.add(s.gameId);
    }
    if (t >= weekStart) {
      stats.week = addPeriod(stats.week, s);
      uniqueWeek.add(s.gameId);
    }
    if (t >= monthStart) {
      stats.month = addPeriod(stats.month, s);
      uniqueMonth.add(s.gameId);
    }
    if (t >= yearStart) {
      stats.year = addPeriod(stats.year, s);
      uniqueYear.add(s.gameId);
    }
  }

  stats.total.uniqueGames = uniqueTotal.size;
  stats.today.uniqueGames = uniqueToday.size;
  stats.week.uniqueGames = uniqueWeek.size;
  stats.month.uniqueGames = uniqueMonth.size;
  stats.year.uniqueGames = uniqueYear.size;

  // Mejor día (más tiempo)
  let best: { date: string; seconds: number } | null = null;
  for (const [dk, secs] of daySeconds) {
    if (!best || secs > best.seconds) best = { date: dk, seconds: secs };
  }
  stats.bestDay = best;

  // Últimos 7 días (para la mini-gráfica)
  const labels: { label: string; seconds: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const dk = dayKey(d.toISOString());
    const label = d.toLocaleDateString("es", { weekday: "short" });
    labels.push({ label, seconds: daySeconds.get(dk) ?? 0 });
  }
  stats.last7 = labels;

  // Racha de días seguidos jugando (hasta hoy)
  let streak = 0;
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 365; i++) {
    const dk = dayKey(cursor.toISOString());
    if (activeDays.has(dk)) streak++;
    else if (i > 0) break; // solo cuenta si empezó hoy o ayer
    cursor.setTime(cursor.getTime() - 24 * 3600 * 1000);
  }
  stats.streakDays = streak;

  stats.avgSessionSeconds = stats.total.sessions
    ? Math.round(stats.total.seconds / stats.total.sessions)
    : 0;

  return stats;
}

/** Busca el juego más jugado de un periodo (por segundos totales). */
export function getTopGame(period: "total" | "today" | "week" | "month" | "year"): {
  title: string;
  seconds: number;
  coverUrl: string | null;
} | null {
  const sessions = getPlayHistory();
  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  const threshold =
    period === "week" ? now.getTime() - 6 * 24 * 3600 * 1000
    : period === "month" ? now.getTime() - 29 * 24 * 3600 * 1000
    : period === "year" ? now.getTime() - 364 * 24 * 3600 * 1000
    : 0;

  const byGame = new Map<string, { title: string; seconds: number; coverUrl: string | null }>();
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (period === "today" && dayKey(s.startedAt) !== todayKey) continue;
    if (period !== "today" && period !== "total" && t < threshold) continue;
    const cur = byGame.get(s.gameId) ?? { title: s.gameTitle, seconds: 0, coverUrl: s.coverUrl };
    cur.seconds += s.durationSeconds;
    if (!cur.coverUrl && s.coverUrl) cur.coverUrl = s.coverUrl;
    byGame.set(s.gameId, cur);
  }
  let top: { title: string; seconds: number; coverUrl: string | null } | null = null;
  for (const g of byGame.values()) {
    if (!top || g.seconds > top.seconds) top = g;
  }
  return top;
}

// ───────────────────────── LIKES ─────────────────────────

/**
 * Todos los posts que el usuario ha marcado con "like".
 *
 * Se consultan directamente por ID en la tabla `posts` (en vez de filtrar el
 * feed limitado a 100) para que: 1) aparezcan TODOS los likes aunque sean
 * antiguos o sean juegos, y 2) nunca se cuele contenido de chats, avisos o
 * mensajes que no sean publicaciones reales del feed.
 */
export async function getMyLikedPosts(): Promise<PostWithMeta[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: reactions, error: reactErr } = await supabase
    .from("reactions")
    .select("post_id")
    .eq("user_id", user.id)
    .eq("type", "like")
    .order("created_at", { ascending: false })
    .limit(200);
  if (reactErr) throw reactErr;
  if (!reactions?.length) return [];
  const ids = [...new Set<string>(reactions.map((r: { post_id: string }) => r.post_id))].filter(Boolean);
  if (!ids.length) return [];

  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!posts?.length) return [];

  const authorIds = Array.from(new Set(posts.map((p: { author_id: string }) => p.author_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", authorIds);
  const pmap = new Map<string, Profile>(
    (profiles ?? []).map((p: { id: string }) => [p.id, p as unknown as Profile] as const)
  );

  const result: PostWithMeta[] = [];
  for (const p of posts) {
    const row = p as PostRow;
    const media = row.media_urls?.length ? await signMediaUrls(row.media_urls) : [];
    const cover = row.cover_url ? (await signMediaUrls([row.cover_url]))[0] ?? null : null;
    const screenshots = row.screenshots?.length ? await signMediaUrls(row.screenshots) : [];
    result.push({
      ...row,
      author: pmap.get(row.author_id) ?? null,
      tags: [],
      likes: 1,
      favorites: 0,
      comments_count: 0,
      reposts_count: 0,
      my_like: true,
      my_favorite: false,
      my_repost: false,
      signed_media: media,
      signed_cover: cover,
      signed_screenshots: screenshots,
      signed_documents: [],
      poll: null,
      pinned_game: null,
      is_unlocked: true,
      owned: true,
    });
  }
  return result;
}
