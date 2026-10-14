import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Avatar } from "@/components/social/Avatar";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isMod, isAdmin, listManagedUsers, setUserModerator, type ManagedUser,
  listBannedEmails, banEmail, unbanEmail, type BannedEmail,
  deductTrustPoints, restoreTrustPoints, DEFAULT_TRUST_POINTS,
  setUserAdmin,
  listGameReviews,
  reviewGameAi,
  fetchEvents, createEvent, updateEventStatus,
  type EventItem,
  type PostRow, type Profile,
} from "@/lib/social/api";
import { AI_STATUS_LABEL, readGameAiState, type AiStatus } from "@/lib/social/game-review";
import { toast } from "sonner";
import {
  getForumThreads, getForumCategories, deleteForumThread,
  createForumCategory, deleteForumCategory,
  type ForumThread, type ForumCategory,
} from "@/lib/social/forum-storage";
import { fetchChatProfiles } from "@/lib/social/chat";
import { SegmentedControl } from "@/components/ui/segmented";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Shield, ShieldCheck, Loader2, Search, Ban, Trash2, Plus, MessageSquare, Hash,
  X, Check, Trophy, Gamepad2, Lock, Pin, Globe, LifeBuoy, MessageCircleMore,
  Coffee, Star,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Moderación · Asternal" }] }),
  component: AdminPage,
});

type Tab = "mods" | "bans" | "juegos" | "foros" | "eventos";

/** Pestañas del panel; «MODS» solo existe para el administrador. */
const TABS: { id: Tab; label: string }[] = [
  { id: "mods", label: "MODS" },
  { id: "bans", label: "BANEOS" },
  { id: "juegos", label: "JUEGOS" },
  { id: "foros", label: "FOROS" },
  { id: "eventos", label: "EVENTOS" },
];

/** Un solo ancho de columna para cabecera y contenido. */
const SHELL = "max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full";

/** Inputs del panel: mismo alto, radio y foco en todas las pestañas. */
const FIELD =
  "h-10 w-full rounded-lg border border-line-strong bg-card px-3 text-sm outline-none transition focus:border-primary/50";
/** Igual que `FIELD` pero para textos largos (sin alto fijo). */
const TEXTAREA =
  "w-full resize-none rounded-lg border border-line-strong bg-card px-3 py-2.5 text-sm outline-none transition focus:border-primary/50";

type Tone = "success" | "warn" | "danger" | "primary" | "neutral";

/** Confirmación pendiente: todo el panel comparte una instancia de ConfirmDialog. */
type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  run: () => void;
};

const EVENT_STATUS_LABEL: Record<EventItem["status"], string> = {
  upcoming: "PRÓXIMO",
  active: "ACTIVO",
  completed: "FINALIZADO",
};

const EVENT_STATUS_TONE: Record<EventItem["status"], Tone> = {
  upcoming: "warn",
  active: "success",
  completed: "neutral",
};

/** Iconos de categoría del foro (mismos que la sección pública). */
const CAT_ICON: Record<string, ReactNode> = {
  "globe": <Globe size={15} />,
  "life-buoy": <LifeBuoy size={15} />,
  "trophy": <Trophy size={15} />,
  "message-circle-more": <MessageCircleMore size={15} />,
  "coffee": <Coffee size={15} />,
};

