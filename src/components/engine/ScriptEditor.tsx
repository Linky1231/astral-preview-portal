import { useRef, useState } from "react";
import type { EntityKind } from "@/lib/engine/core";
import {
  type Block, type BlockKind, type EventType, type GenericProperty, type Script, type ScriptTarget, type VariableOperator, type VariableScope,
  ALL_BLOCKS, BLOCK_LABELS, ENTITY_EVENTS, EVENT_LABELS, applyScriptEdit, normalizeScripts, uid,
} from "@/lib/engine/scripts";
import {
  addCustomSound, loadCustomSounds, playSoundUrl, type CustomSound,
} from "@/lib/engine/sfx";
import { fileToDataURL } from "@/lib/engine/images";
import { ENGINE_KNOWLEDGE } from "@/lib/ai/engine-knowledge";
import { buildGeminiScriptEditPrompt, buildGeminiScriptPrompt, geminiChat, parseAiJson } from "@/lib/ai/gemini-provider";

const KIND_OPTIONS: (EntityKind | "any")[] = ["any", "player", "platform", "enemy", "coin", "goal"];
const KIND_ONLY: EntityKind[] = ["player", "platform", "enemy", "coin", "goal"];

/**
 * Editor de eventos por bloques. Sirve igual para una entidad de la escena y
 * para un elemento de interfaz: solo cambian los eventos que ofrece el selector
 * (`events`) y los textos que ve la IA (`aiTargetKind` / `aiSummary`).
 */
interface Props {
  /** Scripts actuales del propietario. */
  scripts?: Script[];
  /** Título del encabezado, p. ej. «PLAYER» o «BOTÓN · JUMP». */
  ownerLabel: string;
  /** Qué tipo de cosa se está programando (lo usa la IA). */
  aiTargetKind: string;
  /** Resumen para la IA: dónde está y qué tamaño tiene. */
  aiSummary: string;
  /** Eventos que ofrece el selector (por defecto, los de una entidad). */
  events?: EventType[];
  onChange: (patch: { scripts: Script[] }) => void;
  onClose: () => void;
}

