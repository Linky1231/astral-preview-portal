import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Plus, Trash2, Upload } from "lucide-react";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteProjectById,
  listDraftProjects,
  type ProjectMeta,
} from "@/lib/engine/storage";

/**
 * Borradores: proyectos guardados que todavía no se han publicado.
 * Se abre desde el menú lateral (sección CREACIÓN).
 */
export function DraftsDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Abre el diálogo de creación (nuevo juego). */
  onCreate?: () => void;
}) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ProjectMeta[]>([]);
  // Borrado en dos pasos: el aviso nativo del navegador bloqueaba la pestaña y
  // rompía el aspecto de la app.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => setDrafts(listDraftProjects());

  // Al abrirse relee los borradores del almacenamiento local (ajuste durante el
  // render, sin efectos que provoquen renders en cascada).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) refresh();
  }

  const openDraft = (id: string) => {
    onOpenChange(false);
    navigate({ to: "/editor", search: { mode: "mini", p: id } });
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      deleteProjectById(pendingDelete.id);
      refresh();
    }
    setPendingDelete(null);
  };

  const formatWhen = (at: number) =>
    new Date(at).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} /> Borradores
          </DialogTitle>
          <DialogDescription>
            Proyectos guardados que todavía no has publicado. Sigue donde lo dejaste o
            publícalos cuando estén listos.
          </DialogDescription>
        </DialogHeader>

        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-input/20 px-3 py-6 text-center">
            <p className="text-[12px] text-muted-foreground">
              No tienes borradores todavía.
            </p>
            {onCreate && (
              <button
                type="button"
                onClick={() => { onOpenChange(false); onCreate(); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl btn-grad px-3 py-2 text-[11px] font-display tracking-widest text-primary-foreground active:scale-95 transition"
              >
                <Plus size={13} /> CREAR JUEGO
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2 max-h-[52vh] overflow-y-auto no-scrollbar">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-input/30 px-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <FileText size={16} />
                </span>
                <button
                  type="button"
                  onClick={() => openDraft(d.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[13px] font-display font-semibold text-foreground">
                    {d.name}
                  </span>
                  <span className="block text-[10px] font-mono text-muted-foreground">
                    guardado {formatWhen(d.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openDraft(d.id)}
                  title="Abrir en el editor"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-2 hover:border-primary/40 hover:text-primary active:scale-95 transition"
                >
                  <Upload size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete({ id: d.id, name: d.name })}
                  title="Borrar borrador"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-2 hover:border-destructive/40 hover:text-destructive active:scale-95 transition"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[10px] leading-snug text-muted-foreground/70">
          Un proyecto deja de ser borrador cuando publicas el juego desde el editor.
        </p>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={pendingDelete !== null}
      title={pendingDelete ? `¿Borrar el borrador «${pendingDelete.name}»?` : "¿Borrar este borrador?"}
      description="Esta acción no se puede deshacer."
      confirmLabel="BORRAR"
      cancelLabel="CANCELAR"
      destructive
      onConfirm={confirmDelete}
      onCancel={() => setPendingDelete(null)}
    />
    </>
  );
}
