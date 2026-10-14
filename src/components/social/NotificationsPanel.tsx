import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { Link } from "@tanstack/react-router";
import {
  Bell, MessageSquare, Reply, Heart, Star, Repeat, AtSign, UserPlus,
  Gamepad2, CheckCheck, Inbox, X, Loader2,
} from "lucide-react";
import { fetchAllNotifications, markNotificationsRead, type Profile } from "@/lib/social/api";
import {
  notificationCategoryOf,
  notificationEventRowClass,
  notificationFilterControlClass,
  notificationSummarySurfaceClass,
  notificationTotals,
  type NotificationCategory,
} from "@/lib/social/notification-presentation";

type Notif = {
  id: string;
  type: string;
  created_at: string;
  read: boolean;
  actor_id?: string | null;
  actor?: Profile | null;
  post_id?: string | null;
  comment_id?: string | null;
};

const TYPE_META: Record<string, { icon: typeof Heart; label: string; cat: Exclude<NotificationCategory, "todas"> }> = {
  comment: { icon: MessageSquare, label: "comentó tu publicación", cat: "interacciones" },
  reply: { icon: Reply, label: "respondió a tu comentario", cat: "interacciones" },
  reaction: { icon: Heart, label: "reaccionó a tu contenido", cat: "interacciones" },
  like: { icon: Heart, label: "indicó que le gusta tu contenido", cat: "interacciones" },
  favorite: { icon: Star, label: "guardó tu contenido como favorito", cat: "interacciones" },
  repost: { icon: Repeat, label: "republicó tu publicación", cat: "interacciones" },
  mention: { icon: AtSign, label: "te mencionó", cat: "interacciones" },
  follow: { icon: UserPlus, label: "comenzó a seguirte", cat: "seguidores" },
  game: { icon: Gamepad2, label: "publicó un juego que sigues", cat: "juegos" },
};

