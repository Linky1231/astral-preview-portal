import { useState, useEffect, useCallback } from "react";
import { Avatar } from "./Avatar";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchEvents, deleteEvent, joinEvent, leaveEvent, listEventParticipants,
  type EventItem, type EventParticipant,
} from "@/lib/social/api";
import {
  Calendar, Trophy, Clock, Users, FileText,
  ChevronRight, Sparkles, Trash2, AlertCircle, Loader2,
  UserPlus, UserCheck, PartyPopper,
} from "lucide-react";

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Iniciado";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatJoined(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", {
    day: "numeric", month: "short",
  });
}

// Estados del evento como contenedores tonales de M3: el par contenedor/texto
// se define en claro y en oscuro (antes el chip tenía fondo claro fijo, así que
// en tema oscuro aparecía un recuadro blanco sobre la superficie).
const STATUS_STYLES: Record<string, { label: string; class: string }> = {
  upcoming: { label: "PRÓXIMO", class: "text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300" },
  active: { label: "ACTIVO", class: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300" },
  completed: { label: "FINALIZADO", class: "text-slate-500 bg-slate-500/10 border-slate-500/20 dark:text-slate-300" },
};

export function EventsSection({ isAdmin, showHeader = true }: { isAdmin: boolean; showHeader?: boolean }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Inscripción: estado por evento (sin re-renderizar todo el feed).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Panel de inscritos (solo admin): lista cargada bajo demanda por evento.
  const [showParts, setShowParts] = useState<Record<string, boolean>>({});
  const [partsList, setPartsList] = useState<Record<string, EventParticipant[]>>({});
  const [partsLoadingId, setPartsLoadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEvents();
        setEvents(data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const sorted = [...events].sort((a, b) => {
    const order = { upcoming: 0, active: 1, completed: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const patchEvent = useCallback((id: string, patch: Partial<EventItem>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const removeEvent = async (ev: EventItem) => {
    setDeleteError(null);
    try {
      await deleteEvent(ev.id);
      setEvents(prev => prev.filter(e => e.id !== ev.id));
      if (selected === ev.id) setSelected(null);
      setConfirmDeleteId(null);
    } catch (e) {
      console.error("[events] error al eliminar:", e);
      setDeleteError((e as Error)?.message || "No se pudo eliminar el evento");
      setConfirmDeleteId(null);
    }
  };

  // Inscribirse / desinscribirse: RPC real, luego estado local optimista.
  const toggleRegistration = async (ev: EventItem) => {
    if (busyId) return;
    setBusyId(ev.id);
    setActionError(null);
    const nowRegistered = !!ev.my_registered;
    try {
      if (nowRegistered) {
        await leaveEvent(ev.id);
      } else {
        await joinEvent(ev.id);
      }
      const delta = nowRegistered ? -1 : 1;
      patchEvent(ev.id, {
        my_registered: !nowRegistered,
        participant_count: Math.max(0, (ev.participant_count ?? 0) + delta),
      });
      // Si el admin tiene la lista abierta, refrescarla.
      if (isAdmin && showParts[ev.id]) {
        await loadParticipants(ev.id);
      }
    } catch (e) {
      console.error("[events] error al cambiar inscripción:", e);
      const msg = String((e as Error)?.message ?? "");
      setActionError(
        msg.includes("event_completed")
          ? "Este evento ya finalizó y no admite inscripciones."
          : msg || "No se pudo cambiar tu inscripción. Inténtalo de nuevo."
      );
    } finally {
      setBusyId(null);
    }
  };

  const loadParticipants = async (eventId: string) => {
    if (partsLoadingId) return;
    setPartsLoadingId(eventId);
    try {
      const list = await listEventParticipants(eventId);
      setPartsList(prev => ({ ...prev, [eventId]: list }));
    } catch {
      setPartsList(prev => ({ ...prev, [eventId]: [] }));
    } finally {
      setPartsLoadingId(null);
    }
  };

  const toggleParts = (ev: EventItem) => {
    const next = !showParts[ev.id];
    setShowParts(prev => ({ ...prev, [ev.id]: next }));
    if (next && !partsList[ev.id]) void loadParticipants(ev.id);
  };

  const activeCount = events.filter(e => e.status === "active").length;
  const upcomingCount = events.filter(e => e.status === "upcoming").length;

  return (
    <div className="space-y-4">
      {/* El panel completo ya aporta cabecera; esta cabecera solo se muestra en vistas incrustadas. */}
      {showHeader && <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary grid place-items-center shrink-0">
          <Trophy size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-display font-semibold text-foreground">Eventos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeCount > 0
              ? `${activeCount} evento${activeCount > 1 ? "s" : ""} activo${activeCount > 1 ? "s" : ""}`
              : upcomingCount > 0
              ? `${upcomingCount} próximo${upcomingCount > 1 ? "s" : ""}`
              : "Participa en concursos y gana premios"}
          </p>
        </div>
        {activeCount > 0 && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border border-success/25 bg-success/10 text-success-ink shrink-0">
            <Sparkles size={12} />
            {activeCount} activo{activeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="rounded-lg border border-border/70 bg-surface overflow-hidden animate-pulse">
              <div className="h-32 bg-muted/50" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-2/3 bg-muted/60 rounded" />
                <div className="h-3 w-1/2 bg-muted/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/60 grid place-items-center mx-auto mb-3">
            <Calendar size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No hay eventos disponibles</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Los eventos y concursos aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sorted.map((ev, i) => {
              const s = STATUS_STYLES[ev.status] ?? STATUS_STYLES.upcoming;
              const isOpen = selected === ev.id;
              const now = Date.now();
              const startsAt = new Date(ev.starts_at).getTime();
              const endsAt = new Date(ev.ends_at).getTime();
              const isLive = startsAt <= now && endsAt > now;
              const isPast = endsAt < now;
              const registered = !!ev.my_registered;
              const partsOpen = !!showParts[ev.id];
              const parts = partsList[ev.id] ?? null;
              const count = ev.participant_count ?? 0;

              return (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-lg overflow-hidden border border-border/70 bg-surface"
                >
                  {/* Banner */}
                  <div
                    className="relative h-36 cursor-pointer group"
                    onClick={() => setSelected(isOpen ? null : ev.id)}
                  >
                    {ev.banner_url ? (
                      <img src={ev.banner_url} alt={ev.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="w-full h-full bg-primary/10 grid place-items-center">
                        <Trophy size={40} className="text-primary/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider border shadow-sm ${s.class}`}>
                        {s.label}
                      </span>
                      {isLive && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider border border-success/25 bg-success/10 text-success-ink">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          EN VIVO
                        </span>
                      )}
                    </div>
                    {ev.prize_pool && ev.prize_pool > 0 && (
                      <div className="absolute bottom-3 right-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider border border-warn/30 bg-warn/15 text-warn-ink">
                          <Trophy size={10} /> {ev.prize_pool.toLocaleString()} Orbes
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-sm font-display font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setSelected(isOpen ? null : ev.id)}
                        >
                          {ev.title}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>
                      </div>
                      <button
                        onClick={() => setSelected(isOpen ? null : ev.id)}
                        className="shrink-0 w-7 h-7 rounded-lg border border-border grid place-items-center text-muted-foreground hover:bg-muted/60 transition"
                      >
                        <ChevronRight size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </button>
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(ev.starts_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {isPast ? "Finalizado" : timeUntil(isLive ? ev.ends_at : ev.starts_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} />
                        {count.toLocaleString()} inscrito{count === 1 ? "" : "s"}
                      </span>
                      {ev.submission_count !== undefined && (
                        <span className="inline-flex items-center gap-1">
                          <FileText size={11} />
                          {ev.submission_count} entrega{ev.submission_count === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pt-3 border-t border-border/60 space-y-3">
                            {ev.prize_description && (
                              <div>
                                <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                  <Trophy size={10} className="text-amber-500" /> PREMIOS
                                </div>
                                <p className="text-xs text-foreground/80">{ev.prize_description}</p>
                              </div>
                            )}
                            {ev.rules && (
                              <div>
                                <div className="text-[11px] font-medium text-muted-foreground mb-1">Reglas</div>
                                <p className="text-xs text-foreground/80 whitespace-pre-wrap">{ev.rules}</p>
                              </div>
                            )}

                            {/* Acciones: inscribirse + contador de inscritos */}
                            {!isPast && (
                              <div className="space-y-2 pt-1">
                                <button
                                  onClick={() => void toggleRegistration(ev)}
                                  disabled={!!busyId}
                                  className={`w-full h-10 rounded-lg text-xs font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 ${
                                    registered
                                      ? "bg-success/10 border border-success/25 text-success-ink hover:bg-success/15"
                                      : "grad-brand text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-110"
                                  }`}
                                >
                                  {busyId === ev.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : registered ? (
                                    <UserCheck size={14} />
                                  ) : (
                                    <UserPlus size={14} />
                                  )}
                                  {busyId === ev.id
                                    ? "GUARDANDO…"
                                    : registered
                                    ? "INSCRITO · TOCA PARA CANCELAR"
                                    : "INSCRIBIRSE"}
                                </button>
                                {/* Contador de inscritos, justo debajo del botón */}
                                <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                  <Users size={12} className="text-primary" />
                                  <span>
                                    {count.toLocaleString()} {count === 1 ? "persona inscrita" : "personas inscritas"}
                                  </span>
                                  {registered && (
                                    <span className="inline-flex items-center gap-1 text-emerald-600">
                                      · <UserCheck size={11} /> Tú
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {actionError && (
                              <div className="w-full flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 rounded-lg px-3 py-2">
                                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                                <span className="break-words">{actionError}</span>
                              </div>
                            )}

                            {/* Panel de inscritos — SOLO administradores */}
                            {isAdmin && (
                              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                                    <PartyPopper size={12} />
                                    Inscritos · {count.toLocaleString()}
                                  </div>
                                  <button
                                    onClick={() => toggleParts(ev)}
                                    className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-primary/30 bg-surface text-primary hover:bg-primary/10 transition active:scale-95"
                                  >
                                    {partsOpen ? "OCULTAR" : "VER QUIÉN"}
                                  </button>
                                </div>
                                {partsOpen && (
                                  <div className="mt-2.5">
                                    {partsLoadingId === ev.id ? (
                                      <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-muted-foreground">
                                        <Loader2 size={13} className="animate-spin" /> Cargando inscritos…
                                      </div>
                                    ) : parts && parts.length === 0 ? (
                                      <div className="text-center text-[11px] text-muted-foreground py-3">
                                        Aún no hay nadie inscrito en este evento.
                                      </div>
                                    ) : (
                                      <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                                        {parts?.map(p => (
                                          <li
                                            key={p.user_id}
                                            className="flex items-center gap-2.5 rounded-lg bg-background/80 border border-border/60 px-2.5 py-2"
                                          >
                                            <Avatar p={p} size={32} className="ring-1 ring-primary/20" />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium truncate">{p.display_name || p.username}</div>
                                              <div className="text-[10px] font-mono text-muted-foreground truncate">@{p.username}</div>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground shrink-0">
                                              {formatJoined(p.joined_at)}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {deleteError && (
                              <div className="w-full flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 rounded-lg px-3 py-2">
                                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                                <span className="break-words">{deleteError}</span>
                              </div>
                            )}
                            {isAdmin && confirmDeleteId === ev.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                  ¿Seguro?
                                </span>
                                <button
                                  onClick={() => removeEvent(ev)}
                                  className="h-8 px-3 rounded-lg bg-rose-500 text-white text-[11px] font-semibold hover:bg-rose-600 active:scale-[0.98] transition shadow-sm shadow-rose-500/25 flex items-center gap-1.5"
                                >
                                  <Trash2 size={12} /> Sí, eliminar
                                </button>
                                <button
                                  onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                                  className="h-8 px-3 rounded-lg border border-border/70 text-muted-foreground text-[11px] font-medium hover:bg-muted/40 transition active:scale-[0.98]"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : isAdmin ? (
                              <button
                                onClick={() => { setConfirmDeleteId(ev.id); setDeleteError(null); }}
                                className="h-8 px-3 rounded-lg border border-rose-200/70 text-rose-500 text-[11px] font-medium hover:bg-rose-50 dark:border-rose-800/40 dark:hover:bg-rose-950/20 transition active:scale-[0.98] flex items-center gap-1.5"
                              >
                                <Trash2 size={12} /> Eliminar evento
                              </button>
                            ) : null}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
