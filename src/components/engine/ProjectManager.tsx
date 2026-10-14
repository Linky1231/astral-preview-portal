import { useEffect, useState } from "react";
import {
  listProjects,
  createProject,
  deleteProjectById,
  renameProject,
  duplicateProject,
  setCurrentProjectId,
  loadProjectById,
  saveProjectById,
  setProjectCloudId,
  getProjectCloudId,
  type ProjectMeta,
} from "@/lib/engine/storage";
import type { Project } from "@/lib/engine/core";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import { cloudSaveProject, cloudListProjects, cloudDeleteProject, type CloudProject } from "@/lib/social/api";
import { syncAllProjects } from "@/lib/engine/cloud-sync";
import { ArrowLeft, Cloud, CloudDownload, CloudUpload, FolderOpen, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";


function timeAgo(t: number) {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function ProjectManager({
  onOpen,
  onClose,
}: {
  onOpen: (id: string) => void;
  onClose?: () => void;
}) {
  const [items, setItems] = useState<ProjectMeta[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [cloudList, setCloudList] = useState<CloudProject[]>([]);
  const [cloudBusy, setCloudBusy] = useState<string | null>(null);
  const [cloudErr, setCloudErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const refresh = () => setItems(listProjects());
  const refreshCloud = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (!session) { setCloudList([]); return; }
      setCloudList(await cloudListProjects());
    } catch (e) { setCloudErr((e as Error).message); }
  };

  /** Sincronización automática al abrir: sube lo local sin respaldo y descarga lo de la nube. */
  const runAutoSync = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (!session) return;
      setSyncing(true); setCloudErr(null);
      const r = await syncAllProjects();
      refresh();
      setCloudList(await cloudListProjects());
      setSyncNote(r.pushed > 0 || r.imported > 0
        ? `${r.pushed} subido${r.pushed === 1 ? "" : "s"} · ${r.imported} descargado${r.imported === 1 ? "" : "s"}`
        : null);
    } catch (e) { setCloudErr((e as Error).message); }
    finally { setSyncing(false); }
  };

  useEffect(() => { refresh(); refreshCloud(); runAutoSync(); }, []);

  const pushLocalToCloud = async (m: ProjectMeta) => {
    setCloudBusy(m.id); setCloudErr(null);
    try {
      const p = loadProjectById(m.id); if (!p) return;
      const cloudId = getProjectCloudId(m.id);
      const saved = await cloudSaveProject({ id: cloudId, name: p.name || m.name, data: p });
      if (!cloudId) setProjectCloudId(m.id, saved.id);
      await refreshCloud();
    } catch (e) { setCloudErr((e as Error).message); }
    finally { setCloudBusy(null); }
  };

  const pullCloudToLocal = async (c: CloudProject) => {
    setCloudBusy(c.id); setCloudErr(null);
    try {
      const existing = items.find(m => getProjectCloudId(m.id) === c.id);
      const localId = existing ? existing.id : createProject(c.name);
      saveProjectById(localId, c.data as Project);
      setProjectCloudId(localId, c.id);
      refresh();
    } catch (e) { setCloudErr((e as Error).message); }
    finally { setCloudBusy(null); }
  };

  const removeCloud = async (c: CloudProject) => {
    if (!confirm(`¿Borrar "${c.name}" de la nube? Tu copia local no se borra.`)) return;
    setCloudBusy(c.id);
    try { await cloudDeleteProject(c.id); await refreshCloud(); }
    finally { setCloudBusy(null); }
  };


  const handleNew = () => {
    const name = prompt("Nombre del nuevo proyecto:", "Nuevo Juego");
    if (name === null) return;
    const id = createProject(name);
    onOpen(id);
  };

  const handleOpen = (id: string) => {
    setCurrentProjectId(id);
    onOpen(id);
  };

  const handleDuplicate = (id: string) => {
    const nid = duplicateProject(id);
    if (nid) refresh();
  };

  const handleDelete = (m: ProjectMeta) => {
    if (!confirm(`¿Borrar "${m.name}"? Esta acción no se puede deshacer.`)) return;
    deleteProjectById(m.id);
    refresh();
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) renameProject(id, renameValue.trim());
    setRenamingId(null);
    refresh();
  };

  const handleExport = (m: ProjectMeta) => {
    const p = loadProjectById(m.id);
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${m.name.replace(/[^a-z0-9\-_]+/gi, "_")}.asternal.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const p = JSON.parse(text) as Project;
        if (!p.scenes?.length) throw new Error("Archivo inválido");
        const id = createProject(p.name || file.name.replace(/\.json$/i, ""));
        saveProjectById(id, p);
        refresh();
      } catch (e) {
        alert("No se pudo importar: " + String(e));
      }
    };
    input.click();
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-3 px-4 h-14 shrink-0 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="grid place-items-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-sm font-semibold tracking-wide leading-none">Proyectos</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {items.length} {items.length === 1 ? "proyecto" : "proyectos"} en este dispositivo
            </p>
          </div>
        </div>
        {syncing && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Loader2 size={13} className="animate-spin" />
            Sincronizando…
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
          {/* Proyectos locales */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <FolderOpen size={14} className="text-primary" />
              <span className="section-label">Este dispositivo</span>
            </div>
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Aún no tienes proyectos.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Crea tu primer juego con «Nuevo proyecto».</p>
              </div>
            ) : (
              items.map((m) => (
                <div
                  key={m.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2.5 transition-colors hover:border-border-strong"
                >
                  <button
                    onClick={() => handleOpen(m.id)}
                    className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center shrink-0 transition-colors hover:bg-primary/15"
                    aria-label="Abrir"
                  >
                    <FolderOpen size={18} className="text-primary" />
                  </button>
                  <div className="flex-1 min-w-0">
                    {renamingId === m.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(m.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm font-medium outline-none focus:border-primary/50"
                      />
                    ) : (
                      <button
                        onClick={() => handleOpen(m.id)}
                        className="block w-full text-left text-sm font-medium truncate hover:text-primary transition-colors"
                      >
                        {m.name}
                      </button>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      editado hace {timeAgo(m.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setRenamingId(m.id); setRenameValue(m.name); }}
                      className="grid place-items-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                      title="Renombrar"
                      aria-label="Renombrar"
                    ><Pencil size={14} /></button>
                    <button
                      onClick={() => handleDuplicate(m.id)}
                      className="grid place-items-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                      title="Duplicar"
                      aria-label="Duplicar"
                    >⧉</button>
                    <button
                      onClick={() => handleExport(m)}
                      className="grid place-items-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                      title="Exportar JSON"
                      aria-label="Exportar"
                    >⤓</button>
                    {signedIn && (
                      <button
                        onClick={() => pushLocalToCloud(m)}
                        disabled={cloudBusy === m.id}
                        className="grid place-items-center w-8 h-8 rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        title={getProjectCloudId(m.id) ? "Actualizar en la nube" : "Guardar en la nube"}
                        aria-label="Guardar en la nube"
                      >{cloudBusy === m.id ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}</button>
                    )}
                    <button
                      onClick={() => handleDelete(m)}
                      className="grid place-items-center w-8 h-8 rounded-md text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Borrar"
                      aria-label="Borrar"
                    ><Trash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </section>

          {/* Nube */}
          {signedIn && (
            <section className="space-y-2 pt-5 border-t border-border/70">
              <div className="flex items-center gap-2 px-1">
                <Cloud size={14} className="text-primary" />
                <span className="section-label">Asternal Sync · nube</span>
                <span className="ml-auto text-xs font-mono text-muted-foreground tabular-nums">{cloudList.length}</span>
              </div>
              {(syncNote || syncing) && (
                <div className="flex items-center gap-1.5 text-xs text-primary px-1">
                  {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  {syncing ? "Sincronizando con la nube…" : syncNote}
                </div>
              )}
              {cloudErr && <div className="text-xs text-destructive px-1">{cloudErr}</div>}
              {!hasSupabaseConfig() && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  ⚠ Modo local: tus juegos se guardan solo en este navegador. Para verlos en otro dispositivo,
                  conecta la nube con el icono ☁ del inicio (o el tab Keys) y entra con la misma cuenta.
                </div>
              )}
              {cloudList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                  Nada guardado en la nube todavía. Usa el icono <CloudUpload size={12} className="inline" /> para respaldar un proyecto y acceder a él desde cualquier dispositivo.
                </div>
              ) : (
                cloudList.map(c => {
                  const inLocal = items.some(m => getProjectCloudId(m.id) === c.id);
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2.5">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center shrink-0">
                        <Cloud size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {inLocal ? "sincronizado · " : "no descargado · "}actualizado hace {timeAgo(new Date(c.updated_at).getTime())}
                        </div>
                      </div>
                      <button
                        onClick={() => pullCloudToLocal(c)}
                        disabled={cloudBusy === c.id}
                        className="grid place-items-center w-8 h-8 rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        title={inLocal ? "Actualizar copia local" : "Descargar"}
                        aria-label="Descargar"
                      >{cloudBusy === c.id ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}</button>
                      <button
                        onClick={() => removeCloud(c)}
                        className="grid place-items-center w-8 h-8 rounded-md text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Borrar de la nube"
                        aria-label="Borrar de la nube"
                      ><Trash2 size={14} /></button>
                    </div>
                  );
                })
              )}
            </section>
          )}
          {!signedIn && (
            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
              Inicia sesión para sincronizar tus juegos en la nube y no perderlos al cambiar de dispositivo.
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-2">
          <button
            onClick={handleNew}
            className="btn-grad inline-flex items-center justify-center gap-1.5 rounded-lg h-11 text-sm font-semibold text-white active:scale-[0.98] transition-transform"
          >
            <Plus size={16} /> Nuevo proyecto
          </button>
          <button
            onClick={handleImport}
            className="rounded-lg h-11 border border-border bg-surface text-sm font-medium text-foreground hover:bg-muted/60 active:scale-[0.98] transition"
          >
            ⤒ Importar JSON
          </button>
        </div>
      </div>
    </div>
  );
}
