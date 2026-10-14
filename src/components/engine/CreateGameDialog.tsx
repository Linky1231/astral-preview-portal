import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowRight, Check, ExternalLink, FileCode2, FlaskConical,
  Gamepad2, Globe, ImagePlus, Loader2, Rocket, X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { publishWebGame } from "@/lib/social/api";
import { CREATE_GAME_FIELD_CLASS } from "@/lib/engine/create-game-field";
import { createProject } from "@/lib/engine/storage";
import {
  addWebGameLink, GDEVELOP_EDITOR_URL, normalizeGameUrl,
} from "@/lib/engine/gdevelop-publish";

/**
 * Botón «Crear»: en lugar de abrir una página completa, despliega esta
 * interfaz reducida con los motores disponibles.
 *
 *  1. Motor Asternal (nativo) → pide el nombre del juego y abre el editor.
 *  2. Asternal Beta → nuestro motor con las funciones nuevas en pruebas.
 *  3. Motor de GDevelop → título, descripción, icono y enlace del juego.
 *  4. Página existente → juego hecho con otro motor y publicado fuera.
 */

type Step = "engines" | "name" | "gdevelop" | "page";
type EngineId = "own" | "beta";

const ENGINES: {
  id: EngineId | "gdevelop" | "web";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tag?: string;
}[] = [
  {
    id: "own",
    title: "Motor Asternal",
    subtitle: "Escenas, entidades, scripts y publicación directa.",
    icon: <Gamepad2 size={18} />,
    tag: "NATIVO",
  },
  {
    id: "beta",
    title: "Asternal Beta",
    subtitle: "Las funciones nuevas del motor, todavía en pruebas.",
    icon: <FlaskConical size={18} />,
    tag: "PRUEBAS",
  },
  {
    id: "gdevelop",
    title: "Motor de GDevelop",
    subtitle: "Publica un juego hecho en GDevelop y comparte el enlace.",
    icon: <Rocket size={18} />,
    tag: "GDEVELOP",
  },
  {
    id: "web",
    title: "Publicar una página existente",
    subtitle: "Un juego con otro motor alojado en una página estática.",
    icon: <Globe size={18} />,
  },
];

