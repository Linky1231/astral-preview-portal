// Block-based scripting (events + actions) for Asternal Engine
import type { Entity, EntityKind, RuntimeInput, RuntimeState, Scene, UIElement } from "./core";
import { intersects, KIND_PRESETS, uid as makeId } from "./core";
import { playSoundUrl, playRandomCustomSound, vibrate } from "./sfx";

export type EventType =
  | "onStart"
  | "onCreate"
  | "onUpdate"
  | "onCollide"
  | "onKeyDown"
  | "onScoreReach"
  | "onDestroyed"
  | "onDestroy"
  | "onTimer"
  | "onLeaveScreen"
  | "onLand"
  | "onWin"
  | "onLose"
  | "onMessage"
  // Eventos de interfaz: los dispara el toque sobre un elemento de UI.
  | "onTap"
  | "onHold"
  | "onRelease";

/**
 * Los tres momentos en que se puede ejecutar un script de interfaz.
 *
 * `tap` es el instante de apoyar el dedo (no la espera al primer movimiento),
 * `hold` se repite en cada fotograma mientras se mantiene, y `release` llega al
 * levantar. Para un botón, `hold` es lo que permite hacer algo "mientras está
 * pulsado" (acelerar, cargar un salto…) sin depender de los eventos de tecla.
 */
export type UIScriptPhase = "tap" | "hold" | "release";

/** Evento que corresponde a cada momento de ejecución. */
export const UI_EVENT_FOR_PHASE: Record<UIScriptPhase, EventType> = {
  tap: "onTap",
  hold: "onHold",
  release: "onRelease",
};

/** Eventos que solo tienen sentido en un elemento de interfaz. */
export const UI_EVENTS: EventType[] = ["onTap", "onHold", "onRelease"];

export type BlockKind =
  // existing
  | "jump"
  | "setVx"
  | "setVy"
  | "addScore"
  | "destroySelf"
  | "destroyOther"
  | "win"
  | "lose"
  | "teleport"
  | "log"
  | "playSound"
  | "vibrate"
  | "shake"
  | "setColor"
  | "setSize"
  | "setGravity"
  | "setControllable"
  | "impulse"
  | "setVisible"
  | "restartScene"
  | "setBg"
  | "if"
  // 30 new
  | "setX"
  | "setY"
  | "moveX"
  | "moveY"
  | "flipVx"
  | "flipVy"
  | "bounceY"
  | "stop"
  | "setSpeed"
  | "setOpacity"
  | "setHazard"
  | "setSolid"
  | "setCollectible"
  | "setGoalFlag"
  | "addLives"
  | "setLives"
  | "setScore"
  | "resetScore"
  | "spawnEntity"
  | "cloneSelf"
  | "setSceneGravity"
  | "playRandomSound"
  | "wrapScreen"
  | "faceTarget"
  | "chase"
  | "setHitbox"
  | "clearHitbox"
  | "removeAllOf"
  | "comment"
  | "hurtPlayer"
  | "wait"
  | "setFacing"
  | "knockback"
  | "pushAway"
  | "setVariable"
  | "changeVariable"
  | "setProperty"
  | "changeProperty"
  | "broadcast"
  | "ifVariable"
  | "repeat"
  | "setObjectSize";

export type ScriptTarget = "self" | "other" | "scene";
export type VariableScope = "entity" | "scene";
export type GenericProperty = "x" | "y" | "vx" | "vy" | "w" | "h" | "opacity" | "rotation" | "visible" | "solid" | "gravity" | "controllable" | "hazard" | "collectible" | "goal";
export type VariableOperator = "eq" | "neq" | "gte" | "lte";

export interface Block {
  id: string;
  kind: BlockKind;
  value?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  /** dataURL/URL del sonido personalizado (archivo del usuario). */
  soundUrl?: string;
  /** Nombre visible del sonido seleccionado. */
  soundName?: string;
  color?: string;
  bool?: boolean;
  cond?: "scoreGte" | "scoreLte";
  thenBlocks?: Block[];
  elseBlocks?: Block[];
  target?: ScriptTarget;
  scope?: VariableScope;
  property?: GenericProperty;
  operator?: VariableOperator;
  repeat?: number;
}

export interface Script {
  id: string;
  event: EventType;
  withKind?: EntityKind | "any";          // onCollide
  key?: "left" | "right" | "jump";        // onKeyDown
  threshold?: number;                     // onScoreReach
  interval?: number;                      // onTimer (ms)
  message?: string;                       // onMessage
  blocks: Block[];
}

