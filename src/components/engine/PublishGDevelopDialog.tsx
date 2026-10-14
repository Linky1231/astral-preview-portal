import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2, Rocket, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addWebGameLink,
  GDEVELOP_EDITOR_URL,
  removeWebGameLink,
  useWebGameLinks,
  type WebGameLink,
} from "@/lib/engine/gdevelop-publish";

/**
 * Publicar como juego web (GDevelop → gd.games).
 *
 * La compilación la hacen los servidores de GDevelop desde el propio editor
 * (Share → gd.games → Publish game), por lo que este diálogo guía el proceso
 * y guarda el enlace público que resulta para tenerlo siempre a mano.
 */
const STEPS = [
  "Entra con tu cuenta de GDevelop (es gratis) dentro del editor.",
  'Pulsa "Share" en la barra superior del editor.',
  'Elige "gd.games" y pulsa "Publish game".',
  "Copia el enlace que aparece (https://gd.games/…) y pégalo aquí abajo.",
];

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Respaldo si el navegador bloquea el portapapeles (permissions policy).
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function PublishGDevelopDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const links = useWebGameLinks();
  const [title, setTitle] = useState("Mi juego web");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const save = () => {
    const next = addWebGameLink(title, url);
    if (!next) {
      setErr("Ese enlace no parece válido. Pega la URL completa (https://gd.games/…).");
      return;
    }
    setErr(null);
    setUrl("");
    toast.success("Enlace del juego guardado");
  };

  const copy = async (link: WebGameLink) => {
    const ok = await copyToClipboard(link.url);
    if (!ok) {
      toast.error("No se pudo copiar el enlace");
      return;
    }
    setCopiedId(link.id);
    toast.success("Enlace copiado");
    window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 1600);
  };

  const remove = (link: WebGameLink) => {
    removeWebGameLink(link.id);
    toast.success("Enlace eliminado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket size={18} /> Publicar como juego web
          </DialogTitle>
          <DialogDescription>
            GDevelop compila tu juego y lo publica en gd.games con un enlace público que cualquiera
            puede jugar. Al terminar, pega el enlace aquí y lo guardamos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Guía paso a paso */}
          <div className="rounded-xl border border-border/70 bg-input/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-display tracking-widest text-muted-foreground">
              <Link2 size={12} className="text-primary" /> CÓMO SE PUBLICA
            </div>
            <ol className="mt-2 space-y-2">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full grad-brand text-[10px] font-display font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="text-[12px] leading-snug text-foreground/85">{step}</span>
                </li>
              ))}
            </ol>
            <a
              href={GDEVELOP_EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-input/50 px-4 py-2.5 text-[12px] font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors active:scale-[0.99]"
            >
              Abrir el editor de GDevelop
              <ExternalLink size={13} />
            </a>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
              La compilación la ejecuta GDevelop con tu cuenta desde su propio editor; Asternal
              guarda el enlace para que no se te pierda.
            </p>
          </div>

          {/* Guardar el enlace */}
          <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
            <label className="block">
              <span className="text-[10px] font-display tracking-widest text-muted-foreground">
                NOMBRE DEL JUEGO
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="w-full mt-1 bg-input/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-display tracking-widest text-muted-foreground">
                ENLACE DEL JUEGO
              </span>
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (err) setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder="https://gd.games/…"
                inputMode="url"
                className="w-full mt-1 bg-input/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            {err && <div className="text-xs text-destructive">{err}</div>}
            <button
              type="button"
              onClick={save}
              disabled={!url.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl grad-brand px-4 py-2.5 text-xs font-display tracking-widest text-primary-foreground active:scale-[0.99] transition disabled:opacity-50"
            >
              <Check size={14} /> GUARDAR ENLACE
            </button>
          </div>

          {/* Enlaces guardados */}
          <div>
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">
              TUS JUEGOS WEB
            </span>
            {links.length === 0 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                Todavía no has guardado ningún enlace. Publica el juego en gd.games y pega el
                enlace arriba.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-2">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center gap-2 rounded-xl border border-border/70 bg-input/30 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-display font-semibold text-foreground">
                        {link.title}
                      </div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[11px] text-primary/85 hover:text-primary transition-colors"
                      >
                        {link.url}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copy(link)}
                      title="Copiar enlace"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-2 hover:text-primary hover:border-primary/40 active:scale-95 transition"
                    >
                      {copiedId === link.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir juego"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-2 hover:text-primary hover:border-primary/40 active:scale-95 transition"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(link)}
                      title="Eliminar enlace"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-2 hover:text-destructive hover:border-destructive/40 active:scale-95 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl border border-border text-xs font-display tracking-widest active:scale-95 transition"
            >
              CERRAR
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