export function ScriptEditor({ scripts: initialScripts, ownerLabel, aiTargetKind, aiSummary, events = ENTITY_EVENTS, onChange, onClose }: Props) {
  const [scripts, setScripts] = useState<Script[]>(initialScripts ?? []);
  const [openId, setOpenId] = useState<string | null>(scripts[0]?.id ?? null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  /** Scripts que añadió la última generación, para poder quitarlos de una vez. */
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);

  const commit = (next: Script[]) => {
    setScripts(next);
    onChange({ scripts: next });
  };

  const addScript = () => {
    const s: Script = { id: uid(), event: "onStart", blocks: [] };
    commit([...scripts, s]);
    setOpenId(s.id);
  };

  const updateScript = (id: string, patch: Partial<Script>) =>
    commit(scripts.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeScript = (id: string) => {
    commit(scripts.filter(s => s.id !== id));
    setGeneratedIds(ids => ids.filter(x => x !== id));
  };
  /** Elimina solo lo que acaba de generar la IA, dejando el resto intacto. */
  const removeGenerated = () => {
    if (!generatedIds.length) return;
    commit(scripts.filter(s => !generatedIds.includes(s.id)));
    setGeneratedIds([]);
  };
  /** Sustituye un script conservando su identidad (lo usa la edición con IA). */
  const replaceScript = (id: string, next: Script) =>
    commit(scripts.map(s => s.id === id ? { ...next, id } : s));
  const addBlock = (sid: string, kind: BlockKind) => {
    commit(scripts.map(s => s.id === sid ? { ...s, blocks: [...s.blocks, defaultBlock(kind)] } : s));
  };
  const updateBlock = (sid: string, bid: string, patch: Partial<Block>) =>
    commit(scripts.map(s => s.id === sid
      ? { ...s, blocks: s.blocks.map(b => b.id === bid ? { ...b, ...patch } : b) }
      : s));
  const removeBlock = (sid: string, bid: string) =>
    commit(scripts.map(s => s.id === sid
      ? { ...s, blocks: s.blocks.filter(b => b.id !== bid) }
      : s));

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 panel border-b">
        <div>
          <div className="font-display text-sm text-primary-glow glow-text">EVENTS · {ownerLabel}</div>
          <div className="text-[10px] font-mono text-muted-foreground">block-code scripting</div>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 rounded-md panel glow-border text-xs font-display">CLOSE</button>
      </header>

      <div className="mx-3 mt-3 rounded-xl border border-border/60 bg-card p-3 space-y-2">
        <div className="text-[10px] font-display tracking-widest text-ink-2">IA · GENERAR SCRIPTS (Gemini)</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          La IA conoce todo el motor (tipos, eventos, bloques, capas 1-10). Describe qué quieres y la IA generará scripts válidos para esta entidad.
        </p>
        <textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          placeholder="Ej: haz que este enemigo persiga al jugador y que al tocarlo reste una vida…"
          rows={2}
          className="w-full rounded-lg border border-border bg-input/50 px-3 py-2 text-xs outline-none focus:border-primary/40 min-h-[56px] resize-none"
        />
        {aiErr && <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-2.5 py-2">{aiErr}</div>}
        <button
          disabled={aiBusy || !aiPrompt.trim()}
          onClick={async () => {
            setAiBusy(true);
            setAiErr(null);
            try {
              const prompt = buildGeminiScriptPrompt({
                userRequest: aiPrompt.trim(),
                engineKnowledge: ENGINE_KNOWLEDGE,
                targetEntityKind: aiTargetKind,
                projectSummary: `${aiSummary} Scripts actuales: ${scripts.length}.`,
              });
              const res = await geminiChat([{ role: "user", content: prompt }]);
              const normalized = normalizeScripts(parseAiJson(res.text));
              if (!normalized.length) throw new Error("La IA no devolvió ningún script válido.");
              commit([...scripts, ...normalized]);
              setGeneratedIds(normalized.map(s => s.id));
              setAiPrompt("");
            } catch (e) {
              setAiErr(e instanceof Error ? e.message : "No se pudo generar con IA.");
            } finally {
              setAiBusy(false);
            }
          }}
          className="w-full h-9 rounded-xl btn-grad text-primary-foreground text-[11px] font-display tracking-widest disabled:opacity-40 active:scale-[0.98] transition"
        >
          {aiBusy ? "GENERANDO…" : "GENERAR CON IA"}
        </button>
        {generatedIds.length > 0 && (
          <button
            type="button"
            onClick={removeGenerated}
            className="w-full h-8 rounded-xl bg-destructive/15 border border-destructive/40 text-destructive text-[10px] font-display tracking-widest"
          >ELIMINAR LOS {generatedIds.length} GENERADOS</button>
        )}
        <div className="text-[9px] font-mono text-muted-foreground text-center">
          IA integrada (Gemini). Sin clave ni configuración: escribe y genera.
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {scripts.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">
            No scripts yet. Tap <span className="text-primary-glow">+ NEW SCRIPT</span> to start.
          </div>
        )}

        {scripts.map(s => {
          const open = openId === s.id;
          return (
            <div key={s.id} className="panel rounded-lg border border-border/60 overflow-hidden">
              <div className="flex items-center gap-1.5 pl-3 pr-2 py-2">
                <button
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <span className="font-display text-xs text-primary-glow tracking-widest truncate">
                    ◉ {EVENT_LABELS[s.event]}{s.event === "onCollide" ? ` · ${s.withKind ?? "any"}` : ""}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{s.blocks.length} BLK</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeScript(s.id)}
                  title="Eliminar script"
                  aria-label="Eliminar script"
                  className="shrink-0 w-7 h-7 rounded-md border border-destructive/40 text-destructive text-sm leading-none"
                >✕</button>
              </div>

              {open && (
                <div className="border-t border-border/40 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                      EVENT
                      <select
                        value={s.event}
                        onChange={e => updateScript(s.id, { event: e.target.value as EventType })}
                        className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                      >
                        {events.map(k =>
                          <option key={k} value={k}>{EVENT_LABELS[k]}</option>
                        )}
                      </select>
                    </label>
                    {s.event === "onCollide" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        WITH
                        <select
                          value={s.withKind ?? "any"}
                          onChange={e => updateScript(s.id, { withKind: e.target.value as EntityKind | "any" })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                        >
                          {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </label>
                    )}
                    {s.event === "onKeyDown" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        KEY
                        <select
                          value={s.key ?? "jump"}
                          onChange={e => updateScript(s.id, { key: e.target.value as Script["key"] })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                        >
                          <option value="jump">jump</option>
                          <option value="left">left</option>
                          <option value="right">right</option>
                        </select>
                      </label>
                    )}
                    {s.event === "onScoreReach" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        SCORE ≥
                        <input type="number" value={s.threshold ?? 0}
                          onChange={e => updateScript(s.id, { threshold: Number(e.target.value) })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono" />
                      </label>
                    )}
                    {s.event === "onTimer" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        EVERY (MS)
                        <input type="number" value={s.interval ?? 1000}
                          onChange={e => updateScript(s.id, { interval: Number(e.target.value) })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono" />
                      </label>
                    )}
                    {s.event === "onMessage" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        MENSAJE
                        <input value={s.message ?? "message"} onChange={e => updateScript(s.id, { message: e.target.value })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono" />
                      </label>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {s.blocks.map(b => (
                      <BlockRow
                        key={b.id}
                        block={b}
                        onChange={patch => updateBlock(s.id, b.id, patch)}
                        onRemove={() => removeBlock(s.id, b.id)}
                      />
                    ))}
                  </div>

                  <AddBlock onAdd={k => addBlock(s.id, k)} />

                  <ScriptAiEditor
                    script={s}
                    targetKind={aiTargetKind}
                    summary={aiSummary}
                    onApply={next => replaceScript(s.id, next)}
                  />

                  <button
                    type="button"
                    onClick={() => removeScript(s.id)}
                    className="w-full mt-1 py-1.5 rounded-md bg-destructive/15 border border-destructive/40 text-destructive font-display text-[10px] tracking-widest"
                  >DELETE SCRIPT</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t panel">
        <button
          onClick={addScript}
          className="w-full py-3 rounded-lg grad-brand text-primary-foreground font-display tracking-widest text-sm glow-border"
        >+ NEW SCRIPT</button>
      </div>
    </div>
  );
}

/** Acepta el script suelto, un array con uno o un envoltorio `{ script }`. */
function unwrapScript(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0];
  if (raw && typeof raw === "object" && "script" in raw) return (raw as { script: unknown }).script;
  return raw;
}

/**
 * Seguir editando un script con IA.
 *
 * No genera uno nuevo: envía el script actual completo —con los cambios que ya
 * tenga, hechos por la IA o a mano— y pide solo el cambio descrito, así que el
 * resultado sustituye a este script conservando su identidad. El evento y sus
 * parámetros no se tocan (`applyScriptEdit`): la IA aporta los bloques y, si
 * propuso otro evento, se avisa en lugar de cambiarlo. El hilo por script
 * (`sessionId`) mantiene además el contexto de las ediciones anteriores. Cada
 * aplicación guarda el estado previo para poder deshacerla.
 */
function ScriptAiEditor({ script, targetKind, summary, onApply }: { script: Script; targetKind: string; summary: string; onApply: (next: Script) => void }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Script | null>(null);
  const [suggestedEvent, setSuggestedEvent] = useState<EventType | null>(null);

  const edit = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const prompt = buildGeminiScriptEditPrompt({
        instruction: text,
        engineKnowledge: ENGINE_KNOWLEDGE,
        currentScript: script,
        targetEntityKind: targetKind,
        projectSummary: summary,
      });
      const res = await geminiChat([{ role: "user", content: prompt }], {
        sessionId: `asternal-script-${script.id}`,
      });
      const result = applyScriptEdit(script, unwrapScript(parseAiJson(res.text)));
      if (!result) throw new Error("La IA no devolvió un script válido para este evento.");
      setPrevious(script);
      setSuggestedEvent(result.suggestedEvent);
      onApply(result.script);
      setInstruction("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo editar el script con IA.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
      <div className="text-[9px] font-display tracking-widest text-primary-glow">EDITAR CON IA · CONSERVA EL CONTEXTO</div>
      <textarea
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        placeholder="Ej: ahora que suene al chocar y reste una vida…"
        rows={2}
        className="w-full rounded-lg border border-border bg-input/50 px-2.5 py-2 text-xs outline-none focus:border-primary/40 min-h-[48px] resize-none"
      />
      {err && <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-2.5 py-2">{err}</div>}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy || !instruction.trim()}
          onClick={edit}
          className="flex-1 h-8 rounded-lg btn-grad text-primary-foreground text-[10px] font-display tracking-widest disabled:opacity-40 active:scale-[0.98] transition"
        >{busy ? "EDITANDO…" : "APLICAR CAMBIOS"}</button>
        {previous && !busy && (
          <button
            type="button"
            onClick={() => { onApply(previous); setPrevious(null); setSuggestedEvent(null); }}
            className="px-2.5 h-8 rounded-lg border border-border text-[10px] font-display tracking-widest text-muted-foreground"
          >DESHACER</button>
        )}
      </div>
      {suggestedEvent && (
        <div className="text-[10px] leading-relaxed text-muted-foreground">
          La IA propuso el evento «{EVENT_LABELS[suggestedEvent]}». Se conserva el tuyo: cámbialo con el selector de EVENT si lo prefieres.
        </div>
      )}
      <div className="text-[9px] font-mono text-muted-foreground">
        La IA parte de este script tal como está: mantiene el evento y lo que ya habías ajustado.
      </div>
    </div>
  );
}

/**
 * Selector de sonido personalizado. No hay sonidos predeterminados: el bloque
 * solo suena si apunta a un archivo de audio del usuario, ya sea subiéndolo
 * ahora o eligiéndolo de la biblioteca guardada en este dispositivo.
 */
function SoundPicker({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const [sounds, setSounds] = useState<CustomSound[]>(() => loadCustomSounds());
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const url = await fileToDataURL(file);
    if (!url) return;
    setSounds(addCustomSound(file.name, url));
    onChange({ soundUrl: url, soundName: file.name });
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async e => { await pickFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      {block.soundUrl ? (
        <div className="flex items-center gap-1.5">
          <span className="flex-1 min-w-0 truncate text-xs font-mono text-primary-glow" title={block.soundName || "sonido"}>
            ♪ {block.soundName || "sonido"}
          </span>
          <button type="button" onClick={() => playSoundUrl(block.soundUrl)}
            title="Escuchar" className="px-2 py-1 text-xs rounded border border-primary/40 text-primary-glow font-display">▶</button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-2 py-1 text-[10px] rounded border border-border font-display tracking-wide text-muted-foreground">CAMBIAR</button>
          <button type="button" onClick={() => onChange({ soundUrl: undefined, soundName: undefined })}
            title="Quitar" className="px-2 py-1 text-xs rounded border border-destructive/40 text-destructive">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full py-2 rounded border border-dashed border-primary/40 text-primary-glow font-display text-[10px] tracking-widest">
          ⤒ SUBIR SONIDO (archivo)
        </button>
      )}
      {sounds.length > 0 && (
        <select
          value=""
          onChange={e => {
            const s = sounds.find(x => x.id === e.target.value);
            if (s) onChange({ soundUrl: s.url, soundName: s.name });
          }}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono"
        >
          <option value="">— usar un sonido guardado —</option>
          {sounds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {!block.soundUrl && sounds.length === 0 && (
        <div className="text-[9px] font-mono text-muted-foreground">Sin sonidos: sube un archivo de audio para este evento.</div>
      )}
    </div>
  );
}

function defaultBlock(k: BlockKind): Block {
  const base: Block = { id: uid(), kind: k };
  switch (k) {
    case "jump": return { ...base, value: 520 };
    case "setVx": return { ...base, value: 120 };
    case "setVy": return { ...base, value: 0 };
    case "addScore": return { ...base, value: 10 };
    case "teleport": return { ...base, x: 100, y: 100 };
    case "impulse": return { ...base, x: 0, y: -300 };
    case "log": return { ...base, text: "hello" };
    case "playSound": return { ...base };
    case "vibrate": return { ...base, value: 50 };
    case "shake": return { ...base, value: 8 };
    case "setColor": return { ...base, color: "#7dd3fc" };
    case "setBg": return { ...base, color: "#0b1e3f" };
    case "setSize": return { ...base, x: 32, y: 32 };
    case "setObjectSize": return { ...base, text: "self", w: 32, h: 32, bool: false };
    case "setGravity": return { ...base, bool: true };
    case "setControllable": return { ...base, bool: true };
    case "setVisible": return { ...base, bool: true };
    case "if": return { ...base, cond: "scoreGte", value: 10, thenBlocks: [] };
    case "setVariable": return { ...base, text: "variable", value: 0, scope: "entity" };
    case "changeVariable": return { ...base, text: "variable", value: 1, scope: "entity" };
    case "setProperty": return { ...base, target: "self", property: "x", value: 0 };
    case "changeProperty": return { ...base, target: "self", property: "x", value: 10 };
    case "broadcast": return { ...base, text: "message" };
    case "ifVariable": return { ...base, text: "variable", value: 1, scope: "entity", operator: "gte", thenBlocks: [], elseBlocks: [] };
    case "repeat": return { ...base, repeat: 2, thenBlocks: [] };
    // new
    case "setX": return { ...base, value: 100 };
    case "setY": return { ...base, value: 100 };
    case "moveX": return { ...base, value: 20 };
    case "moveY": return { ...base, value: -20 };
    case "bounceY": return { ...base, value: 80 };
    case "setSpeed": return { ...base, value: 200 };
    case "setOpacity": return { ...base, value: 100 };
    case "setHazard": return { ...base, bool: true };
    case "setSolid": return { ...base, bool: true };
    case "setCollectible": return { ...base, bool: true };
    case "setGoalFlag": return { ...base, bool: true };
    case "addLives": return { ...base, value: 1 };
    case "setLives": return { ...base, value: 3 };
    case "setScore": return { ...base, value: 0 };
    case "setSceneGravity": return { ...base, value: 1400 };
    case "spawnEntity": return { ...base, text: "coin", x: 0, y: 0 };
    case "cloneSelf": return { ...base, x: 30, y: 0 };
    case "faceTarget": return { ...base, text: "player" };
    case "chase": return { ...base, text: "player", value: 80 };
    case "removeAllOf": return { ...base, text: "coin" };
    case "setHitbox": return { ...base, x: 0, y: 0, w: 32, h: 32 };
    case "comment": return { ...base, text: "note" };
    case "wait": return { ...base, value: 250 };
    case "setFacing": return { ...base, value: 1 };
    case "pushAway": return { ...base, value: 280 };
    case "knockback": return { ...base, x: 240, y: -320 };
    default: return base;
  }
}

function BlockRow({ block, onChange, onRemove }: { block: Block; onChange: (p: Partial<Block>) => void; onRemove: () => void }) {
  return (
    <div className="panel rounded-md border border-border/60 p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-display text-primary-glow tracking-widest">{BLOCK_LABELS[block.kind]}</span>
        <button
          type="button"
          onClick={onRemove}
          title="Eliminar bloque"
          aria-label="Eliminar bloque"
          className="ml-auto text-destructive text-sm px-1 rounded hover:bg-destructive/10"
        >✕</button>
      </div>
      <BlockFields block={block} onChange={onChange} />
      {(block.kind === "if" || block.kind === "ifVariable" || block.kind === "repeat") && (
        <NestedBlocks label={block.kind === "repeat" ? "REPETIR" : "ENTONCES"} blocks={block.thenBlocks ?? []}
          onChange={thenBlocks => onChange({ thenBlocks })} />
      )}
      {block.kind === "ifVariable" && (
        <NestedBlocks label="SI NO" blocks={block.elseBlocks ?? []} onChange={elseBlocks => onChange({ elseBlocks })} />
      )}
    </div>
  );
}

function BlockFields({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const num = (k: keyof Block, v: string) => onChange({ [k]: Number(v) } as Partial<Block>);
  switch (block.kind) {
    // single value
    case "jump":
    case "setVx":
    case "setVy":
    case "addScore":
    case "vibrate":
    case "shake":
    case "setX":
    case "setY":
    case "moveX":
    case "moveY":
    case "bounceY":
    case "setSpeed":
    case "setOpacity":
    case "addLives":
    case "setLives":
    case "setScore":
    case "setSceneGravity":
    case "wait":
    case "pushAway":
      return (
        <input type="number" value={block.value ?? 0} onChange={e => num("value", e.target.value)}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
      );

    case "setFacing":
      return (
        <div className="grid grid-cols-2 gap-2">
          {([[1, "derecha"], [-1, "izquierda"]] as const).map(([dir, label]) => (
            <button key={dir} type="button" onClick={() => onChange({ value: dir })}
              className={`py-1.5 rounded border text-xs font-display tracking-widest ${
                (dir === 1 ? (block.value ?? 1) >= 0 : (block.value ?? 1) < 0)
                  ? "bg-primary/15 border-primary/50 text-primary-glow"
                  : "border-border text-muted-foreground"
              }`}>{label}</button>
          ))}
        </div>
      );

    case "teleport":
    case "setSize":
    case "impulse":
    case "cloneSelf":
    case "knockback":
      return (
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={block.x ?? 0} onChange={e => num("x", e.target.value)}
            placeholder={block.kind === "setSize" ? "w" : "x"} className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
          <input type="number" value={block.y ?? 0} onChange={e => num("y", e.target.value)}
            placeholder={block.kind === "setSize" ? "h" : "y"} className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
        </div>
      );

    case "setHitbox":
      return (
        <div className="grid grid-cols-4 gap-1.5">
          {(["x", "y", "w", "h"] as const).map(k => (
            <label key={k} className="text-[10px] font-mono text-muted-foreground">
              {k}
              <input type="number" value={block[k] ?? 0} onChange={e => num(k, e.target.value)}
                className="w-full bg-input/60 border border-border rounded px-1.5 py-1 text-xs font-mono" />
            </label>
          ))}
        </div>
      );

    case "spawnEntity":
      return (
        <div className="space-y-1.5">
          <select value={block.text ?? "coin"} onChange={e => onChange({ text: e.target.value })}
            className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
            {KIND_ONLY.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={block.x ?? 0} onChange={e => num("x", e.target.value)}
              placeholder="x" className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
            <input type="number" value={block.y ?? 0} onChange={e => num("y", e.target.value)}
              placeholder="y" className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
          </div>
        </div>
      );

    case "faceTarget":
    case "removeAllOf":
      return (
        <select value={block.text ?? "player"} onChange={e => onChange({ text: e.target.value })}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
          {KIND_ONLY.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      );

    case "setObjectSize":
      return (
        <div className="space-y-1.5">
          <select value={block.text ?? "self"} onChange={e => onChange({ text: e.target.value })}
            className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
            <option value="self">este objeto</option>
            {KIND_ONLY.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={block.w ?? 32} onChange={e => num("w", e.target.value)}
              placeholder="ancho" aria-label="Ancho del objeto"
              className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
            <input type="number" value={block.h ?? 32} onChange={e => num("h", e.target.value)}
              placeholder="alto" aria-label="Alto del objeto"
              className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
          </div>
          {block.text && block.text !== "self" && (
            <button type="button" onClick={() => onChange({ bool: !block.bool })}
              className={`w-full py-1.5 rounded border text-xs font-display tracking-widest ${
                block.bool ? "bg-primary/15 border-primary/50 text-primary-glow" : "border-border text-muted-foreground"
              }`}>{block.bool ? "TODOS LOS OBJETOS DE ESE TIPO" : "SOLO EL PRIMERO"}</button>
          )}
        </div>
      );

    case "chase":
      return (
        <div className="grid grid-cols-2 gap-2">
          <select value={block.text ?? "player"} onChange={e => onChange({ text: e.target.value })}
            className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
            {KIND_ONLY.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input type="number" value={block.value ?? 80} onChange={e => num("value", e.target.value)}
            placeholder="speed" className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
        </div>
      );

    case "log":
    case "comment":
      return (
        <input value={block.text ?? ""} onChange={e => onChange({ text: e.target.value })}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
      );

    case "playSound":
      return <SoundPicker block={block} onChange={onChange} />;

    case "playRandomSound":
      return (
        <div className="text-[10px] font-mono text-muted-foreground">
          Reproduce un sonido al azar de tu biblioteca personalizada.
        </div>
      );

    case "setColor":
    case "setBg":
      return (
        <input type="color" value={block.color ?? "#7dd3fc"} onChange={e => onChange({ color: e.target.value })}
          className="w-full h-9 bg-transparent border border-border rounded" />
      );

    case "setGravity":
    case "setControllable":
    case "setVisible":
    case "setHazard":
    case "setSolid":
    case "setCollectible":
    case "setGoalFlag":
      return (
        <button onClick={() => onChange({ bool: !block.bool })}
          className={`w-full py-1.5 rounded border text-xs font-display tracking-widest ${
            block.bool ? "bg-primary/15 border-primary/50 text-primary-glow" : "border-border text-muted-foreground"
          }`}>{block.bool ? "ON" : "OFF"}</button>
      );

    case "if":
      return (
        <div className="grid grid-cols-2 gap-2">
          <select value={block.cond ?? "scoreGte"} onChange={e => onChange({ cond: e.target.value as Block["cond"] })}
            className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
            <option value="scoreGte">score ≥</option>
            <option value="scoreLte">score ≤</option>
          </select>
          <input type="number" value={block.value ?? 0} onChange={e => num("value", e.target.value)}
            className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
        </div>
      );

    case "setVariable":
    case "changeVariable":
      return <VariableFields block={block} onChange={onChange} />;

    case "setProperty":
    case "changeProperty":
      return <PropertyFields block={block} onChange={onChange} />;

    case "broadcast":
      return (
        <input value={block.text ?? "message"} onChange={e => onChange({ text: e.target.value })}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
      );

    case "ifVariable":
      return <VariableFields block={block} onChange={onChange} conditional />;

    case "repeat":
      return (
        <input type="number" min="0" max="100" value={block.repeat ?? 1} onChange={e => onChange({ repeat: Number(e.target.value) })}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
      );

    // no fields
    default:
      return <div className="text-[10px] font-mono text-muted-foreground">no parameters</div>;
  }
}

function VariableFields({ block, onChange, conditional = false }: { block: Block; onChange: (p: Partial<Block>) => void; conditional?: boolean }) {
  return <div className="grid grid-cols-3 gap-1.5">
    <input value={block.text ?? "variable"} onChange={e => onChange({ text: e.target.value })} placeholder="nombre" className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono" />
    <select value={block.scope ?? "entity"} onChange={e => onChange({ scope: e.target.value as VariableScope })} className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono"><option value="entity">objeto</option><option value="scene">escena</option></select>
    {conditional ? <select value={block.operator ?? "gte"} onChange={e => onChange({ operator: e.target.value as VariableOperator })} className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono"><option value="gte">≥</option><option value="lte">≤</option><option value="eq">=</option><option value="neq">≠</option></select> : <input type="number" value={block.value ?? 0} onChange={e => onChange({ value: Number(e.target.value) })} className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono" />}
    {conditional && <input type="number" value={block.value ?? 0} onChange={e => onChange({ value: Number(e.target.value) })} className="col-span-3 bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono" />}
  </div>;
}

function PropertyFields({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const booleanProperties: GenericProperty[] = ["visible", "solid", "gravity", "controllable", "hazard", "collectible", "goal"];
  const properties: GenericProperty[] = ["x", "y", "vx", "vy", "w", "h", "opacity", "rotation", "visible", "solid", "gravity", "controllable", "hazard", "collectible", "goal"];
  const boolean = booleanProperties.includes(block.property ?? "x");
  return <div className="grid grid-cols-3 gap-1.5">
    <select value={block.target ?? "self"} onChange={e => onChange({ target: e.target.value as ScriptTarget })} className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono"><option value="self">este objeto</option><option value="other">otro objeto</option><option value="scene">escena</option></select>
    <select value={block.property ?? "x"} onChange={e => onChange({ property: e.target.value as GenericProperty })} className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono">{properties.map(property => <option key={property} value={property}>{property}</option>)}</select>
    {boolean ? <button type="button" onClick={() => onChange({ bool: !block.bool })} className="rounded border border-primary/40 text-xs font-mono text-primary-glow">{block.bool ? "sí" : "no"}</button> : <input type="number" value={block.value ?? 0} onChange={e => onChange({ value: Number(e.target.value) })} className="bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono" />}
  </div>;
}

function NestedBlocks({ label, blocks, onChange }: { label: string; blocks: Block[]; onChange: (blocks: Block[]) => void }) {
  return <div className="ml-2 border-l-2 border-primary/30 pl-2 space-y-1.5">
    <div className="text-[9px] font-display tracking-widest text-primary-glow">{label}</div>
    {blocks.map((nested, index) => <BlockRow key={nested.id} block={nested} onChange={patch => onChange(blocks.map((item, i) => i === index ? { ...item, ...patch } : item))} onRemove={() => onChange(blocks.filter((_, i) => i !== index))} />)}
    <AddBlock onAdd={kind => onChange([...blocks, defaultBlock(kind)])} />
  </div>;
}

function AddBlock({ onAdd }: { onAdd: (k: BlockKind) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const palette = ALL_BLOCKS;
  const filtered = filter
    ? palette.filter(k => BLOCK_LABELS[k].toLowerCase().includes(filter.toLowerCase()))
    : palette;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full py-2 rounded-md border border-dashed border-primary/40 text-primary-glow font-display text-xs tracking-widest"
      >+ ADD BLOCK</button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="search blocks…"
            className="w-full bg-input/60 border border-border rounded px-2 py-1 text-xs font-mono"
          />
          <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-auto">
            {filtered.map(k => (
              <button key={k}
                onClick={() => { onAdd(k); setOpen(false); setFilter(""); }}
                className="text-[11px] py-1.5 rounded panel border border-border/60 text-left px-2 font-mono"
              >{BLOCK_LABELS[k]}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