export const EVENT_LABELS: Record<EventType, string> = {
  onStart: "On Start",
  onCreate: "On Create",
  onUpdate: "On Update",
  onCollide: "On Collide",
  onKeyDown: "On Key Press",
  onScoreReach: "On Score Reach",
  onDestroyed: "On Destroyed",
  onDestroy: "On Destroy",
  onTimer: "On Timer",
  onLeaveScreen: "On Leave Screen",
  onLand: "On Land",
  onWin: "On Win",
  onLose: "On Lose",
  onMessage: "On Message",
  onTap: "On Tap (button)",
  onHold: "While Held (button)",
  onRelease: "On Release (button)",
};

/**
 * Eventos que una entidad sí puede recibir sola. El editor de eventos de una
 * entidad ofrece solo estos: los de interfaz no llegarían nunca (los dispara un
 * toque sobre un elemento de UI, no la escena).
 */
export const ENTITY_EVENTS: EventType[] = (Object.keys(EVENT_LABELS) as EventType[])
  .filter(event => !UI_EVENTS.includes(event));

export const BLOCK_LABELS: Record<BlockKind, string> = {
  jump: "Jump (force)",
  setVx: "Set velocity X",
  setVy: "Set velocity Y",
  addScore: "Add score",
  destroySelf: "Destroy self",
  destroyOther: "Destroy other",
  win: "Win level",
  lose: "Game over",
  teleport: "Teleport (x,y)",
  log: "Log message",
  playSound: "Play sound",
  vibrate: "Vibrate (ms)",
  shake: "Screen shake",
  setColor: "Set color",
  setSize: "Set size",
  setGravity: "Enable gravity",
  setControllable: "Player control",
  impulse: "Impulse (x,y)",
  setVisible: "Set visible",
  restartScene: "Restart scene",
  setBg: "Set background",
  if: "If condition",
  // new
  setX: "Set X",
  setY: "Set Y",
  moveX: "Move X by",
  moveY: "Move Y by",
  flipVx: "Flip velocity X",
  flipVy: "Flip velocity Y",
  bounceY: "Bounce Y (%)",
  stop: "Stop motion",
  setSpeed: "Set speed",
  setOpacity: "Set opacity %",
  setHazard: "Set hazard",
  setSolid: "Set solid",
  setCollectible: "Set collectible",
  setGoalFlag: "Set goal flag",
  addLives: "Add lives",
  setLives: "Set lives",
  setScore: "Set score",
  resetScore: "Reset score",
  spawnEntity: "Spawn entity",
  cloneSelf: "Clone self",
  setSceneGravity: "Set scene gravity",
  playRandomSound: "Random sound",
  wrapScreen: "Wrap screen",
  faceTarget: "Face target",
  chase: "Chase target",
  setHitbox: "Set hitbox",
  clearHitbox: "Clear hitbox",
  removeAllOf: "Remove all of kind",
  comment: "Comment",
  hurtPlayer: "Hurt player",
  wait: "Wait (ms)",
  setFacing: "Set facing (-1/1)",
  knockback: "Knockback (x,y)",
  pushAway: "Push away from player",
  setVariable: "Set variable",
  changeVariable: "Change variable by",
  setProperty: "Set property",
  changeProperty: "Change property by",
  broadcast: "Broadcast message",
  ifVariable: "If variable",
  repeat: "Repeat",
  setObjectSize: "Set object size (target)",
};

export const ALL_BLOCKS: BlockKind[] = [
  "jump", "impulse", "setVx", "setVy", "setSpeed", "stop", "flipVx", "flipVy", "bounceY",
  "setX", "setY", "moveX", "moveY", "teleport", "wrapScreen",
  "addScore", "setScore", "resetScore", "addLives", "setLives",
  "destroySelf", "destroyOther", "cloneSelf", "spawnEntity", "removeAllOf",
  "win", "lose", "restartScene", "hurtPlayer",
  "playSound", "playRandomSound", "vibrate", "shake",
  "setColor", "setBg", "setVisible", "setOpacity", "setSize", "setObjectSize",
  "setGravity", "setControllable", "setHazard", "setSolid", "setCollectible", "setGoalFlag",
  "setSceneGravity", "setHitbox", "clearHitbox",
  "faceTarget", "chase", "knockback", "setFacing", "pushAway",
  "log", "comment", "if", "wait", "setVariable", "changeVariable", "setProperty", "changeProperty", "broadcast", "ifVariable", "repeat",
];

export interface RuntimeHooks {
  shake: (intensity: number, duration: number) => void;
  restart: () => void;
}

interface ExecCtx {
  self: Entity;
  other?: Entity;
  scene: Scene;
  state: RuntimeState;
  hooks: RuntimeHooks;
  emitMessage?: (message: string) => void;
}