export function CreateGameDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("engines");
  const [engine, setEngine] = useState<EngineId>("own");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Al abrirse vuelve al primer paso. Se ajusta durante el render (patrón
  // recomendado por React) para no provocar renders en cascada.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("engines");
      setEngine("own");
      setName("");
      setTitle("");
      setDescription("");
      setUrl("");
      setCoverFile(null);
      setCoverPreview(null);
      setErr(null);
      setBusy(false);
      setDone(false);
    }
  }

  const pickCover = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("La imagen no puede pesar más de 5MB"); return; }
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
    setErr(null);
  };

  const choose = (id: (typeof ENGINES)[number]["id"]) => {
    if (id === "own" || id === "beta") {
      setEngine(id);
      setStep("name");
      return;
    }
    setStep(id === "gdevelop" ? "gdevelop" : "page");
  };

  /** Crea el proyecto con el motor propio y abre el editor. */
  const createOwn = () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Ponle un nombre a tu juego"); return; }
    const id = createProject(trimmed);
    onOpenChange(false);
    toast.success(`«${trimmed}» listo para editar`);
    navigate({
      to: "/editor",
      search: { mode: "mini", p: id, beta: engine === "beta" ? true : undefined },
    });
  };

  const requireAuth = async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { onOpenChange(false); navigate({ to: "/auth" }); return false; }
    return true;
  };

  /** Publica un juego alojado fuera de Asternal (GDevelop o página estática). */
  const publishExternal = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) { setErr("El título es obligatorio"); return; }
    const safeUrl = normalizeGameUrl(url);
    if (!safeUrl) { setErr("Pega un enlace válido (https://…)"); return; }
    setBusy(true);
    setErr(null);
    try {
      if (!(await requireAuth())) return;
      if (step === "gdevelop") addWebGameLink(cleanTitle, safeUrl);
      await publishWebGame({
        title: cleanTitle,
        description: description.trim(),
        url: safeUrl,
        coverFile,
      });
      setDone(true);
      toast.success("Juego publicado");
      setTimeout(() => { onOpenChange(false); navigate({ to: "/" }); }, 700);
    } catch (e) {
      setErr((e as Error).message || "No se pudo publicar el juego.");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setErr(null);
    setStep(step === "name" || step === "gdevelop" || step === "page" ? "engines" : "engines");
  };

  const heading: Record<Step, string> = {
    engines: "Crear",
    name: engine === "beta" ? "Nuevo juego · Beta" : "Nuevo juego",
    gdevelop: "Publicar de GDevelop",
    page: "Publicar página existente",
  };

  const label = "text-[10px] font-display tracking-widest text-muted-foreground";
  const input = CREATE_GAME_FIELD_CLASS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {step === "engines" ? <Gamepad2 size={18} /> : <ArrowLeft size={18} />}
            {heading[step]}
          </DialogTitle>
          <DialogDescription>
            {step === "engines"
              ? "Elige con qué motor quieres trabajar o publica un juego ya hecho."
              : step === "name"
                ? "Ponle nombre: se guardará en tus borradores hasta que lo publiques."
                : "Rellena la ficha que verá la comunidad junto a tu juego."}
          </DialogDescription>
        </DialogHeader>

        {step !== "engines" && (
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 self-start text-[11px] font-medium text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft size={13} /> Volver a motores
          </button>
        )}

        {/* ─── Elección de motor ─── */}
        {step === "engines" && (
          <div className="space-y-2">
            {ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => choose(e.id)}
                className="w-full flex items-center gap-3 rounded-xl border border-border/70 bg-input/30 px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  {e.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-display font-semibold text-foreground">
                      {e.title}
                    </span>
                    {e.tag && (
                      <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[8px] font-display font-semibold tracking-wider text-accent">
                        {e.tag}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {e.subtitle}
                  </span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-muted-foreground/60" />
              </button>
            ))}

            <a
              href={GDEVELOP_EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-input/50 px-3 py-2 text-[11px] font-medium text-foreground/75 hover:border-primary/40 hover:text-primary transition"
            >
              Ir a GDevelop <ExternalLink size={12} />
            </a>
          </div>
        )}

        {/* ─── Nombre (motor propio) ─── */}
        {step === "name" && (
          <div className="space-y-3">
            <label className="block">
              <span className={label}>NOMBRE DEL JUEGO</span>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); if (err) setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") createOwn(); }}
                maxLength={80}
                autoFocus
                placeholder="Mi primer juego"
                className={input}
              />
            </label>
            {err && <div className="text-xs text-destructive">{err}</div>}
            <button
              type="button"
              onClick={createOwn}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl btn-grad px-4 py-2.5 text-xs font-display tracking-widest text-primary-foreground active:scale-[0.99] transition"
            >
              CREAR Y ABRIR EDITOR <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* ─── Ficha: GDevelop / página existente ─── */}
        {(step === "gdevelop" || step === "page") && (
          <div className="space-y-3">
            <div>
              <span className={label}>ICONO</span>
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative w-16 h-16 shrink-0 rounded-xl border border-border overflow-hidden bg-input/50 grid place-items-center active:scale-95 transition group"
                >
                  {coverPreview ? (
                    <img src={coverPreview} alt="icono" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus size={20} className="text-muted-foreground group-hover:text-primary-glow" />
                  )}
                </button>
                <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  JPG o PNG, máximo 5MB. Aparecerá como icono del juego.
                  {coverFile && (
                    <button
                      type="button"
                      onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                      className="ml-1 flex items-center gap-1 text-destructive"
                    >
                      <X size={11} /> quitar
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickCover(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <label className="block">
              <span className={label}>TÍTULO</span>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (err) setErr(null); }}
                maxLength={80}
                placeholder="Mi juego"
                className={input}
              />
            </label>

            <label className="block">
              <span className={label}>DESCRIPCIÓN</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Cuenta de qué va tu juego…"
                className={`${input} resize-none`}
              />
            </label>

            <label className="block">
              <span className={label}>
                {step === "gdevelop" ? "ENLACE DEL JUEGO (GD.GAMES)" : "ENLACE DE LA PÁGINA"}
              </span>
              <input
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (err) setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") publishExternal(); }}
                inputMode="url"
                placeholder="https://…"
                className={input}
              />
            </label>

            {step === "gdevelop" && (
              <a
                href={GDEVELOP_EDITOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-primary/85 hover:text-primary transition"
              >
                <FileCode2 size={12} /> Abrir el editor de GDevelop <ExternalLink size={11} />
              </a>
            )}

            {err && <div className="text-xs text-destructive">{err}</div>}

            <button
              type="button"
              onClick={publishExternal}
              disabled={busy || done}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl btn-grad px-4 py-2.5 text-xs font-display tracking-widest text-primary-foreground active:scale-[0.99] transition disabled:opacity-60"
            >
              {done ? <><Check size={14} /> PUBLICADO</>
                : busy ? <><Loader2 size={14} className="animate-spin" /> PUBLICANDO…</>
                : <><Rocket size={14} /> PUBLICAR JUEGO</>}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
