import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Settings, Layers, Copy, X, Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Trash2, Plus, Upload, Home, MousePointer2, Boxes, Square, Flower2, Triangle, Target, PersonStanding, Eraser, SlidersHorizontal, PanelsTopLeft, Image as ImageIcon, Layers3, Play, LibraryBig, Save, Gem, Pencil } from "lucide-react";
import { schedulePushToCloud, scheduleAssetLibraryPush, pullAssetLibraryFromCloud, activateCloudProjectIfBlank } from "@/lib/engine/cloud-sync";
import { supabase } from "@/integrations/supabase/client";
import { Link, useRouter } from "@tanstack/react-router";
import { PublishGameDialog } from "./PublishGameDialog";
import type { EntityKind, Project, SpriteAsset, Entity, Scene, Hitbox, SceneLayer } from "@/lib/engine/core";
import { placedEntitySize } from "@/lib/engine/sprite-placement";
import { applyEditedDrawing } from "@/lib/engine/sprite-edit";
import {
  newScene, uid, ensureSceneLayers, DEFAULT_LAYER_ID, duplicateEntityInScene, isPlayerEntity,
  addSceneLayer, removeSceneLayer,
  attachEntityToParent, canAttachAsChild, childrenOf, createChildFromPreset,
  detachEntityFromParent, entityById, hierarchyDepth, removeEntityWithChildren, setEntityPosition,
} from "@/lib/engine/core";
import { loadProject, loadProjectById, saveProjectById, getCurrentProjectId, setCurrentProjectId } from "@/lib/engine/storage";
import { useFormFactor } from "@/hooks/use-mobile";
import { fileToDataURL, imageSize } from "@/lib/engine/images";
import { SceneEditor } from "./SceneEditor";
import { GameRuntime } from "./GameRuntime";
import { AnimationEditor } from "./AnimationEditor";
import { PaintEditor } from "./PaintEditor";
import { UIEditor } from "./UIEditor";
import { ProjectManager } from "./ProjectManager";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { ScriptEditor } from "./ScriptEditor";
import { useT, setLang } from "@/lib/i18n";
import { setNavGuard } from "@/lib/nav-guard";



/** Salida pendiente de confirmar (incluye la del botón global «Volver»). */
type ExitRequest = { kind: "manager" | "home" | "back"; proceed?: () => void };

type Tool = EntityKind | "select" | "erase";
type Tab = "build" | "inspect" | "ui" | "scenes" | "textures" | "settings";

const TOOL_LIST: { id: Tool; tKey: string; icon: ReactNode }[] = [
  { id: "select", tKey: "tool.select", icon: <MousePointer2 size={15} strokeWidth={1.9} /> },
  { id: "platform", tKey: "tool.platform", icon: <Square size={15} strokeWidth={1.9} /> },
  { id: "decor", tKey: "tool.decor", icon: <Flower2 size={15} strokeWidth={1.9} /> },
  { id: "coin", tKey: "tool.coin", icon: <Gem size={15} strokeWidth={1.9} /> },
  { id: "enemy", tKey: "tool.enemy", icon: <Triangle size={15} strokeWidth={1.9} /> },
  { id: "goal", tKey: "tool.goal", icon: <Target size={15} strokeWidth={1.9} /> },
  { id: "player", tKey: "tool.player", icon: <PersonStanding size={15} strokeWidth={1.9} /> },
  { id: "erase", tKey: "tool.erase", icon: <Eraser size={15} strokeWidth={1.9} /> },
];