export function nextVariableValue(current: number | undefined, delta: number): number {
  return (current ?? 0) + delta;
}

function variableBag(ctx: ExecCtx, scope: VariableScope = "entity") {
  if (scope === "scene") return (ctx.scene.variables ??= {});
  return (ctx.self.variables ??= {});
}

function targetFor(ctx: ExecCtx, target: ScriptTarget = "self"): Entity | Scene | null {
  if (target === "scene") return ctx.scene;
  if (target === "other") return ctx.other ?? null;
  return ctx.self;
}

export function applyGenericProperty(target: Entity | Scene, property: GenericProperty, value: number | boolean, mode: "set" | "change" = "set") {
  const record = target as unknown as Record<string, unknown>;
  if (typeof value === "boolean") { record[property] = value; return; }
  const previous = typeof record[property] === "number" ? record[property] as number : 0;
  const next = mode === "change" ? previous + value : value;
  if (property === "w" || property === "h") record[property] = Math.max(1, next);
  else if (property === "opacity") record[property] = Math.max(0, Math.min(1, next > 1 ? next / 100 : next));
  else record[property] = next;
}

function variablePasses(current: string | number | boolean | undefined, operator: VariableOperator = "gte", expected = 0) {
  const numberCurrent = typeof current === "number" ? current : Number(current ?? 0);
  if (operator === "eq") return numberCurrent === expected;
  if (operator === "neq") return numberCurrent !== expected;
  return operator === "lte" ? numberCurrent <= expected : numberCurrent >= expected;
}

function findFirstOfKind(scene: Scene, kind: EntityKind) {
  for (const e of scene.entities) if (e.kind === kind && e.x > -9000) return e;
  return null;
}