const CATEGORIES: { id: NotificationCategory; label: string; icon: typeof Heart }[] = [
  { id: "todas", label: "Todas", icon: Inbox },
  { id: "interacciones", label: "Interacciones", icon: Heart },
  { id: "seguidores", label: "Seguidores", icon: UserPlus },
  { id: "juegos", label: "Juegos", icon: Gamepad2 },
];

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "ahora";
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  return `hace ${Math.floor(seconds / 86400)} d`;
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<NotificationCategory>("todas");
  const [marking, setMarking] = useState(false);

  const reload = async () => {
    try {
      setLoadError(false);
      setItems((await fetchAllNotifications()) as Notif[]);
    } catch {
      // No se sustituye un fallo de consulta por un historial vacío ni por datos locales.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    const interval = window.setInterval(() => void reload(), 45000);
    return () => window.clearInterval(interval);
  }, []);

  const totals = useMemo(() => notificationTotals(items), [items]);
  const filtered = category === "todas" ? items : items.filter(item => notificationCategoryOf(item.type) === category);

  const markAll = async () => {
    setMarking(true);
    try {
      await markNotificationsRead();
      await reload();
      window.dispatchEvent(new Event("asternal-notifications:changed"));
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-background flex flex-col">
      <div className="h-[2px] shrink-0 bg-primary/70" />
      <header className="shrink-0 border-b border-border/60 bg-background px-3 sm:px-4 py-2.5 flex items-center gap-2.5">
        <button onClick={onClose} aria-label="Cerrar notificaciones" className="w-9 h-9 rounded-lg border border-line-strong bg-card text-ink-2 grid place-items-center hover:bg-muted/60 hover:text-foreground active:scale-95 transition shrink-0">
          <X size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm font-semibold flex items-center gap-2"><Bell size={14} className="text-primary shrink-0" /><span className="truncate">NOTIFICACIONES</span></div>
          <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
            {loading ? "Cargando eventos…" : loadError ? "No se pudo actualizar el historial" : `${totals.total} evento${totals.total !== 1 ? "s" : ""} · ${totals.unread} sin leer`}
          </div>
        </div>
        {totals.total > 0 && <button onClick={markAll} disabled={marking || totals.unread === 0} className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border/60 text-[10px] font-display text-muted-foreground hover:text-primary hover:border-primary/40 active:scale-95 transition shrink-0 disabled:opacity-40">
          {marking ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />} MARCAR LEÍDAS
        </button>}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-3 py-3 pb-12 space-y-3">
          <section className={notificationSummarySurfaceClass} aria-label="Resumen real de notificaciones">
            <div className="flex items-center gap-3.5">
              <span className="w-11 h-11 rounded-xl border border-primary/20 bg-primary/10 text-primary grid place-items-center shrink-0"><Bell size={19} /></span>
              <div className="min-w-0">
                <div className="text-[10px] font-display tracking-[0.18em] text-muted-foreground">EVENTOS DE TU CUENTA</div>
                <div className="text-xl font-display font-semibold tabular-nums leading-tight">{loading ? "…" : totals.unread} sin leer</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{loading ? "Consultando tu historial…" : loadError ? "No se pudo consultar el historial real. Inténtalo de nuevo." : `${totals.total} notificación${totals.total !== 1 ? "es" : ""} recibida${totals.total !== 1 ? "s" : ""} desde eventos reales.`}</p>
              </div>
            </div>
          </section>

          <section className="notification-category-panel rounded-xl border p-2" aria-label="Filtrar notificaciones">
            <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
              <h2 className="font-display text-[11px] tracking-widest text-muted-foreground flex items-center gap-1.5"><Inbox size={12} className="text-primary" />FILTRAR</h2>
              <span className="text-[9px] font-mono text-muted-foreground/70">solo eventos recibidos</span>
            </div>
            <div role="tablist" aria-label="Categorías de notificaciones" className="grid grid-cols-2 sm:grid-cols-4 gap-1">
              {CATEGORIES.map(entry => {
                const active = category === entry.id;
                const summary = entry.id === "todas" ? { total: totals.total, unread: totals.unread } : totals.categories[entry.id];
                const Icon = entry.icon;
                return <button key={entry.id} role="tab" aria-selected={active} onClick={() => setCategory(entry.id)} className={`${notificationFilterControlClass} ${active ? "notification-filter-control-active" : ""}`}>
                  <span className="flex items-center gap-2 min-w-0"><Icon size={14} className="text-primary shrink-0" /><span className="text-[11px] font-display font-medium truncate">{entry.label}</span><span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums">{summary.total}</span></span>
                  {summary.unread > 0 && <span className="block mt-0.5 ml-[22px] text-[9px] font-mono text-primary">{summary.unread} sin leer</span>}
                </button>;
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between px-1"><h2 className="font-display text-sm tracking-widest flex items-center gap-1.5"><Bell size={13} className="text-primary" />{category === "todas" ? "TODAS" : CATEGORIES.find(entry => entry.id === category)?.label.toUpperCase()}</h2><span className="text-[10px] font-mono text-muted-foreground">{filtered.length} evento{filtered.length !== 1 ? "s" : ""}</span></div>
            {loading && items.length === 0 ? <div className="space-y-1.5">{[0, 1, 2].map(index => <div key={index} className="h-16 rounded-xl anim-shimmer" />)}</div>
              : loadError && items.length === 0 ? <div className="notification-empty-state rounded-xl border border-dashed p-8 text-center"><Inbox size={22} className="mx-auto mb-2 text-primary/55" /><div className="text-xs text-foreground">No se pudo cargar el historial</div><p className="text-[10px] text-muted-foreground mt-1">No mostraremos métricas hasta poder consultar los eventos reales.</p><button onClick={() => void reload()} className="mt-3 px-3 py-1.5 rounded-lg border border-border text-[10px] font-display text-primary hover:border-primary/40 active:scale-95 transition">REINTENTAR</button></div>
              : filtered.length === 0 ? <div className="notification-empty-state rounded-xl border border-dashed p-8 text-center"><Inbox size={22} className="mx-auto mb-2 text-primary/55" /><div className="text-xs text-foreground">Aún no hay eventos en esta categoría</div><p className="text-[10px] text-muted-foreground mt-1">Las notificaciones aparecerán cuando ocurran interacciones reales.</p></div>
              : <ul className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/45">{filtered.map(item => {
                const meta = TYPE_META[item.type] ?? TYPE_META.comment;
                const Icon = meta.icon;
                return <li key={item.id} className={`${notificationEventRowClass} ${!item.read ? "notification-event-row-unread" : ""}`}>
                  <Link to="/profile/$userId" params={{ userId: item.actor_id ?? "" }} onClick={event => { if (!item.actor_id) event.preventDefault(); }} className="relative shrink-0"><Avatar p={item.actor} size={36} /><span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full grid place-items-center border-2 border-background bg-card text-primary"><Icon size={10} strokeWidth={2.5} /></span></Link>
                  <div className="flex-1 min-w-0 pt-0.5"><div className="text-[12px] leading-snug text-foreground"><Link to="/profile/$userId" params={{ userId: item.actor_id ?? "" }} onClick={event => { if (!item.actor_id) event.preventDefault(); }} className="font-display font-semibold hover:text-primary transition-colors">{item.actor?.display_name ?? item.actor?.username ?? "Alguien"}</Link>{" "}<span className="text-muted-foreground">{meta.label}</span></div><div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">{timeAgo(item.created_at)}</div></div>
                  {!item.read && <span aria-label="Sin leer" className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                </li>;
              })}</ul>}
          </section>
        </div>
      </div>
    </div>
  );
}
