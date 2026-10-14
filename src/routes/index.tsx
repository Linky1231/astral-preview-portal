import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Avatar } from "@/components/social/Avatar";
import { Component, useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Earth, Search, LogOut, Plus, ShieldCheck, User, Sparkles, Menu, MessageCircle, Bell, X, Home, Users, Flame, MessageSquare, Compass, Store, Trophy, BarChart3, ChevronRight, ArrowLeft, ArrowRight, Megaphone, FileText, TrendingUp, Info, Settings2, HardDriveDownload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchFeed, fetchGames, fetchFollowing, getMyProfile, isMod, isAdmin, type PostWithMeta, type Profile } from "@/lib/social/api";
import { rankFeedWithOrion } from "@/lib/ai/community-orion";
import { syncAllProjects } from "@/lib/engine/cloud-sync";
import { PostComposer } from "@/components/social/PostComposer";
import { PostCard } from "@/components/social/PostCard";
import { GamesHome, type GamesView } from "@/components/social/GamesHome";
import { NotificationBell } from "@/components/social/NotificationBell";
import { ProfilePanel } from "@/components/social/ProfilePanel";
import { NotificationsPanel } from "@/components/social/NotificationsPanel";
import ChatSection from "@/components/social/ChatSection";
import { ForumSection } from "@/components/social/ForumSection";
import { StoreSection } from "@/components/social/StoreSection";
import { EventsSection } from "@/components/social/EventsSection";
import { GamePageSection } from "@/components/social/GamePageSection";
import { isTabLoading, shouldFetchPrimaryTab } from "@/lib/social/tab-switch";
import { MENU_SECTIONS, menuSectionById, visibleMenuEntries, type MenuActionId, type MenuEntry, type MenuSectionId } from "@/lib/social/menu-sections";
import { menuEntryCardClass, menuEntryCtaClass, menuEntryIconClass } from "@/lib/social/menu-presentation";
import { UserName } from "@/components/social/UserName";
import { PlusIcon } from "@/components/social/PlusIcon";
import { BackButton } from "@/components/ui/back-button";
import { filterStateClass } from "@/lib/ui/filter-control";
import { CreateGameDialog } from "@/components/engine/CreateGameDialog";
import { DraftsDialog } from "@/components/engine/DraftsDialog";
import { StorageDialog } from "@/components/engine/StorageDialog";
import { SettingsDialog } from "@/components/settings/SettingsPanel";
import { SignInSide } from "@/components/auth/SignInSide";
import { AsternalLogo } from "@/components/brand/AsternalLogo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Asternal — Juegos y Comunidad" },
      { name: "description", content: "Descubre y juega creaciones hechas con Asternal. Crea las tuyas y publícalas al instante." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  component: HomePage,
});

type Tab = "games" | "feed" | "gallery" | "profile";
type FeedSub = "forYou" | "following" | "explore";

/**
 * Posición de la píldora del menú inferior, en celdas de 1/5 (100 % = una
 * celda). La celda central es «Crear» y no participa, por eso Tienda salta a la
 * cuarta celda. Estaba escrito como una cadena de ternarios con un `else`
 * implícito que colocaba la píldora bajo Perfil para cualquier pestaña nueva.
 */
const NAV_PILL_OFFSET: Record<Tab, number> = {
  games: 0,
  feed: 100,
  gallery: 300,
  profile: 400,
};
/**
 * Aisla el chat: si algo falla dentro de él (error inesperado de render o
 * efecto), solo se cierra el chat con un aviso en vez de tumbar toda la app
 * con la página de error de la ruta.
 */
class ChatBoundary extends Component<
  { onClose: () => void; onRetry: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="fixed inset-0 z-[90] bg-background/97 backdrop-blur-xl grid place-items-center p-6">
          <div className="text-center max-w-xs">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-destructive/10 grid place-items-center">
              <MessageCircle size={20} className="text-destructive" />
            </div>
            <p className="text-sm font-semibold mb-1">El chat tuvo un problema</p>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Cierra y vuelve a abrirlo. Si persiste, revisa la conexión de Supabase.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.props.onRetry}
                className="px-4 py-2 rounded-xl btn-grad text-xs font-display tracking-widest"
              >
                REINTENTAR
              </button>
              <button
                onClick={this.props.onClose}
                className="px-4 py-2 rounded-xl border border-line-strong bg-card text-foreground text-xs font-display tracking-widest hover:bg-muted/60 transition"
              >
                VOLVER
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * ¿Hay una sesión guardada en este dispositivo?
 *
 * Se mira en el almacenamiento (no en la red) para poder decidir la primera
 * pantalla antes de pintar nada: la sesión que guarda supabase-js
 * (`sb-<ref>-auth-token`, a veces troceada en `.0`, `.1`…) y el puente de
 * cuenta local (`_local_auth_session`) mientras no haya caducado.
 */