function execBlock(b: Block, ctx: ExecCtx) {
  switch (b.kind) {
    case "jump": ctx.self.vy = -(b.value ?? 520); break;
    case "setVx": ctx.self.vx = b.value ?? 0; break;
    case "setVy": ctx.self.vy = b.value ?? 0; break;
    case "impulse":
      ctx.self.vx += b.x ?? 0;
      ctx.self.vy += b.y ?? 0;
      break;
    case "addScore": ctx.state.score += b.value ?? 1; break;
    case "destroySelf": ctx.self.x = -99999; break;
    case "destroyOther": if (ctx.other) ctx.other.x = -99999; break;
    case "win": ctx.state.win = true; break;
    case "lose": ctx.state.dead = true; break;
    case "restartScene": ctx.hooks.restart(); break;
    case "teleport":
      ctx.self.x = b.x ?? ctx.self.x;
      ctx.self.y = b.y ?? ctx.self.y;
      break;
    case "log": console.log("[script]", b.text ?? "", ctx.self.kind); break;
    case "playSound": playSoundUrl(b.soundUrl); break;
    case "vibrate": vibrate(Math.max(1, b.value ?? 50)); break;
    case "shake": ctx.hooks.shake(Math.max(1, b.value ?? 8), 0.3); break;
    case "setColor": if (b.color) ctx.self.color = b.color; break;
    case "setBg": if (b.color) ctx.scene.bg = b.color; break;
    case "setVisible": ctx.self.visible = b.bool ?? !(ctx.self.visible ?? true); break;
    case "setSize":
      if (b.x) ctx.self.w = Math.max(4, b.x);
      if (b.y) ctx.self.h = Math.max(4, b.y);
      break;
    case "setObjectSize": {
      // Cambia el tamaño de un objeto concreto (no solo el de este script):
      // «self» ajusta su propia entidad, un tipo del motor busca ese objeto y
      // `bool` decide si se aplica al primero (false) o a todos (true).
      const w = typeof b.w === "number" && b.w > 0 ? Math.max(4, b.w) : undefined;
      const h = typeof b.h === "number" && b.h > 0 ? Math.max(4, b.h) : undefined;
      if (w === undefined && h === undefined) break;
      const applySize = (target: Entity) => {
        if (w !== undefined) target.w = w;
        if (h !== undefined) target.h = h;
      };
      const kind = b.text;
      if (!kind || kind === "self") { applySize(ctx.self); break; }
      if (b.bool) {
        for (const e of ctx.scene.entities) if (e.kind === kind && e.x > -9000) applySize(e);
      } else {
        const first = findFirstOfKind(ctx.scene, kind as EntityKind);
        if (first) applySize(first);
      }
      break;
    }
    case "setGravity": ctx.self.gravity = b.bool ?? !ctx.self.gravity; break;
    case "setControllable": ctx.self.controllable = b.bool ?? !ctx.self.controllable; break;

    // --- new ---
    case "setX": ctx.self.x = b.value ?? ctx.self.x; break;
    case "setY": ctx.self.y = b.value ?? ctx.self.y; break;
    case "moveX": ctx.self.x += b.value ?? 0; break;
    case "moveY": ctx.self.y += b.value ?? 0; break;
    case "flipVx": ctx.self.vx = -ctx.self.vx; break;
    case "flipVy": ctx.self.vy = -ctx.self.vy; break;
    case "bounceY": ctx.self.vy = -ctx.self.vy * ((b.value ?? 80) / 100); break;
    case "stop": ctx.self.vx = 0; ctx.self.vy = 0; break;
    case "setSpeed": {
      const s = b.value ?? 0;
      const dir = ctx.self.vx === 0 ? 1 : Math.sign(ctx.self.vx);
      ctx.self.vx = s * dir;
      break;
    }
    case "setOpacity": ctx.self.opacity = Math.max(0, Math.min(1, (b.value ?? 100) / 100)); break;
    case "setHazard": ctx.self.hazard = b.bool ?? !ctx.self.hazard; break;
    case "setSolid": ctx.self.solid = b.bool ?? !ctx.self.solid; break;
    case "setCollectible": ctx.self.collectible = b.bool ?? !ctx.self.collectible; break;
    case "setGoalFlag": ctx.self.goal = b.bool ?? !ctx.self.goal; break;
    case "addLives": ctx.state.lives += b.value ?? 1; break;
    case "setLives": ctx.state.lives = b.value ?? 1; break;
    case "setScore": ctx.state.score = b.value ?? 0; break;
    case "resetScore": ctx.state.score = 0; break;
    case "spawnEntity": {
      const k = (b.text as EntityKind) || "coin";
      const preset = KIND_PRESETS[k];
      if (preset) {
        ctx.scene.entities.push({
          ...preset,
          id: makeId(),
          x: b.x ?? ctx.self.x,
          y: b.y ?? ctx.self.y,
        });
      }
      break;
    }
    case "cloneSelf": {
      ctx.scene.entities.push({
        ...ctx.self,
        id: makeId(),
        x: ctx.self.x + (b.x ?? 20),
        y: ctx.self.y + (b.y ?? 0),
        scripts: [], // no script inheritance to avoid runaway
      });
      break;
    }
    case "setSceneGravity": ctx.scene.gravity = Math.max(0, b.value ?? 1400); break;
    case "playRandomSound": playRandomCustomSound(); break;
    case "wrapScreen": {
      const e = ctx.self;
      if (e.x + e.w < 0) e.x = ctx.scene.width;
      else if (e.x > ctx.scene.width) e.x = -e.w;
      if (e.y + e.h < 0) e.y = ctx.scene.height;
      else if (e.y > ctx.scene.height) e.y = -e.h;
      break;
    }
    case "faceTarget": {
      const t = findFirstOfKind(ctx.scene, (b.text as EntityKind) || "player");
      if (t) ctx.self.vx = Math.sign(t.x - ctx.self.x) * Math.abs(ctx.self.vx || 60);
      break;
    }
    case "chase": {
      const t = findFirstOfKind(ctx.scene, (b.text as EntityKind) || "player");
      if (t) {
        const sp = b.value ?? 80;
        ctx.self.vx = Math.sign(t.x - ctx.self.x) * sp;
      }
      break;
    }
    case "setHitbox":
      ctx.self.hitbox = { x: b.x ?? 0, y: b.y ?? 0, w: Math.max(1, b.w ?? ctx.self.w), h: Math.max(1, b.h ?? ctx.self.h) };
      break;
    case "clearHitbox": ctx.self.hitbox = null; break;
    case "removeAllOf": {
      const k = (b.text as EntityKind) || "coin";
      for (const e of ctx.scene.entities) if (e.kind === k) e.x = -99999;
      break;
    }
    case "comment": break;
    case "hurtPlayer": ctx.state.dead = true; break;
    // `wait`, `if`, `ifVariable` y `repeat` los resuelve el intérprete de marcos
    // (ver execFrames): necesitan controlar qué bloque se ejecuta después.
    case "setFacing": {
      const f = (b.value ?? 1) >= 0 ? 1 : -1;
      ctx.self.facing = f;
      ctx.self.flipX = f === -1;
      break;
    }
    case "knockback": {
      const target = ctx.other ?? ctx.self;
      target.vx = b.x ?? 240;
      target.vy = b.y ?? -320;
      break;
    }
    case "pushAway": {
      const p = findFirstOfKind(ctx.scene, "player");
      if (p) {
        const force = b.value ?? 280;
        const dir = ctx.self.x < p.x ? -1 : 1;
        ctx.self.vx = dir * force;
        ctx.self.vy = -180;
      }
      break;
    }
    case "setVariable": {
      variableBag(ctx, b.scope)[b.text?.trim() || "variable"] = b.value ?? 0;
      break;
    }
    case "changeVariable": {
      const bag = variableBag(ctx, b.scope);
      const key = b.text?.trim() || "variable";
      bag[key] = nextVariableValue(typeof bag[key] === "number" ? bag[key] : undefined, b.value ?? 1);
      break;
    }
    case "setProperty":
    case "changeProperty": {
      const target = targetFor(ctx, b.target);
      if (target && b.property) applyGenericProperty(target, b.property, b.bool ?? b.value ?? 0, b.kind === "changeProperty" ? "change" : "set");
      break;
    }
    case "broadcast": ctx.emitMessage?.(b.text?.trim() || "message"); break;
  }
}

