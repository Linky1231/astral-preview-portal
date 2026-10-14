import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play, Flame, Rocket, Heart, Sparkles, Users, Gamepad2, Trophy, Crown, CloudOff, Loader2, CheckCircle2, Compass } from "lucide-react";
import type { PostWithMeta } from "@/lib/social/api";
import { fetchGamePlayCounts24h } from "@/lib/social/api";
import { SUPABASE_ACCESS_TOKEN, runGamePlaysSchemaSetup } from "@/lib/supabase/setup";
import { GameIcon, GameIconPlaceholder } from "./GameIcon";
import { GameCard } from "./GameCard";
import { coverFrameFromPreset, coverFrameStyle } from "@/lib/social/cover-frame";
import { mobileCarouselScrollClassName } from "@/lib/social/carousel-scroll";
import { filterStateClass } from "@/lib/ui/filter-control";

function extractTitle(content: string): string {
  const line = content.split("\n")[0] || "Juego";
  return line.replace(/^🎮\s*/, "").trim() || "Juego";
}

type TrendTab = "hot" | "growing" | "rated" | "new";



/** Sub-secciones de Inicio: la vista normal, el ranking, los nuevos y explorar. */
export type GamesView = "inicio" | "ranking" | "nuevos" | "explorar";

export function GamesHome({
  games, myId, isMod, onChange, onOpenGame, view = "inicio",
}: {
  games: PostWithMeta[]; myId: string | null; isMod: boolean; onChange: () => void; onOpenGame?: (gameId: string) => void;
  view?: GamesView;
}) {
  // Abre el juego a pantalla completa (el contenedor decide cómo mostrarlo).
  const openGame = (g: PostWithMeta) => onOpenGame?.(g.id);
  const [trend, setTrend] = useState<TrendTab>("hot");
  const [forYouGenre, setForYouGenre] = useState<string | null>(null);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  // Estado de la sincronización del ranking: null = comprobando, true = nube OK,
  // false = la tabla game_plays no existe (solo hay conteo local del navegador).
  const [rankCloud, setRankCloud] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  // Cuenta real de jugadas en las últimas 24h para el ranking.
  useEffect(() => {
    let alive = true;
    if (!games.length) { setPlayCounts({}); setRankCloud(false); return; }
    fetchGamePlayCounts24h(games.map(g => g.id))
      .then(r => { if (alive) { setPlayCounts(r.counts); setRankCloud(r.cloud); } })
      .catch(() => { if (alive) { setPlayCounts({}); setRankCloud(false); } });
    return () => { alive = false; };
  }, [games]);

  // Instala la tabla game_plays (ranking sincronizado) con un clic, usando el
  // token de acceso de Supabase si está disponible (Keys). Si no, guía al diálogo.
  const installRankingTable = async () => {
    setInstalling(true);
    setInstallMsg(null);
    try {
      const token = (SUPABASE_ACCESS_TOKEN ?? "").trim();
      if (!token) {
        setInstallMsg("Sin token de Supabase. Abre ⋮ → Supabase → «Instalar esquema» para crear la tabla.");
        return;
      }
      const r = await runGamePlaysSchemaSetup(token);
      setInstallMsg(r.ok ? "Tabla creada: el ranking ya se sincroniza entre dispositivos." : r.message);
      if (r.ok && games.length) {
        const rr = await fetchGamePlayCounts24h(games.map(g => g.id));
        setPlayCounts(rr.counts);
        setRankCloud(rr.cloud);
      }
    } catch (e) {
      setInstallMsg((e as Error)?.message ?? "No se pudo instalar. Revisa el token en Keys.");
    } finally {
      setInstalling(false);
    }
  };

  // Ranking de los más jugados en las últimas 24 horas (real). Solo el TOP 3:
  // el podio debe ser corto y selectivo, no una lista larga.
  const ranking24 = useMemo(() => {
    return [...games]
      .map(g => ({ g, n: playCounts[g.id] ?? 0 }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
  }, [games, playCounts]);

  // Ranking completo (TOP 10) para su propia sub-sección: si aún no hay
  // jugadas registradas se rellena con los más populares, así nunca queda vacío.
  const rankingFull = useMemo(() => {
    return [...games]
      .map(g => ({ g, n: playCounts[g.id] ?? 0 }))
      .sort((a, b) => b.n - a.n || (b.g.likes + b.g.comments_count) - (a.g.likes + a.g.comments_count))
      .slice(0, 10);
  }, [games, playCounts]);

  const sections = useMemo(() => {
    if (!games.length) return null;
    const scored = [...games];
    const featured = [...scored].sort((a, b) => (b.likes + b.comments_count * 2) - (a.likes + a.comments_count * 2))[0];
    const featuredId = featured?.id;

    const continuePlaying = scored
      .filter(g => g.id !== featuredId && (g.owned === true || g.author_id === myId))
      .slice(0, 12);

    const continueIds = new Set(continuePlaying.map(g => g.id));

    const recommended = scored
      .filter(g => g.id !== featuredId && !continueIds.has(g.id))
      .sort((a, b) => (b.likes + b.favorites) - (a.likes + a.favorites))
      .slice(0, 12);

    const now = Date.now();
    const week = 1000 * 60 * 60 * 24 * 7;

    // «Más jugados hoy»: primero por jugadas reales (24h); si aún no hay
    // datos, cae al compromiso por interacciones.
    const playsOf = (g: PostWithMeta) => playCounts[g.id] ?? 0;
    const hot = [...scored].sort((a, b) => {
      const pa = playsOf(a), pb = playsOf(b);
      if (pa !== pb) return pb - pa;
      return (b.likes + b.comments_count) - (a.likes + a.comments_count);
    });
    const growing = [...scored]
      .filter(g => now - new Date(g.created_at).getTime() < week * 2)
      .sort((a, b) => b.likes - a.likes);
    const rated = [...scored].sort((a, b) => (b.likes + b.favorites * 2) - (a.likes + a.favorites * 2));
    const brandNew = [...scored].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { featured, continuePlaying, recommended, trends: { hot, growing, rated, new: brandNew } };
  }, [games, myId, playCounts]);

  // ── "Para ti" algoritmo avanzado ───────────────────────────────────
  // Basado en los juegos que el usuario ha JUGADO (owned), no publicado.
  const forYou = useMemo(() => {
    if (!games.length) return { items: [], userGenres: [] };

    // 1. Géneros de los juegos que YO he JUGADO (owned o los míos)
    const myPlayed = games.filter(g => g.owned === true || g.author_id === myId);
    const genreCounts: Record<string, number> = {};
    for (const g of myPlayed) {
      const genre = g.game_genre?.trim();
      if (genre) genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    const userGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);

    // Si no hay géneros conocidos, devolver trending popular como fallback
    if (!userGenres.length) {
      const fallback = [...games]
        .sort((a, b) => (b.likes + b.favorites * 2 + b.comments_count) - (a.likes + a.favorites * 2 + a.comments_count))
        .slice(0, 12);
      return { items: fallback, userGenres: [] };
    }

    // 2. Scoring avanzado de juegos que NO he jugado
    const now = Date.now();
    const day = 1000 * 60 * 60 * 24;
    const week = day * 7;
    const playedIds = new Set(myPlayed.map(g => g.id));
    const candidates = games.filter(g => !playedIds.has(g.id));

    const scored = candidates.map(g => {
      let score = 0;
      const genre = g.game_genre?.trim();
      const isGenreMatch = genre && userGenres.includes(genre);
      const genreRank = genre ? userGenres.indexOf(genre) : -1;

      if (isGenreMatch) {
        score += 30 * (1 / (genreRank + 1));
        score += 10 * (genreCounts[genre!] || 1);
      }

      score += g.likes * 1;
      score += g.favorites * 2;
      score += g.comments_count * 1.5;
      const playCount = playCounts[g.id] ?? 0;
      score += playCount * 3;

      const age = now - new Date(g.created_at).getTime();
      if (age < day) score += 20;
      else if (age < week) score += 12;
      else if (age < week * 4) score += 6;

      return { g, score, isGenreMatch };
    });

    // 3. Filtrar según el chip seleccionado
    const filtered = forYouGenre
      ? scored.filter(s => s.g.game_genre?.trim() === forYouGenre)
      : scored.filter(s => s.isGenreMatch);

    // 4. Ordenar por score y devolver top 20
    const items = filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(s => s.g);

    return { items, userGenres };
  }, [games, myId, playCounts, forYouGenre]);

  if (!sections) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/15 grid place-items-center">
          <Gamepad2 size={26} className="text-primary" />
        </div>
        <div className="font-display text-sm">Aún no hay juegos publicados</div>
        <div className="text-xs text-muted-foreground max-w-xs mx-auto">
          Abre el editor y publica el primero.
        </div>
        <Link to="/editor" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl grad-brand text-primary-foreground text-xs font-display tracking-widest">
          ABRIR EDITOR
        </Link>
      </div>
    );
  }

  const { featured, continuePlaying, recommended, trends } = sections;
  const trendList = trends[trend];

  // Rejilla de iconos compartida por las sub-secciones «Nuevos» y «Explorar».
  const gamesGridClass =
    "grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-3 gap-y-4";

  if (view === "ranking") {
    return (
      <div className="space-y-3">
        {rankCloud === false && games.length > 0 && (
          <RankingSyncBanner
            installing={installing}
            message={installMsg}
            onInstall={installRankingTable}
          />
        )}
        <Ranking24 games={rankingFull} totalGames={games.length} onOpen={openGame} />
      </div>
    );
  }

  if (view === "nuevos") {
    return (
      <Section title="Nuevos" subtitle="Lo último que ha publicado la comunidad">
        <div className={gamesGridClass}>
          {trends.new.slice(0, 24).map(g => (
            <GameIcon key={g.id} post={g} onOpen={() => openGame(g)} />
          ))}
        </div>
      </Section>
    );
  }

  if (view === "explorar") {
    return (
      <Section title="Explorar" subtitle="Todo el catálogo de juegos de Asternal">
        <div className={gamesGridClass}>
          {trends.hot.slice(0, 48).map(g => (
            <GameIcon key={g.id} post={g} onOpen={() => openGame(g)} />
          ))}
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Banner destacado */}
      <FeaturedBanner post={featured} plays24={playCounts[featured.id] ?? 0} onPlay={() => openGame(featured)} />

      {/* 2. Ranking · Más jugados en las últimas 24h */}
      {rankCloud === false && games.length > 0 && (
        <RankingSyncBanner
          installing={installing}
          message={installMsg}
          onInstall={installRankingTable}
        />
      )}
      <Ranking24 games={ranking24} totalGames={games.length} onOpen={openGame} />

      {/* 3. Para ti — recomendaciones personalizadas */}
      {forYou.items.length > 0 && (
        <ForYouSection
          items={forYou.items}
          userGenres={forYou.userGenres}
          activeGenre={forYouGenre}
          onSelectGenre={setForYouGenre}
          onOpen={openGame}
          playCounts={playCounts}
        />
      )}

      {/* 4. Continuar jugando */}
      {continuePlaying.length > 0 && (
        <Section title="Continuar jugando" subtitle="Retoma donde lo dejaste">
          <IconRow games={continuePlaying} onOpen={openGame} />
        </Section>
      )}

      {/* 5. Recomendados para ti */}
      {recommended.length > 0 && (
        <Section title="Recomendados para ti" subtitle="En base a lo que juega la comunidad">            <IconRow games={recommended} onOpen={openGame} />
        </Section>
      )}

      {/* 6. Tendencias */}
      <div className="space-y-2">
        <div className="flex items-end justify-between px-1">
          <div>
            <div className="font-display text-base leading-tight">Tendencias</div>
            <div className="text-[11px] text-muted-foreground">Lo que se mueve ahora mismo</div>
          </div>
        </div>
        <div className="flex gap-1.5 m3-scroll-x no-scrollbar -mx-1 px-1 pb-1">
          <TrendChip active={trend === "hot"} onClick={() => setTrend("hot")} icon={<Flame size={12} />} label="Más jugados hoy" />
          <TrendChip active={trend === "growing"} onClick={() => setTrend("growing")} icon={<Rocket size={12} />} label="Creciendo rápido" />
          <TrendChip active={trend === "rated"} onClick={() => setTrend("rated")} icon={<Heart size={12} />} label="Mejor valorados" />
          {/* «Nuevos» ya tiene su propia sub-sección arriba: no se repite aquí. */}
        </div>
        <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-3 gap-y-4 pt-1">
          {trendList.slice(0, 18).map(g => (
            <GameIcon key={g.id} post={g} onOpen={() => openGame(g)} />
          ))}
        </div>
      </div>


    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <div>
          <div className="font-display text-base leading-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

function IconRow({ games, onOpen }: { games: PostWithMeta[]; onOpen: (g: PostWithMeta) => void }) {
  return (
    <div className={mobileCarouselScrollClassName}>
      {games.map(g => (
        <GameIcon key={g.id} post={g} onOpen={() => onOpen(g)} />
      ))}
    </div>
  );
}

function TrendChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      // `text-primary-foreground` (y no blanco fijo): en modo oscuro el primary
      // es claro y el texto blanco quedaba ilegible sobre él.
      className={`shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium transition-colors duration-200 active:scale-[0.96] ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-line-strong text-ink-2 hover:border-primary/30 hover:text-primary"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function RankingSyncBanner({ installing, message, onInstall }: {
  installing: boolean;
  message: string | null;
  onInstall: () => void;
}) {
  return (
    <section className="flex items-center gap-2.5 rounded-2xl border border-amber-400/40 bg-amber-50/70 dark:bg-amber-500/10 px-3.5 py-3">
      <div className="w-9 h-9 shrink-0 rounded-xl bg-amber-500/15 grid place-items-center">
        <CloudOff size={16} className="text-amber-600 dark:text-amber-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12px] font-semibold leading-tight text-amber-900 dark:text-amber-200">
          El ranking no se sincroniza entre dispositivos
        </div>
        <div className="text-[10px] text-amber-800/80 dark:text-amber-300/80 leading-snug mt-0.5">
          Falta la tabla <span className="font-mono">game_plays</span> en Supabase. Con un clic la creas y el conteo pasa a ser global.
        </div>
        {message && (
          <div className={`text-[10px] mt-1 leading-snug flex items-center gap-1 ${message.startsWith("Tabla creada") || message.startsWith("Tabla") ? "text-emerald-600 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
            {message.startsWith("Tabla creada") ? <CheckCircle2 size={10} className="shrink-0" /> : null}
            {message}
          </div>
        )}
      </div>
      <button
        onClick={onInstall}
        disabled={installing}
        className="shrink-0 h-8 px-3 rounded-lg grad-brand text-primary-foreground text-[10px] font-display font-semibold tracking-widest shadow-sm active:scale-[0.97] transition disabled:opacity-50 flex items-center gap-1.5"
      >
        {installing ? <Loader2 size={11} className="animate-spin" /> : <Trophy size={11} />}
        {installing ? "CREANDO…" : "INSTALAR"}
      </button>
    </section>
  );
}