// ---- Asset library (saved presets) ----
type LibraryItem = { id: string; name: string; preset: Omit<Entity, "id" | "x" | "y"> };
const LIBRARY_KEY = "asternal:library";
function loadLibrary(): LibraryItem[] {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]") as LibraryItem[]; } catch { return []; }
}
function saveLibrary(items: LibraryItem[]) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function AsternalEditor({ initialProjectId, beta = false }: {
  initialProjectId?: string;
  /** Motor propio abierto con las funciones nuevas en pruebas. */
  beta?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  // Guardado manual: solo se escribe cuando la persona lo pide.
  const lastSavedRef = useRef<Project | null>(null);
  const [dirty, setDirty] = useState(false);
  const [exitRequest, setExitRequest] = useState<ExitRequest | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [tab, setTab] = useState<Tab>("build");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>(() => loadLibrary());
  const updateLibrary = (items: LibraryItem[]) => {
    setLibrary(items);
    saveLibrary(items);
    // Respaldo en la nube (debounced) para que la biblioteca aparezca en
    // cualquier otro dispositivo con la misma cuenta.
    scheduleAssetLibraryPush(items);
  };

  const formFactor = useFormFactor();
  const isTablet = formFactor === "tablet" || formFactor === "desktop";

  useEffect(() => {
    setLang("es");
    const wanted = initialProjectId && loadProjectById(initialProjectId) ? initialProjectId : undefined;
    const id = wanted ?? getCurrentProjectId();
    setProjectId(id);
    setCurrentProjectId(id);
    const loaded = loadProjectById(id) ?? loadProject();
    if (loaded) {
      // migrate: ensure every scene has at least one layer
      loaded.scenes = loaded.scenes.map(s => ensureSceneLayers(s));
    }
    lastSavedRef.current = loaded;
    setDirty(false);
    setProject(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Biblioteca de objetos en la nube: al abrir el editor con una cuenta real se
  // sincroniza en ambos sentidos — importa la de la nube si este dispositivo no
  // tiene nada (o fusiona lo que falte) y respalda la local si aún no está
  // guardada. Así las imágenes/prefabs aparecen en cualquier dispositivo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const cloud = await pullAssetLibraryFromCloud();
        if (cancelled) return;
        const local = loadLibrary();
        if (cloud && cloud.length > 0) {
          if (local.length === 0) {
            // Este dispositivo aún no tenía nada: adopta la biblioteca de la cuenta.
            updateLibrary(cloud as LibraryItem[]);
          } else {
            // Fusiona sin pisar: conserva lo local y añade lo de la nube que falte.
            const ids = new Set(local.map(i => i.id));
            const merged = [...local, ...cloud.filter(c => !ids.has(c.id))];
            if (merged.length !== local.length) updateLibrary(merged as LibraryItem[]);
            else scheduleAssetLibraryPush(local);
          }
        } else if (local.length > 0) {
          // La cuenta no tenía biblioteca: respalda la local por primera vez.
          scheduleAssetLibraryPush(local);
        }
        // Dispositivo nuevo: si el proyecto actual es el "Untitled Game" vacío
        // que crea storage, activa el proyecto de la nube más reciente para que
        // el editor abra el juego real (con sus imágenes) en lugar de uno vacío.
        const activatedId = await activateCloudProjectIfBlank();
        if (cancelled) return;
        if (activatedId) {
          const p = loadProjectById(activatedId);
          if (p) {
            p.scenes = p.scenes.map(s => ensureSceneLayers(s));
            setProjectId(activatedId);
            lastSavedRef.current = p;
            setDirty(false);
            setProject(p);
            setSelectedId(null);
          }
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const openProject = (id: string) => {
    setCurrentProjectId(id);
    const p = loadProjectById(id);
    if (!p) return;
    setProjectId(id);
    lastSavedRef.current = p;
    setDirty(false);
    setProject(p);
    setSelectedId(null);
    setTab("build");
    setShowManager(false);
  };

  /** Guardado manual: escribe el proyecto en local y lo sube a la nube. */
  const saveNow = () => {
    if (!project || !projectId) return;
    saveProjectById(projectId, project);
    lastSavedRef.current = project;
    setDirty(false);
    setSavedAt(Date.now());
    schedulePushToCloud(projectId, project);
  };

  // Un proyecto está «sucio» cuando cambió respecto a la última copia guardada.
  useEffect(() => {
    if (!project || !projectId) return;
    setDirty(project !== lastSavedRef.current);
  }, [project, projectId]);

  // Aviso al cerrar la pestaña o la página con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const performExit = (request: ExitRequest) => {
    if (request.kind === "home") router.history.push("/");
    else if (request.kind === "manager") setShowManager(true);
    else request.proceed?.();
  };

  // Cualquier botón «Volver» de la pantalla respeta los cambios sin guardar:
  // le cedemos la navegación para que muestre el aviso antes de salir.
  useEffect(() => {
    if (!dirty) { setNavGuard(null); return; }
    setNavGuard((proceed) => setExitRequest({ kind: "back", proceed }));
    return () => setNavGuard(null);
  }, [dirty]);

  // Listen for goal-reached events from the runtime to support scene transitions
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nextSceneId: string | null; endsGame: boolean }>).detail;
      if (!detail) return;
      if (detail.nextSceneId && project?.scenes.some(s => s.id === detail.nextSceneId)) {
        setProject(p => p ? { ...p, activeSceneId: detail.nextSceneId! } : p);
        // brief delay so React swaps the scene prop, then restart runtime
        setTimeout(() => window.dispatchEvent(new Event("asternal:restart")), 60);
      }
    };
    window.addEventListener("asternal:goal", handler);
    return () => window.removeEventListener("asternal:goal", handler);
  }, [project]);

  const activeScene = useMemo(
    () => project?.scenes.find(s => s.id === project.activeSceneId),
    [project]
  );

  if (showManager) {
    return <ProjectManager onOpen={openProject} onClose={project ? () => setShowManager(false) : undefined} />;
  }

  if (!project || !activeScene) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-ink-2">
        <span className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        Cargando el motor…
      </div>
    );
  }

  const updateScene = (s: typeof activeScene) =>
    setProject({ ...project, scenes: project.scenes.map(x => x.id === s.id ? s : x) });

  const selected = activeScene.entities.find(e => e.id === selectedId) ?? null;
  // El tope de FPS experimental (120) solo existe en el motor beta.
  const allowedFps: number[] = beta ? [60, 120] : [60];
  const playProject = allowedFps.includes(project.settings.fpsCap)
    ? project
    : { ...project, settings: { ...project.settings, fpsCap: 60 as const } };

  if (playing) {
    return (
      <div className="h-screen w-full">
        <GameRuntime
          scene={activeScene}
          fpsCap={playProject.settings.fpsCap}
          showHUD={playProject.settings.showHUD}
          showFPS={playProject.settings.showFPS ?? true}
          volume={playProject.settings.volume ?? 0.8}
          muted={playProject.settings.muted ?? false}
          music={playProject.settings.music ?? false}
          musicUrl={playProject.settings.musicUrl ?? null}
          touchControls={playProject.settings.touchControls ?? true}
          autoPause={playProject.settings.autoPause ?? true}
          showHitboxes={playProject.settings.showHitboxes ?? false}
          onExit={() => setPlaying(false)}
        />
      </div>
    );
  }


  const TABS: [Tab, string, ReactNode][] = [
    ["build", t("tab.build"), <Boxes size={18} strokeWidth={1.75} key="build" />],
    ["inspect", t("tab.inspect"), <SlidersHorizontal size={18} strokeWidth={1.75} key="inspect" />],
    ["ui", t("tab.ui"), <PanelsTopLeft size={18} strokeWidth={1.75} key="ui" />],
    ["textures", t("tab.assets"), <ImageIcon size={18} strokeWidth={1.75} key="textures" />],
    ["scenes", t("tab.scenes"), <Layers3 size={18} strokeWidth={1.75} key="scenes" />],
    ["settings", t("tab.settings"), <Settings size={18} strokeWidth={1.75} key="settings" />],
  ];

  return (
    <div className={`editor-shell flex h-dvh w-full overflow-hidden ${isTablet ? "flex-row" : "flex-col"}`}>
      {/* Left rail (tablet/desktop) */}
      {isTablet && (
        <nav className="editor-rail w-[88px] border-r flex flex-col items-stretch py-3 gap-1 px-2 shrink-0">
          <div className="grid place-items-center pb-2.5 mb-1.5 border-b border-border/50">
            <Logo />
          </div>
          {TABS.map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              title={label}
              className={`relative flex flex-col items-center gap-1.5 py-3 rounded-lg transition-colors duration-150 active:scale-[0.96] ${
                tab === id
                  ? "text-primary bg-primary/12 border border-primary/20 shadow-sm before:absolute before:-left-2 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-primary"
                  : "text-ink-3 border border-transparent hover:bg-primary/[0.06] hover:text-foreground"
              }`}
            >
              <span className="leading-none">{icon}</span>
              <span className="text-[9px] font-display tracking-wide">{label}</span>
            </button>
          ))}
        </nav>
      )}

    <div className="flex h-full flex-1 flex-col overflow-hidden min-w-0">
      {/* Top bar */}
      <header className="editor-bar flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex min-w-0 items-center gap-2.5">
          {!isTablet && <Logo />}
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate font-display text-sm font-semibold text-foreground leading-none">{project.name || "Proyecto sin título"}</span><span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-primary">STUDIO</span></div>
            <div className={`mt-0.5 truncate text-[10px] font-mono ${dirty ? "text-amber-500" : "text-ink-3"}`}>
              {dirty
                ? "● cambios sin guardar"
                : savedAt ? `guardado ${timeAgo(savedAt)}` : "ENGINE · v2"}
              {beta && <span className="text-accent"> · BETA</span>}
            </div>
          </div>
        </div>

        {/* Botones independientes: la barra superior agrupa navegación, ayuda y
            las acciones principales. En móvil se envuelve a una segunda fila en
            lugar de recortar botones. */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
          <Link
            to="/"
            aria-label="Ir al inicio"
            title="Inicio"
            onClick={(e) => {
              if (dirty) { e.preventDefault(); setExitRequest({ kind: "home" }); }
            }}
            className="w-9 h-9 rounded-lg border border-line-strong bg-card text-ink-2 grid place-items-center hover:bg-muted/60 hover:text-foreground active:scale-95 transition"
          ><Home size={16} /></Link>
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Ayuda"
            title="Ayuda"
            className="w-9 h-9 rounded-lg border border-line-strong bg-card text-ink-2 grid place-items-center hover:bg-muted/60 hover:text-foreground active:scale-95 transition font-display"
          >?</button>

          <button
            onClick={() => setPublishOpen(true)}
            aria-label="Publicar juego"
            title="Publicar"
            className="hidden sm:flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-widest h-9 px-3.5 rounded-lg btn-grad text-primary-foreground active:scale-95 transition"
          ><Upload size={14} /> PUBLICAR</button>
          <button
            onClick={() => setPublishOpen(true)}
            aria-label="Publicar juego"
            title="Publicar"
            className="sm:hidden w-9 h-9 rounded-lg btn-grad text-primary-foreground grid place-items-center active:scale-95 transition"
          ><Upload size={15} /></button>
          <button
            onClick={() => {
              // Probar en 60 FPS no guarda nada: si el proyecto usaba otro tope,
              // queda como cambio sin guardar para que la persona lo confirme.
              if (!allowedFps.includes(project.settings.fpsCap)) {
                const next = { ...project, settings: { ...project.settings, fpsCap: 60 as const } };
                setProject(next);
              }
              setPlaying(true);
            }}
            className="flex h-9 w-9 items-center justify-center gap-1.5 rounded-lg font-display text-[13px] font-semibold btn-grad active:scale-95 sm:w-auto sm:px-4"
          >
            <Play size={14} fill="currentColor" /><span className="hidden sm:inline">PLAY</span>
          </button>
        </div>
      </header>
      {publishOpen && (
        <PublishGameDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          project={project}
          projectId={projectId}
          defaultTitle={project.name || "Mi juego"}
        />
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Aviso de cambios sin guardar al salir del editor */}
      {exitRequest && (
        <Dialog open onOpenChange={(v) => { if (!v) setExitRequest(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Tienes cambios sin guardar</DialogTitle>
              <DialogDescription>
                El proyecto todavía no se ha guardado. ¿Qué quieres hacer antes de salir?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => { const request = exitRequest; setExitRequest(null); saveNow(); performExit(request); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl btn-grad text-primary-foreground py-2.5 text-xs font-display tracking-widest active:scale-[0.98] transition"
              ><Save size={14} /> GUARDAR Y SALIR</button>
              <button
                onClick={() => { const request = exitRequest; setExitRequest(null); performExit(request); }}
                className="w-full rounded-xl border border-border py-2.5 text-xs font-display tracking-widest text-muted-foreground hover:text-foreground active:scale-[0.98] transition"
              >SALIR SIN GUARDAR</button>
              <button
                onClick={() => setExitRequest(null)}
                className="w-full rounded-xl py-2 text-[11px] text-muted-foreground hover:text-foreground transition"
              >CANCELAR</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Main */}
      <main key={tab} className="relative flex-1 min-h-0 view-fade">
        {tab === "build" && (
          <>
            <SceneEditor
              scene={activeScene}
              tool={tool}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={updateScene}
            />
            {layersOpen && (
              <div className="pointer-events-auto absolute right-3 bottom-3 z-30 w-[300px] max-h-[70vh] overflow-auto rounded-xl surface shadow-lg view-slide-right">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                  <span className="font-display text-[10px] font-semibold tracking-[0.15em] text-ink-2">CAPAS DE LA ESCENA</span>
                  <button onClick={() => setLayersOpen(false)} className="text-muted-foreground hover:text-foreground grid place-items-center w-7 h-7 rounded-lg hover:bg-muted/60 transition"><X size={14} /></button>
                </div>
                <div className="p-2">
                  <SceneLayersPanel scene={activeScene} onChangeScene={updateScene} />
                </div>
              </div>
            )}
          </>
        )}

        {tab === "inspect" && (
          <InspectorPanel
            scene={activeScene}
            entityId={selectedId}
            onChangeScene={updateScene}
            onSelect={setSelectedId}
            library={library}
            onOpenLibrary={() => setLibraryOpen(true)}
            project={project}
          />
        )}

        {tab === "ui" && (
          <UIEditor scene={activeScene} onChange={updateScene} />
        )}

        {tab === "scenes" && (
          <ScenesPanel
            project={project}
            onChange={setProject}
            onOpen={(id) => { setProject({ ...project, activeSceneId: id }); setTab("build"); }}
          />
        )}

        {tab === "textures" && (
          <TexturesPanel
            project={project}
            onChange={setProject}
            selectedEntity={selected}
            onAssignTexture={(dataUrl: string) => {
              if (!selected) return;
              const s = activeScene;
              updateScene({ ...s, entities: s.entities.map(e => e.id === selected.id ? { ...e, texture: dataUrl } : e) });
            }}
            onAssignAnimation={(sprite: SpriteAsset) => {
              if (!selected) return;
              const s = activeScene;
              const clip = {
                id: uid(),
                name: "idle",
                fps: sprite.fps,
                loop: sprite.loop,
                frames: sprite.frames.map((f) => f.composite),
              };
              const animations = [
                ...(selected.animations ?? []).filter(c => c.name !== "idle"),
                clip,
              ];
              updateScene({ ...s, entities: s.entities.map(e => e.id === selected.id ? { ...e, animations, texture: sprite.frames[0]?.composite ?? e.texture } : e) });
            }}
            onPlaceOnScene={(sprite: SpriteAsset) => {
              const s = activeScene;
              // La textura manda: entra con el tamaño del lienzo en el que se pintó
              // (misma proporción y mismos píxeles) y solo se ajusta si no cabe
              // entero en la escena. Antes se encogía siempre a 96 px.
              const placed = placedEntitySize(
                { w: sprite.width, h: sprite.height },
                { w: s.width, h: s.height },
              );
              const ent: Entity = {
                id: uid(),
                kind: "platform",
                x: Math.round(s.width / 2 - placed.w / 2),
                y: Math.round(s.height / 2 - placed.h / 2),
                w: placed.w, h: placed.h, vx: 0, vy: 0,
                color: "#1e3a8a",
                solid: false, gravity: false, controllable: false,
                collectible: false, hazard: false, goal: false,
                visible: true, opacity: 1,
                texture: sprite.frames[0]?.composite ?? null,
              };
              updateScene({ ...s, entities: [...s.entities, ent] });
              setSelectedId(ent.id);
              setTab("inspect");
            }}
          />
        )}

        {tab === "settings" && (
          <SettingsPanel
            project={project}
            onChange={setProject}
            beta={beta}
          />
        )}

        {/* Acciones flotantes sobre el lienzo: botones independientes, en fila y
            juntos en la esquina inferior derecha. Duplicar es contextual (pide una
            entidad seleccionada); Capas y Biblioteca solo aplican a Construir;
            Guardar acompaña a todas las pestañas. */}
        <div className="editor-fab-group pointer-events-auto absolute right-3 bottom-3 z-20 flex flex-row items-center gap-1 rounded-2xl p-1">
          {tab === "build" && selected && (
            <button
              onClick={() => {
                if (!selected) return;
                const result = duplicateEntityInScene(activeScene, selected.id);
                if (!result) return;
                updateScene(result.scene);
                setSelectedId(result.cloneId);
              }}
              className="pointer-events-auto w-10 h-10 rounded-xl editor-fab text-ink-2 hover:text-primary hover:border-primary/40 active:scale-90 transition grid place-items-center"
              title="Duplicar objeto (Ctrl+D)"
              aria-label="Duplicar"
            ><Copy size={18} /></button>
          )}
          {tab === "build" && (
            <button
              onClick={() => setLayersOpen(o => !o)}
              className={`pointer-events-auto w-10 h-10 rounded-xl grid place-items-center active:scale-90 transition ${
                layersOpen
                  ? "bg-primary text-primary-foreground border border-primary"
                  : "editor-fab text-ink-2 hover:text-primary"
              }`}
              title="Capas de la escena"
              aria-label="Capas"
            ><Layers size={18} /></button>
          )}
          {tab === "build" && (
            <button
              onClick={() => setLibraryOpen(true)}
              className="pointer-events-auto w-10 h-10 rounded-xl editor-fab text-ink-2 hover:text-primary hover:border-primary/40 active:scale-90 transition grid place-items-center"
              title={t("library.title")}
              aria-label="Librería de objetos"
            ><LibraryBig size={18} /></button>
          )}
          <button
            onClick={saveNow}
            disabled={!dirty}
            aria-label="Guardar proyecto"
            title={dirty ? "Guardar cambios" : "Todo guardado"}
            className={`pointer-events-auto w-10 h-10 rounded-xl grid place-items-center active:scale-90 transition disabled:opacity-45 ${
              dirty
                ? "btn-grad text-primary-foreground border border-transparent"
                : "editor-fab text-ink-2"
            }`}
          ><Save size={18} /></button>
        </div>

      </main>

      {/* Tool strip — only on build */}
      {tab === "build" && (
        <div className="editor-bar px-2 py-1 border-t">
          {/* El scroller aporta aire vertical propio: `overflow-x-auto`
              también recorta el eje Y, así que sin este padding la sombra del
              botón seleccionado aparecía cortada. */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-1.5">
            {TOOL_LIST.map(toolItem => (
              <button
                key={toolItem.id}
                onClick={() => setTool(toolItem.id)}
                title={t(toolItem.tKey)}
                className={`shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[10px] font-display font-medium transition-colors duration-150 active:scale-95 ${
                  tool === toolItem.id
                    ? "btn-grad border-transparent text-primary-foreground"
                    : "border-transparent text-ink-2 hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {toolItem.icon}
                <span className="truncate">{t(toolItem.tKey).toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom tabs (mobile only) */}
      {!isTablet && (
      <nav className="editor-bar grid grid-cols-6 border-t pb-[env(safe-area-inset-bottom)]">
        {TABS.map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`min-w-0 flex flex-col items-center gap-1 py-2.5 px-0.5 transition-colors duration-150 active:scale-95 ${
              tab === id ? "relative text-foreground after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-primary" : "text-ink-3 hover:text-foreground"
            }`}
          >
            <span className="leading-none">{icon}</span>
            <span className="w-full text-center text-[8px] font-display tracking-wide truncate">{label}</span>
          </button>
        ))}
      </nav>
      )}


      {libraryOpen && (
        <LibrarySheet
          library={library}
          selected={selected}
          onClose={() => setLibraryOpen(false)}
          onSave={(name) => {
            if (!selected) return;
            const { id: _id, x: _x, y: _y, ...preset } = selected;
            void _id; void _x; void _y;
            updateLibrary([...library, { id: uid(), name: name || selected.kind, preset }]);
          }}
          onRemove={(id) => updateLibrary(library.filter(i => i.id !== id))}
          onPlace={(item) => {
            const s = activeScene;
            const ent: Entity = {
              ...item.preset,
              id: uid(),
              x: Math.round(s.width / 2 - item.preset.w / 2),
              y: Math.round(s.height / 2 - item.preset.h / 2),
            };
            updateScene({ ...s, entities: [...s.entities, ent] });
            setSelectedId(ent.id);
            setLibraryOpen(false);
          }}
        />
      )}
    </div>
    </div>
  );
}

function LibrarySheet({
  library, selected, onClose, onSave, onRemove, onPlace,
}: {
  library: LibraryItem[];
  selected: Entity | null;
  onClose: () => void;
  onSave: (name: string) => void;
  onRemove: (id: string) => void;
  onPlace: (item: LibraryItem) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-xl panel rounded-t-2xl border border-border/60 p-4 space-y-3 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="section-label">{t("library.title")}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-line-strong bg-card text-ink-2 grid place-items-center hover:bg-muted/60 active:scale-95 transition"><X size={14} /></button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">Guarda cualquier entidad seleccionada para reutilizarla en otras escenas. Toca un item para colocarlo en el centro.</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={selected ? `Guardar: ${selected.kind}` : "Selecciona una entidad primero"}
            disabled={!selected}
            className="flex-1 bg-card border border-line-strong rounded-lg px-3 py-2 text-xs font-mono disabled:opacity-50 focus:border-primary/50 focus:ring-2 focus:ring-ring/30 outline-none transition"
          />
          <button
            disabled={!selected}
            onClick={() => { onSave(name); setName(""); }}
            className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-display font-semibold text-[10px] tracking-widest disabled:opacity-40 hover:bg-primary/15 active:scale-95 transition"
          >{t("library.save")}</button>
        </div>
        {library.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t("library.empty")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {library.map(item => (
              <div key={item.id} className="panel rounded-md p-2 flex flex-col items-center gap-1.5 border border-border/40 hover:border-primary/60 transition">
                <button
                  onClick={() => onPlace(item)}
                  className="w-full aspect-square rounded grid place-items-center active:scale-95 transition"
                  style={{ background: item.preset.color + "33", border: `1px solid ${item.preset.color}` }}
                >
                  {item.preset.texture ? (
                    <img src={item.preset.texture} alt={item.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-xs font-display text-primary-glow">{item.preset.kind.slice(0,3).toUpperCase()}</span>
                  )}
                </button>
                <span className="text-[10px] font-mono text-foreground truncate w-full text-center">{item.name}</span>
                <button onClick={() => onRemove(item.id)} className="text-[9px] text-destructive">✕ borrar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <a href="/" title="Volver al menú principal" className="relative w-9 h-9 rounded-lg grad-brand grid place-items-center shadow-sm ring-1 ring-white/25 ring-inset active:scale-95 transition">
      <span className="font-display text-lg text-primary-foreground">A</span>
    </a>
  );
}

function InspectorPanel({
  scene,
  entityId,
  onChangeScene,
  onSelect,
  library,
  onOpenLibrary,
  project,
}: {
  scene: import("@/lib/engine/core").Scene;
  entityId: string | null;
  onChangeScene: (s: import("@/lib/engine/core").Scene) => void;
  onSelect: (id: string | null) => void;
  library: LibraryItem[];
  onOpenLibrary: () => void;
  project?: Project;
}) {
  const t = useT();
  const ent = scene.entities.find(e => e.id === entityId);

  if (!ent) {
    return (
      <div className="h-full overflow-auto p-4 space-y-3">
        <SectionTitle>{t("scene.props")}</SectionTitle>
        <Field label={t("settings.gameName")} value={scene.name} onChange={v => onChangeScene({ ...scene, name: v })} />
        <Slider label={t("scene.gravity")} value={scene.gravity} min={0} max={3000} step={50}
          onChange={v => onChangeScene({ ...scene, gravity: v })} />
        <Slider label={t("scene.width")} value={scene.width} min={400} max={8000} step={100}
          onChange={v => onChangeScene({ ...scene, width: v })} />
        <Slider label={t("scene.height")} value={scene.height} min={400} max={4000} step={100}
          onChange={v => onChangeScene({ ...scene, height: v })} />

        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.bgColor")}</label>
          <input
            type="color"
            value={scene.bg}
            onChange={e => onChangeScene({ ...scene, bg: e.target.value })}
            className="w-full h-10 rounded-md bg-transparent border border-border mt-1"
          />
        </div>

        <SceneBgImage scene={scene} onChange={onChangeScene} />



        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.scaleAll")}</label>
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            {[0.5, 0.75, 1.5, 2].map(k => (
              <button key={k}
                onClick={() => onChangeScene(scaleScene(scene, k))}
                className="py-2 rounded-lg border border-line-strong bg-card text-xs font-display font-semibold tracking-widest text-ink-2 hover:border-primary/40 hover:text-primary active:scale-95 transition"
              >×{k}</button>
            ))}
          </div>
        </div>

        <Slider label={t("scene.timeLimit")} value={scene.timeLimit ?? 0} min={0} max={300} step={5}
          onChange={v => onChangeScene({ ...scene, timeLimit: v })} />
        <Slider label={t("scene.startLives")} value={scene.startLives ?? 1} min={1} max={9} step={1}
          onChange={v => onChangeScene({ ...scene, startLives: v })} />

        <SceneLayersPanel scene={scene} onChangeScene={onChangeScene} />

        <div className="pt-4">
          <SectionTitle>ENTIDADES · {scene.entities.length}</SectionTitle>
          <LayersPanel scene={scene} onChangeScene={onChangeScene} selectedId={null} onSelect={onSelect} />
        </div>
      </div>
    );
  }

  const update = (patch: Partial<typeof ent>) => {
    // Mover desde los deslizadores X/Y arrastra a los hijos igual que el
    // arrastre del lienzo, y mantiene al hijo dentro de su padre.
    if (patch.x !== undefined || patch.y !== undefined) {
      const { x, y, ...rest } = patch;
      const moved = setEntityPosition(scene, ent.id, x ?? ent.x, y ?? ent.y);
      onChangeScene(Object.keys(rest).length
        ? { ...moved, entities: moved.entities.map(e => e.id === ent.id ? { ...e, ...rest } : e) }
        : moved);
      return;
    }
    onChangeScene({
      ...scene,
      entities: scene.entities.map(e => e.id === ent.id ? { ...e, ...patch } : e),
    });
  };

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <SectionTitle>{ent.kind.toUpperCase()}</SectionTitle>
          {ent.parentId && (
            <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-display font-semibold tracking-wider text-accent">
              HIJO
            </span>
          )}
        </div>
        <button onClick={() => onSelect(null)} className="text-xs text-muted-foreground">{t("common.back")}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Slider label="X" value={ent.x} min={0} max={scene.width} step={10} onChange={v => update({ x: v })} />
        <Slider label="Y" value={ent.y} min={0} max={scene.height} step={10} onChange={v => update({ y: v })} />
        <Slider label="Ancho" value={ent.w} min={8} max={400} step={4} onChange={v => update({ w: v })} />
        <Slider label="Alto" value={ent.h} min={8} max={400} step={4} onChange={v => update({ h: v })} />
      </div>

      <HierarchyPanel
        scene={scene}
        entity={ent}
        onChangeScene={onChangeScene}
        onSelect={onSelect}
        library={library}
        onOpenLibrary={onOpenLibrary}
      />
      <div>
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("inspector.color")}</label>
        <input
          type="color"
          value={ent.color}
          onChange={e => update({ color: e.target.value })}
          className="w-full h-10 rounded-md bg-transparent border border-border mt-1"
        />
      </div>

      <TexturePicker
        texture={ent.texture ?? null}
        fit={ent.textureFit ?? "stretch"}
        onPick={(dataUrl, size) => {
          if (!size) { update({ texture: dataUrl }); return; }
          // La textura trae su tamaño: el objeto lo adopta (así no se deforma) y
          // conserva su centro en la escena.
          update({
            texture: dataUrl,
            w: Math.max(1, Math.round(size.w)),
            h: Math.max(1, Math.round(size.h)),
            x: Math.round(ent.x + ent.w / 2 - size.w / 2),
            y: Math.round(ent.y + ent.h / 2 - size.h / 2),
          });
        }}
        onClear={() => update({ texture: null })}
        onFit={(f) => update({ textureFit: f })}
      />

      <AnimationsButton entity={ent} onUpdate={update} />
      <ScriptsButton entity={ent} onUpdate={update} />
      <DialogEditor entity={ent} onUpdate={update} />
      <HitboxEditor entity={ent} onUpdate={update} />

      <div className="grid grid-cols-2 gap-2">
        <Slider label={t("inspector.depth")} value={ent.z ?? 0} min={-20} max={20} step={1}
          onChange={v => update({ z: v })} />
        <Toggle label={t("inspector.flipX")} on={!!ent.flipX} onChange={v => update({ flipX: v })} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">ROTACIÓN</label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => update({ rotation: 0 })}
              className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/70 font-mono">0°</button>
            <button type="button" onClick={() => update({ rotation: (((ent.rotation ?? 0) + 90) % 360) })}
              className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 hover:bg-primary/40 text-primary-glow font-mono">+90°</button>
            <span className="text-[10px] font-mono tabular-nums w-10 text-right">{Math.round(ent.rotation ?? 0)}°</span>
          </div>
        </div>
        <input type="range" min={0} max={360} step={1}
          value={ent.rotation ?? 0}
          onChange={e => update({ rotation: Number(e.target.value) })}
          className="w-full accent-primary" />
      </div>

      {(scene.layers && scene.layers.length > 0) && (
        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("inspector.layer")}</label>
          <select
            value={ent.layerId ?? DEFAULT_LAYER_ID}
            onChange={e => update({ layerId: e.target.value })}
            className="w-full mt-1 bg-input/60 border border-border rounded-md px-2 py-2 text-xs font-mono"
          >
            {[...(scene.layers ?? [])].sort((a, b) => b.z - a.z).map(l => (
              <option key={l.id} value={l.id}>{l.name} · z={l.z}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label={t("inspector.solid")} on={ent.solid} onChange={v => update({ solid: v })} />
        <Toggle label={t("inspector.gravity")} on={ent.gravity} onChange={v => update({ gravity: v })} />
        <Toggle label={t("inspector.collectible")} on={ent.collectible} onChange={v => update({ collectible: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label={t("inspector.visible")} on={ent.visible ?? true} onChange={v => update({ visible: v })} />
        <Slider label={t("inspector.opacity")} value={Math.round((ent.opacity ?? 1) * 100)} min={0} max={100} step={5}
          onChange={v => update({ opacity: v / 100 })} />
      </div>
      <BehaviorsPanel ent={ent} onUpdate={update} />
      <ParticlesButton entity={ent} onUpdate={update} />

      {ent.goal && (
        <div className="panel rounded-md p-2 space-y-2 border border-primary/30">
          <div className="text-[10px] font-display tracking-widest text-primary-glow">{t("goal.onReach") || "AL ALCANZAR"}</div>
          <Toggle
            label={t("goal.endsGame") || "GANAR PARTIDA"}
            on={!!ent.endsGame}
            onChange={v => update({ endsGame: v })}
          />
          <div>
            <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("goal.nextScene") || "IR A ESCENA"}</label>
            <select
              value={ent.nextSceneId ?? ""}
              onChange={e => update({ nextSceneId: e.target.value || null })}
              className="w-full mt-1 bg-input/60 border border-border rounded-md px-2 py-2 text-xs font-mono"
            >
              <option value="">— {t("goal.none") || "Ninguna (solo ganar nivel)"} —</option>
              {(project?.scenes ?? []).filter(s => s.id !== scene.id).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <button
        onClick={() => update({ x: scene.width / 2 - ent.w / 2, y: scene.height / 2 - ent.h / 2 })}          className="w-full py-2 rounded-lg border border-line-strong bg-card text-ink-2 font-display text-[10px] tracking-widest hover:border-primary/30 hover:text-primary active:scale-[0.98] transition"
        >{t("inspector.center")}</button>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          onClick={() => {
            const idx = scene.entities.findIndex(e => e.id === ent.id);
            if (idx <= 0) return;
            const next = [...scene.entities];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            onChangeScene({ ...scene, entities: next });
          }}
          className="py-2 rounded-lg border border-line-strong bg-card text-ink-2 font-display text-[10px] tracking-widest hover:border-primary/30 hover:text-primary active:scale-[0.98] transition"
        >{t("inspector.back")}</button>
        <button
          onClick={() => {
            const idx = scene.entities.findIndex(e => e.id === ent.id);
            if (idx < 0 || idx === scene.entities.length - 1) return;
            const next = [...scene.entities];
            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
            onChangeScene({ ...scene, entities: next });
          }}
          className="py-2 rounded-lg border border-line-strong bg-card text-ink-2 font-display text-[10px] tracking-widest hover:border-primary/30 hover:text-primary active:scale-[0.98] transition"
        >{t("inspector.front")}</button>
        <button
          onClick={() => {
            const result = duplicateEntityInScene(scene, ent.id);
            if (!result) return;
            onChangeScene(result.scene);
            onSelect(result.cloneId);
          }}
          className="py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-display text-[10px] tracking-widest hover:bg-primary/15 active:scale-[0.98] transition"
        >{t("inspector.clone")}</button>
      </div>

      {!isPlayerEntity(ent) && (
        <button
          onClick={() => {
            // Con la rama completa: un padre borrado no deja hijos sueltos.
            onChangeScene(removeEntityWithChildren(scene, ent.id));
            onSelect(null);
          }}
          className="w-full mt-2 py-2 rounded-lg bg-destructive/10 border border-destructive/40 text-destructive font-display font-semibold text-xs tracking-widest hover:bg-destructive/15 active:scale-[0.98] transition"
        >
          {t("inspector.delete")}
        </button>
      )}
    </div>
  );
}

function ScenesPanel({
  project,
  onChange,
  onOpen,
}: {
  project: Project;
  onChange: (p: Project) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <SectionTitle>ESCENAS</SectionTitle>
      <div className="space-y-2">
        {project.scenes.map(s => (
          <div key={s.id} className="surface rounded-xl p-3 flex items-center gap-3 transition-colors hover:border-primary/35">
            <div
              className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/15 grid place-items-center text-primary shrink-0"
              title={`${s.entities.length} elementos`}
            >
              <Layers size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={s.name}
                onChange={e => onChange({ ...project, scenes: project.scenes.map(x => x.id === s.id ? { ...x, name: e.target.value } : x) })}
                className="w-full bg-transparent font-display text-sm focus:outline-none focus:bg-input/40 rounded px-1"
              />
              <div className="text-[10px] font-mono text-muted-foreground px-1">{s.width}×{s.height} · g{s.gravity}</div>
            </div>
            <button
              onClick={() => onOpen(s.id)}
              className="text-[10px] font-display font-semibold px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 active:scale-[0.96] transition"
            >ABRIR</button>
            <button
              onClick={() => {
                const copy: Scene = JSON.parse(JSON.stringify(s));
                copy.id = uid();
                copy.name = s.name + " copia";
                copy.entities = copy.entities.map(e => ({ ...e, id: uid() }));
                onChange({ ...project, scenes: [...project.scenes, copy], activeSceneId: copy.id });
              }}
              className="text-[10px] font-display px-2 py-1.5 rounded-lg border border-line-strong bg-card text-ink-2 hover:text-primary hover:border-primary/30 active:scale-[0.96] transition"
              title="Duplicar"
            >⧉</button>
            <button
              onClick={() => {
                if (!confirm(`¿Vaciar todas las entidades de "${s.name}"?`)) return;
                onChange({ ...project, scenes: project.scenes.map(x => x.id === s.id ? { ...x, entities: [] } : x) });
              }}
              className="text-[10px] font-display px-2 py-1.5 rounded-lg border border-line-strong bg-card text-ink-2 hover:text-destructive hover:border-destructive/40 active:scale-[0.96] transition"
              title="Vaciar entidades"
            >⌫</button>
            {project.scenes.length > 1 && (
              <button
                onClick={() => {
                  if (!confirm(`¿Borrar "${s.name}"?`)) return;
                  const remaining = project.scenes.filter(x => x.id !== s.id);
                  onChange({
                    ...project,
                    scenes: remaining,
                    activeSceneId: project.activeSceneId === s.id ? remaining[0].id : project.activeSceneId,
                  });
                }}
                className="text-ink-3 hover:text-destructive text-lg px-1.5 active:scale-90 transition"
              >✕</button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          const s = newScene(`Escena ${project.scenes.length + 1}`);
          s.id = uid();
          onChange({ ...project, scenes: [...project.scenes, s], activeSceneId: s.id });
        }}
        className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary font-display font-semibold tracking-widest text-sm hover:bg-primary/5 active:scale-[0.98] transition"
      >
        + NUEVA ESCENA
      </button>
    </div>
  );
}


function SettingsPanel({ project, onChange, beta = false }: { project: Project; onChange: (p: Project) => void; beta?: boolean }) {
  useT();
  const set = (patch: Partial<Project["settings"]>) =>
    onChange({ ...project, settings: { ...project.settings, ...patch } });


  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <SectionTitle>PROYECTO</SectionTitle>
      <Field label="Nombre del juego" value={project.name} onChange={v => onChange({ ...project, name: v })} />



      <SectionTitle>EJECUCIÓN</SectionTitle>
      <div>
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">TOPE DE FPS</label>
        <div className="flex gap-2 mt-1">
          {(beta ? [30, 60, 120] : [30, 60]).map(f => (
            <button key={f}
              onClick={() => set({ fpsCap: f as Project["settings"]["fpsCap"] })}
              className={`flex-1 py-2 rounded-lg font-display font-semibold border transition active:scale-[0.96] ${
                project.settings.fpsCap === f
                  ? "bg-primary/10 border-primary/50 text-primary"
                  : "border-line-strong bg-card text-ink-2 hover:border-primary/25 hover:text-primary"
              }`}
            >{f}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Mostrar HUD" on={project.settings.showHUD} onChange={v => set({ showHUD: v })} />
        <Toggle label="Mostrar FPS" on={project.settings.showFPS ?? true} onChange={v => set({ showFPS: v })} />
        <Toggle label="Controles táctiles" on={project.settings.touchControls ?? true} onChange={v => set({ touchControls: v })} />
        <Toggle label="Auto-pausa" on={project.settings.autoPause ?? true} onChange={v => set({ autoPause: v })} />
        <Toggle label="Mostrar hitbox" on={project.settings.showHitboxes ?? false} onChange={v => set({ showHitboxes: v })} />
      </div>


      {beta && (
        <>
          <SectionTitle>FUNCIONES EN PRUEBAS · BETA</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Rejilla magnética" on={project.settings.snapToGrid ?? false} onChange={v => set({ snapToGrid: v })} />
            <Toggle label="Mostrar rejilla" on={project.settings.showGrid ?? true} onChange={v => set({ showGrid: v })} />
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Motor propio en pruebas: el tope de 120 FPS y estos ajustes son experimentales
            y pueden cambiar en próximas versiones.
          </p>
        </>
      )}


      <SectionTitle>AUDIO</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Silenciar" on={project.settings.muted ?? false} onChange={v => set({ muted: v })} />
        <Toggle
          label="Música"
          on={(project.settings.music ?? false) && !!project.settings.musicUrl}
          onChange={v => set({ music: v })}
        />
      </div>
      <Slider label="Volumen" value={Math.round((project.settings.volume ?? 0.8) * 100)} min={0} max={100} step={5}
        onChange={v => set({ volume: v / 100 })} />
      <div className="space-y-1.5">
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">ARCHIVO DE MÚSICA</label>
        {project.settings.musicUrl ? (
          <div className="flex items-center gap-2 panel rounded-md px-3 py-2">
            <span className="flex-1 text-xs font-mono text-primary-glow truncate">
              ♪ {project.settings.musicName || "pista"}
            </span>
            <button
              onClick={() => set({ musicUrl: null, musicName: null, music: false })}
              className="text-[10px] font-display font-semibold tracking-widest text-ink-2 hover:text-primary px-2 py-1.5 rounded-lg border border-line-strong bg-card active:scale-[0.96] transition"
            >QUITAR</button>
          </div>
        ) : (
          <label className="block">
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={async e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const url = String(reader.result || "");
                  if (url) set({ musicUrl: url, musicName: f.name, music: true });
                };
                reader.readAsDataURL(f);
                e.target.value = "";
              }}
            />
            <span className="block text-center py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-display font-semibold text-xs tracking-widest cursor-pointer hover:bg-primary/15 active:scale-[0.98] transition">
              ⤒ SUBIR MÚSICA
            </span>
          </label>
        )}
      </div>





      <div className="pt-6 text-center text-[10px] font-mono text-muted-foreground">
        ASTERNAL ENGINE · HECHO PARA MÓVIL
      </div>

    </div>
  );
}


// --- shared bits ---
/**
 * Jerarquía de objetos: padre, hijos y creación de hijos nuevos.
 *
 * El hijo es una entidad normal —conserva scripts, comportamientos y ajustes—
 * así que aquí solo se gestiona el vínculo: crear un hijo dentro del objeto
 * seleccionado, vincular el objeto a un padre existente, desvincular y saltar
 * de un objeto a otro del árbol.
 */
function HierarchyPanel({
  scene,
  entity,
  onChangeScene,
  onSelect,
  library,
  onOpenLibrary,
}: {
  scene: Scene;
  entity: Entity;
  onChangeScene: (s: Scene) => void;
  onSelect: (id: string | null) => void;
  library: LibraryItem[];
  onOpenLibrary: () => void;
}) {
  // El hijo se crea a partir de un objeto guardado en la Biblioteca, nunca de un
  // tipo predeterminado del motor. La selección se deriva de la lista para que
  // siga siendo válida si la Biblioteca cambia (p. ej. tras sincronizar).
  const [childItemId, setChildItemId] = useState<string>(library[0]?.id ?? "");
  const childItem = library.find(i => i.id === childItemId) ?? library[0] ?? null;
  const parent = entityById(scene, entity.parentId);
  const children = childrenOf(scene, entity.id);
  // Solo se ofrecen padres posibles: ni él mismo ni sus descendientes (ciclo).
  const candidates = scene.entities.filter(e => canAttachAsChild(scene, entity.id, e.id));

  const addChild = () => {
    if (!childItem) {
      onOpenLibrary();
      return;
    }
    const result = createChildFromPreset(scene, entity.id, childItem.preset);
    if (!result) return;
    onChangeScene(result.scene);
    onSelect(result.childId);
  };

  return (
    <div className="surface rounded-xl p-3 space-y-2.5">
      <SectionTitle>OBJETOS HIJOS</SectionTitle>

      {/* Objeto padre */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-display tracking-widest text-muted-foreground">PADRE</div>
        {parent ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelect(parent.id)}
              className="flex-1 min-w-0 text-left text-[11px] font-display tracking-widest text-primary truncate"
              title="Seleccionar el objeto padre"
            >↑ {parent.kind.toUpperCase()}</button>
            <button
              onClick={() => onChangeScene(detachEntityFromParent(scene, entity.id))}
              className="shrink-0 text-[10px] font-display tracking-widest px-2.5 py-1.5 rounded-lg border border-line-strong bg-card text-ink-2 hover:text-primary hover:border-primary/40 active:scale-95 transition"
            >DESVINCULAR</button>
          </div>
        ) : (
          <select
            value=""
            onChange={e => {
              const id = e.target.value;
              if (id) onChangeScene(attachEntityToParent(scene, entity.id, id));
            }}
            className="w-full h-9 rounded-lg border border-border bg-input/50 px-2 text-[11px] font-display tracking-widest outline-none focus:border-primary/40"
          >
            <option value="">— ES UN OBJETO RAÍZ —</option>
            {candidates.map(c => (
              <option key={c.id} value={c.id}>{c.kind.toUpperCase()} · x{c.x} y{c.y}</option>
            ))}
          </select>
        )}
      </div>

      {/* Crear un objeto hijo a partir de un objeto guardado en la Biblioteca */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-display tracking-widest text-muted-foreground">OBJETO DE LA BIBLIOTECA</div>
        {library.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground/75">
              Un objeto hijo se crea a partir de un objeto guardado en tu Biblioteca.
              Todavía no hay ninguno: guarda una selección en la Biblioteca y vuelve aquí.
            </p>
            <button
              onClick={onOpenLibrary}
              className="w-full h-9 rounded-lg border border-line-strong bg-card text-ink-2 font-display text-[11px] font-semibold tracking-widest hover:text-primary hover:border-primary/40 active:scale-95 transition inline-flex items-center justify-center gap-1.5"
            ><LibraryBig size={13} /> IR A LA BIBLIOTECA</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={childItem?.id ?? ""}
              onChange={e => setChildItemId(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-border bg-input/50 px-2 text-[11px] font-display tracking-widest outline-none focus:border-primary/40"
            >
              {library.map(item => <option key={item.id} value={item.id}>{item.name.toUpperCase()}</option>)}
            </select>
            <button
              onClick={addChild}
              className="h-9 shrink-0 px-3 rounded-lg btn-grad text-primary-foreground font-display text-[11px] font-semibold tracking-widest inline-flex items-center gap-1 active:scale-95 transition"
            ><Plus size={13} /> CREAR HIJO</button>
          </div>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground/75">
        El hijo conserva el objeto guardado (textura, scripts y ajustes) y nace centrado, en la misma
        capa y por delante. Se mueve contigo y, a la vez, se puede colocar dentro de ti.
      </p>

      {/* Hijos actuales */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-display tracking-widest text-muted-foreground">HIJOS · {children.length}</div>
        {children.length === 0 && (
          <div className="text-[10px] font-mono text-muted-foreground px-2 py-2 text-center border border-dashed border-border rounded-lg">
            SIN HIJOS
          </div>
        )}
        {children.map(c => (
          <div key={c.id} className="flex items-center gap-1.5 panel rounded-lg px-2 py-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
            <button
              onClick={() => onSelect(c.id)}
              className="flex-1 min-w-0 text-left text-[10px] font-display tracking-widest truncate hover:text-primary"
              title="Editar este hijo"
            >{c.kind.toUpperCase()} · {Math.round(c.w)}×{Math.round(c.h)}</button>
            <button
              onClick={() => onChangeScene(detachEntityFromParent(scene, c.id))}
              title="Desvincular (deja de seguir al padre)"
              className="w-6 h-6 grid place-items-center rounded text-muted-foreground hover:text-primary"
            >⤴</button>
            <button
              onClick={() => onChangeScene(removeEntityWithChildren(scene, c.id))}
              title="Borrar el hijo"
              className="w-6 h-6 grid place-items-center rounded text-destructive/70 hover:text-destructive"
            ><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-[11px] font-semibold tracking-[0.18em] uppercase text-ink-2">{children}</h2>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] font-display font-medium tracking-widest text-ink-2">{label.toUpperCase()}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full mt-1 bg-card border border-line-strong rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30 transition-[border-color,box-shadow]"
      />
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between items-baseline">
        <label className="text-[10px] font-display font-medium tracking-widest text-ink-2">{label.toUpperCase()}</label>
        <span className="text-[10px] font-mono text-primary tabular-nums">{Math.round(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors duration-150 active:scale-[0.98] ${
        on ? "border-primary/40 bg-primary/10 text-primary" : "border-line-strong bg-card text-ink-2 hover:border-primary/25"
      }`}
    >
      <span className="text-xs font-display font-medium tracking-wide">{label.toUpperCase()}</span>
      <span className={`w-8 h-4 rounded-full p-0.5 transition ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`block w-3 h-3 rounded-full bg-white shadow-sm transition ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

function TexturePicker({ texture, fit = "stretch", onPick, onClear, onFit }: {
  texture: string | null;
  fit?: "stretch" | "contain" | "cover";
  /** La textura, con el tamaño del dibujo cuando se conoce (para que el objeto lo adopte). */
  onPick: (dataUrl: string, size?: { w: number; h: number }) => void;
  onClear: () => void;
  onFit?: (f: "stretch" | "contain" | "cover") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const t = useT();
  return (
    <div>
      <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("inspector.texture")}</label>        <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="relative w-16 h-16 rounded-lg border border-line-strong bg-input/40 grid place-items-center overflow-hidden shadow-xs"
          style={{ backgroundColor: "#e5e7eb", backgroundImage: "linear-gradient(45deg,#9ca3af 25%,transparent 25%),linear-gradient(-45deg,#9ca3af 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#9ca3af 75%),linear-gradient(-45deg,transparent 75%,#9ca3af 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0" }}
        >
          {texture ? (
            <img src={texture} alt="texture" className="absolute inset-0 w-full h-full" style={{ objectFit: fit === "stretch" ? "fill" : fit, imageRendering: "auto" }} />
          ) : (
            <span className="text-xl text-muted-foreground">＋</span>
          )}
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-display font-semibold tracking-widest px-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 transition"
            >
              {t("texture.gallery")}
            </button>
            <button
              onClick={() => setDrawOpen(true)}
              className="text-[10px] font-display font-semibold tracking-widest px-2 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent-foreground hover:bg-accent/15 transition"
            >
              {t("texture.draw")}
            </button>
          </div>
          {texture && (
            <button
              onClick={onClear}
              className="text-[10px] font-display font-semibold tracking-widest px-3 py-1.5 rounded-lg border border-line-strong bg-card text-ink-2 hover:text-primary hover:border-primary/30 transition"
            >
              {t("texture.clear")}
            </button>
          )}
        </div>
      </div>
      {drawOpen && (
        <PaintEditor
          onClose={() => setDrawOpen(false)}
          onSave={(asset) => {
            const url = asset.frames[0]?.composite;
            // El dibujo llega con su lienzo: el objeto adopta ese tamaño.
            if (url) onPick(url, { w: asset.width, h: asset.height });
            setDrawOpen(false);
          }}
        />
      )}
      {texture && onFit && (
        <div className="grid grid-cols-3 gap-1 mt-2">
          {(["stretch","contain","cover"] as const).map(m => (
            <button key={m}
              onClick={() => onFit(m)}
              className={`py-1 rounded text-[9px] font-display font-semibold tracking-widest border transition ${
                fit === m ? "bg-primary/10 border-primary/50 text-primary" : "border-line-strong bg-card text-ink-2 hover:border-primary/30 hover:text-primary"
              }`}
            >{m.toUpperCase()}</button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const url = await fileToDataURL(f);
            onPick(url, await imageSize(url));
          } catch { /* ignore */ }
          e.target.value = "";
        }}
      />
    </div>
  );
}

function AnimationsButton({ entity, onUpdate }: { entity: import("@/lib/engine/core").Entity; onUpdate: (patch: Partial<import("@/lib/engine/core").Entity>) => void }) {
  const [open, setOpen] = useState(false);
  const count = entity.animations?.length ?? 0;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-1 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-display font-semibold text-xs tracking-widest flex items-center justify-between hover:bg-primary/15 active:scale-[0.99] transition"
      >
        <span>◈ ANIMATIONS</span>
        <span className="font-mono text-[10px] opacity-80">{count} CLIPS</span>
      </button>
      {open && (
        <AnimationEditor
          entity={entity}
          onChange={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TexturesPanel({
  project, onChange, selectedEntity, onAssignTexture, onAssignAnimation, onPlaceOnScene,
}: {
  project: Project;
  onChange: (p: Project) => void;
  selectedEntity: Entity | null;
  onAssignTexture: (dataUrl: string) => void;
  onAssignAnimation: (sprite: SpriteAsset) => void;
  onPlaceOnScene: (sprite: SpriteAsset) => void;
}) {
  const sprites = project.assets?.sprites ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [paintOpen, setPaintOpen] = useState(false);
  // Textura abierta con el lápiz para seguir editándola. Se guarda su copia
  // para que al guardar vuelva a SU sitio, no como una textura nueva.
  const [editing, setEditing] = useState<SpriteAsset | null>(null);

  const writeSprites = (next: SpriteAsset[]) => {
    onChange({ ...project, assets: { ...(project.assets ?? { sprites: [] }), sprites: next } });
  };

  const addSprite = (asset: SpriteAsset) => writeSprites([...sprites, asset]);

  /**
   * Guarda la textura que se estaba editando: el dibujo nuevo ocupa el lugar del
   * anterior (mismo id, mismo nombre y, si la textura tenía varios fotogramas,
   * el resto se conserva). Editar nunca duplica ni pierde nada.
   */
  const saveEdited = (asset: SpriteAsset) => {
    const target = editing;
    if (!target) return;
    writeSprites(sprites.map(s => (s.id === target.id ? applyEditedDrawing(s, asset) : s)));
    setEditing(null);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const frames = await Promise.all(list.map(async (f) => ({
      id: uid(),
      layers: [],
      composite: await fileToDataURL(f),
    })));
    // Medidas reales del primer cuadro: el asset entra con su tamaño.
    const dims = await imageSize(frames[0].composite) ?? { w: 32, h: 32 };
    const asset: SpriteAsset = {
      id: uid(),
      name: list[0].name.replace(/\.[^.]+$/, "").slice(0, 24) || "textura",
      width: dims.w,
      height: dims.h,
      fps: 8,
      loop: true,
      frames,
    };
    writeSprites([...sprites, asset]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeSprite = (id: string) => {
    if (!confirm("¿Borrar esta textura?")) return;
    writeSprites(sprites.filter(s => s.id !== id));
  };

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>TEXTURAS · {sprites.length}</SectionTitle>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPaintOpen(true)}
            title="Pintar una textura nueva"
            className="text-xs font-display px-3 py-1.5 rounded-md bg-primary/10 border border-accent/50 text-primary-glow glow-border"
          >✎ DIBUJAR</button>
          <button
            onClick={() => fileRef.current?.click()}
            title="Traer una imagen del dispositivo"
            className="text-xs font-display px-3 py-1.5 rounded-md bg-primary/10 border border-primary/50 text-primary-glow glow-border"
          >+ AÑADIR IMAGEN</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => importFiles(e.target.files)}
        />
      </div>
      {paintOpen && (
        <PaintEditor
          onClose={() => setPaintOpen(false)}
          onSave={(asset) => { addSprite(asset); setPaintOpen(false); }}
        />
      )}
      {/* El lápiz abre la textura otra vez con su dibujo dentro: se sigue
          editando en cualquier momento, no se da nunca por terminada. */}
      {editing && (
        <PaintEditor
          onClose={() => setEditing(null)}
          source={{
            image: editing.frames[0]?.composite ?? "",
            width: editing.width,
            height: editing.height,
            name: editing.name,
          }}
          onSave={saveEdited}
        />
      )}

      {sprites.length > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground panel rounded-md px-2 py-1.5 border border-border/50">
          {selectedEntity
            ? <>Toca el <span className="text-primary-glow">lápiz</span> de una textura para seguir editándola, o la textura para asignarla a <span className="text-primary-glow">{selectedEntity.kind.toUpperCase()}</span>.</>
            : <>Toca el <span className="text-primary-glow">lápiz</span> de una textura para seguir editándola cuando quieras. Selecciona un objeto en INSPECCIÓN para asignarle texturas.</>}
        </div>
      )}

      {sprites.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-10">
          Aún no hay texturas. Pinta una con <span className="text-primary-glow">✎ DIBUJAR</span> o trae una imagen con <span className="text-primary-glow">+ AÑADIR IMAGEN</span>.
          <div className="mt-1 text-[10px] opacity-70">Con varios archivos a la vez se crea una animación con esos fotogramas.</div>
          <div className="mt-1 text-[10px] opacity-70">Cada textura lleva un lápiz en su esquina: puedes volver a editarla siempre que quieras.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {sprites.map(sp => (
          <div key={sp.id} className="relative panel rounded-lg p-2 border border-border/60 glow-border">
            {/* Lápiz en la esquina superior derecha: la textura se puede seguir
                editando de verdad, en cualquier momento. */}
            <button
              onClick={() => setEditing(sp)}
              title={`Seguir editando «${sp.name}»`}
              aria-label={`Seguir editando ${sp.name}`}
              className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-primary/40 bg-card/90 text-primary-glow shadow-sm hover:bg-primary/15 active:scale-90 transition"
            ><Pencil size={17} strokeWidth={2} /></button>
            {/* Vista previa: fondo blanco y el dibujo, sin cuadrícula ni damero. */}
            <div className="aspect-square rounded-md grid place-items-center overflow-hidden border border-border/30 bg-white">
              {sp.frames[0]?.composite && (
                <img src={sp.frames[0].composite} alt={sp.name}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "auto" }} />
              )}
            </div>
            <div className="mt-1.5">
              <div className="text-xs font-display truncate text-primary-glow">{sp.name}</div>
              <div className="text-[9px] font-mono text-muted-foreground">{sp.width}×{sp.height} · {sp.frames.length}f</div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <button
                onClick={() => onPlaceOnScene(sp)}
                title={`Colocar en la escena con su tamaño real (${sp.width}×${sp.height})`}
                className="text-[10px] py-1.5 rounded bg-primary/10 border border-primary/50 text-primary-glow font-display tracking-widest glow-border"
              >＋ COLOCAR</button>
              <button
                onClick={() => removeSprite(sp.id)}
                className="text-[10px] py-1.5 rounded bg-destructive/15 border border-destructive/40 text-destructive font-display tracking-widest"
              >✕ BORRAR</button>
            </div>
            {selectedEntity && (
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button
                  onClick={() => onAssignTexture(sp.frames[0]?.composite ?? "")}
                  className="text-[10px] py-1.5 rounded bg-primary/15 border border-primary/40 text-primary-glow font-display tracking-widest"
                >TEXTURA</button>
                <button
                  onClick={() => onAssignAnimation(sp)}
                  disabled={sp.frames.length < 1}
                  className="text-[10px] py-1.5 rounded bg-accent/15 border border-accent/40 text-primary-glow font-display tracking-widest disabled:opacity-40"
                >ANIM</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function scaleScene(scene: Scene, k: number): Scene {
  return {
    ...scene,
    width: Math.round(scene.width * k),
    height: Math.round(scene.height * k),
    entities: scene.entities.map(e => ({
      ...e,
      x: Math.round(e.x * k),
      y: Math.round(e.y * k),
      w: Math.max(8, Math.round(e.w * k)),
      h: Math.max(8, Math.round(e.h * k)),
    })),
  };
}

function ScriptsButton({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const [open, setOpen] = useState(false);
  const count = entity.scripts?.length ?? 0;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-1 px-3 py-2.5 rounded-md bg-primary/10 border border-accent/50 text-primary-glow font-display text-xs tracking-widest flex items-center justify-between glow-border"
      >
        <span>◉ EVENTS · BLOCKS</span>
        <span className="font-mono text-[10px] opacity-80">{count} SCRIPTS</span>
      </button>
      {open && (
        <ScriptEditor
          scripts={entity.scripts}
          ownerLabel={entity.kind.toUpperCase()}
          aiTargetKind={entity.kind}
          aiSummary={`Entidad ${entity.kind} en ${entity.x},${entity.y} ${entity.w}x${entity.h}.`}
          onChange={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function exportProject(project: Project) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(project.name || "asternal-project").replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProject(): Promise<Project | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const text = await f.text();
        const parsed = JSON.parse(text) as Project;
        if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
          return reject(new Error("Archivo de proyecto no válido"));
        }
        if (!confirm("Replace current project with imported file?")) return resolve(null);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background p-4" onClick={onClose}>
      <div className="panel rounded-xl border border-primary/40 glow-border max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm text-primary-glow glow-text tracking-[0.25em]">AYUDA RÁPIDA</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">✕</button>
        </div>
        <ul className="space-y-2 text-xs font-mono text-muted-foreground">
          <li><span className="text-primary-glow">CONSTRUIR</span> · toca para colocar la herramienta, pellizca para zoom, desliza para mover.</li>
          <li><span className="text-primary-glow">SELECCIONAR</span> · toca una entidad y abre INSPECCIÓN para editarla.</li>
          <li><span className="text-primary-glow">TEXTURAS</span> · pinta un dibujo o añade imágenes; cada textura guarda su lápiz para seguir editándola cuando quieras.</li>
          <li><span className="text-primary-glow">SCRIPTS</span> · añade bloques de eventos (onStart, onCollide) para dar vida a las entidades.</li>
          <li><span className="text-primary-glow">ESCENAS</span> · renombra en línea, duplica con ⧉, escala ×N desde el inspector.</li>
          <li><span className="text-primary-glow">DATOS</span> · exporta/importa el proyecto como JSON. Guarda automáticamente.</li>
        </ul>
        <button onClick={onClose} className="w-full mt-2 py-2.5 rounded-xl bg-primary/20 border border-primary/50 text-primary-glow font-display text-xs tracking-widest active:scale-[0.98] transition">ENTENDIDO</button>
      </div>
    </div>
  );
}

function DialogEditor({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const [open, setOpen] = useState(false);
  const d = entity.dialog ?? null;
  const lines = d?.lines ?? [];
  const setDialog = (patch: Partial<NonNullable<Entity["dialog"]>>) => {
    const base = d ?? { lines: [], trigger: "interact" as const };
    onUpdate({ dialog: { ...base, ...patch } });
  };
  const addLine = () => {
    const newLine = { id: uid(), text: "", speaker: "" };
    setDialog({ lines: [...lines, newLine] });
  };
  const removeLine = (id: string) => setDialog({ lines: lines.filter(l => l.id !== id) });
  const updateLine = (id: string, patch: Partial<typeof lines[number]>) =>
    setDialog({ lines: lines.map(l => l.id === id ? { ...l, ...patch } : l) });
  const moveLine = (id: string, dir: -1 | 1) => {
    const idx = lines.findIndex(l => l.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[idx], next[j]] = [next[j], next[idx]];
    setDialog({ lines: next });
  };

  return (
    <>
      <button
        onClick={() => { if (!d) setDialog({ lines: [{ id: uid(), text: "", speaker: "" }] }); setOpen(true); }}
        className="w-full py-2 rounded-md panel border border-border text-xs font-display tracking-widest text-primary-glow glow-border flex items-center justify-center gap-2"
      >
        DIÁLOGO {d ? `· ${lines.length}` : ""}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[540px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Diálogo · {entity.kind}</DialogTitle>
            <DialogDescription>Lo dice el personaje cuando el jugador lo activa.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="col-span-3">
              <label className="text-[10px] font-display tracking-widest text-muted-foreground">DISPARADOR</label>
              <select
                value={d?.trigger ?? "interact"}
                onChange={e => setDialog({ trigger: e.target.value as "touch" | "interact" | "auto" })}
                className="w-full mt-1 bg-input/60 border border-border rounded-md px-2 py-2 text-xs font-mono"
              >
                <option value="interact">Al pulsar SALTAR sobre él</option>
                <option value="touch">Al tocarlo</option>
                <option value="auto">Al empezar la escena</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs col-span-3">
              <input type="checkbox" checked={!!d?.pausesGame} onChange={e => setDialog({ pausesGame: e.target.checked })} />
              <span>Pausar el juego mientras habla</span>
            </label>
            <label className="flex items-center gap-2 text-xs col-span-3">
              <input type="checkbox" checked={!!d?.once} onChange={e => setDialog({ once: e.target.checked })} />
              <span>Reproducir solo una vez</span>
            </label>
          </div>

          <div className="flex-1 overflow-auto space-y-2 mt-2 pr-1">
            {lines.map((l, i) => (
              <div key={l.id} className="panel rounded-md p-2 border border-border space-y-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-muted-foreground w-6">#{i + 1}</span>
                  <input
                    value={l.speaker ?? ""}
                    onChange={e => updateLine(l.id, { speaker: e.target.value })}
                    placeholder="Nombre (opcional)"
                    className="flex-1 bg-input/60 border border-border rounded px-2 py-1 text-xs"
                  />
                  <button onClick={() => moveLine(l.id, -1)} className="w-7 h-7 grid place-items-center rounded hover:bg-muted"><ArrowUp size={12} /></button>
                  <button onClick={() => moveLine(l.id, 1)} className="w-7 h-7 grid place-items-center rounded hover:bg-muted"><ArrowDown size={12} /></button>
                  <button onClick={() => removeLine(l.id)} className="w-7 h-7 grid place-items-center rounded text-destructive/70 hover:text-destructive"><Trash2 size={12} /></button>
                </div>
                <textarea
                  value={l.text}
                  onChange={e => updateLine(l.id, { text: e.target.value })}
                  placeholder="Escribe lo que dice…"
                  rows={2}
                  className="w-full bg-input/60 border border-border rounded px-2 py-1.5 text-sm resize-y"
                />
              </div>
            ))}
            {lines.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">Sin líneas de diálogo aún.</div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={addLine} className="flex-1 py-2 rounded-md bg-primary/15 border border-primary/40 text-primary-glow font-display text-[10px] tracking-widest flex items-center justify-center gap-1">
              <Plus size={12} /> AÑADIR LÍNEA
            </button>
            {d && (
              <button
                onClick={() => { onUpdate({ dialog: null }); setOpen(false); }}
                className="py-2 px-3 rounded-md bg-destructive/15 border border-destructive/40 text-destructive font-display text-[10px] tracking-widest"
              >
                QUITAR
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HitboxEditor({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const enabled = !!entity.hitbox;
  const hb: Hitbox = entity.hitbox ?? { x: 0, y: 0, w: entity.w, h: entity.h };
  const set = (patch: Partial<Hitbox>) => onUpdate({ hitbox: { ...hb, ...patch } });

  return (
    <div className="mt-1 panel rounded-md border border-border/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-display text-[11px] tracking-widest text-primary-glow">▣ HITBOX</span>
        <Toggle
          label={enabled ? "Activado" : "Desactivado"}
          on={enabled}
          onChange={(v) => onUpdate({ hitbox: v ? { x: 0, y: 0, w: entity.w, h: entity.h } : null })}
        />
      </div>
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Slider label="HB X" value={hb.x} min={-entity.w} max={entity.w} step={1} onChange={v => set({ x: v })} />
            <Slider label="HB Y" value={hb.y} min={-entity.h} max={entity.h} step={1} onChange={v => set({ y: v })} />
            <Slider label="HB W" value={hb.w} min={1} max={entity.w * 2} step={1} onChange={v => set({ w: v })} />
            <Slider label="HB H" value={hb.h} min={1} max={entity.h * 2} step={1} onChange={v => set({ h: v })} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => set({ x: 0, y: 0, w: entity.w, h: entity.h })}
              className="py-1.5 rounded border border-border text-muted-foreground font-display text-[10px] tracking-widest"
            >RELLENAR</button>
            <button
              onClick={() => set({
                x: Math.round(entity.w * 0.15),
                y: Math.round(entity.h * 0.1),
                w: Math.round(entity.w * 0.7),
                h: Math.round(entity.h * 0.85),
              })}
              className="py-1.5 rounded border border-border text-muted-foreground font-display text-[10px] tracking-widest"
            >SHRINK 80%</button>
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">Arrastra el rectángulo rosa en el escenario para moverlo, o sus esquinas para redimensionarlo.</div>
        </>
      )}
    </div>
  );
}

function BehaviorsPanel({ ent, onUpdate }: { ent: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="text-[10px] font-display tracking-widest text-primary-glow">BEHAVIORS</div>

      {/* Moving platform */}
      <div className="panel rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display tracking-widest text-muted-foreground">MOVING</span>
          <button
            onClick={() => onUpdate({ moving: ent.moving ? null : { axis: "x", range: 120, speed: 80 } })}
            className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
          >{ent.moving ? "OFF" : "ON"}</button>
        </div>
        {ent.moving && (
          <>
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => onUpdate({ moving: { ...ent.moving!, axis: "x" } })}
                className={`py-1 rounded text-[10px] font-display tracking-widest border ${ent.moving.axis === "x" ? "bg-primary/20 border-primary" : "border-border"}`}>X</button>
              <button onClick={() => onUpdate({ moving: { ...ent.moving!, axis: "y" } })}
                className={`py-1 rounded text-[10px] font-display tracking-widest border ${ent.moving.axis === "y" ? "bg-primary/20 border-primary" : "border-border"}`}>Y</button>
            </div>
            <Slider label="Rango" value={ent.moving.range} min={20} max={800} step={10}
              onChange={v => onUpdate({ moving: { ...ent.moving!, range: v } })} />
            <Slider label="Velocidad" value={ent.moving.speed} min={10} max={400} step={10}
              onChange={v => onUpdate({ moving: { ...ent.moving!, speed: v } })} />
          </>
        )}
      </div>

      {/* Crumble */}
      <div className="panel rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display tracking-widest text-muted-foreground">CRUMBLE</span>
          <button
            onClick={() => onUpdate({ crumble: ent.crumble ? null : { delay: 0.6, respawn: 3 } })}
            className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
          >{ent.crumble ? "OFF" : "ON"}</button>
        </div>
        {ent.crumble && (
          <>
            <Slider label="Retardo s" value={Math.round(ent.crumble.delay * 10) / 10} min={0.1} max={3} step={0.1}
              onChange={v => onUpdate({ crumble: { ...ent.crumble!, delay: v } })} />
            <Slider label="Reaparecer s" value={ent.crumble.respawn} min={0} max={10} step={0.5}
              onChange={v => onUpdate({ crumble: { ...ent.crumble!, respawn: v } })} />
          </>
        )}
      </div>

      {/* Spring */}
      <div className="panel rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display tracking-widest text-muted-foreground">SPRING</span>
          <button
            onClick={() => onUpdate({ spring: ent.spring ? null : { force: 820 } })}
            className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
          >{ent.spring ? "OFF" : "ON"}</button>
        </div>
        {ent.spring && (
          <Slider label="Fuerza" value={ent.spring.force} min={200} max={1600} step={20}
            onChange={v => onUpdate({ spring: { force: v } })} />
        )}
      </div>

      {/* Patrol (enemy) */}
      {ent.kind === "enemy" && (
        <div className="panel rounded-md p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">PATROL</span>
            <button
              onClick={() => onUpdate({ patrol: ent.patrol ? null : { range: 120 } })}
              className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
            >{ent.patrol ? "OFF" : "ON"}</button>
          </div>
          {ent.patrol && (
            <Slider label="Rango" value={ent.patrol.range} min={20} max={600} step={10}
              onChange={v => onUpdate({ patrol: { range: v } })} />
          )}
        </div>
      )}

      {/* Coin/pickup options */}
      {ent.collectible && (
        <div className="panel rounded-md p-2 space-y-1.5">
          <Slider label="Valor" value={ent.value ?? 10} min={1} max={100} step={1}
            onChange={v => onUpdate({ value: v })} />
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">POWER-UP</div>
          <div className="grid grid-cols-4 gap-1">
            {(["none","speed","djump","invuln"] as const).map(p => (
              <button key={p}
                onClick={() => onUpdate({ powerup: p === "none" ? null : p })}
                className={`py-1 rounded text-[10px] font-display tracking-widest border ${(ent.powerup ?? "none") === p ? "bg-primary/20 border-primary" : "border-border"}`}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function SceneBgImage({ scene, onChange }: { scene: Scene; onChange: (s: Scene) => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="panel rounded-md p-2 space-y-2">
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.bgImage")}</div>
      {scene.bgImage && (
        <div className="relative w-full h-24 rounded overflow-hidden border border-border bg-background">
          <img src={scene.bgImage} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => ref.current?.click()}
          className="py-1.5 rounded border border-border text-[10px] font-display tracking-widest text-primary-glow"
        >{t("scene.bgImagePick")}</button>
        <button
          onClick={() => onChange({ ...scene, bgImage: null })}
          className="py-1.5 rounded border border-border text-[10px] font-display tracking-widest text-muted-foreground"
        >{t("scene.bgImageClear")}</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(["cover","contain","stretch","tile"] as const).map(m => (
          <button key={m}
            onClick={() => onChange({ ...scene, bgImageMode: m })}
            className={`py-1 rounded text-[9px] font-display tracking-widest border ${
              (scene.bgImageMode ?? "cover") === m ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
            }`}
          >{m.toUpperCase()}</button>
        ))}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const url = await fileToDataURL(f);
          onChange({ ...scene, bgImage: url });
          if (ref.current) ref.current.value = "";
        }}
      />
    </div>
  );
}

function ParticlesButton({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const has = !!entity.emitter;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full py-2 rounded-md font-display text-[10px] tracking-widest border ${
          has ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
        }`}
      >✦ {t("inspector.particles")}{has ? " · ON" : ""}</button>
      {open && (
        <ParticleEditor
          entity={entity}
          onUpdate={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ParticleEditor({ entity, onUpdate, onClose }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void; onClose: () => void }) {
  const t = useT();
  // If the entity has no emitter yet, the toggle must reflect that (OFF) so
  // turning it ON actually persists an emitter. Previously the default
  // {enabled:true} made the toggle appear ON while no emitter was saved,
  // so the user had to flip it off then on again to make it work.
  const hasEmitter = !!entity.emitter;
  const em = entity.emitter ?? {
    enabled: false, rate: 20, lifetime: 1, speed: 80,
    direction: 270, spread: 40, size: 4, gravity: 0, color: "#7dd3fc",
  };
  const upd = (patch: Partial<typeof em>) =>
    onUpdate({ emitter: { ...em, ...patch } });


  // Live preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number };
    const ps: P[] = [];
    let acc = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      acc += (em.rate || 0) * dt;
      while (acc >= 1) {
        acc -= 1;
        const dir = ((em.direction || 0) + (Math.random() - 0.5) * (em.spread || 0)) * Math.PI / 180;
        const sp = em.speed || 80;
        ps.push({ x: c.width / 2, y: c.height / 2, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, life: em.lifetime || 1, max: em.lifetime || 1 });
      }
      ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, c.width, c.height);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (em.gravity ?? 0) * dt;
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = em.color || "#7dd3fc";
        ctx.fillRect(p.x - (em.size || 4) / 2, p.y - (em.size || 4) / 2, em.size || 4, em.size || 4);
      }
      ctx.globalAlpha = 1;
      // direction arrow
      const cx = c.width / 2, cy = c.height / 2;
      const dr = (em.direction || 0) * Math.PI / 180;
      ctx.strokeStyle = "rgba(125,211,252,0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(dr) * 30, cy + Math.sin(dr) * 30); ctx.stroke();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [em.rate, em.direction, em.spread, em.speed, em.lifetime, em.gravity, em.size, em.color]);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-2">
      <div className="panel glow-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-display text-sm tracking-widest text-primary-glow">✦ {t("inspector.particles")}</div>
          <button onClick={onClose} className="text-xs font-display tracking-widest text-muted-foreground">✕</button>
        </div>

        <Toggle label={t("particles.enable")} on={hasEmitter && em.enabled} onChange={v => upd({ enabled: v })} />

        <div className="rounded-md overflow-hidden border border-border bg-background">
          <canvas ref={canvasRef} width={320} height={180} className="w-full block" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Slider label={t("particles.rate")} value={em.rate} min={0} max={200} step={1} onChange={v => upd({ rate: v })} />
          <Slider label={t("particles.lifetime")} value={Math.round(em.lifetime * 10) / 10} min={0.1} max={6} step={0.1} onChange={v => upd({ lifetime: v })} />
          <Slider label={t("particles.speed")} value={em.speed} min={0} max={600} step={5} onChange={v => upd({ speed: v })} />
          <Slider label={t("particles.size")} value={em.size} min={1} max={24} step={1} onChange={v => upd({ size: v })} />
          <Slider label={t("particles.direction")} value={em.direction} min={0} max={360} step={5} onChange={v => upd({ direction: v })} />
          <Slider label={t("particles.spread")} value={em.spread} min={0} max={360} step={5} onChange={v => upd({ spread: v })} />
          <Slider label={t("particles.gravity")} value={em.gravity} min={-600} max={1200} step={20} onChange={v => upd({ gravity: v })} />
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[0, 45, 90, 135, 180, 225, 270, 315].map(d => (
            <button key={d}
              onClick={() => upd({ direction: d })}
              className={`py-1 rounded text-[10px] font-display tracking-widest border ${
                em.direction === d ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
              }`}
            >{d}°</button>
          ))}
        </div>

        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("particles.color")}</label>
          <input type="color" value={em.color}
            onChange={e => upd({ color: e.target.value })}
            className="w-full h-10 rounded-md bg-transparent border border-border mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onUpdate({ emitter: null })}
            className="py-2 rounded-md border border-destructive/50 text-destructive font-display text-[10px] tracking-widest"
          >QUITAR</button>
          <button
            onClick={onClose}
            className="py-2 rounded-md bg-primary text-primary-foreground font-display text-[10px] tracking-widest"
          >{t("particles.close")}</button>
        </div>
      </div>
    </div>
  );
}

function LayersPanel({
  scene,
  onChangeScene,
  selectedId,
  onSelect,
}: {
  scene: import("@/lib/engine/core").Scene;
  onChangeScene: (s: import("@/lib/engine/core").Scene) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  // Render sorted by z desc (top layer first) — but reorder operates on the
  // underlying entities array (z is the source of truth for draw order).
  // Los hijos se listan justo debajo de su padre y sangrados, para que el
  // árbol se lea de un vistazo.
  const byZ = (a: Entity, b: Entity) => (b.z ?? 0) - (a.z ?? 0);
  const childrenSorted = (parentId: string | null) =>
    scene.entities.filter(e => (e.parentId ?? null) === parentId).sort(byZ);
  const sorted: Entity[] = [];
  const seenEntities = new Set<string>();
  const pushTree = (e: Entity) => {
    if (seenEntities.has(e.id)) return; // corta ciclos de un guardado incoherente
    seenEntities.add(e.id);
    sorted.push(e);
    for (const child of childrenSorted(e.id)) pushTree(child);
  };
  for (const root of childrenSorted(null)) pushTree(root);
  for (const e of scene.entities) if (!seenEntities.has(e.id)) sorted.push(e);
  const patch = (id: string, p: Partial<Entity>) =>
    onChangeScene({ ...scene, entities: scene.entities.map(e => e.id === id ? { ...e, ...p } : e) });
  const bumpZ = (id: string, dir: 1 | -1) => {
    const e = scene.entities.find(x => x.id === id);
    if (!e) return;
    const cur = e.z ?? 0;
    patch(id, { z: Math.max(-20, Math.min(20, cur + dir)) });
  };
  const toTop = (id: string) => {
    const maxZ = scene.entities.reduce((m, e) => Math.max(m, e.z ?? 0), 0);
    patch(id, { z: Math.min(20, maxZ + 1) });
  };
  const toBottom = (id: string) => {
    const minZ = scene.entities.reduce((m, e) => Math.min(m, e.z ?? 0), 0);
    patch(id, { z: Math.max(-20, minZ - 1) });
  };
  const remove = (id: string) => {
    const e = scene.entities.find(x => x.id === id);
    if (!e || isPlayerEntity(e)) return;
    // Igual que en el lienzo: un padre se lleva su rama. Deshacible con Ctrl+Z.
    onChangeScene(removeEntityWithChildren(scene, id));
    if (selectedId === id) onSelect(null);
  };
  return (
    <div className="mt-2 space-y-1">
      {sorted.length === 0 && (
        <div className="text-[10px] font-mono text-muted-foreground px-2 py-3 text-center border border-dashed border-border rounded">
          NO LAYERS
        </div>
      )}
      {sorted.map(e => {
        const isSel = e.id === selectedId;
        const visible = e.visible ?? true;
        const locked = !!e.locked;
        const depth = hierarchyDepth(scene, e);
        return (
          <div
            key={e.id}
            className={`group flex items-center gap-1 panel rounded-md pl-1.5 pr-1 py-1 text-xs border ${
              isSel ? "border-primary/70 bg-primary/10" : "border-border/40"
            }`}
            style={{ marginLeft: Math.min(depth, 6) * 12 }}
          >
            <button
              onClick={() => bumpZ(e.id, 1)}
              title="Adelante"
              className="w-5 h-5 grid place-items-center rounded text-muted-foreground hover:text-primary-glow"
            ><ArrowUp size={11} /></button>
            <button
              onClick={() => bumpZ(e.id, -1)}
              title="Atrás"
              className="w-5 h-5 grid place-items-center rounded text-muted-foreground hover:text-primary-glow"
            ><ArrowDown size={11} /></button>
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: e.color, boxShadow: visible ? `0 0 8px ${e.color}` : undefined, opacity: visible ? 1 : 0.3 }}
            />
            <button
              onClick={() => onSelect(e.id)}
              className="flex-1 flex items-center gap-1.5 text-left min-w-0"
            >
              {depth > 0 && <span className="font-mono text-[9px] text-accent shrink-0">└</span>}
              <span className="font-display tracking-wider text-[10px] truncate">{e.kind.toUpperCase()}</span>
              {e.parentId && <span className="font-mono text-[8px] text-accent/80 shrink-0">hijo</span>}
              <span className="ml-auto font-mono text-[9px] text-muted-foreground shrink-0">z{e.z ?? 0}</span>
            </button>
            <button
              onClick={() => patch(e.id, { visible: !visible })}
              title={visible ? "Ocultar" : "Mostrar"}
              className={`w-6 h-6 grid place-items-center rounded ${visible ? "text-primary-glow" : "text-muted-foreground/50"}`}
            >{visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
            <button
              onClick={() => patch(e.id, { locked: !locked })}
              title={locked ? "Desbloquear" : "Bloquear"}
              className={`w-6 h-6 grid place-items-center rounded ${locked ? "text-destructive" : "text-muted-foreground/60"}`}
            >{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
            <button
              onClick={() => toTop(e.id)}
              title="Mover al frente"
              className="hidden sm:grid w-6 h-6 place-items-center rounded text-muted-foreground hover:text-primary-glow"
            ><ChevronsUp size={12} /></button>
            <button
              onClick={() => toBottom(e.id)}
              title="Mover al fondo"
              className="hidden sm:grid w-6 h-6 place-items-center rounded text-muted-foreground hover:text-primary-glow"
            ><ChevronsDown size={12} /></button>
            {!isPlayerEntity(e) && (
              <button
                onClick={() => remove(e.id)}
                title="Borrar"
                className="w-6 h-6 grid place-items-center rounded text-destructive/70 hover:text-destructive"
              ><Trash2 size={12} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SceneLayersPanel({
  scene,
  onChangeScene,
}: {
  scene: Scene;
  onChangeScene: (s: Scene) => void;
}) {
  const layers = scene.layers ?? [];
  const setLayers = (next: SceneLayer[]) => onChangeScene({ ...scene, layers: next });
  const update = (id: string, patch: Partial<SceneLayer>) =>
    setLayers(layers.map(l => (l.id === id ? { ...l, ...patch } : l)));
  // Crear y borrar capas: antes solo existía la «Principal» y no había forma
  // de añadir más desde el selector. Al borrar, sus objetos se reasignan a otra
  // capa para no quedar huérfanos.
  const addLayer = () => onChangeScene(addSceneLayer(scene).scene);
  const removeLayer = (id: string) => {
    if (layers.length <= 1) return;
    onChangeScene(removeSceneLayer(scene, id));
  };

  // Profundidad 1-10: 1 es lo más al frente (delante de la cámara), 10 lo más atrás.
  // Regla pedida: ≤5 delante, >5 detrás. Mapeo: z = 5 - depth  →  depth 1 => z 4 (frente), 5 => 0, 6 => -1, 10 => -4.
  const depthFromZ = (z: number) => Math.max(1, Math.min(10, 5 - Math.round(z)));
  const zFromDepth = (d: number) => 5 - Math.max(1, Math.min(10, Math.round(d)));

  return (
    <div className="panel rounded-xl p-3 space-y-3 view-fade border border-border/40">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-display tracking-[0.14em] text-ink-2 font-semibold">CAPAS · {layers.length}</div>
          <div className="text-[9px] font-mono text-muted-foreground">1 delante · 10 detrás</div>
        </div>
        <button
          onClick={addLayer}
          className="shrink-0 h-9 px-3 rounded-xl btn-grad text-primary-foreground font-display text-[10px] font-semibold tracking-widest inline-flex items-center gap-1.5 active:scale-95 transition"
        ><Plus size={13} /> NUEVA CAPA</button>
      </div>
      <div className="space-y-3">
        {[...layers].sort((a, b) => b.z - a.z).map(l => {
          const count = scene.entities.filter(e => (e.layerId ?? DEFAULT_LAYER_ID) === l.id).length;
          const depth = depthFromZ(l.z);
          const delante = depth <= 5;
          return (
            <div key={l.id} className="rounded-xl border border-border/50 bg-card p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <input
                    value={l.name}
                    onChange={e => update(l.id, { name: e.target.value })}
                    aria-label="Nombre de la capa"
                    className="w-full bg-transparent text-xs font-display font-semibold rounded-md px-1 py-0.5 focus:outline-none focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 transition"
                  />
                  <div className="text-[10px] font-mono text-muted-foreground px-1">
                    {count} objeto{count !== 1 ? "s" : ""} · {delante ? "delante de cámara" : "detrás de cámara"}
                  </div>
                </div>
                <button
                  onClick={() => update(l.id, { visible: !l.visible })}
                  aria-label={l.visible ? "Ocultar capa" : "Mostrar capa"}
                  title={l.visible ? "Ocultar capa" : "Mostrar capa"}
                  className={`shrink-0 w-9 h-9 grid place-items-center rounded-xl border transition active:scale-95 ${
                    l.visible ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/40 border-border text-muted-foreground"
                  }`}
                >
                  {l.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => removeLayer(l.id)}
                  disabled={layers.length <= 1}
                  aria-label="Borrar capa"
                  title={layers.length <= 1 ? "La escena necesita al menos una capa" : "Borrar capa"}
                  className="shrink-0 w-9 h-9 grid place-items-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-display tracking-widest text-muted-foreground">PROFUNDIDAD</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      delante ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50 border-border text-ink-2"
                    }`}
                  >
                    {depth} · {delante ? "delante" : "detrás"}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={depth}
                  onChange={e => update(l.id, { z: zFromDepth(Number(e.target.value)) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-1">
                  <span>1 delante</span>
                  <span>5</span>
                  <span>10 detrás</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground text-center">
        ≤5 se dibuja delante de la cámara · &gt;5 se dibuja detrás. La IA conoce este mapeo para programar scripts de profundidad.
      </p>
    </div>
  );
}