/**
 * Marco de ejecución. Cada marco recorre una lista de bloques; los contenedores
 * (`si`, `si no`, `repetir`) apilan un marco hijo, así que un `esperar` puede
 * suspender la ejecución a cualquier profundidad y reanudarla después sin
 * perder el punto exacto ni afectar a los demás bloques del script.
 */
interface ExecFrame {
  blocks: Block[];
  index: number;
  repeatLeft: number;
}

/** Script detenido en un `esperar`, a la espera del instante `until`. */
interface SuspendedScript {
  stack: ExecFrame[];
  until: number;
  entityId: string;
  otherId?: string;
}

/** Campos numéricos de un bloque que deben llegar como número usable. */
const NUMERIC_FIELDS = ["value", "x", "y", "w", "h", "repeat"] as const;

/**
 * Normaliza un bloque sin tocar el guardado: un script importado o generado
 * por IA puede traer el número como texto (`"120"`) o como basura (`"abc"`).
 * Un texto numérico se convierte y un valor inválido se descarta, para que el
 * bloque use su valor por defecto en lugar de romper la escena.
 */
function sanitizeBlock(block: Block): Block {
  let copy: Block | null = null;
  for (const field of NUMERIC_FIELDS) {
    const raw: unknown = block[field];
    if (raw === undefined) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) continue;
    const parsed = typeof raw === "string" ? Number(raw.trim()) : NaN;
    copy ??= { ...block };
    if (Number.isFinite(parsed)) copy[field] = parsed;
    else delete copy[field];
  }
  return copy ?? block;
}

/**
 * Lista de bloques a prueba de datos incompletos: un script importado o
 * generado por IA puede llegar sin `blocks`, con entradas nulas, con números
 * como texto o con un `thenBlocks` que no es una lista. Nunca debe lanzar.
 */
function blockList(blocks: unknown): Block[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b): b is Block => !!b && typeof b === "object" && typeof (b as Block).kind === "string")
    .map(sanitizeBlock);
}

/** Número usable a partir de lo que llega (número, texto numérico o basura). */
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Bloque a prueba de datos de la IA o de una importación: descarta lo que no
 * es un bloque real del motor, conserva su `id` (o crea uno) y normaliza
 * también los bloques anidados de `if` / `ifVariable` / `repeat`.
 *
 * Que cada bloque —incluidos los de dentro— tenga identidad propia es lo que
 * permite editarlos y eliminarlos por separado en el editor de eventos.
 */
export function normalizeBlock(block: Block): Block | null {
  if (!block || typeof block !== "object") return null;
  if (typeof block.kind !== "string" || !(block.kind in BLOCK_LABELS)) return null;
  const clean = sanitizeBlock(block);
  const next: Block = { ...clean, id: typeof clean.id === "string" && clean.id ? clean.id : uid() };
  if (Array.isArray(clean.thenBlocks)) next.thenBlocks = clean.thenBlocks.flatMap(normalizedList);
  if (Array.isArray(clean.elseBlocks)) next.elseBlocks = clean.elseBlocks.flatMap(normalizedList);
  return next;
}

function normalizedList(block: Block): Block[] {
  const normalized = normalizeBlock(block);
  return normalized ? [normalized] : [];
}

/**
 * Script a prueba de datos de la IA o de una importación.
 *
 * Devuelve `null` si no hay evento real: así una respuesta inventada no ensucia
 * la lista de scripts. `fallbackId` conserva la identidad al **seguir editando
 * un script con IA**, de modo que el resultado siga siendo el mismo script (con
 * su contexto y sus cambios previos) en lugar de uno nuevo.
 */