function Ranking24({ games, totalGames, onOpen }: {
  games: { g: PostWithMeta; n: number }[];
  totalGames: number;
  onOpen: (g: PostWithMeta) => void;
}) {
  if (games.length === 0) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card/60 p-3.5 flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 grid place-items-center">
          <Trophy size={17} className="text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[13px] leading-tight">Ranking · Más jugados (24h)</div>
          <div className="text-[11px] text-muted-foreground">
            {totalGames > 0
              ? "Aún no hay jugadas registradas hoy. ¡Dale a JUGAR y sube a la cima!"
              : "Cuando haya juegos publicados, aquí verás los más jugados."}
          </div>
        </div>
      </section>
    );
  }

  // Medallas del podio con tono legible en cada tema: los tonos claros
  // originales (primary-glow y blue-400) se perdían sobre la insignia clara del
  // tema claro, así que el 2.º y 3.º puesto usan su variante oscura.
  const medals = [
    "text-primary",
    "text-blue-600 dark:text-primary-glow",
    "text-violet-600 dark:text-violet-300",
  ] as const;

  return (
    <section className="rounded-2xl border border-primary/20 grad-brand-soft p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <Trophy size={15} className="text-primary" />
        <div className="font-display text-[13px] leading-tight">Ranking · Más jugados (24h)</div>
        <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-mono font-bold tracking-wider">TOP {games.length}</span>
        <span className="ml-auto text-[9px] font-mono text-muted-foreground/60">en vivo</span>
      </div>
      <div className="space-y-1.5">
        {games.map(({ g, n }, i) => {
          const title = extractTitle(g.content);
          const coverFrame = coverFrameFromPreset(g.asset_preset);
          return (
            <button
              key={g.id}
              onClick={() => onOpen(g)}
              className="w-full flex items-center gap-2.5 rounded-xl bg-card/80 border border-border/50 px-2.5 py-2 text-left hover:border-primary/40 hover:bg-card active:scale-[0.99] transition"
            >
              <span className={`w-6 h-6 shrink-0 rounded-lg grid place-items-center font-display text-[11px] font-bold ${i < 3 ? `bg-primary/10 ${medals[i]}` : "text-muted-foreground/60 bg-muted/60"}`}>
                {i + 1}
              </span>
              <div className={`relative w-11 h-11 shrink-0 rounded-lg overflow-hidden border border-border/60 ${g.signed_cover || g.signed_screenshots?.[0] ? "bg-muted/40" : "tile-blueprint"}`}>
                {g.signed_cover || g.signed_screenshots?.[0] ? (
                  <img src={g.signed_cover ?? g.signed_screenshots[0]} alt="" className="w-full h-full object-contain" style={coverFrameStyle(coverFrame)} />
                ) : (
                  <GameIconPlaceholder iconSize={22} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold truncate leading-tight">{title}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  @{g.author?.username ?? "jugador"}
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-display font-semibold tabular-nums">
                <Flame size={10} fill="currentColor" /> {n}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ForYouSection({ items, userGenres, activeGenre, onSelectGenre, onOpen, playCounts }: {
  items: PostWithMeta[];
  userGenres: string[];
  activeGenre: string | null;
  onSelectGenre: (g: string | null) => void;
  onOpen: (g: PostWithMeta) => void;
  playCounts: Record<string, number>;
}) {
  return (
    <section className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Compass size={18} className="text-primary" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-base leading-tight">Para ti</div>
          <div className="text-[11px] text-muted-foreground">{userGenres.length ? "Según lo que juegas" : "Los más populares de la comunidad"}</div>
        </div>

      </div>

      {/* Genre filter chips */}
      {userGenres.length > 1 && (
        <div className="flex gap-1.5 m3-scroll-x no-scrollbar -mx-1 px-1 pb-0.5">
          <button
            onClick={() => onSelectGenre(null)}
            className={`shrink-0 flex items-center gap-1 px-3 h-7 rounded-lg border text-[11px] font-medium transition-all duration-200 active:scale-[0.96] ${filterStateClass(activeGenre === null)}`}
          >
            <Sparkles size={11} /> Todos
          </button>
          {userGenres.map(g => (
            <button
              key={g}
              onClick={() => onSelectGenre(activeGenre === g ? null : g)}
              className={`shrink-0 flex items-center gap-1 px-3 h-7 rounded-lg border text-[11px] font-medium transition-all duration-200 active:scale-[0.96] ${filterStateClass(activeGenre === g)}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Games grid */}
      <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-3 gap-y-4">
        {items.map(g => (
          <GameIcon key={g.id} post={g} onOpen={() => onOpen(g)} />
        ))}
      </div>
    </section>
  );
}

function FeaturedBanner({ post, plays24, onPlay }: { post: PostWithMeta; plays24?: number; onPlay: () => void }) {
  const title = extractTitle(post.content);
  const active = plays24 && plays24 > 0 ? plays24 : 1 + Math.floor((post.likes + post.comments_count) * 1.3);
  const visualUrl = post.signed_cover ?? post.signed_screenshots[0] ?? null;
  const hasVisual = Boolean(visualUrl);
  const coverFrame = coverFrameFromPreset(post.asset_preset);
  return (
    <div className="relative">
      {/* M3: el banner es una tarjeta elevada (elevación 2) sobre el lienzo, sin
          halos de luz ni barridos animados. */}
      <div className="relative mx-auto max-w-md rounded-3xl overflow-hidden border border-line shadow-lg">
        <div className="relative aspect-square w-full">
        {hasVisual ? (
          <img src={visualUrl!} alt={title} className="absolute inset-0 w-full h-full object-contain" style={coverFrameStyle(coverFrame)} />
        ) : (
          <div className="absolute inset-0 tile-blueprint">
            <GameIconPlaceholder iconSize={112} />
          </div>
        )}
        {/* Overlay azul de marca SOLO sobre portadas (nunca negro): da contraste
            al título sin desaturar a gris. Sin portada NO se aplica: el degradado
            oficial de la página se ve completo, con solo un scrim sutil abajo
            para que el texto blanco siga legible. */}
        {/* Velo sobre la portada: es legibilidad (texto blanco sobre una foto
            cualquiera), no decoración. Sin portada no hace falta: el texto ya
            va en el color sobre superficie. */}
        {hasVisual && <div className="absolute inset-0 banner-overlay-deep" />}
        {/* Insignia M3: contenedor primario + etiqueta, sin halo ni pulso. */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-display tracking-widest">
          <Crown size={11} fill="currentColor" /> JUEGO MÁS JUGADO
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4 space-y-3">
        <div>
          <div className={`${hasVisual ? "text-white" : "text-foreground"} font-display text-xl leading-tight drop-shadow`}>{title}</div>
          <div className={`${hasVisual ? "text-white/80" : "text-muted-foreground"} text-[11px] font-mono truncate`}>
            @{post.author?.username ?? "jugador"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPlay}
            className="flex-1 h-11 rounded-full bg-primary text-primary-foreground font-display tracking-widest text-xs flex items-center justify-center gap-2 transition"
          >
            <Play size={16} fill="currentColor" /> JUGAR
          </button>
        </div>
        <div className={`flex items-center gap-3 ${hasVisual ? "text-white/90" : "text-muted-foreground"} text-[11px]`}>
          <span className="flex items-center gap-1">
            {plays24 && plays24 > 0 ? <Flame size={11} fill="currentColor" /> : <Users size={11} />}
            {plays24 && plays24 > 0 ? `${plays24} jugados hoy` : `${active} activos`}
          </span>
          <span className="flex items-center gap-1"><Heart size={11} fill="currentColor" /> {post.likes}</span>
        </div>
      </div>
      </div>
    </div>
  );
}

export function GamePlayModal({
  post, myId, isMod, onClose, onChange,
}: {
  post: PostWithMeta; myId: string | null; isMod: boolean; onClose: () => void; onChange: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 p-3 flex items-start justify-center pt-16 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <GameCard post={post} myId={myId} isMod={isMod} onChange={onChange} />
        <button
          onClick={onClose}
          className="mt-3 w-full h-10 rounded-xl bg-white/10 text-white text-xs font-display tracking-widest border border-white/20 "
        >
          CERRAR
        </button>
      </div>
    </div>
  );
}