function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("mods");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [bans, setBans] = useState<BannedEmail[]>([]);
  const [games, setGames] = useState<PostRow[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [threadAuthors, setThreadAuthors] = useState<Map<string, Profile>>(new Map());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [trustBusy, setTrustBusy] = useState<string | null>(null);
  const [banBusy, setBanBusy] = useState(false);
  const [catBusy, setCatBusy] = useState(false);
  const [evBusy, setEvBusy] = useState(false);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [banErr, setBanErr] = useState<string | null>(null);
  // Formulario de nueva categoría
  const [showNewCat, setShowNewCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catIcon, setCatIcon] = useState("globe");
  // Eventos
  const [events, setEvents] = useState<EventItem[]>([]);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evStarts, setEvStarts] = useState("");
  const [evEnds, setEvEnds] = useState("");
  const [evPrizePool, setEvPrizePool] = useState<number | "">("");
  const [evPrizeDesc, setEvPrizeDesc] = useState("");
  const [evRules, setEvRules] = useState("");
  const [evErr, setEvErr] = useState<string | null>(null);

  const tabs = useMemo(() => (admin ? TABS : TABS.filter(t => t.id !== "mods")), [admin]);

  const load = async (search?: string, which: Tab = tab) => {
    setLoading(true);
    try {
      if (which === "mods") setUsers(await listManagedUsers(search));
      else if (which === "bans") setBans(await listBannedEmails());
      else if (which === "juegos") setGames(await listGameReviews());
      else if (which === "eventos") setEvents(await fetchEvents());
      else {
        const ts = await getForumThreads();
        setThreads(ts);
        setCategories(await getForumCategories());
        // Fotos de perfil de los autores de los hilos (carga en lote).
        const ids = Array.from(new Set(ts.map(t => t.authorId).filter(Boolean)));
        if (ids.length) {
          fetchChatProfiles(ids).then(setThreadAuthors).catch(() => {});
        } else {
          setThreadAuthors(new Map());
        }
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      const isA = await isAdmin();
      const isM = await isMod();
      setAdmin(isA);
      // Un moderador no tiene nada que hacer en «MODS»: arranca en su cola útil.
      setTab(isA ? "mods" : "bans");
      setAllowed(isA || isM);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (allowed) load(q, tab); /* eslint-disable-next-line */ }, [tab, allowed]);

  const askConfirm = (request: ConfirmRequest) => setConfirmReq(request);
  const fail = (e: unknown, fallback: string) =>
    toast.error(e instanceof Error && e.message ? e.message : fallback);

  /* ── Roles ─────────────────────────────────────────────── */

  const toggleMod = async (u: ManagedUser) => {
    setBusy(u.id);
    try {
      await setUserModerator(u.id, !u.is_mod);
      toast.success(u.is_mod ? `@${u.username} ya no es moderador.` : `@${u.username} ahora es moderador.`);
      await load(q);
    } catch (e) { fail(e, "No se pudo cambiar el rol."); }
    finally { setBusy(null); }
  };

  const grantAdmin = (u: ManagedUser) => askConfirm({
    title: "Dar rol de administrador",
    description: `@${u.username} tendrá acceso total al panel: roles, baneos y revisiones.`,
    confirmLabel: "HACER ADMIN",
    run: async () => {
      setBusy(u.id);
      try {
        await setUserAdmin(u.id, true);
        toast.success(`@${u.username} ahora es administrador.`);
        await load(q);
      } catch (e) { fail(e, "No se pudo asignar el rol."); }
      finally { setBusy(null); }
    },
  });

  /* ── Puntos de confianza ───────────────────────────────── */

  const trustPoints = (u: ManagedUser) => u.trust_points ?? DEFAULT_TRUST_POINTS;

  const deductTrust = (u: ManagedUser, amount: number, reason: string) => {
    const current = trustPoints(u);
    const why = reason || "Sin razón especificada";
    askConfirm({
      title: `Quitar ${amount} punto${amount === 1 ? "" : "s"} a @${u.username}`,
      description: `Pasará de ${current} a ${Math.max(0, current - amount)} puntos. Motivo: ${why}. Al llegar a 0 la cuenta se banea sola.`,
      confirmLabel: "QUITAR PUNTOS",
      destructive: true,
      run: async () => {
        setTrustBusy(u.id);
        try {
          const result = await deductTrustPoints(u.id, amount, why);
          if (result.banned) toast.error(`@${u.username} llegó a 0 puntos y fue baneado.`);
          else toast.success(`-${amount} punto(s) para @${u.username}.`);
          await load(q);
        } catch (e) { fail(e, "No se pudieron quitar los puntos."); }
        finally { setTrustBusy(null); }
      },
    });
  };

  const restoreTrust = async (u: ManagedUser) => {
    setTrustBusy(u.id);
    try {
      await restoreTrustPoints(u.id, 1);
      toast.success(`+1 punto para @${u.username}.`);
      await load(q);
    } catch (e) { fail(e, "No se pudo restaurar el punto."); }
    finally { setTrustBusy(null); }
  };

  /* ── Juegos ────────────────────────────────────────────── */

  const decideGameAi = async (postId: string, decision: "no_ia" | "ia") => {
    setBusy(postId);
    try {
      await reviewGameAi(postId, decision);
      setGames(await listGameReviews());
      toast.success(
        decision === "no_ia"
          ? "Verificado como no IA: ganancias activas."
          : "Marcado como IA: sin ganancias hasta nueva verificación.",
      );
    } catch (e) { fail(e, "No se pudo guardar la revisión."); }
    finally { setBusy(null); }
  };

  /* ── Baneos ────────────────────────────────────────────── */

  const addBan = async () => {
    setBanErr(null);
    setBanBusy(true);
    try {
      await banEmail(newEmail, newReason || undefined);
      toast.success(`${newEmail} baneado.`);
      setNewEmail("");
      setNewReason("");
      await load();
    } catch (e) {
      setBanErr(e instanceof Error && e.message ? e.message : "No se pudo banear el email.");
    } finally { setBanBusy(false); }
  };

  const removeBan = (b: BannedEmail) => askConfirm({
    title: "Quitar el baneo",
    description: `${b.email} podrá volver a registrarse con este correo.`,
    confirmLabel: "QUITAR BANEO",
    run: async () => {
      setBusy(b.id);
      try { await unbanEmail(b.id); toast.success("Baneo retirado."); await load(); }
      catch (e) { fail(e, "No se pudo quitar el baneo."); }
      finally { setBusy(null); }
    },
  });

  /* ── Foro ──────────────────────────────────────────────── */

  const handleDeleteThread = (t: ForumThread) => askConfirm({
    title: "Borrar el hilo",
    description: `«${t.title}» y todas sus respuestas se eliminarán de forma permanente.`,
    confirmLabel: "BORRAR HILO",
    destructive: true,
    run: async () => {
      setBusy(t.id);
      try { await deleteForumThread(t.id); toast.success("Hilo borrado."); await load(); }
      catch (e) { fail(e, "No se pudo borrar el hilo."); }
      finally { setBusy(null); }
    },
  });

  const handleDeleteCategory = (cat: ForumCategory) => askConfirm({
    title: "Borrar la categoría",
    description: `«${cat.name}» y TODOS los hilos que contiene se eliminarán de forma permanente.`,
    confirmLabel: "BORRAR CATEGORÍA",
    destructive: true,
    run: async () => {
      try { await deleteForumCategory(cat.id); toast.success("Categoría borrada."); await load(); }
      catch (e) { fail(e, "No se pudo borrar la categoría."); }
    },
  });

  const handleNewCategory = async () => {
    if (!catName.trim()) return;
    setCatBusy(true);
    try {
      await createForumCategory(catName.trim(), catDesc.trim(), catIcon);
      setCatName(""); setCatDesc(""); setCatIcon("globe"); setShowNewCat(false);
      toast.success("Categoría creada.");
      await load();
    } catch (e) { fail(e, "No se pudo crear la categoría."); }
    finally { setCatBusy(false); }
  };

  /* ── Eventos ───────────────────────────────────────────── */

  const createNewEvent = async () => {
    setEvErr(null);
    if (!evTitle.trim() || !evDesc.trim() || !evStarts || !evEnds) {
      setEvErr("Completa título, descripción, inicio y fin.");
      return;
    }
    if (new Date(evStarts) >= new Date(evEnds)) {
      setEvErr("La fecha de fin debe ser posterior al inicio.");
      return;
    }
    setEvBusy(true);
    try {
      await createEvent({
        title: evTitle.trim(),
        description: evDesc.trim(),
        starts_at: new Date(evStarts).toISOString(),
        ends_at: new Date(evEnds).toISOString(),
        prize_pool: typeof evPrizePool === "number" ? evPrizePool : null,
        prize_description: evPrizeDesc.trim() || null,
        rules: evRules.trim() || null,
      });
      setEvTitle(""); setEvDesc(""); setEvStarts(""); setEvEnds("");
      setEvPrizePool(""); setEvPrizeDesc(""); setEvRules("");
      setShowNewEvent(false);
      toast.success("Evento creado.");
      await load();
    } catch (e) { setEvErr(e instanceof Error && e.message ? e.message : "No se pudo crear el evento."); }
    finally { setEvBusy(false); }
  };

  const changeEventStatus = async (ev: EventItem, status: EventItem["status"]) => {
    try {
      await updateEventStatus(ev.id, status);
      toast.success(`«${ev.title}» · ${EVENT_STATUS_LABEL[status]}.`);
      await load();
    } catch (e) { fail(e, "No se pudo cambiar el estado."); }
  };

  /* ── Puertas de acceso ─────────────────────────────────── */

  if (allowed === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Comprobando permisos…
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm surface p-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <Lock size={24} />
          </div>
          <h1 className="font-display text-base font-semibold text-ink">Acceso restringido</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo moderadores y administradores pueden abrir el panel de moderación.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[11px] font-display font-semibold tracking-wide text-primary-foreground transition active:scale-95"
          >
            VOLVER AL INICIO
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <SubPageHeader
        title="MODERACIÓN"
        icon={<ShieldCheck size={14} />}
        subtitle={admin ? "Administrador · acceso total" : "Moderador"}
        right={
          <StatusChip tone={admin ? "primary" : "neutral"} icon={<Shield size={11} />}>
            {admin ? "ADMIN" : "MOD"}
          </StatusChip>
        }
        below={
          <div className="space-y-2.5">
            <SegmentedControl items={tabs} value={tab} onChange={setTab} />
            {tab === "mods" && admin && (
              <form
                onSubmit={e => { e.preventDefault(); load(q); }}
                className="flex gap-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-card px-3">
                  <Search size={14} className="shrink-0 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Buscar usuario por nombre o @usuario…"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => { setQ(""); load(""); }}
                      aria-label="Limpiar búsqueda"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-lg bg-primary px-4 text-[11px] font-display font-semibold tracking-wide text-primary-foreground transition active:scale-95"
                >
                  BUSCAR
                </button>
              </form>
            )}
          </div>
        }
      />

      <main className={`${SHELL} flex-1 space-y-2.5 px-3 py-3 pb-24`}>
        {loading ? (
          <ListSkeleton rows={tab === "foros" ? 5 : 3} />
        ) : tab === "mods" ? (
          users.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={24} />}
              title="Sin usuarios que mostrar"
              subtitle={q ? `Nadie coincide con «${q}».` : "Escribe un nombre para buscar cuentas."}
            />
          ) : (
            <>
              <SectionTitle icon={<Shield size={12} />}>USUARIOS · {users.length}</SectionTitle>
              {users.map(u => (
                <ModeratorCard
                  key={u.id}
                  user={u}
                  admin={admin}
                  busy={busy === u.id}
                  trustBusy={trustBusy === u.id}
                  onToggleMod={() => toggleMod(u)}
                  onGrantAdmin={() => grantAdmin(u)}
                  onRestore={() => restoreTrust(u)}
                  onDeduct={(amount, reason) => deductTrust(u, amount, reason)}
                />
              ))}
            </>
          )
        ) : tab === "bans" ? (
          <>
            {admin ? (
              <section className="surface space-y-2.5 p-3">
                <SectionTitle icon={<Ban size={12} />}>BANEAR UN EMAIL</SectionTitle>
                <Field label="Email">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="usuario@ejemplo.com"
                    className={FIELD}
                  />
                </Field>
                <Field label="Motivo (opcional)">
                  <input
                    value={newReason}
                    onChange={e => setNewReason(e.target.value)}
                    placeholder="Por qué se banea esta cuenta"
                    maxLength={200}
                    className={FIELD}
                  />
                </Field>
                {banErr && <InlineError>{banErr}</InlineError>}
                <button
                  onClick={addBan}
                  disabled={!newEmail.trim() || banBusy}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-destructive text-[11px] font-display font-semibold tracking-wide text-destructive-foreground transition active:scale-[0.98] disabled:opacity-40"
                >
                  {banBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} BANEAR EMAIL
                </button>
              </section>
            ) : (
              <RoleNote icon={<Lock size={12} />}>
                Solo el administrador puede añadir emails a la lista de baneos.
              </RoleNote>
            )}

            {bans.length === 0 ? (
              <EmptyState
                icon={<Ban size={24} />}
                title="No hay emails baneados"
                subtitle="Los baneos que se añadan aparecerán aquí con su motivo."
              />
            ) : (
              <>
                <SectionTitle icon={<Ban size={12} />}>BANEADOS · {bans.length}</SectionTitle>
                {bans.map(b => (
                  <article key={b.id} className="surface flex items-center gap-3 px-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                      <Ban size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-mono text-ink">{b.email}</div>
                      <div className="truncate text-[10px] text-ink-3">
                        {b.reason || "Sin motivo registrado"}
                      </div>
                    </div>
                    <button
                      onClick={() => removeBan(b)}
                      disabled={busy === b.id}
                      title="Quitar del baneo"
                      aria-label={`Quitar el baneo de ${b.email}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-destructive/30 text-destructive transition hover:bg-destructive/10 active:scale-95 disabled:opacity-40"
                    >
                      {busy === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </article>
                ))}
              </>
            )}
          </>
        ) : tab === "juegos" ? (
          games.length === 0 ? (
            <EmptyState
              icon={<Gamepad2 size={24} />}
              title="Nada que revisar"
              subtitle="Los juegos publicados aparecerán aquí para verificar si están hechos con IA."
            />
          ) : (
            <>
              <SectionTitle icon={<Gamepad2 size={12} />}>REVISIONES · {games.length}</SectionTitle>
              {games.map(g => {
                const ai = readGameAiState((g as { asset_preset?: Record<string, unknown> | null }).asset_preset);
                const status: AiStatus = ai?.status ?? "pendiente";
                const tone: Tone = status === "no_ia" ? "success" : status === "ia" ? "danger" : "warn";
                const title = (g.content || "Juego").split("\n")[0].replace(/^🎮\s*/, "");
                const origin = ai?.auto
                  ? "verificado automáticamente (motor propio)"
                  : ai?.declared
                    ? "el creador declaró que está hecho con IA"
                    : "pendiente de revisión manual";
                return (
                  <article key={g.id} className="surface space-y-2.5 p-3">
                    <div className="flex items-start gap-3">
                      {g.cover_url ? (
                        <img
                          src={g.cover_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg border border-border/60 object-cover"
                        />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-border/60 bg-muted/40 text-ink-3">
                          <Gamepad2 size={16} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-sm font-semibold">{title}</div>
                        <div className="truncate font-mono text-[10px] text-ink-3">
                          {g.link_url || "Publicado desde el motor de Asternal"}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusChip tone={tone}>{AI_STATUS_LABEL[status]}</StatusChip>
                          <span className="text-[11px] text-muted-foreground">{origin}</span>
                        </div>
                      </div>
                    </div>

                    {admin ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => decideGameAi(g.id, "no_ia")}
                          disabled={busy === g.id}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[11px] font-display font-semibold tracking-wide text-success transition active:scale-[0.98] disabled:opacity-40"
                        >
                          {busy === g.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          NO ES IA · GANA
                        </button>
                        <button
                          onClick={() => decideGameAi(g.id, "ia")}
                          disabled={busy === g.id}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] font-display font-semibold tracking-wide text-destructive transition active:scale-[0.98] disabled:opacity-40"
                        >
                          {busy === g.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                          ES IA · SIN GANANCIAS
                        </button>
                      </div>
                    ) : (
                      <RoleNote icon={<Lock size={12} />}>Solo un administrador puede resolver la revisión.</RoleNote>
                    )}
                  </article>
                );
              })}
            </>
          )
        ) : tab === "eventos" ? (
          <>
            <section className="surface space-y-2.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle icon={<Trophy size={12} />}>NUEVO EVENTO</SectionTitle>
                <button
                  onClick={() => setShowNewEvent(s => !s)}
                  className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-2.5 py-1.5 text-[11px] font-display font-semibold tracking-wide text-ink-2 transition hover:border-primary/40 hover:text-primary active:scale-95"
                >
                  {showNewEvent ? <X size={12} /> : <Plus size={12} />} {showNewEvent ? "CANCELAR" : "CREAR"}
                </button>
              </div>

              {showNewEvent && (
                <div className="space-y-2.5 border-t border-border/40 pt-3">
                  <Field label="Título">
                    <input value={evTitle} onChange={e => setEvTitle(e.target.value)} maxLength={60}
                      placeholder="Copa de otoño" className={FIELD} />
                  </Field>
                  <Field label="Descripción">
                    <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} maxLength={500} rows={2}
                      placeholder="De qué trata el evento" className={TEXTAREA} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Inicio">
                      <input type="datetime-local" value={evStarts} onChange={e => setEvStarts(e.target.value)} className={FIELD} />
                    </Field>
                    <Field label="Fin">
                      <input type="datetime-local" value={evEnds} onChange={e => setEvEnds(e.target.value)} className={FIELD} />
                    </Field>
                  </div>
                  <Field label="Premio (Orbes)">
                    <input type="number" min={0} value={evPrizePool}
                      onChange={e => setEvPrizePool(e.target.value ? Number(e.target.value) : "")}
                      placeholder="0" className={FIELD} />
                  </Field>
                  <Field label="Descripción del premio (opcional)">
                    <textarea value={evPrizeDesc} onChange={e => setEvPrizeDesc(e.target.value)} maxLength={300} rows={1}
                      placeholder="Qué se lleva quien gane" className={TEXTAREA} />
                  </Field>
                  <Field label="Reglas (opcional)">
                    <textarea value={evRules} onChange={e => setEvRules(e.target.value)} maxLength={1000} rows={2}
                      placeholder="Cómo se participa y qué se evalúa" className={TEXTAREA} />
                  </Field>
                  {evErr && <InlineError>{evErr}</InlineError>}
                  {/* La CTA principal de la pantalla: un solo degradado. */}
                  <button
                    onClick={createNewEvent}
                    disabled={!evTitle.trim() || !evDesc.trim() || !evStarts || !evEnds || evBusy}
                    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg grad-brand text-[11px] font-display font-semibold tracking-wide text-primary-foreground transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {evBusy ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />} CREAR EVENTO
                  </button>
                </div>
              )}
            </section>

            {events.length === 0 ? (
              <EmptyState
                icon={<Trophy size={24} />}
                title="No hay eventos"
                subtitle="Crea el primer evento para que la comunidad compita."
              />
            ) : (
              <>
                <SectionTitle icon={<Trophy size={12} />}>EVENTOS · {events.length}</SectionTitle>
                {events.map(ev => (
                  <article key={ev.id} className="surface space-y-2.5 p-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/50 text-ink-2">
                        <Trophy size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-sm font-semibold">{ev.title}</div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-3">{ev.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
                      <span>{new Date(ev.starts_at).toLocaleDateString()} → {new Date(ev.ends_at).toLocaleDateString()}</span>
                      <span>{ev.participant_count ?? 0} participantes</span>
                      <span>{ev.submission_count ?? 0} entregas</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                      <StatusChip tone={EVENT_STATUS_TONE[ev.status]}>
                        {EVENT_STATUS_LABEL[ev.status]}
                      </StatusChip>
                      <select
                        value={ev.status}
                        aria-label={`Estado del evento ${ev.title}`}
                        onChange={e => changeEventStatus(ev, e.target.value as EventItem["status"])}
                        className="h-9 rounded-lg border border-line-strong bg-card px-2 font-mono text-[11px] outline-none transition focus:border-primary/50"
                      >
                        {(Object.keys(EVENT_STATUS_LABEL) as EventItem["status"][]).map(s => (
                          <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
              </>
            )}
          </>
        ) : (
          /* ── FOROS ── */
          <>
            <section className="surface space-y-2.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle icon={<Hash size={12} />}>CATEGORÍAS · {categories.length}</SectionTitle>
                {admin && (
                  <button
                    onClick={() => setShowNewCat(s => !s)}
                    className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-2.5 py-1.5 text-[11px] font-display font-semibold tracking-wide text-ink-2 transition hover:border-primary/40 hover:text-primary active:scale-95"
                  >
                    {showNewCat ? <X size={12} /> : <Plus size={12} />} {showNewCat ? "CANCELAR" : "AÑADIR"}
                  </button>
                )}
              </div>

              {admin && showNewCat && (
                <div className="space-y-2 rounded-lg surface-2 p-2.5">
                  <Field label="Nombre">
                    <input value={catName} onChange={e => setCatName(e.target.value)} maxLength={30}
                      placeholder="Ej. Tutoriales" className={FIELD} />
                  </Field>
                  <Field label="Descripción (opcional)">
                    <input value={catDesc} onChange={e => setCatDesc(e.target.value)} maxLength={100}
                      placeholder="De qué se habla en esta categoría" className={FIELD} />
                  </Field>
                  <div className="flex items-center gap-2">
                    <select
                      value={catIcon}
                      onChange={e => setCatIcon(e.target.value)}
                      aria-label="Icono de la categoría"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-2.5 text-xs outline-none"
                    >
                      <option value="globe">🌍 General</option>
                      <option value="life-buoy">🛟 Ayuda</option>
                      <option value="trophy">🏆 Showcase</option>
                      <option value="message-circle-more">💬 Feedback</option>
                      <option value="coffee">☕ Off-Topic</option>
                    </select>
                    <button
                      onClick={handleNewCategory}
                      disabled={!catName.trim() || catBusy}
                      className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[11px] font-display font-semibold tracking-wide text-primary-foreground transition active:scale-95 disabled:opacity-40"
                    >
                      {catBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} CREAR
                    </button>
                  </div>
                </div>
              )}

              {categories.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">Aún no hay categorías.</p>
              ) : (
                <ul className="overflow-hidden rounded-lg border border-border/50">
                  {categories.map((cat, i) => (
                    <li
                      key={cat.id}
                      className={`flex items-center gap-3 bg-card px-3 py-2 ${i > 0 ? "border-t border-border/50" : ""}`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/40 text-ink-2">
                        {CAT_ICON[cat.icon] ?? <MessageSquare size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-xs font-semibold">{cat.name}</div>
                        <div className="truncate text-[10px] text-ink-3">
                          {cat.threadCount} hilo{cat.threadCount === 1 ? "" : "s"}
                          {cat.description ? ` · ${cat.description}` : ""}
                        </div>
                      </div>
                      {admin && (
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          title="Eliminar categoría"
                          aria-label={`Eliminar la categoría ${cat.name}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-destructive/70 transition hover:bg-destructive/10 hover:text-destructive active:scale-95"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {threads.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={24} />}
                title="No hay hilos en el foro"
                subtitle="Los hilos aparecerán aquí para poder revisarlos y borrarlos."
              />
            ) : (
              <>
                <SectionTitle icon={<MessageSquare size={12} />}>HILOS · {threads.length}</SectionTitle>
                {threads.map(t => {
                  const author = t.authorId ? threadAuthors.get(t.authorId) ?? null : null;
                  const catName = categories.find(c => c.id === t.categoryId)?.name ?? "Sin categoría";
                  return (
                    <article key={t.id} className="surface flex items-start gap-3 px-3 py-2.5">
                      <Link
                        to="/profile/$userId"
                        params={{ userId: t.authorId }}
                        title={`Ver perfil de ${t.authorUsername}`}
                        className="block h-9 w-9 shrink-0 overflow-hidden rounded-full"
                      >
                        <Avatar p={author} size={36} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5 font-display text-sm">
                          {t.pinned && <Pin size={11} className="shrink-0 text-primary" aria-label="Hilo fijado" />}
                          {t.closed && <Lock size={11} className="shrink-0 text-ink-3" aria-label="Hilo cerrado" />}
                          <span className="truncate">{t.title}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-3">
                          <Link
                            to="/profile/$userId"
                            params={{ userId: t.authorId }}
                            className="font-mono transition-colors hover:text-primary"
                          >
                            @{t.authorUsername}
                          </Link>
                          <span>{t.postCount} respuestas</span>
                          <span>{t.views} vistas</span>
                          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5">{catName}</span>
                        </div>
                      </div>
                      {admin && (
                        <button
                          onClick={() => handleDeleteThread(t)}
                          disabled={busy === t.id}
                          title="Eliminar hilo"
                          aria-label={`Eliminar el hilo ${t.title}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-destructive/30 text-destructive/80 transition hover:bg-destructive/10 hover:text-destructive active:scale-95 disabled:opacity-40"
                        >
                          {busy === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </article>
                  );
                })}
              </>
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmReq}
        title={confirmReq?.title ?? ""}
        description={confirmReq?.description}
        confirmLabel={confirmReq?.confirmLabel}
        destructive={confirmReq?.destructive}
        onConfirm={() => { const request = confirmReq; setConfirmReq(null); request?.run(); }}
        onCancel={() => setConfirmReq(null)}
      />
    </div>
  );
}

/* ─── Piezas compartidas del panel ───────────────────────── */

/** Micro-label de sección: una vez por bloque, como en el resto de la app. */
function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <div className="section-label">{icon}{children}</div>;
}

/** Etiqueta + control, para que ningún campo del panel quede sin nombre. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] text-ink-2">{label}</span>
      {children}
    </label>
  );
}

/** Chip de estado con los tokens del sistema (success/warn/danger/primary). */
function StatusChip({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  const toneCls =
    tone === "success" ? "border-success/30 bg-success/10 text-success"
    : tone === "warn" ? "border-warn/30 bg-warn/10 text-warn"
    : tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive"
    : tone === "primary" ? "border-primary/30 bg-primary/10 text-primary"
    : "border-border/60 bg-muted/40 text-ink-3";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-display font-semibold tracking-wide ${toneCls}`}>
      {icon}
      {children}
    </span>
  );
}

/** Puntos de confianza: mismos umbrales de color que el resto del panel. */
function trustTone(points: number): Tone {
  return points <= 3 ? "danger" : points <= 6 ? "warn" : "success";
}

/** Explica por qué una acción no está disponible para este rol. */
function RoleNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg surface-2 px-3 py-2 text-[11px] text-ink-3">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
      {children}
    </div>
  );
}

/** Carga de listas con el shimmer estándar (sin spinners de página). */
function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-[76px] rounded-xl anim-shimmer" />
      ))}
    </div>
  );
}

/** Estado vacío estándar: icono contenido, título y una línea de ayuda. */
function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border/40 bg-muted/30 text-ink-3">
        {icon}
      </div>
      <h3 className="mb-1 font-display text-sm font-semibold text-ink-2">{title}</h3>
      {subtitle && <p className="max-w-xs text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/**
 * Ficha de una cuenta: identidad, puntos de confianza y roles.
 *
 * Los puntos van en su propio bloque inset con campos con nombre (cantidad y
 * motivo) y objetivos táctiles de 36px, en lugar de la fila apretada de
 * controles de 24px que había antes.
 */
function ModeratorCard({
  user, admin, busy, trustBusy, onToggleMod, onGrantAdmin, onRestore, onDeduct,
}: {
  user: ManagedUser;
  admin: boolean;
  busy: boolean;
  trustBusy: boolean;
  onToggleMod: () => void;
  onGrantAdmin: () => void;
  onRestore: () => void;
  onDeduct: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const points = user.trust_points ?? DEFAULT_TRUST_POINTS;
  const name = user.display_name || user.username;

  const modBtn = user.is_mod
    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
    : "border-line-strong bg-card text-ink-2 hover:border-primary/40 hover:text-primary";

  return (
    <article className="surface space-y-3 p-3">
      <div className="flex items-start gap-3">
        <Link
          to="/profile/$userId"
          params={{ userId: user.id }}
          title={`Ver perfil de ${name}`}
          className="shrink-0 rounded-full"
        >
          <Avatar p={user} size={40} className="ring-2 ring-primary/15" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/profile/$userId"
            params={{ userId: user.id }}
            className="block truncate font-display text-sm font-semibold transition-colors hover:text-primary"
          >
            {name}
          </Link>
          <div className="truncate font-mono text-[11px] text-ink-3">@{user.username}</div>
        </div>
        <StatusChip
          tone={user.is_admin ? "primary" : user.is_mod ? "neutral" : "neutral"}
          icon={user.is_admin || user.is_mod ? <Shield size={11} /> : undefined}
        >
          {user.is_admin ? "ADMIN" : user.is_mod ? "MOD" : "USUARIO"}
        </StatusChip>
      </div>

      <div className="space-y-2 rounded-lg surface-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={<Star size={12} />}>PUNTOS DE CONFIANZA</SectionTitle>
          <StatusChip tone={trustTone(points)}>{points} / {DEFAULT_TRUST_POINTS}</StatusChip>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={DEFAULT_TRUST_POINTS}
            value={amount}
            aria-label={`Puntos a quitar a ${name}`}
            onChange={e => setAmount(Math.max(1, Math.min(DEFAULT_TRUST_POINTS, parseInt(e.target.value) || 1)))}
            className="h-9 w-12 shrink-0 rounded-lg border border-line-strong bg-card text-center font-mono text-xs outline-none transition focus:border-primary/50"
          />
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={120}
            placeholder="Motivo del ajuste"
            aria-label={`Motivo del ajuste a ${name}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-2.5 text-xs outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50"
          />
          <button
            type="button"
            onClick={onRestore}
            disabled={trustBusy || points >= DEFAULT_TRUST_POINTS}
            title="Restaurar un punto"
            className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-success/30 bg-success/10 px-2.5 text-xs font-semibold text-success transition active:scale-95 disabled:opacity-40"
          >
            {trustBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} 1
          </button>
          <button
            type="button"
            onClick={() => onDeduct(amount, reason.trim())}
            disabled={trustBusy || points <= 0}
            title={`Quitar ${amount} punto(s)`}
            className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 text-xs font-semibold text-destructive transition active:scale-95 disabled:opacity-40"
          >
            {trustBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} {amount}
          </button>
        </div>
      </div>

      {admin && !user.is_admin ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleMod}
            disabled={busy}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-[11px] font-display font-semibold tracking-wide transition active:scale-[0.98] disabled:opacity-40 ${modBtn}`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
            {user.is_mod ? "QUITAR MOD" : "HACER MOD"}
          </button>
          <button
            type="button"
            onClick={onGrantAdmin}
            disabled={busy}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-[11px] font-display font-semibold tracking-wide text-ink-2 transition hover:border-primary/40 hover:text-primary active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
            HACER ADMIN
          </button>
        </div>
      ) : (
        <RoleNote icon={<Lock size={12} />}>
          {user.is_admin
            ? "El rol de administrador se gestiona fuera del panel."
            : "Solo el administrador puede cambiar roles."}
        </RoleNote>
      )}
    </article>
  );
}