export function normalizeScript(raw: unknown, fallbackId?: string): Script | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<Script>;
  const event = typeof source.event === "string" && source.event in EVENT_LABELS
    ? (source.event as EventType)
    : null;
  if (!event) return null;

  const script: Script = {
    ...(source as Script),
    id: typeof source.id === "string" && source.id ? source.id : fallbackId || uid(),
    event,
    blocks: blockList(source.blocks).flatMap(normalizedList),
  };

  // Los números de cabecera también pueden llegar como texto desde la IA.
  for (const field of ["threshold", "interval"] as const) {
    const value = finiteNumber(source[field]);
    if (value === undefined) delete script[field];
    else script[field] = value;
  }
  return script;
}

/** Resultado de seguir editando un script existente con IA. */
export interface ScriptEditResult {
  /** El script original con su cabecera intacta y los bloques que devolvió la IA. */
  script: Script;
  /** Evento que propuso la IA si intentó cambiarlo (la cabecera no se toca). */
  suggestedEvent: EventType | null;
}

/**
 * Aplica la respuesta de la IA al script que se estaba editando.
 *
 * La cabecera del script —evento y sus parámetros (`withKind`, `key`,
 * `threshold`, `interval`, `message`)— se conserva tal cual: la IA solo aporta
 * los bloques. Así el resultado sigue siendo el mismo script, sin perder el
 * contexto ni los cambios previos, y el evento no cambia a espaldas del
 * usuario. Si la IA propuso otro evento, se devuelve en `suggestedEvent` para
 * avisarlo en el editor. Devuelve `null` si la respuesta no es usable.
 */
export function applyScriptEdit(original: Script, edited: unknown): ScriptEditResult | null {
  const next = normalizeScript(edited, original.id);
  if (!next) return null;
  return {
    script: { ...original, id: original.id, blocks: next.blocks },
    suggestedEvent: next.event === original.event ? null : next.event,
  };
}

/** Lista de scripts normalizados: acepta un array o un envoltorio `{ scripts }`. */
export function normalizeScripts(raw: unknown): Script[] {
  const list = Array.isArray(raw) ? raw : (raw as { scripts?: unknown } | null)?.scripts;
  if (!Array.isArray(list)) return [];
  return list.flatMap(item => {
    const script = normalizeScript(item);
    return script ? [script] : [];
  });
}

function ifConditionPasses(b: Block, ctx: ExecCtx) {
  const v = b.value ?? 0;
  if (b.cond === "scoreGte") return ctx.state.score >= v;
  if (b.cond === "scoreLte") return ctx.state.score <= v;
  return false;
}

/** Milisegundos de un bloque `esperar` (0 si falta o no es un número válido). */
function waitSeconds(b: Block) {
  const ms = typeof b.value === "number" && Number.isFinite(b.value) ? b.value : 0;
  return Math.max(0, ms) / 1000;
}

/**
 * Ejecuta la pila hasta agotarla. Devuelve el control cuando alcanza un
 * `esperar` con duración positiva: entonces guarda la pila con `suspend`.
 */
function execFrames(stack: ExecFrame[], ctx: ExecCtx, now: number, suspend: (stack: ExecFrame[], until: number) => void) {
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.blocks.length) {
      stack.pop();
      if (frame.repeatLeft > 1) {
        frame.repeatLeft -= 1;
        frame.index = 0;
        stack.push(frame);
      }
      continue;
    }

    const block = frame.blocks[frame.index];
    frame.index += 1;

    if (block.kind === "wait") {
      const seconds = waitSeconds(block);
      if (seconds > 0) {
        suspend(stack, now + seconds);
        return;
      }
      continue;
    }

    if (block.kind === "if") {
      if (ifConditionPasses(block, ctx)) stack.push({ blocks: blockList(block.thenBlocks), index: 0, repeatLeft: 1 });
      continue;
    }

    if (block.kind === "ifVariable") {
      const current = variableBag(ctx, block.scope)[block.text?.trim() || "variable"];
      const branch = variablePasses(current, block.operator, block.value ?? 0) ? block.thenBlocks : block.elseBlocks;
      stack.push({ blocks: blockList(branch), index: 0, repeatLeft: 1 });
      continue;
    }

    if (block.kind === "repeat") {
      const amount = Math.min(100, Math.max(0, Math.floor(block.repeat ?? block.value ?? 1)));
      if (amount > 0) stack.push({ blocks: blockList(block.thenBlocks), index: 0, repeatLeft: amount });
      continue;
    }

    execBlock(block, ctx);
  }
}

