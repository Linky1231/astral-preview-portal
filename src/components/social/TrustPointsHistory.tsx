import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Clock, X } from "lucide-react";
import {
  fetchTrustHistory,
  type TrustHistoryEntry,
} from "@/lib/social/api";

function timeAgo(date: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `hace ${d}d` : new Date(date).toLocaleDateString();
}

export function TrustPointsHistory({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TrustHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchTrustHistory(userId);
      if (!cancelled) {
        setEntries(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const deductions = entries.filter((e) => e.action === "deduct");
  const restores = entries.filter((e) => e.action === "restore");
  const totalDeducted = deductions.reduce((sum, e) => sum + e.amount, 0);
  const totalRestored = restores.reduce((sum, e) => sum + e.amount, 0);

  return (
    <section className="fixed inset-0 z-[140] flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-background/95 backdrop-blur-md animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Historial de confianza">
      <header className="glass-header shrink-0 border-b border-border/70">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-3 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="h-9 w-9 shrink-0 rounded-xl border border-primary/20 bg-primary/8 grid place-items-center text-primary hover:bg-primary/14 active:scale-95 transition" aria-label="Volver a puntos de confianza"><X size={16} /></button>
          <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Puntos de confianza</div><h2 className="font-display text-base font-bold text-primary truncate">Historial</h2></div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <main className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-primary/20 bg-card px-4 py-4">
          <div className="text-center">
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-0.5">RESTADOS</div>
            <div className="text-sm font-display font-semibold text-primary tabular-nums">
              -{totalDeducted}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-0.5">EVENTOS</div>
            <div className="text-sm font-display font-semibold text-primary tabular-nums">
              {entries.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-0.5">RECUPERADOS</div>
            <div className="text-sm font-display font-semibold text-primary tabular-nums">
              +{totalRestored}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Cargando historial…
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Clock size={20} className="mx-auto mb-2 text-muted-foreground/30" />
              No hay eventos de confianza registrados
            </div>
          ) : (
            entries.map((entry) => {
              const isDeduct = entry.action === "deduct";
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/30 bg-card/50"
                >
                  <div
                    className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 mt-0.5 ${
                      "bg-primary/10 border border-primary/25"
                    }`}
                  >
                    {isDeduct ? (
                      <ShieldAlert size={14} className="text-primary" />
                    ) : (
                      <ShieldCheck size={14} className="text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-display font-semibold ${
                          "text-primary"
                        }`}
                      >
                        {isDeduct ? `-${entry.amount}` : `+${entry.amount}`} pts
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground/40">
                        {entry.points_before} → {entry.points_after}
                      </span>
                    </div>
                    {entry.reason && (
                      <div className="text-[11px] text-foreground/60 mt-0.5 leading-relaxed">
                        {entry.reason}
                      </div>
                    )}
                    <div className="text-[9px] font-mono text-muted-foreground/35 mt-1">
                      {timeAgo(entry.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </main>
      </div>
    </section>
  );
}
