import { useEffect, useRef, useState } from "react";
import type { Entity, SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";
import type { AnimationClip, AnimState } from "@/lib/engine/animations";
import { DEFAULT_ANIM_NAMES } from "@/lib/engine/animations";
import { fileToDataURL, getImage, preloadImage } from "@/lib/engine/images";
import {
  Play, Pause, RotateCcw, StepBack, StepForward, Plus, Copy, Trash2,
  ChevronLeft, ChevronRight, Download, Pencil, Layers,
  Repeat, Eye, EyeOff, Film, X, Clapperboard,
} from "lucide-react";
import { PaintEditor } from "./PaintEditor";

interface Props {
  entity: Entity;
  onChange: (patch: Partial<Entity>) => void;
  onClose: () => void;
}

/** Nombre de clip libre (evita colisiones al duplicar). */
function uniqueClipName(base: string, clips: AnimationClip[]): string {
  const taken = new Set(clips.map(c => c.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/**
 * Editor de animaciones de un objeto o asset.
 *
 * Cada clip es una secuencia de fotogramas (data URLs) con su propio ritmo. El
 * editor reúne en una sola pantalla lo necesario para crear animaciones:
 * previsualización con fondo de transparencia, control de reproducción
 * (play/pausa, reinicio, paso a paso, bucle), ajuste de nombre y FPS, y una
 * línea de tiempo donde cada fotograma se selecciona, reordena, duplica o
 * elimina. También permite dibujar un fotograma al vuelo o importarlos.
 */
export function AnimationEditor({ entity, onChange, onClose }: Props) {
  const clips = entity.animations ?? [];
  const [activeId, setActiveId] = useState<string | null>(clips[0]?.id ?? null);
  const active = clips.find(c => c.id === activeId) ?? null;

  const setClips = (next: AnimationClip[]) => onChange({ animations: next });

  const addClip = (name: AnimState = "idle") => {
    const clip: AnimationClip = { id: uid(), name, fps: 8, loop: true, frames: [] };
    setClips([...clips, clip]);
    setActiveId(clip.id);
  };

  const updateClip = (patch: Partial<AnimationClip>) => {
    if (!active) return;
    setClips(clips.map(c => c.id === active.id ? { ...c, ...patch } : c));
  };

  const duplicateClip = (c: AnimationClip) => {
    const copy: AnimationClip = { ...c, id: uid(), name: uniqueClipName(`${c.name}_copy`, clips), frames: [...c.frames] };
    setClips([...clips, copy]);
    setActiveId(copy.id);
  };

  const deleteClip = (c: AnimationClip) => {
    const next = clips.filter(x => x.id !== c.id);
    setClips(next);
    if (activeId === c.id) setActiveId(next[0]?.id ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md">
      {/* Cabecera */}
      <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 panel border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 border border-primary/40 text-primary-glow">
            <Clapperboard size={18} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-sm text-primary-glow glow-text leading-none">ANIMACIONES</div>
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
              {entity.kind.toUpperCase()} · {clips.length} {clips.length === 1 ? "clip" : "clips"}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar el editor de animaciones"
          className="shrink-0 inline-flex items-center gap-1.5 font-display text-xs px-3 py-1.5 rounded-md bg-primary/15 border border-primary/50 text-primary-glow hover:bg-primary/25 transition"
        >
          <X size={14} /> CERRAR
        </button>
      </header>

      {/* Clips */}
      <div className="shrink-0 px-2.5 pt-2.5 pb-2 border-b panel space-y-2">
        <div className="flex gap-1.5 m3-scroll-x no-scrollbar">
          {clips.map(c => (
            <ClipChip
              key={c.id}
              clip={c}
              active={activeId === c.id}
              onSelect={() => setActiveId(c.id)}
              onDuplicate={() => duplicateClip(c)}
            />
          ))}
          <button
            onClick={() => addClip()}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg min-w-[60px] border-2 border-dashed border-primary/40 text-primary-glow font-display text-xs hover:bg-primary/10 transition"
          >
            <Plus size={13} /> NUEVO
          </button>
        </div>
        {clips.length === 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground">Empieza con:</span>
            {DEFAULT_ANIM_NAMES.map(n => (
              <button
                key={n}
                onClick={() => addClip(n)}
                className="text-[10px] font-display tracking-widest px-2 py-1 rounded-md border border-border text-muted-foreground hover:border-primary/50 hover:text-primary-glow transition"
              >
                + {n.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor del clip activo */}
      <div className="flex-1 min-h-0 overflow-auto">
        {active ? (
          <ClipPanel
            clip={active}
            onChangeName={name => {
              const next = [...clips];
              const at = next.findIndex(c => c.id === active.id);
              if (at >= 0) next[at] = { ...next[at], name };
              setClips(next);
            }}
            onUpdate={updateClip}
            onDuplicate={() => duplicateClip(active)}
            onDelete={() => deleteClip(active)}
          />
        ) : (
          <div className="h-full grid place-items-center p-6 text-center">
            <div className="max-w-xs">
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 border border-primary/30 text-primary-glow">
                <Film size={22} />
              </span>
              <div className="font-display text-sm mb-1.5 text-primary-glow">SIN ANIMACIONES</div>
              <div className="text-xs text-muted-foreground">
                Crea un clip con «NUEVO» o elige un preajuste (idle, walk, run, jump…).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ficha de un clip en la fila superior. Marca el activo y permite duplicarlo. */
function ClipChip({
  clip, active, onSelect, onDuplicate,
}: {
  clip: AnimationClip;
  active: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      className={`shrink-0 flex items-stretch rounded-lg border transition overflow-hidden ${
        active
          ? "border-primary bg-primary/20 shadow-[0_0_12px_oklch(0.66_0.19_246/0.45)]"
          : "border-border/50 bg-muted/40 hover:border-primary/40"
      }`}
    >
      <button
        onClick={onSelect}
        aria-pressed={active}
        className={`px-3 py-1.5 min-w-[76px] flex flex-col items-center gap-0.5 ${
          active ? "text-primary-glow" : "text-muted-foreground"
        }`}
      >
        <span className="text-[9px] font-display tracking-widest uppercase truncate max-w-[90px]">{clip.name || "?"}</span>
        <span className="text-[9px] font-mono opacity-70">{clip.frames.length}f · {clip.fps}fps</span>
      </button>
      <button
        onClick={onDuplicate}
        title={`Duplicar «${clip.name}»`}
        aria-label={`Duplicar ${clip.name}`}
        className="px-1.5 border-l border-border/40 text-muted-foreground hover:text-primary-glow hover:bg-primary/10 transition"
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

function ClipPanel({
  clip, onChangeName, onUpdate, onDuplicate, onDelete,
}: {
  clip: AnimationClip;
  onChangeName: (name: string) => void;
  onUpdate: (patch: Partial<AnimationClip>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const total = clip.frames.length;
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const startRef = useRef(performance.now());
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [onion, setOnion] = useState(false);
  const [paintOpen, setPaintOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fps = Math.max(1, clip.fps || 8);

  // Decodifica los fotogramas en cuanto cambian para que el preview no parpadee.
  useEffect(() => {
    clip.frames.forEach(f => { preloadImage(f).catch(() => {}); });
  }, [clip.id, clip.frames]);

  // Si el clip cambia de identidad o pierde fotogramas, recoloca el cursor.
  useEffect(() => {
    frameRef.current = Math.min(frameRef.current, Math.max(0, total - 1));
    setFrame(frameRef.current);
    startRef.current = performance.now();
  }, [clip.id, total]);

  // Bucle de previsualización: compone el fotograma actual (y el anterior como
  // «piel de cebolla») sobre el tablero de transparencia del contenedor.
  useEffect(() => {
    const cnv = previewRef.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      const W = cnv.clientWidth;
      const H = cnv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W > 0 && H > 0 && (cnv.width !== Math.round(W * dpr) || cnv.height !== Math.round(H * dpr))) {
        cnv.width = Math.round(W * dpr);
        cnv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      if (total > 0 && W > 0 && H > 0) {
        if (playing) {
          const t = (performance.now() - startRef.current) / 1000;
          const raw = Math.floor(t * fps);
          const idx = clip.loop ? ((raw % total) + total) % total : Math.min(raw, total - 1);
          if (idx !== frameRef.current) { frameRef.current = idx; setFrame(idx); }
          if (!clip.loop && raw >= total - 1) setPlaying(false);
        }
        const i = Math.min(frameRef.current, total - 1);
        const drawFit = (src: string, alpha: number) => {
          const img = getImage(src);
          if (!img) return false;
          const ratio = img.naturalWidth / img.naturalHeight || 1;
          const maxH = H * 0.86, maxW = W * 0.86;
          let dw = maxW, dh = dw / ratio;
          if (dh > maxH) { dh = maxH; dw = dh * ratio; }
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
          ctx.restore();
          return true;
        };
        if (onion && total > 1) drawFit(clip.frames[(i - 1 + total) % total], 0.28);
        if (!drawFit(clip.frames[i], 1) && !getImage(clip.frames[i])) {
          ctx.fillStyle = "rgba(148,163,184,0.85)";
          ctx.font = "600 12px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText("Cargando fotograma…", W / 2, H / 2);
        }
      } else if (W > 0 && H > 0) {
        ctx.fillStyle = "rgba(148,163,184,0.85)";
        ctx.font = "600 12px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText("Sin fotogramas: dibuja o importa abajo", W / 2, H / 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [clip.frames, clip.loop, clip.id, total, fps, playing, onion]);

  // Transporte
  const togglePlay = () => {
    setPlaying(p => {
      if (!p) startRef.current = performance.now() - (frameRef.current / fps) * 1000;
      return !p;
    });
  };
  const restart = () => {
    frameRef.current = 0;
    setFrame(0);
    startRef.current = performance.now();
    setPlaying(true);
  };
  const step = (dir: -1 | 1) => {
    if (!total) return;
    setPlaying(false);
    const n = Math.max(0, Math.min(total - 1, frameRef.current + dir));
    frameRef.current = n;
    setFrame(n);
  };
  const selectFrame = (i: number) => {
    setPlaying(false);
    frameRef.current = i;
    setFrame(i);
  };

  // Atajos: espacio reproduce/pausa y las flechas mueven el fotograma actual.
  const shortcuts = useRef({ togglePlay, step });
  shortcuts.current = { togglePlay, step };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); shortcuts.current.togglePlay(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); shortcuts.current.step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); shortcuts.current.step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const importFrames = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      try { urls.push(await fileToDataURL(f)); } catch { /* archivo ilegible: se salta */ }
    }
    if (urls.length) {
      onUpdate({ frames: [...clip.frames, ...urls] });
      frameRef.current = total + urls.length - 1;
      setFrame(frameRef.current);
    }
  };

  const moveFrame = (idx: number, dir: -1 | 1) => {
    const next = [...clip.frames];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onUpdate({ frames: next });
    frameRef.current = j;
    setFrame(j);
  };
  const duplicateFrame = (idx: number) => {
    const next = [...clip.frames];
    next.splice(idx + 1, 0, next[idx]);
    onUpdate({ frames: next });
    frameRef.current = idx + 1;
    setFrame(idx + 1);
  };
  const deleteFrame = (idx: number) => {
    const next = clip.frames.filter((_, i) => i !== idx);
    onUpdate({ frames: next });
    frameRef.current = Math.min(idx, Math.max(0, next.length - 1));
    setFrame(frameRef.current);
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-3 space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Previsualización + transporte */}
        <div className="space-y-2">
          <div
            className="relative rounded-2xl overflow-hidden border border-line shadow-[var(--m3-elev-2)]"
            style={{
              backgroundImage:
                "linear-gradient(45deg, var(--m3-surface-highest) 25%, transparent 25%), linear-gradient(-45deg, var(--m3-surface-highest) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--m3-surface-highest) 75%), linear-gradient(-45deg, transparent 75%, var(--m3-surface-highest) 75%)",
              backgroundSize: "18px 18px",
              backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0",
              backgroundColor: "var(--m3-surface-lowest)",
            }}
          >
            <canvas ref={previewRef} className="block w-full" style={{ height: 260 }} aria-label="Previsualización de la animación" />
            <div className="pointer-events-none absolute left-2 bottom-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-mono text-white tabular-nums">
              {total ? `${Math.min(frame, total - 1) + 1}/${total} · ${fps}fps${clip.loop ? " · loop" : ""}` : "0 frames"}
            </div>
            {onion && total > 1 && (
              <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-mono text-white">
                piel de cebolla
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => step(-1)}
              disabled={!total}
              title="Fotograma anterior (←)"
              aria-label="Fotograma anterior"
              className="grid h-10 w-10 place-items-center rounded-full border border-border text-foreground/80 hover:bg-accent transition disabled:opacity-40"
            >
              <StepBack size={17} />
            </button>
            <button
              onClick={togglePlay}
              disabled={!total}
              aria-pressed={playing}
              title="Reproducir / Pausar (espacio)"
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 btn-grad text-primary-foreground font-display text-xs tracking-widest disabled:opacity-40 active:scale-95 transition"
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "PAUSA" : "PLAY"}
            </button>
            <button
              onClick={() => step(1)}
              disabled={!total}
              title="Fotograma siguiente (→)"
              aria-label="Fotograma siguiente"
              className="grid h-10 w-10 place-items-center rounded-full border border-border text-foreground/80 hover:bg-accent transition disabled:opacity-40"
            >
              <StepForward size={17} />
            </button>
            <button
              onClick={restart}
              disabled={!total}
              title="Reiniciar"
              aria-label="Reiniciar"
              className="grid h-10 w-10 place-items-center rounded-full border border-border text-foreground/80 hover:bg-accent transition disabled:opacity-40"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={() => setOnion(o => !o)}
              aria-pressed={onion}
              title="Ver el fotograma anterior translúcido"
              className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium border transition ${
                onion ? "border-primary/60 bg-primary/15 text-primary-glow" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {onion ? <Eye size={15} /> : <EyeOff size={15} />} Cebolla
            </button>
          </div>
        </div>

        {/* Ajustes del clip */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2">
            <label className="text-[10px] font-display tracking-widest text-muted-foreground">NOMBRE DEL CLIP</label>
            <input
              value={clip.name}
              onChange={e => onChangeName(e.target.value)}
              placeholder="idle, walk, jump…"
              className="w-full bg-input/60 border border-border rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_ANIM_NAMES.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChangeName(n)}
                  className={`text-[10px] font-display tracking-widest px-2 py-1 rounded-md border transition ${
                    clip.name === n
                      ? "bg-primary/20 border-primary text-primary-glow"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary-glow"
                  }`}
                >
                  {n.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] font-display tracking-widest text-muted-foreground">VELOCIDAD</label>
              <span className="text-[11px] font-mono text-primary-glow tabular-nums">{fps} fps</span>
            </div>
            <input
              type="range" min={1} max={30} step={1} value={fps}
              onChange={e => onUpdate({ fps: Number(e.target.value) })}
              aria-label="Fotogramas por segundo"
              className="w-full accent-[oklch(0.66_0.19_246)]"
            />
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                onClick={() => onUpdate({ loop: !clip.loop })}
                aria-pressed={clip.loop}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-display tracking-widest transition ${
                  clip.loop ? "border-primary/60 bg-primary/15 text-primary-glow" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Repeat size={14} /> {clip.loop ? "BUCLE" : "UNA VEZ"}
              </button>
              <span className="text-[10px] font-mono text-muted-foreground">
                {total} {total === 1 ? "fotograma" : "fotogramas"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onDuplicate}
              className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-muted-foreground font-display text-[11px] tracking-widest hover:bg-accent transition"
            >
              <Copy size={13} /> DUPLICAR CLIP
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/15 border border-destructive/40 text-destructive font-display text-[11px] tracking-widest hover:bg-destructive/25 transition"
            >
              <Trash2 size={13} /> BORRAR CLIP
            </button>
          </div>
        </div>
      </div>

      {/* Línea de tiempo */}
      <div className="rounded-2xl border border-border/60 bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 font-display text-xs tracking-[0.25em] text-primary-glow glow-text">
            <Film size={14} /> LÍNEA DE TIEMPO
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPaintOpen(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-display tracking-widest px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary-glow hover:bg-primary/20 transition"
            >
              <Pencil size={13} /> DIBUJAR FOTOGRAMA
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[11px] font-display tracking-widest px-2.5 py-1.5 rounded-lg bg-primary/15 border border-primary/50 text-primary-glow hover:bg-primary/25 transition"
            >
              <Download size={13} /> IMPORTAR
            </button>
          </div>
        </div>

        {paintOpen && (
          <PaintEditor
            onClose={() => setPaintOpen(false)}
            onSave={(sprite: SpriteAsset) => {
              const composite = sprite.frames[0]?.composite;
              if (composite) {
                onUpdate({ frames: [...clip.frames, composite] });
                frameRef.current = total;
                setFrame(total);
              }
              setPaintOpen(false);
            }}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/*"
          multiple
          className="hidden"
          onChange={e => { importFrames(e.target.files); e.target.value = ""; }}
        />

        <div className="flex gap-2 m3-scroll-x no-scrollbar py-1">
          {clip.frames.map((src, i) => {
            const selected = i === Math.min(frame, total - 1);
            return (
              <div
                key={`${i}-${src.length}`}
                className={`shrink-0 w-24 rounded-xl border p-1 transition ${
                  selected ? "border-primary bg-primary/10 shadow-[0_0_10px_oklch(0.66_0.19_246/0.4)]" : "border-border/60 bg-muted/30 hover:border-primary/40"
                }`}
              >
                <button
                  onClick={() => selectFrame(i)}
                  aria-label={`Fotograma ${i + 1}`}
                  aria-pressed={selected}
                  className="block w-full"
                >
                  <div
                    className="relative w-full h-16 rounded-lg overflow-hidden"
                    style={{
                      backgroundColor: "var(--m3-surface-highest)",
                      backgroundImage:
                        "linear-gradient(45deg, var(--m3-surface-lowest) 25%, transparent 25%), linear-gradient(-45deg, var(--m3-surface-lowest) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--m3-surface-lowest) 75%), linear-gradient(-45deg, transparent 75%, var(--m3-surface-lowest) 75%)",
                      backgroundSize: "12px 12px",
                      backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
                    }}
                  >
                    <img src={src} alt={`Fotograma ${i + 1}`} className="absolute inset-0 w-full h-full object-contain" />
                    <span className={`absolute top-0.5 left-1 rounded px-1 text-[9px] font-mono ${selected ? "bg-primary text-primary-foreground" : "bg-black/50 text-white"}`}>
                      {i + 1}
                    </span>
                  </div>
                </button>
                <div className="mt-1 flex items-center justify-between">
                  <button onClick={() => moveFrame(i, -1)} disabled={i === 0} title="Mover a la izquierda" aria-label="Mover a la izquierda" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition"><ChevronLeft size={13} /></button>
                  <button onClick={() => duplicateFrame(i)} title="Duplicar fotograma" aria-label="Duplicar fotograma" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-primary-glow hover:bg-accent transition"><Copy size={12} /></button>
                  <button onClick={() => deleteFrame(i)} title="Borrar fotograma" aria-label="Borrar fotograma" className="grid h-6 w-6 place-items-center rounded text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition"><Trash2 size={12} /></button>
                  <button onClick={() => moveFrame(i, 1)} disabled={i === total - 1} title="Mover a la derecha" aria-label="Mover a la derecha" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition"><ChevronRight size={13} /></button>
                </div>
              </div>
            );
          })}
          {total === 0 && (
            <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 px-4 py-8 text-center">
              <Layers size={20} className="text-primary-glow" />
              <span className="text-xs font-display tracking-widest text-primary-glow">AÑADE TU PRIMER FOTOGRAMA</span>
              <div className="flex gap-1.5">
                <button onClick={() => setPaintOpen(true)} className="text-[11px] px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary-glow hover:bg-primary/20 transition">Dibujar</button>
                <button onClick={() => inputRef.current?.click()} className="text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/50 text-primary-glow hover:bg-primary/25 transition">Importar</button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] font-mono text-muted-foreground">
          Toca un fotograma para seleccionarlo · espacio reproduce o pausa · ←/→ cambian de fotograma.
        </p>
      </div>

      <p className="text-center text-[10px] font-mono text-muted-foreground">
        Nombra los clips <span className="text-primary-glow">walk</span>, <span className="text-primary-glow">jump</span> o <span className="text-primary-glow">fall</span> para que cambien solos según el estado del objeto.
      </p>

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-[var(--m3-elev-3)]">
            <h3 className="font-display text-sm text-foreground">¿Borrar el clip «{clip.name}»?</h3>
            <p className="mt-1 text-xs text-muted-foreground">Se eliminan sus {total} fotogramas. Esta acción no se puede deshacer.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent transition">Cancelar</button>
              <button onClick={() => { setConfirmDelete(false); onDelete(); }} className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:opacity-90 transition">Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