export interface ScriptRunner {
  step: (scene: Scene, state: RuntimeState, input: RuntimeInput, hooks: RuntimeHooks, dt: number) => void;
  /**
   * Ejecuta los scripts de un elemento de interfaz en el momento indicado
   * (`tap` al pulsar, `hold` mientras se mantiene, `release` al soltar).
   *
   * Dentro del script, `self` es el propio elemento: los bloques que cambian
   * tamaño, posición, opacidad, visibilidad o color actúan sobre él, y los de
   * puntuación, vidas, escena, sonido o mensajes siguen actuando sobre la
   * partida. Los mensajes que emita (`broadcast`) los reciben en el mismo
   * fotograma los scripts `onMessage` de la escena.
   */
  runUI: (element: UIElement, phase: UIScriptPhase) => void;
}

export function createScriptRunner(): ScriptRunner {
  const started = new Set<string>();
  const destroyed = new Set<string>();
  const left = new Set<string>();
  const colliding = new Set<string>();
  const prevVy = new Map<string, number>();
  const timerAcc = new Map<string, number>();
  /** Scripts detenidos en un `esperar`, por entidad y script. */
  const suspended = new Map<string, SuspendedScript>();
  /** Lo mismo para los scripts de interfaz: por elemento y script. */
  const uiSuspended = new Map<string, { stack: ExecFrame[]; until: number; elementId: string }>();
  /** Mensajes emitidos por un script de interfaz, que se reparten en el paso siguiente. */
  const uiMessages = new Set<string>();
  /** Lo último que vio el motor: los scripts de UI lo necesitan fuera del paso. */
  let last: { scene: Scene; state: RuntimeState; hooks: RuntimeHooks } | null = null;
  /** Identidad estable por objeto de script: dos scripts con el mismo id no se mezclan. */
  const execKeys = new WeakMap<Script, string>();
  let execKeySeq = 0;
  let clock = 0;
  let prevInput: RuntimeInput = { left: false, right: false, jump: false };
  let prevScore = 0;
  let prevWin = false;
  let prevDead = false;

  return {
    runUI(element, phase) {
      if (!last) return;
      const want = UI_EVENT_FOR_PHASE[phase];
      const scripts = (element.scripts ?? []).filter(s => s.event === want);
      if (!scripts.length) return;
      const ctx: ExecCtx = {
        // El elemento hace de `self`: así los bloques de interfaz (tamaño,
        // posición, opacidad, visibilidad, color) lo cambian a él.
        self: element as unknown as Entity,
        scene: last.scene,
        state: last.state,
        hooks: last.hooks,
        emitMessage: (message: string) => uiMessages.add(message),
      };
      for (const script of scripts) {
        const key = `${element.id}|${script.id}`;
        // Un script que ya está esperando no se reinicia: se reanuda él solo.
        if (uiSuspended.has(key)) continue;
        execFrames(
          [{ blocks: blockList(script.blocks), index: 0, repeatLeft: 1 }],
          ctx,
          clock,
          (stack, until) => uiSuspended.set(key, { stack, until, elementId: element.id }),
        );
      }
    },

    step(scene, state, input, hooks, dt) {
      clock += dt;
      last = { scene, state, hooks };
      const messages = new Set<string>(uiMessages);
      uiMessages.clear();
      const keyFor = (script: Script, self: Entity) => {
        let base = execKeys.get(script);
        if (!base) { base = `k${++execKeySeq}`; execKeys.set(script, base); }
        return `${self.id}|${base}`;
      };
      // Mientras un script espera, su evento no lo reinicia: se reanuda donde
      // se quedó (ver el paso de reanudación), nunca desde el principio.
      const run = (script: Script, self: Entity, other?: Entity) => {
        const key = keyFor(script, self);
        if (suspended.has(key)) return;
        const ctx = { self, other, scene, state, hooks, emitMessage: (message: string) => messages.add(message) };
        execFrames(
          [{ blocks: blockList(script.blocks), index: 0, repeatLeft: 1 }],
          ctx,
          clock,
          (stack, until) => suspended.set(key, { stack, until, entityId: self.id, otherId: other?.id }),
        );
      };
      const live = scene.entities;
      const keyEdges = {
        left: input.left && !prevInput.left,
        right: input.right && !prevInput.right,
        jump: input.jump && !prevInput.jump,
      };

      const winEdge = state.win && !prevWin;
      const loseEdge = state.dead && !prevDead;

      for (let i = 0; i < live.length; i++) {
        const e = live[i];
        const scripts = e.scripts ?? [];
        if (!scripts.length) { prevVy.set(e.id, e.vy); continue; }

        if (e.x < -9000 && !destroyed.has(e.id)) {
          destroyed.add(e.id);
          for (const s of scripts) {
            suspended.delete(keyFor(s, e));
            if (s.event === "onDestroyed" || s.event === "onDestroy") run(s, e);
          }
        }
        if (e.x < -9000) continue;

        const outside = e.x + e.w < 0 || e.x > scene.width || e.y > scene.height + 200 || e.y + e.h < -200;
        if (outside && !left.has(e.id)) {
          left.add(e.id);
          for (const s of scripts) if (s.event === "onLeaveScreen")
            run(s, e);
        } else if (!outside) {
          left.delete(e.id);
        }

        if (!started.has(e.id)) {
          for (const s of scripts) if (s.event === "onStart" || s.event === "onCreate")
            run(s, e);
          started.add(e.id);
        }

        const pv = prevVy.get(e.id) ?? 0;
        const landed = pv > 80 && e.vy === 0;

        for (const s of scripts) {
          if (s.event === "onUpdate") {
            run(s, e);
          } else if (s.event === "onKeyDown" && s.key && keyEdges[s.key]) {
            run(s, e);
          } else if (s.event === "onScoreReach") {
            const t = s.threshold ?? 0;
            if (prevScore < t && state.score >= t)
              run(s, e);
          } else if (s.event === "onTimer") {
            // El resto se arrastra al siguiente ciclo y el margen de error evita
            // que el redondeo en coma flotante retrase (o se coma) un pulso.
            const iv = Math.max(0.05, (s.interval ?? 1000) / 1000);
            const acc = (timerAcc.get(s.id) ?? 0) + dt;
            if (acc + 1e-6 >= iv) { timerAcc.set(s.id, acc - iv); run(s, e); }
            else timerAcc.set(s.id, acc);
          } else if (s.event === "onLand" && landed) {
            run(s, e);
          } else if (s.event === "onWin" && winEdge) {
            run(s, e);
          } else if (s.event === "onLose" && loseEdge) {
            run(s, e);
          }
        }

        prevVy.set(e.id, e.vy);
      }

      // onCollide (edge-triggered)
      const now = new Set<string>();
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        if (a.x < -9000) continue;
        const aScripts = (a.scripts ?? []).filter(s => s.event === "onCollide");
        if (!aScripts.length) continue;
        for (let j = 0; j < live.length; j++) {
          if (i === j) continue;
          const b = live[j];
          if (b.x < -9000) continue;
          if (!intersects(a, b)) continue;
          const key = `${a.id}|${b.id}`;
          now.add(key);
          if (colliding.has(key)) continue;
          for (const s of aScripts) {
            if (!s.withKind || s.withKind === "any" || s.withKind === b.kind) {
              run(s, a, b);
            }
          }
        }
      }
      colliding.clear();
      now.forEach(k => colliding.add(k));

      // Los `esperar` vencidos se reanudan aunque su evento solo haya ocurrido
      // una vez (onStart, onCreate…), y antes de repartir los mensajes emitidos.
      if (suspended.size) {
        for (const [key, paused] of Array.from(suspended)) {
          if (clock < paused.until) continue;
          const self = live.find(e => e.id === paused.entityId);
          if (!self || self.x < -9000) { suspended.delete(key); continue; }
          const other = paused.otherId ? live.find(e => e.id === paused.otherId) : undefined;
          suspended.delete(key);
          execFrames(
            paused.stack,
            { self, other, scene, state, hooks, emitMessage: (message: string) => messages.add(message) },
            clock,
            (stack, until) => suspended.set(key, { stack, until, entityId: self.id, otherId: other?.id }),
          );
        }
      }

      // Los `esperar` de un script de interfaz se reanudan igual que los de una
      // entidad, sobre el propio elemento (que puede haberse ocultado entre medias).
      if (uiSuspended.size) {
        for (const [key, paused] of Array.from(uiSuspended)) {
          if (clock < paused.until) continue;
          uiSuspended.delete(key);
          const element = (scene.ui ?? []).find(u => u.id === paused.elementId);
          if (!element || element.visible === false) continue;
          execFrames(
            paused.stack,
            {
              self: element as unknown as Entity,
              scene,
              state,
              hooks,
              emitMessage: (message: string) => uiMessages.add(message),
            },
            clock,
            (stack, until) => uiSuspended.set(key, { stack, until, elementId: element.id }),
          );
        }
      }

      for (const message of messages) {
        for (const entity of live) {
          if (entity.x < -9000) continue;
          for (const script of entity.scripts ?? []) {
            if (script.event === "onMessage" && script.message === message) run(script, entity);
          }
        }
      }

      prevInput = { ...input };
      prevScore = state.score;
      prevWin = state.win;
      prevDead = state.dead;
    },
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