function hasStoredSession(): boolean {
  const bridge = localStorage.getItem("_local_auth_session");
  if (bridge) {
    try {
      const s = JSON.parse(bridge) as { userId?: string; expiresAt?: string };
      if (s.userId && s.expiresAt && new Date(s.expiresAt) > new Date()) return true;
    } catch { /* sesión ilegible: se ignora */ }
  }
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && /-auth-token(\.\d+)?$/.test(key)) return true;
  }
  return false;
}

/** Estado de sesión con el que arranca la portada, antes del primer pintado. */
function initialSessionState(): "in" | "out" {
  try {
    return hasStoredSession() ? "in" : "out";
  } catch {
    // Sin acceso al almacenamiento (SSR o modo privado): decide el efecto.
    return "in";
  }
}

function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [mod, setMod] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("games");
  const [homeSub, setHomeSub] = useState<GamesView>("inicio");
  const [feedSub, setFeedSub] = useState<FeedSub>("forYou");
  const [games, setGames] = useState<PostWithMeta[]>([]);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [loadingTab, setLoadingTab] = useState<Tab | null>("games");
  const loadedTabsRef = useRef<Set<Tab>>(new Set());
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialView, setChatInitialView] = useState<"group" | "dms" | "groups" | undefined>(undefined);
  const [chatRetryNonce, setChatRetryNonce] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatShareText, setChatShareText] = useState<string | null>(null);
  const [chatShareView, setChatShareView] = useState<"group" | "dms" | "groups" | undefined>(undefined);
  const [eventsOpen, setEventsOpen] = useState(false);
  // El menú de tres líneas abre una sección a la vez: `null` es su pantalla
  // inicial (la lista de secciones) y cualquier id es la pantalla de esa
  // sección, que se cierra con «Volver» sin cerrar el propio menú.
  const [menuSection, setMenuSection] = useState<MenuSectionId | null>(null);
  const [gamePageId, setGamePageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Estado de sesión. Sin sesión guardada la portada es la pantalla de acceso
  // desde el primer frame; con sesión guardada se pinta el panel y la
  // comprobación real (asíncrona) decide si sigue siendo válida.
  const [sessionState, setSessionState] = useState<"in" | "out">(initialSessionState);

  // El menú desplaza solo sus opciones, nunca la página que queda detrás.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setMenuSection(null);
    };
    window.addEventListener("keydown", dismiss);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", dismiss);
    };
  }, [menuOpen]);

  // Abrir el chat con un mensaje compartido (botón «Compartir en el chat» del perfil).
  useEffect(() => {
    try {
      const t = sessionStorage.getItem("asternal_chat_share");
      if (t) {
        sessionStorage.removeItem("asternal_chat_share");
        setChatShareText(t);
        setChatOpen(true);
      }
    } catch { /* noop */ }
    // También escuchar CustomEvents para compartir en tiempo real (sin depender de remount)
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (typeof d === "string") {
        setChatShareText(d);
        setChatOpen(true);
      } else if (d && typeof d === "object") {
        setChatShareText(d.text ?? null);
        setChatShareView(d.view ?? undefined);
        setChatOpen(true);
      }
    };
    window.addEventListener("asternal_share_chat", handler);
    return () => window.removeEventListener("asternal_share_chat", handler);
  }, []);

  // Al cambiar de apartado del encabezado (INICIO/PUBLICACIONES/TIENDA/PERFIL)
  // la página vuelve al inicio: si estabas scrolleado abajo, la nueva sección
  // empezaba desde esa posición y no se veían su cabecera ni su indicador de
  // carga. Al reiniciar el scroll siempre se muestra desde arriba.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const reload = useCallback(async (which: Tab) => {
    if (which !== "games" && which !== "feed") return;
    setLoadingTab(which);
    try {
      if (which === "games") {
        setGames(await fetchGames({ search: search || undefined }));
        // Inicio muestra las 4 últimas publicaciones del feed: se cargan aquí
        // (una sola vez) para que se vean sin tener que abrir Publicaciones.
        if (!loadedTabsRef.current.has("feed")) {
          try { setPosts(await fetchFeed({ search: search || undefined })); } catch { /* noop */ }
        }
      } else {
        const feed = await fetchFeed({ search: search || undefined });
        setPosts(await rankFeedWithOrion(feed, followingIds));
      }
      loadedTabsRef.current.add(which);
      getMyProfile().then(p => p && setMe(p)).catch(() => {/* ignore */});
    } finally {
      setLoadingTab(current => current === which ? null : current);
    }
  }, [search, followingIds]);

  // Callback estable para PostCard (memoizado): no cambia de identidad en cada
  // render, así abrir un menú en una tarjeta no fuerza a re-renderizar el resto.
  const onFeedChange = useCallback(() => reload("feed"), [reload]);

  useEffect(() => {
    (async () => {
      try {
        let session = null;
        try {
          const res = await supabase.auth.getSession();
          session = res.data?.session ?? null;
        } catch {
          /* Credenciales de Supabase rotas/inaccesibles → se intenta la cuenta local */
        }
        let uid: string | null = session?.user?.id ?? null;
        let localSession = false;
        if (!uid) {
          // Puente: cuenta local creada antes de conectar Supabase (o credenciales
          // inválidas). La app sigue funcionando en modo local en lugar de
          // redirigir en bucle a /auth.
          try {
            const raw = localStorage.getItem("_local_auth_session");
            if (raw) {
              const s = JSON.parse(raw) as { userId?: string; expiresAt?: string };
              if (s.userId && s.expiresAt && new Date(s.expiresAt) > new Date()) {
                uid = s.userId;
                localSession = true;
              }
            }
          } catch { /* noop */ }
        }
        if (!uid) { setSessionState("out"); return; }
        // Sesión válida: si la portada había arrancado en la pantalla de acceso
        // (p. ej. la sesión se guarda con otro formato), se pasa al panel.
        setSessionState("in");
        setMyId(uid);
        void fetchFollowing(uid)
          .then(profiles => setFollowingIds(profiles.map(profile => profile.id)))
          .catch(() => setFollowingIds([]));
        // Estado de la nube: conectada (claves reales + cuenta real), cuenta
        // local con Supabase conectado, o modo local puro (todo en el navegador).
        // Sincroniza los proyectos con la nube (sube los locales sin respaldo y
        // descarga los de la cuenta) para que los juegos aparezcan en cualquier
        // dispositivo con la misma cuenta. Silencioso: no bloquea la carga.
        if (!localSession) {
          syncAllProjects().then(r => {
            if (r.pushed > 0 || r.imported > 0) {
              toast.success(
                `Nube sincronizada: ${r.pushed} subido${r.pushed === 1 ? "" : "s"} · ${r.imported} descargado${r.imported === 1 ? "" : "s"}`
              );
            }
          }).catch(() => {/* noop */});
        }
        let prof: Profile | null = null;
        try { prof = await getMyProfile(); } catch { /* noop */ }
        if (!prof && localSession) {
          // El perfil de la cuenta local vive en localStorage.
          try {
            const rows = JSON.parse(localStorage.getItem("_local_data_profiles") || "[]") as Profile[];
            prof = rows.find((p) => p.id === uid) ?? null;
          } catch { /* noop */ }
        }
        if (prof) setMe(prof);
        try { setMod(await isMod()); } catch { /* noop */ }
        try { setAdmin(await isAdmin()); } catch { /* noop */ }
        // Las listas se cargan desde el efecto dependiente de `myId`, después de
        // que React haya confirmado el identificador de sesión.
      } catch (e) {
        // No romper la preview si el esquema aún no está creado en Supabase.
        console.warn("[home] error de carga inicial (¿esquema sin crear?):", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (myId && shouldFetchPrimaryTab(tab, loadedTabsRef.current)) {
      void reload(tab);
    }
  }, [tab, reload, myId]);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch { /* sin conexión: la sesión se cierra igualmente en el dispositivo */ }
    // Puente de cuenta local: si no se limpia, tras cerrar sesión la portada
    // sigue encontrando sesión y nunca vuelve a la pantalla de acceso.
    try { localStorage.removeItem("_local_auth_session"); } catch { /* noop */ }
    // Recarga limpia: vuelve a la pantalla de acceso (la portada sin sesión).
    window.location.replace("/");
  };
  /** Cierra el menú y vuelve a su pantalla inicial. */
  const closeMenu = () => { setMenuOpen(false); setNotifOpen(false); setMenuSection(null); };
  /** Cierra solo el panel lateral: la opción elegida decide qué se abre. */
  const closeDrawer = () => { setMenuOpen(false); setMenuSection(null); };
  const openMenu = () => { setMenuSection(null); setMenuOpen(true); };
  const runMenuAction = (action: MenuActionId) => {
    if (action === "chats") setChatOpen(true);
    else if (action === "notifications") setNotifOpen(true);
    else if (action === "events") setEventsOpen(true);
    else if (action === "drafts") setDraftsOpen(true);
    else if (action === "storage") setStorageOpen(true);
    else if (action === "settings") setSettingsOpen(true);
  };

  // Sin sesión, la portada es la pantalla de acceso (plantilla sign-in-side).
  if (sessionState === "out") {
    return <SignInSide onSignedIn={() => window.location.assign("/")} />;
  }

  return (
    <div className="min-h-dvh w-full flex flex-col bg-canvas text-foreground">
      {/* Header */}
      {/* Material de vidrio contenido: blur moderado para mantener el scroll fluido. */}
      <header className="app-header glass-header sticky top-0 z-20 border-b">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5">
          <BackButton
            showLabel={false}
            variant="solid"
            hideWithoutHistory
            className="glass-control w-9 h-9 sm:w-10 sm:h-10 justify-center shrink-0"
            label="Volver"
          />
          <button onClick={() => navigate({ to: "/profile" })} title="Mi perfil"
            className="glass-control w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden active:scale-95 shrink-0">
            <Avatar p={me} className="w-full h-full" />
          </button>
          <div className="flex-1 min-w-0 header-name pt-0.5">
            {/* Marca integrada: la «A» del logo abre la palabra y el nombre sigue
                con «sternal», así que el título dice «Asternal» con una sola A. */}
            <AsternalLogo size={16} className="max-w-full" />
            <div className="text-[10px] sm:text-[11px] text-ink-3 truncate mt-1">@{me?.username ?? "…"}</div>
          </div>
          {typeof me?.orbes === "number" && me?.show_orbes !== false && (
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/orbes" })}
              aria-label={`Ver mis orbes: ${me.orbes}`}
              title={`${me.orbes} orbes`}
              className="h-8 sm:h-9 rounded-full px-3 text-accent-foreground shrink-0 select-none"
            >
              <Sparkles size={12} className="text-accent-foreground shrink-0" fill="currentColor" />
              <span className="text-[11px] sm:text-xs font-display font-semibold tabular-nums">{me.orbes}</span>
            </Button>
          )}
          <Button onClick={openMenu} title="Menú" aria-label="Menú" variant="outline" size="icon"
            className="h-10 w-10 rounded-full text-ink-2 shrink-0">
            <Menu size={16} />
          </Button>
        </div>

      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full px-3 py-3 space-y-3 pb-24">
        {/* El contenido anterior se desmonta al instante: `mode="wait"` hacía que
            varios toques consecutivos se encolaran detrás de la salida anterior. */}
        <motion.div
          key={tab}
          initial={{ opacity: 0.92 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="space-y-3"
        >
            {tab === "games" ? (
              <div className="space-y-3">
                {/* Buscador de Inicio: es un botón, no un campo — al tocarlo
                    lleva a la sección Buscar con toda la búsqueda de la app. */}
                <HomeSearchBar onOpen={() => navigate({ to: "/search" })} />
                <HomeSubTabs value={homeSub} onChange={setHomeSub} />
                {isTabLoading("games", loadingTab) ? <SkeletonList /> : (
                  <>
                    <GamesHome
                      view={homeSub}
                      games={games}
                      myId={myId}
                      isMod={mod}
                      onChange={() => reload("games")}
                      onOpenGame={(id) => setGamePageId(id)}
                    />
                    {homeSub === "inicio" && (
                      <HomePostsPreview
                        posts={posts}
                        myId={myId}
                        isMod={mod}
                        onChange={onFeedChange}
                        onOpenGame={(id) => setGamePageId(id)}
                        onSeeAll={() => setTab("feed")}
                      />
                    )}
                  </>
                )}
              </div>
            ) : tab === "feed" ? (
              <div className="max-w-2xl md:max-w-3xl mx-auto w-full">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <PostComposer onCreated={() => reload("feed")} />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: 0.05, ease: "easeOut" }}
                >
                  <FeedSubTabs value={feedSub} onChange={setFeedSub} />
                </motion.div>
                <motion.div
                  key={feedSub}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                >
                  {isTabLoading("feed", loadingTab) ? <SkeletonList /> : (() => {
                    const filtered = filterFeed(posts, feedSub, myId, followingIds);
                    if (filtered.length === 0) {
                      return (
                        <div className="text-center text-xs text-muted-foreground py-10 space-y-2">
                          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/10 border border-primary/20 grid place-items-center mb-2">
                            {feedSub === "forYou" ? <Compass size={24} className="text-primary" /> : feedSub === "following" ? <Users size={24} className="text-primary" /> : <Flame size={24} className="text-primary" />}
                          </div>
                          <div className="font-medium text-foreground/70">
                            {feedSub === "forYou"
                              ? "Tu feed personalizado"
                              : feedSub === "following"
                              ? "Contenido de tus seguidos"
                              : "Descubre contenido nuevo"}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60 max-w-[260px] mx-auto">
                            {feedSub === "forYou"
                              ? "Publica, sigue creadores y guarda lo que te guste para construir tu feed."
                              : feedSub === "following"
                              ? "Sigue a desarrolladores para ver sus actualizaciones aquí."
                              : "Explora proyectos, tutoriales y publicaciones destacadas de la comunidad."}
                          </div>
                        </div>
                      );
                    }

                    // Explorar también conserva el resultado completo: Orión solo
                    // decide la posición. No hay cortes por categoría ni límites
                    // que puedan hacer desaparecer publicaciones de la vista.
                    if (feedSub === "explore") {
                      return (
                        <div>
                          <h3 className="text-xs font-display font-bold tracking-wider text-primary/80 uppercase mb-1 flex items-center gap-2">
                            <TrendingUp size={13} /> Recomendado por Orión
                          </h3>
                          <p className="text-[11px] text-muted-foreground mb-3">Todas las publicaciones aparecen aquí; Orión únicamente ajusta su orden.</p>
                          <div className="space-y-3">
                            {filtered.map((p, i) => (
                              <div key={p.id} className="card-enter" style={{ animationDelay: `${Math.min(i * 25, 180)}ms` }}>
                                <PostCard post={p} myId={myId} isMod={mod} onChange={onFeedChange} onOpenGame={(id) => setGamePageId(id)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return filtered.map((p, i) => (
                      <div key={p.id} className="card-enter mb-3 last:mb-0" style={{ animationDelay: `${Math.min(i * 25, 180)}ms` }}>
                        <PostCard post={p} myId={myId} isMod={mod} onChange={onFeedChange} onOpenGame={(id) => setGamePageId(id)} />
                      </div>
                    ));
                  })()}
                </motion.div>
              </div>
            ) : tab === "gallery" ? (
              <StoreSection myId={myId} isMod={mod} />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                {myId && (
                  <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full">
                    <ProfilePanel userId={myId} myId={myId} isMod={mod} viewingOwn={true} onProfileChange={setMe} />
                  </div>
                )}
              </motion.div>
            )}
        </motion.div>
      </main>



      {/* Menu drawer — dos AnimatePresence separados (el fragment <> no desmonta en exit) */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu-overlay"
            className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu-drawer"
            onClick={e => e.stopPropagation()}
            className="menu-drawer fixed right-0 top-0 z-[101] h-dvh w-[86vw] max-w-xs glass-menu-drawer border-l px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menú principal"
            initial={{ x: "100%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "tween", duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex flex-1 min-h-0 flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="section-label">MENÚ</div>
                <button onClick={closeMenu} aria-label="Cerrar menú"
                  className="w-8 h-8 rounded-lg border border-line-strong bg-card text-ink-2 grid place-items-center hover:bg-muted/60 hover:text-foreground active:scale-95 transition">
                  <X size={14}/>
                </button>
              </div>
              {/* Acceso directo al perfil: al tocar la foto sales del menú y vas a tu perfil */}
              <button
                onClick={() => { closeMenu(); navigate({ to: "/profile" }); }}
                className="flex items-center gap-3 p-2.5 rounded-2xl border border-line-strong bg-card hover:border-primary/25 hover:bg-muted/60 active:scale-[0.98] transition mb-2 text-left group shrink-0"
              >
                <Avatar p={me} size={40} className="ring-2 ring-primary/15" />
                <div className="min-w-0 flex-1">
                  <UserName p={me} size="sm" className="group-hover:text-primary transition-colors" />
                  <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">@{me?.username ?? "…"} · Ver perfil</div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/50 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
              {/* Cada sección es una sola opción: al elegirla se abre su propia
                  pantalla independiente (ver más abajo), no una lista dentro
                  del panel lateral. */}
              <div className="menu-section-list flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {MENU_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setMenuSection(section.id)}
                    aria-haspopup="dialog"
                    className="menu-action w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left group"
                  >
                    <span className="text-primary/80 shrink-0">{MENU_SECTION_ICONS[section.id]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{section.label}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{section.hint}</span>
                    </span>
                    <ChevronRight size={16} className="text-muted-foreground/50 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
              {/* Configuración vive dentro de la sección Ajustes, en lugar del
                  botón flotante que antes se superponía a la pantalla de Inicio. */}
              {/* El aire de arriba va en el envoltorio: puesto como `padding-top`
                  dentro del botón, empujaba el texto hacia abajo y «Cerrar
                  sesión» quedaba descentrado respecto a su marco. */}
              <div className="shrink-0 pt-3">
                <button onClick={() => { logout(); closeMenu(); }}
                  className="w-full flex items-center gap-3 px-3 h-11 rounded-xl border border-destructive/15 bg-destructive/5 text-destructive hover:bg-destructive/10 active:scale-[0.98] transition">
                  <LogOut size={16} /> <span className="text-sm font-medium">Cerrar sesión</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pantalla independiente de la sección del menú.
          Se abre a pantalla completa por encima del panel lateral, que sigue
          abierto detrás: «Volver» regresa a la pantalla inicial del menú sin
          cerrar las tres rayas. */}
      <AnimatePresence>
        {menuSection && (
          <motion.div
            key={`menu-section-${menuSection}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[102] bg-background flex flex-col"
            style={{ height: "100dvh" }}
            role="dialog"
            aria-modal="true"
            aria-label={`${menuSectionById(menuSection).label} · menú`}
          >
            <header className="shrink-0 border-b border-border/60 bg-background">
              <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto flex items-center gap-2.5 px-3 py-2.5">
                <button onClick={() => setMenuSection(null)} aria-label="Volver al menú"
                  className="glass-control w-9 h-9 rounded-lg text-ink-2 grid place-items-center hover:text-foreground active:scale-95 shrink-0">
                  <ArrowLeft size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-sm font-semibold text-foreground truncate">{menuSectionById(menuSection).label}</div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{menuSectionById(menuSection).hint}</div>
                </div>
                <button onClick={closeMenu} aria-label="Cerrar menú"
                  className="glass-control w-9 h-9 rounded-lg text-ink-2 grid place-items-center hover:text-foreground active:scale-95 shrink-0">
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full px-3 py-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {visibleMenuEntries(menuSectionById(menuSection), mod || admin).map((entry) => (
                    <MenuOptionCard
                      key={entry.id}
                      entry={entry}
                      icon={MENU_ENTRY_ICONS[entry.id]}
                      onNavigate={closeDrawer}
                      onAction={(action) => { runMenuAction(action); closeDrawer(); }}
                    />
                  ))}
                </div>
                <button onClick={() => setMenuSection(null)}
                  className="mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-line-strong bg-card text-[13px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition">
                  <ArrowLeft size={15} /> Volver al menú
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen chat */}
      {chatOpen && (
        <ChatBoundary
          onClose={() => setChatOpen(false)}
          onRetry={() => setChatRetryNonce((n) => n + 1)}
        >
          <ChatSection
            key={chatRetryNonce}
            myId={myId}
            onClose={() => { setChatOpen(false); setChatShareText(null); setChatShareView(undefined); }}
            initialText={chatShareText ?? undefined}
            initialView={chatShareView}
          />
        </ChatBoundary>
      )}

      {/* Full-screen panel de notificaciones */}
      {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}

      {/* Full-screen panel de Eventos */}
      <AnimatePresence>
        {eventsOpen && (
          <motion.div
            key="events-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[90] bg-background flex flex-col"
            style={{ height: "100dvh" }}
          >
            <header className="shrink-0 border-b border-border/60 bg-background">
              <div className="max-w-2xl md:max-w-3xl mx-auto flex items-center gap-2.5 px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary grid place-items-center shrink-0">
                  <Trophy size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-display font-semibold text-foreground">Eventos</h2>
                  <p className="text-xs text-muted-foreground">Participa en concursos y gana premios</p>
                </div>
                <button
                  onClick={() => setEventsOpen(false)}
                  className="w-9 h-9 rounded-xl border border-border/70 bg-background grid place-items-center active:scale-95 transition shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="max-w-2xl md:max-w-3xl mx-auto px-4 py-4">
                <EventsSection isAdmin={admin} showHeader={false} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen game page */}
      {gamePageId && (
        <GamePageSection
          gameId={gamePageId}
          myId={myId}
          isMod={mod}
          onClose={() => setGamePageId(null)}
        />
      )}

      {/* Configuración (tema e idioma) desde el menú de tres líneas */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Creación compacta: elegir motor sin salir de la pantalla */}
      <CreateGameDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DraftsDialog
        open={draftsOpen}
        onOpenChange={setDraftsOpen}
        onCreate={() => setCreateOpen(true)}
      />

      {/* Espacio extra: copia de los juegos en Firebase o en el Drive de la persona */}
      <StorageDialog open={storageOpen} onOpenChange={setStorageOpen} />

      {/* Bottom Navigation */}
      {/* Navegación de cristal con una acción de creación en azul de marca. */}
      <nav className="home-bottom-nav fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line" aria-label="Navegación principal">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-3 py-1">
          {/* Tabs with gray selector — Inicio | Publicaciones | +Crear | Tienda | Perfil */}
          <div className="grid grid-cols-5 rounded-full p-0.5 relative">
            {/* Single sliding pill — GPU-composited transform, no layout reflow */}
            {/* `left-0.5` (2 px) coincide con el `p-0.5` de la rejilla: sin él la
                píldora quedaba desplazada 2 px a la izquierda de su celda. El
                fondo es el token `bg-card` y no blanco fijo: en modo oscuro la
                etiqueta activa es clara y sobre blanco no se leía. */}
            <div
              className="pointer-events-none absolute left-0.5 top-0.5 bottom-0.5 w-[calc((100%-4px)/5)] rounded-full bg-secondary will-change-transform transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(${NAV_PILL_OFFSET[tab]}%)` }}
            />

            {/* Inicio (catálogo + publicaciones) */}
            <button
              onClick={() => setTab("games")}
              aria-current={tab === "games" ? "page" : undefined}
              className={`relative z-10 flex flex-col items-center justify-center gap-0.5 min-h-14 rounded-full transition-colors duration-200 motion-reduce:transition-none ${tab === "games" ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Home size={18} />
              <span className="text-[10px] font-medium tracking-wide">Inicio</span>
            </button>
            {/* Publicaciones (feed) */}
            <button
              onClick={() => setTab("feed")}
              aria-current={tab === "feed" ? "page" : undefined}
              className={`relative z-10 flex flex-col items-center justify-center gap-0.5 min-h-14 rounded-full transition-colors duration-200 motion-reduce:transition-none ${tab === "feed" ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Earth size={18} />
              <span className="text-[10px] font-medium tracking-wide">Publicaciones</span>
            </button>

            {/* Center CREAR button: abre la interfaz compacta de creación */}
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-haspopup="dialog"
              variant="ghost"
              aria-label="Crear"
              className="relative z-10 h-auto min-w-0 flex flex-col items-center justify-center gap-1 min-h-14 p-0 rounded-full text-primary hover:text-primary hover:opacity-90 active:scale-[0.97] transition-transform motion-reduce:transition-none"
            >
              <div className="w-9 h-9 rounded-xl btn-grad flex items-center justify-center">
                <Plus size={19} strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-medium tracking-wide">Crear</span>
            </Button>

            {/* Tienda (obras de artistas) */}
            <button
              onClick={() => setTab("gallery")}
              aria-current={tab === "gallery" ? "page" : undefined}
              className={`relative z-10 flex flex-col items-center justify-center gap-0.5 min-h-14 rounded-full transition-colors duration-200 motion-reduce:transition-none ${tab === "gallery" ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Store size={18} />
              <span className="text-[10px] font-medium tracking-wide">Tienda</span>
            </button>
            {/* Perfil */}
            <button
              onClick={() => setTab("profile")}
              aria-current={tab === "profile" ? "page" : undefined}
              className={`relative z-10 flex flex-col items-center justify-center gap-0.5 min-h-14 rounded-full transition-colors duration-200 motion-reduce:transition-none ${tab === "profile" ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <User size={18} />
              <span className="text-[10px] font-medium tracking-wide">Perfil</span>
            </button>
          </div>
        </div>
      </nav>

    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-lg border border-border/70 bg-surface overflow-hidden animate-pulse">
          <div className="aspect-[16/10] bg-muted/40" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-1/2 bg-muted/50 rounded" />
            <div className="h-2.5 w-1/3 bg-muted/40 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Tarjeta de una opción del menú dentro de la pantalla de su sección.
 *
 * Muestra el icono, la descripción de lo que hace la opción y un botón para
 * entrar. El estilo (destacado, aviso o neutro) se decide por la función de la
 * opción con `menu-presentation`, no por su posición en la lista.
 */
function MenuOptionCard({ entry, icon, onNavigate, onAction }: {
  entry: MenuEntry;
  icon: React.ReactNode;
  onNavigate: () => void;
  onAction: (action: MenuActionId) => void;
}) {
  const ctaClass = `w-full h-9 rounded-xl text-[11px] font-display font-semibold tracking-wide inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition ${menuEntryCtaClass()}`;
  const ctaLabel = (<>{entry.cta} <ArrowRight size={13} /></>);

  return (
    <article className={`flex flex-col gap-3 rounded-2xl border p-4 ${menuEntryCardClass(entry)}`}>
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl border grid place-items-center shrink-0 ${menuEntryIconClass(entry)}`} aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[13px] font-semibold truncate">{entry.label}</h3>
            {entry.restricted && (
              <span className="text-[9px] font-display font-bold tracking-wider px-1.5 py-0.5 rounded bg-destructive/10 text-destructive shrink-0">RESTRINGIDO</span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{entry.description}</p>
        </div>
      </div>
      {entry.to ? (
        <Link to={entry.to} onClick={onNavigate} className={ctaClass}>{ctaLabel}</Link>
      ) : (
        <button type="button" onClick={() => entry.action && onAction(entry.action)} className={ctaClass}>{ctaLabel}</button>
      )}
    </article>
  );
}

/** Icono de cada opción. El color lo pone la tarjeta, no el propio icono. */
const MENU_ENTRY_ICONS: Record<string, React.ReactNode> = {
  chats: <MessageCircle size={18} />,
  search: <Search size={18} />,
  notifications: <Bell size={18} />,
  events: <Trophy size={18} />,
  history: <BarChart3 size={18} />,
  orbes: <Megaphone size={18} />,
  about: <Info size={18} />,
  moderation: <ShieldCheck size={18} />,
  drafts: <FileText size={18} />,
  storage: <HardDriveDownload size={18} />,
  plus: <PlusIcon size={18} />,
  settings: <Settings2 size={18} />,
};

/** Icono de cada sección en la pantalla inicial del menú. */
const MENU_SECTION_ICONS: Record<MenuSectionId, React.ReactNode> = {
  social: <Users size={18} />,
  comunidad: <Compass size={18} />,
  creacion: <Sparkles size={18} />,
  ajustes: <Settings2 size={18} />,
};

// Barra de pestañas de publicaciones reconstruida desde cero: botones estáticos
// con estado activo por clases condicionales. SIN píldora deslizante, sin refs,
// sin medición de layout, sin listeners de scroll y sin framer-motion: nada que
// pueda desalinearse, saltar o dar lag. Los botones se reparten el ancho con
// flex-1 y nunca desbordan la fila, así el bug de "la píldora se va al otro
// extremo" es imposible por construcción.
function FeedSubTabs({ value, onChange }: { value: FeedSub; onChange: (v: FeedSub) => void }) {
  const items: { id: FeedSub; label: string; icon: React.ReactNode }[] = [
    { id: "forYou", label: "Para ti", icon: <Compass size={13} /> },
    { id: "following", label: "Seguidos", icon: <Users size={13} /> },
    { id: "explore", label: "Explorar", icon: <Flame size={13} /> },
  ];
  return (
    <div className="flex gap-1.5 pt-1 pb-2">
      {items.map((it) => {
        const active = value === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-pressed={active}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap border transition-colors duration-200 outline-none focus:outline-none active:scale-[0.97] ${filterStateClass(active)}`}
          >
            {it.icon} {it.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// Buscador de Inicio. Deliberadamente NO es un campo de texto: al tocarlo
// navega a /search, donde vive la búsqueda completa (filtros por usuarios,
// juegos, publicaciones y tienda). Así se evita duplicar dos buscadores.
function HomeSearchBar({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Ir a la sección Buscar"
      className="w-full h-11 flex items-center gap-2.5 px-3.5 rounded-xl border border-line-strong bg-card text-left hover:border-primary/30 active:scale-[0.99] transition"
    >
      <Search size={15} className="text-primary/70 shrink-0" />
      <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground/70">
        Buscar juegos, publicaciones, personas…
      </span>
    </button>
  );
}

// Sub-secciones de Inicio: la vista normal, el ranking, los nuevos y explorar.
// Igual que las pestañas de Publicaciones: botones estáticos con el activo por
// clases condicionales (sin píldora deslizante ni medición de layout).
function HomeSubTabs({ value, onChange }: { value: GamesView; onChange: (v: GamesView) => void }) {
  const items: { id: GamesView; label: string; icon: React.ReactNode }[] = [
    { id: "inicio", label: "Inicio", icon: <Home size={13} /> },
    { id: "ranking", label: "Ranking", icon: <Trophy size={13} /> },
    { id: "nuevos", label: "Nuevos", icon: <Sparkles size={13} /> },
    { id: "explorar", label: "Explorar", icon: <Compass size={13} /> },
  ];
  return (
    <div className="flex gap-1.5">
      {items.map((it) => {
        const active = value === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-pressed={active}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[10px] sm:text-[11px] font-display font-semibold tracking-wide whitespace-nowrap border transition-colors duration-200 outline-none focus:outline-none active:scale-[0.97] ${filterStateClass(active)}`}
          >
            {it.icon} {it.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// Vista previa del feed en Inicio: las 4 publicaciones más recientes. El único
// acceso a la pestaña Publicaciones es «VER TODAS» de la cabecera (antes había
// además un botón al pie que repetía la misma acción).
function HomePostsPreview({ posts, myId, isMod, onChange, onOpenGame, onSeeAll }: {
  posts: PostWithMeta[]; myId: string | null; isMod: boolean;
  onChange: () => void; onOpenGame?: (gameId: string) => void; onSeeAll: () => void;
}) {
  const latest = posts.slice(0, 4);
  return (
    <section className="space-y-2.5 pt-1">
      <div className="flex items-center gap-2 px-1">
        <MessageSquare size={16} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-base leading-tight">Publicaciones</div>
          <div className="text-[11px] text-muted-foreground">Lo último de la comunidad</div>
        </div>
        <button
          onClick={onSeeAll}
          className="shrink-0 inline-flex min-h-11 items-center gap-1 text-[11px] font-display font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          VER TODAS <ChevronRight size={13} />
        </button>
      </div>
      {latest.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-[11px] text-muted-foreground">
          Aún no hay publicaciones. Sé la primera persona en compartir algo.
        </div>
      ) : (
        <div className="space-y-3">
          {latest.map(p => (
            <PostCard
              key={p.id}
              post={p}
              myId={myId}
              isMod={isMod}
              onChange={onChange}
              onOpenGame={onOpenGame}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function filterFeed(posts: PostWithMeta[], sub: FeedSub, myId: string | null, followingIds: string[]): PostWithMeta[] {
  if (sub === "following") {
    if (!myId) return [];
    const following = new Set(followingIds);
    return posts.filter(post => following.has(post.author_id));
  }
  // «Para ti» y «Explorar» conservan el orden semántico que entregó Orión.
  // Los conteos de reacciones no participan en esta decisión.
  return posts;
}
