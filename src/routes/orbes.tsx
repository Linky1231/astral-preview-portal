import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Sparkles, TrendingUp, TrendingDown, Gift, Gamepad2, Loader2, Wallet, BarChart3, ExternalLink } from "lucide-react";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, fetchAllOrbeTransactions, type OrbeTx, type Profile } from "@/lib/social/api";

export const Route = createFileRoute("/orbes")({
  head: () => ({ meta: [{ title: "Mis Orbes · Asternal" }] }),
  component: OrbesPage,
});

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString();
}

function kindMeta(k: OrbeTx["kind"]) {
  switch (k) {
    case "welcome_bonus": return { label: "Bienvenida", Icon: Gift, tone: "text-emerald-500" };
    case "game_purchase": return { label: "Juego", Icon: Gamepad2, tone: "text-primary" };
    case "adjustment":    return { label: "Ajuste", Icon: Wallet, tone: "text-muted-foreground" };
    case "refund":        return { label: "Reembolso", Icon: Wallet, tone: "text-emerald-500" };
    default:              return { label: "Movimiento", Icon: Wallet, tone: "text-muted-foreground" };
  }
}

function OrbesPage() {
  const navigate = useNavigate();

  // Bug de navegación: al salir del panel (botón «atrás» o gesto del navegador),
  // SIEMPRE se vuelve al menú principal (/) en lugar de a la pantalla aislada
  // del perfil (/profile), que es lo que ocurría antes.
  useEffect(() => {
    const onPop = () => {
      navigate({ to: "/", replace: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate]);

  const [me, setMe] = useState<Profile | null>(null);
  const [txs, setTxs] = useState<OrbeTx[]>([]);
  const [gameTitles, setGameTitles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setLoading(true);
      try {
        // Se cargan TODAS las transacciones de la cuenta: las estadísticas se
        // calculan sobre el total real, no sobre una muestra de 200.
        const [p, t] = await Promise.all([getMyProfile(), fetchAllOrbeTransactions()]);
        setMe(p); setTxs(t);
        // Títulos reales de los juegos involucrados: las transacciones solo
        // guardan el post_id, aquí se resuelve el nombre de cada juego.
        const ids = [...new Set(
          t.filter(x => x.kind === "game_purchase" && x.post_id).map(x => x.post_id as string)
        )];
        if (ids.length) {
          const { data: posts } = await supabase
            .from("posts" as never)
            .select("id,content" as never)
            .in("id" as never, ids as never);
          const map = new Map<string, string>();
          for (const pst of (posts ?? []) as { id: string; content: string }[]) {
            map.set(pst.id, (pst.content.split("\n")[0] || "Juego").replace(/^[🎮🎨]\s*/, "").trim() || "Juego");
          }
          setGameTitles(map);
        }
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [navigate]);

  const stats = useMemo(() => {
    let earned = 0, spent = 0, purchases = 0, sales = 0;
    const involved = new Set<string>();
    for (const t of txs) {
      if (t.amount > 0) earned += t.amount;
      else spent += -t.amount;
      // Solo cuentan como compras los gastos (la venta de un juego genera un
      // ingreso con kind game_purchase y no debe sumarse como compra).
      if (t.kind === "game_purchase") {
        if (t.amount < 0) purchases += 1;
        else if (t.amount > 0) sales += 1;
        if (t.post_id) involved.add(t.post_id);
      }
    }
    return { earned, spent, purchases, sales, games: involved.size };
  }, [txs]);

  // Estadísticas por periodo (mismo enfoque que el sistema de historial):
  // hoy · últimos 7 días · este mes, con ganado / gastado / neto y compras.
  const periods = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const weekAgo = now.getTime() - 7 * 864e5;

    const mk = () => ({ earned: 0, spent: 0, purchases: 0 });
    const today = mk(), week = mk(), month = mk();
    for (const t of txs) {
      const ts = new Date(t.created_at).getTime();
      if (t.amount > 0) {
        if (ts >= startToday) today.earned += t.amount;
        if (ts >= weekAgo) week.earned += t.amount;
        if (ts >= startMonth) month.earned += t.amount;
      } else {
        if (ts >= startToday) today.spent += -t.amount;
        if (ts >= weekAgo) week.spent += -t.amount;
        if (ts >= startMonth) month.spent += -t.amount;
      }
      if (t.kind === "game_purchase" && t.amount < 0) {
        if (ts >= startToday) today.purchases += 1;
        if (ts >= weekAgo) week.purchases += 1;
        if (ts >= startMonth) month.purchases += 1;
      }
    }
    return { today, week, month };
  }, [txs]);

  // Gasto diario de los últimos 7 días para la mini gráfica.
  const last7 = useMemo(() => {
    const days: { label: string; spent: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      let spent = 0;
      for (const t of txs) {
        const ts = new Date(t.created_at).getTime();
        if (ts >= start && ts < start + 864e5 && t.amount < 0) spent += -t.amount;
      }
      days.push({ label: d.toLocaleDateString("es", { weekday: "narrow" }), spent });
    }
    return days;
  }, [txs]);
  const maxSpent7 = Math.max(1, ...last7.map(d => d.spent));
  const monthName = new Date().toLocaleDateString("es", { month: "long" }).toUpperCase();

  // Historial visible: los 200 movimientos más recientes (el total real se
  // muestra en la cabecera).
  const recent = useMemo(() => txs.slice(0, 200), [txs]);

  // IDs de todos los juegos involucrados (comprados o vendidos), para la
  // lista de chips aunque el post ya no exista (se muestra un título genérico).
  const involvedIds = useMemo(
    () => [...new Set(txs.filter(t => t.kind === "game_purchase" && t.post_id).map(t => t.post_id as string))],
    [txs]
  );

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <SubPageHeader
        title="MIS ORBES"
        icon={<Sparkles size={14} fill="currentColor" />}
        subtitle={me ? `@${me.username ?? "…"}` : undefined}
      />

      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full px-3 py-4 pb-24 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Balance card */}
        <section className="relative overflow-hidden rounded-3xl border border-primary/30 grad-brand-soft p-5 shadow-lg">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <div className="text-[10px] font-display tracking-[0.2em] text-muted-foreground">SALDO ACTUAL</div>
            <div className="flex items-baseline gap-2 mt-2">
              <Sparkles size={28} className="text-primary" fill="currentColor" />
              <div className="text-5xl font-display font-bold tabular-nums">
                {loading ? <span className="opacity-40">···</span> : (me?.orbes ?? 0).toLocaleString()}
              </div>
              <div className="text-xs font-mono text-muted-foreground">orbes</div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Usa tus orbes para desbloquear juegos publicados por la comunidad.
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-3 gap-2">
          <StatCard label="Ganados" value={stats.earned} Icon={TrendingUp} tone="text-emerald-500" />
          <StatCard label="Gastados" value={stats.spent} Icon={TrendingDown} tone="text-rose-500" />
          <StatCard
            label="Juegos involucrados"
            value={stats.games}
            Icon={Gamepad2}
            tone="text-primary"
            sub={`${stats.purchases} comprado${stats.purchases !== 1 ? "s" : ""} · ${stats.sales} vendido${stats.sales !== 1 ? "s" : ""}`}
          />
        </section>

        {/* Juegos involucrados: con qué juegos hubo movimientos de orbes */}
        <section className="rounded-lg border border-border/70 bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between px-0.5 gap-2">
            <h2 className="font-display text-[11px] tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Gamepad2 size={12} className="text-primary-glow" />
              JUEGOS INVOLUCRADOS
            </h2>
            <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">{stats.games} juego{stats.games !== 1 ? "s" : ""} con movimientos de orbes</span>
          </div>
          {involvedIds.length === 0 ? (
            <div className="text-[11px] text-muted-foreground/60 px-0.5 pb-1">
              Aún no hay juegos con movimientos de orbes en tu cuenta. Compra o vende juegos y aparecerán aquí.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {involvedIds.map(id => (
                <a
                  key={id}
                  href={`/?g=${id}`}
                  className="orbes-game-link inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/45 border border-border/60 text-[10px] font-display tracking-wide text-foreground hover:border-primary/35 hover:bg-card transition"
                >
                  <Gamepad2 size={10} /> {gameTitles.get(id) ?? "Juego"} <ExternalLink size={9} className="opacity-60" />
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Estadísticas por periodo (estilo sistema de historial) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-sm tracking-widest flex items-center gap-1.5">
              <BarChart3 size={13} className="text-primary-glow" />
              ESTADÍSTICAS
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground">hoy · 7 días · este mes</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PeriodCard label="HOY" {...periods.today} />
            <PeriodCard label="7 DÍAS" {...periods.week} />
            <PeriodCard label={monthName} {...periods.month} />
          </div>
          {/* Mini gráfica de gastos de los últimos 7 días */}
          <div className="rounded-lg border border-border/70 bg-surface p-3">
            <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
              Gastos últimos 7 días
            </div>
            <div className="flex items-end gap-1 h-12">
              {last7.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div
                    className="w-full rounded-md bg-accent/80 transition-all hover:bg-accent"
                    style={{ height: `${Math.max(6, (d.spent / maxSpent7) * 100)}%`, minHeight: 4 }}
                    title={`${d.label}: ${d.spent} orbes gastados`}
                  />
                  <span className="text-[7px] font-mono text-muted-foreground/60 truncate w-full text-center">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* History */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-sm tracking-widest">HISTORIAL</h2>
            <span className="text-[10px] font-mono text-muted-foreground">{txs.length} movimientos</span>
          </div>
          {err && <div className="text-xs text-destructive px-1">{err}</div>}
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground rounded-lg border border-border/70 bg-surface">
              <Loader2 className="inline animate-spin mr-2" size={14} /> Cargando…
            </div>
          ) : txs.length === 0 ? (
            <div className="p-8 text-center rounded-lg border border-dashed border-border bg-surface space-y-2">
              <Sparkles size={22} className="mx-auto text-primary" />
              <div className="text-xs text-muted-foreground">Aún no hay movimientos.</div>
            </div>
          ) : (
            <ul className="rounded-lg border border-border/70 bg-surface divide-y divide-border/40 overflow-hidden">
              {recent.map(t => {
                const m = kindMeta(t.kind);
                const positive = t.amount > 0;
                const isGame = t.kind === "game_purchase";
                const gameTitle = t.post_id ? gameTitles.get(t.post_id) : undefined;
                const subLabel = isGame ? (positive ? "Venta" : "Compra") : m.label;
                return (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-3 hover:bg-muted/30 transition-colors">
                    <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${positive ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                      <m.Icon size={16} className={m.tone} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isGame && gameTitle ? (
                        <a href={`/?g=${t.post_id}`} className="text-sm truncate block hover:text-primary-glow hover:underline">
                          {positive ? "Vendiste" : "Compraste"} «{gameTitle}»
                        </a>
                      ) : (
                        <div className="text-sm truncate">{t.description || m.label}</div>
                      )}
                      <div className="text-[10px] font-mono text-muted-foreground">{subLabel} · {timeAgo(t.created_at)}</div>
                    </div>
                    <div className={`font-display font-semibold tabular-nums text-sm flex items-center gap-1 ${positive ? "text-emerald-500" : "text-rose-500"}`}>
                      {positive ? "+" : ""}{t.amount}
                      <Sparkles size={11} fill="currentColor" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="pt-2">
          {/* M3: acción táctil con área mínima de 44 dp, no una línea de texto
              suelta de 17 dp. */}
          <Link to="/" className="flex min-h-11 items-center justify-center text-center text-[11px] font-display tracking-widest text-primary-glow hover:underline">
            EXPLORAR JUEGOS PARA USAR TUS ORBES →
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, Icon, tone, sub }: { label: string; value: number; Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-3 flex flex-col items-start gap-1 transition-transform hover:scale-[1.02]">
      <Icon size={14} className={tone} />
      <div className="text-lg font-display font-semibold tabular-nums leading-none mt-1">{value.toLocaleString()}</div>
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60 truncate">{sub}</div>}
    </div>
  );
}

function PeriodCard({ label, earned, spent, purchases }: { label: string; earned: number; spent: number; purchases: number }) {
  const neto = earned - spent;
  return (
    <div className="rounded-lg border border-border/70 bg-surface p-3 space-y-1.5">
      <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center justify-between">
        <span className="truncate">{label}</span>
        {purchases > 0 && <span className="text-primary-glow/70 shrink-0">{purchases} compra{purchases !== 1 ? "s" : ""}</span>}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0"><TrendingUp size={10} className="text-emerald-500" /> Ganado</span>
        <span className="text-xs font-display font-semibold tabular-nums text-emerald-500">+{earned.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0"><TrendingDown size={10} className="text-rose-500" /> Gastado</span>
        <span className="text-xs font-display font-semibold tabular-nums text-rose-500">-{spent.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground shrink-0">Neto</span>
        <span className={`text-xs font-display font-semibold tabular-nums ${neto >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
          {neto >= 0 ? "+" : ""}{neto.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
