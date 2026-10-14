========================================================
MOTOR DE JUEGOS DE ASTERNAL — CONOCIMIENTO COMPLETO PARA ORIÓN
========================================================

Este es el código fuente del motor de juegos de Asternal. Úsalo para
explicar cómo funciona el motor, ayudar a crear juegos, depurar y dar
consejos profesionales de desarrollo de videojuegos.

--------------------------------------------------------
MÓDULO: core.ts (el motor principal — código completo)
--------------------------------------------------------
```ts
// Asternal Engine core: ECS-lite + loop + physics + scenes + input
import type { AnimationClip } from "./animations";
import type { Script } from "./scripts";

export type EntityKind = "player" | "platform" | "enemy" | "coin" | "goal" | "decor";

// --- Sprite asset (created in the in-engine pixel editor) ---
export interface SpriteLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;      // 0..1
  dataUrl: string;      // PNG of just this layer at native resolution
}
export interface SpriteFrame {
  id: string;
  layers: SpriteLayer[];
  composite: string;    // PNG, all visible layers flattened
}
export interface SpriteAsset {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  loop: boolean;
  frames: SpriteFrame[];
}

export interface Hitbox {
  x: number; // offset relative to entity x
  y: number;
  w: number;
  h: number;
}

export type PowerupKind = "speed" | "djump" | "invuln";

export interface MovingSpec { axis: "x" | "y"; range: number; speed: number; _origin?: number; _dir?: number }
export interface CrumbleSpec { delay: number; respawn: number; _t?: number; _state?: "idle" | "break" | "gone"; _rt?: number }
export interface SpringSpec { force: number }
export interface PatrolSpec { range: number; ledgeSafe?: boolean; _origin?: number }

export interface ParticleEmitter {
  enabled: boolean;
  rate: number;       // particles/sec
  lifetime: number;   // seconds
  speed: number;      // px/sec
  direction: number;  // degrees, 0 = right, 90 = down
  spread: number;     // degrees (total cone)
  size: number;       // px
  gravity: number;    // px/s^2 applied to y
  color: string;
  _acc?: number;
}

export type DialogTrigger = "touch" | "interact" | "auto";
export interface DialogLine {
  id: string;
  speaker?: string;      // shown as name over the bubble; falls back to entity name
  text: string;
  portrait?: string | null; // dataURL / URL — optional avatar shown next to the text
}
export interface DialogSpec {
  lines: DialogLine[];
  trigger: DialogTrigger; // touch = on collision, interact = on JUMP press while overlapping, auto = when scene starts
  once?: boolean;         // if true, only plays a single time
  pausesGame?: boolean;   // if true, freezes physics while the dialog is on screen
}

export interface Entity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  color: string;
  // behavior flags
  solid: boolean;
  gravity: boolean;
  controllable: boolean;
  collectible: boolean;
  hazard: boolean;
  goal: boolean;
  visible?: boolean;
  opacity?: number;
  texture?: string | null;
  animations?: AnimationClip[];
  scripts?: Script[];
  hitbox?: Hitbox | null;
  // advanced behaviors
  value?: number;
  moving?: MovingSpec | null;
  crumble?: CrumbleSpec | null;
  spring?: SpringSpec | null;
  patrol?: PatrolSpec | null;
  checkpoint?: boolean;
  slippery?: boolean;
  sticky?: boolean;
  locked?: boolean;          // layer lock — editor only, blocks select/move
  powerup?: PowerupKind | null;
  switchId?: string;
  doorId?: string;
  emitter?: ParticleEmitter | null;
  // depth / rendering
  z?: number;                // higher = drawn on top
  layerId?: string;          // optional scene layer assignment
  facing?: 1 | -1;           // last horizontal direction
  flipX?: boolean;           // force horizontal flip
  rotation?: number;         // degrees (0-360), rotation around center for rendering
  textureFit?: "stretch" | "contain" | "cover";
  // goal-specific
  nextSceneId?: string | null;
  endsGame?: boolean;
  // dialog
  dialog?: DialogSpec | null;
  _dialogPlayed?: boolean;
}

export interface ParallaxLayer { color: string; speed: number; height: number; y: number }

export interface SceneLayer {
  id: string;
  name: string;
  z: number;        // depth ordering — lower draws first (behind)
  visible: boolean;
  locked: boolean;
  opacity?: number; // 0..1
}

// ---- UI Overlay ----
export type UIElementKind = "button" | "label" | "image" | "panel" | "bar" | "joystick";
export type UIAnchor = "tl" | "tc" | "tr" | "cl" | "c" | "cr" | "bl" | "bc" | "br";
export type UIAction = "none" | "left" | "right" | "jump" | "restart" | "exit" | "event";
export type UIBind = "none" | "score" | "lives" | "time";

export interface UIElement {
  id: string;
  kind: UIElementKind;
  name: string;
  x: number;            // offset from anchor (px)
  y: number;
  w: number;
  h: number;
  anchor: UIAnchor;
  text?: string;
  fontSize?: number;
  color?: string;       // text / fg color
  bg?: string;          // background
  border?: string;
  radius?: number;
  opacity?: number;
  image?: string | null;
  action?: UIAction;
  eventName?: string;
  bind?: UIBind;
  max?: number;
  visible?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  bg: string;
  bgImage?: string | null;       // dataURL or CDN URL
  bgImageMode?: "cover" | "contain" | "stretch" | "tile";
  gravity: number;
  width: number;
  height: number;
  entities: Entity[];
  timeLimit?: number;            // seconds; 0 = no limit
  parallax?: ParallaxLayer[];    // deprecated — ignored at runtime, kept for older saves
  layers?: SceneLayer[];         // Z-ordered scene layers
  startLives?: number;
  ui?: UIElement[];
}

export const DEFAULT_LAYER_ID = "default";

/** Ensure a scene has at least one layer; mutate-free. */
export function ensureSceneLayers(scene: Scene): Scene {
  if (scene.layers && scene.layers.length > 0) return scene;
  const def: SceneLayer = { id: DEFAULT_LAYER_ID, name: "Principal", z: 0, visible: true, locked: false, opacity: 1 };
  const entities = scene.entities.map(e => e.layerId ? e : { ...e, layerId: DEFAULT_LAYER_ID });
  return { ...scene, layers: [def], entities };
}

/** Sort entities for rendering: by layer Z, then entity z, then y. */
export function sortedForRender(scene: Scene): Entity[] {
  const layerZ = new Map<string, number>();
  for (const l of scene.layers ?? []) layerZ.set(l.id, l.z);
  return [...scene.entities].sort((a, b) => {
    const az: number = (a.layerId ? layerZ.get(a.layerId) : undefined) ?? 0;
    const bz: number = (b.layerId ? layerZ.get(b.layerId) : undefined) ?? 0;
    if (az !== bz) return az - bz;
    return (a.z ?? 0) - (b.z ?? 0);
  });
}

/** Whether an entity is on a hidden layer (renderer should skip it). */
export function isOnHiddenLayer(scene: Scene, e: Entity): boolean {
  if (!e.layerId || !scene.layers) return false;
  const l = scene.layers.find(x => x.id === e.layerId);
  return !!l && l.visible === false;
}

/** Opacity contribution from the entity's scene layer (1 if none). */
export function layerOpacityFor(scene: Scene, e: Entity): number {
  if (!e.layerId || !scene.layers) return 1;
  const l = scene.layers.find(x => x.id === e.layerId);
  if (!l) return 1;
  return l.opacity ?? 1;
}

export interface ProjectSettings {
  fpsCap: 30 | 60;
  showHUD: boolean;
  showFPS?: boolean;
  gridSize?: number;
  snapToGrid?: boolean;
  showGrid?: boolean;
  volume?: number;       // 0..1
  muted?: boolean;
  music?: boolean;
  musicUrl?: string | null;       // dataURL or URL to custom audio file
  musicName?: string | null;      // display name of the uploaded track
  touchControls?: boolean;
  autoPause?: boolean;
  showHitboxes?: boolean;
  language?: "es" | "en" | "pt" | "fr" | "de";
  perfOptimized?: boolean;
  fpsDefault60Applied?: boolean;
}

export interface Project {
  name: string;
  scenes: Scene[];
  activeSceneId: string;
  assets?: { sprites: SpriteAsset[] };
  settings: ProjectSettings;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  fpsCap: 60,
  showHUD: true,
  showFPS: true,
  gridSize: 16,
  snapToGrid: false,
  showGrid: true,
  volume: 0.8,
  muted: false,
  music: false,
  touchControls: true,
  autoPause: true,
  showHitboxes: false,
};

export const KIND_PRESETS: Record<EntityKind, Omit<Entity, "id" | "x" | "y">> = {
  player: { kind: "player", w: 40, h: 56, vx: 0, vy: 0, color: "#38bdf8", solid: true, gravity: true, controllable: true, collectible: false, hazard: false, goal: false, visible: true, opacity: 1, texture: null },
  platform: { kind: "platform", w: 40, h: 40, vx: 0, vy: 0, color: "#1e3a8a", solid: true, gravity: false, controllable: false, collectible: false, hazard: false, goal: false, visible: true, opacity: 1, texture: null },
  enemy: { kind: "enemy", w: 40, h: 40, vx: 60, vy: 0, color: "#f43f5e", solid: false, gravity: true, controllable: false, collectible: false, hazard: true, goal: false, visible: true, opacity: 1, texture: null },
  coin: { kind: "coin", w: 22, h: 22, vx: 0, vy: 0, color: "#fbbf24", solid: false, gravity: false, controllable: false, collectible: true, hazard: false, goal: false, visible: true, opacity: 1, texture: null },
  goal: { kind: "goal", w: 36, h: 64, vx: 0, vy: 0, color: "#7dd3fc", solid: false, gravity: false, controllable: false, collectible: false, hazard: false, goal: true, visible: true, opacity: 1, texture: null },
  decor: { kind: "decor", w: 64, h: 64, vx: 0, vy: 0, color: "#a78bfa", solid: false, gravity: false, controllable: false, collectible: false, hazard: false, goal: false, visible: true, opacity: 1, texture: null, z: -1 },
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newScene(name = "Scene 1"): Scene {
  return ensureSceneLayers({
    id: uid(),
    name,
    bg: "#0b1e3f",
    gravity: 1400,
    width: 1200,
    height: 700,
    entities: [
      { ...KIND_PRESETS.platform, id: uid(), x: 40, y: 600, w: 1120, h: 40 },
      { ...KIND_PRESETS.platform, id: uid(), x: 240, y: 480, w: 200, h: 24 },
      { ...KIND_PRESETS.platform, id: uid(), x: 520, y: 380, w: 200, h: 24 },
      { ...KIND_PRESETS.coin, id: uid(), x: 320, y: 440 },
      { ...KIND_PRESETS.coin, id: uid(), x: 600, y: 340 },
      { ...KIND_PRESETS.enemy, id: uid(), x: 800, y: 540 },
      { ...KIND_PRESETS.goal, id: uid(), x: 1080, y: 536 },
      { ...KIND_PRESETS.player, id: uid(), x: 80, y: 540 },
    ],
  });
}

export function newProject(): Project {
  const s = newScene();
  return {
    name: "Untitled Game",
    scenes: [s],
    activeSceneId: s.id,
    assets: { sprites: [] },
    settings: { ...DEFAULT_SETTINGS },
  };
}


// --- Physics: AABB ---
export function aabb(e: Entity) {
  const hb = e.hitbox;
  if (hb) return { x: e.x + hb.x, y: e.y + hb.y, w: hb.w, h: hb.h };
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

export function intersects(a: Entity, b: Entity) {
  const A = aabb(a), B = aabb(b);
  return A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y;
}

export interface RuntimeInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface ParticleSpec { x: number; y: number; color: string; count?: number }

export interface RuntimeState {
  score: number;
  lives: number;
  win: boolean;
  dead: boolean;
  cameraX: number;
  time: number;
  jumpPrev: boolean;
  djumpAvailable: boolean;
  coyoteT: number;
  jumpBufferT: number;
  invulnT: number;
  speedT: number;
  switches: Record<string, boolean>;
  checkpoint?: { x: number; y: number } | null;
  particles?: ParticleSpec[];
  dialog?: { entityId: string; speaker: string; text: string; portrait?: string | null; lineIndex: number; totalLines: number; pauses: boolean } | null;
  dialogQueue?: { entityId: string }[];
  dialogAdvance?: boolean; // set by UI to advance current line
}

export function newRuntimeState(scene?: Scene): RuntimeState {
  return {
    score: 0,
    lives: scene?.startLives ?? 1,
    win: false, dead: false, cameraX: 0,
    time: 0,
    jumpPrev: false,
    djumpAvailable: false,
    coyoteT: 0,
    jumpBufferT: 0,
    invulnT: 0, speedT: 0,
    switches: {},
    checkpoint: null,
    particles: [],
    dialog: null,
    dialogQueue: [],
    dialogAdvance: false,
  };
}

function startDialog(state: RuntimeState, ent: Entity) {
  const d = ent.dialog;
  if (!d || !d.lines?.length) return;
  const line = d.lines[0];
  state.dialog = {
    entityId: ent.id,
    speaker: line.speaker || d.lines[0]?.speaker || (ent as Entity & { name?: string }).name || ent.kind,
    text: line.text,
    portrait: line.portrait ?? null,
    lineIndex: 0,
    totalLines: d.lines.length,
    pauses: !!d.pausesGame,
  };
  ent._dialogPlayed = true;
}
function advanceDialog(state: RuntimeState, scene: Scene) {
  if (!state.dialog) return;
  const ent = scene.entities.find(e => e.id === state.dialog!.entityId);
  if (!ent || !ent.dialog) { state.dialog = null; return; }
  const next = state.dialog.lineIndex + 1;
  if (next >= ent.dialog.lines.length) {
    state.dialog = null;
    return;
  }
  const line = ent.dialog.lines[next];
  state.dialog = {
    ...state.dialog,
    lineIndex: next,
    speaker: line.speaker || state.dialog.speaker,
    text: line.text,
    portrait: line.portrait ?? state.dialog.portrait,
  };
}

function emit(state: RuntimeState, p: ParticleSpec) {
  if (!state.particles) state.particles = [];
  state.particles.push(p);
}

export function stepScene(scene: Scene, input: RuntimeInput, state: RuntimeState, dt: number) {
  const BASE_SPEED = 220;
  const JUMP = 520;

  // ── Dialogs ───────────────────────────────────────────────────
  // Auto-trigger on scene start (once) for any entity with a dialog flagged auto.
  for (const e of scene.entities) {
    if (!e.dialog || e._dialogPlayed) continue;
    if (e.dialog.trigger === "auto" && !state.dialog) {
      startDialog(state, e);
      break;
    }
  }
  // If a dialog is on screen and pauses the game, honor advance and freeze physics.
  if (state.dialog) {
    if (state.dialogAdvance) {
      state.dialogAdvance = false;
      advanceDialog(state, scene);
    }
    if (state.dialog?.pauses) {
      state.time += dt;
      state.jumpPrev = input.jump;
      return;
    }
  }

  state.time += dt;

  // time limit
  if (scene.timeLimit && scene.timeLimit > 0 && state.time > scene.timeLimit && !state.win) {
    state.dead = true;
  }

  // power-up timers
  if (state.invulnT > 0) state.invulnT = Math.max(0, state.invulnT - dt);
  if (state.speedT > 0) state.speedT = Math.max(0, state.speedT - dt);

  // Moving platforms
  for (const e of scene.entities) {
    const m = e.moving;
    if (!m) continue;
    if (m._origin === undefined) { m._origin = m.axis === "x" ? e.x : e.y; m._dir = 1; }
    const v = (m.speed || 60) * (m._dir ?? 1);
    if (m.axis === "x") {
      e.x += v * dt;
      if (e.x - (m._origin) > m.range) { e.x = m._origin + m.range; m._dir = -1; }
      else if (e.x - m._origin < -m.range) { e.x = m._origin - m.range; m._dir = 1; }
    } else {
      e.y += v * dt;
      if (e.y - m._origin > m.range) { e.y = m._origin + m.range; m._dir = -1; }
      else if (e.y - m._origin < -m.range) { e.y = m._origin - m.range; m._dir = 1; }
    }
  }

  // Crumble respawn
  for (const e of scene.entities) {
    const c = e.crumble;
    if (!c) continue;
    if (c._state === "gone") {
      c._rt = (c._rt ?? 0) + dt;
      if (c._rt >= (c.respawn || 3)) { c._state = "idle"; c._t = 0; c._rt = 0; e.solid = true; e.visible = true; e.opacity = 1; }
    } else if (c._state === "break") {
      c._t = (c._t ?? 0) + dt;
      e.opacity = Math.max(0.2, 1 - (c._t / (c.delay || 1)));
      if (c._t >= (c.delay || 1)) { c._state = "gone"; e.solid = false; e.visible = false; }
    }
  }

  // Player input — smooth accel & friction for game-feel.
  const speedMul = state.speedT > 0 ? 1.6 : 1;
  const TERMINAL = 1200;
  for (const e of scene.entities) {
    if (e.controllable) {
      const wasGrounded = (e as Entity & { _grounded?: boolean })._grounded ?? false;
      const target = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * BASE_SPEED * speedMul;
      // Ground = snappy, air = floaty. Slippery overrides ground accel.
      const floorEnt = (e as Entity & { _floor?: Entity })._floor;
      const slippery = !!(floorEnt && floorEnt.slippery);
      const groundAccel = slippery ? 6 : 22;
      const airAccel = 10;
      const accel = wasGrounded ? groundAccel : airAccel;
      e.vx += (target - e.vx) * Math.min(1, accel * dt);
      // friction when no input and grounded
      if (wasGrounded && !input.left && !input.right && !slippery) {
        e.vx *= Math.max(0, 1 - 18 * dt);
        if (Math.abs(e.vx) < 4) e.vx = 0;
      }
    }
    if (e.gravity) {
      e.vy += scene.gravity * dt;
      if (e.vy > TERMINAL) e.vy = TERMINAL;
    }
    // facing direction follows velocity
    if ((e.controllable || e.kind === "enemy") && Math.abs(e.vx) > 1) {
      e.facing = e.vx > 0 ? 1 : -1;
    }
  }
  const solids = scene.entities.filter((e) => e.solid);
  const interactables = scene.entities.filter((e) => e.collectible || e.hazard || e.goal || e.switchId || e.checkpoint || e.crumble);

  // Predictive ledge detection for enemies (before moving)
  for (const e of scene.entities) {
    if (e.kind !== "enemy" || Math.abs(e.vx) <= 0.1) continue;
    const wasGrounded = (e as Entity & { _grounded?: boolean })._grounded;
    const ledgeSafe = e.patrol ? (e.patrol.ledgeSafe ?? true) : true;
    if (!wasGrounded || !ledgeSafe) continue;
    const nextX = e.x + e.vx * dt;
    const ahead = e.vx >= 0 ? nextX + e.w + 1 : nextX - 1;
    const probeY = e.y + e.h + 2;
    const probeW = 3, probeH = 6;
    let hasGround = false;
    for (const o of solids) {
      if (o === e || !o.solid) continue;
      if (
        ahead < o.x + o.w &&
        ahead + probeW > o.x &&
        probeY < o.y + o.h &&
        probeY + probeH > o.y
      ) { hasGround = true; break; }
    }
    if (!hasGround) e.vx = -e.vx;
  }

  // --- Unified collision resolution (MTV-based) ---
  // 1) Integrate position on both axes
  // 2) Iteratively resolve each overlap on its smallest-penetration axis.
  // This prevents corner-snagging, wall-sticking, and enemies inverting wrong.
  const grounded = new Set<string>();
  const groundedOn = new Map<string, Entity>();
  const EPS = 0.001;

  for (const e of scene.entities) {
    if (e.kind === "platform") continue;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // Entities that physically collide with solids: anything with gravity OR
  // controllable (player). Pickups (coin/goal) and hazard enemies w/o gravity
  // are skipped so they remain in place for the interaction loop.
  const collidesWithSolids = (e: Entity) =>
    e.kind !== "platform" && (e.gravity || e.controllable || e.kind === "enemy");

  for (let iter = 0; iter < 4; iter++) {
    let anyHit = false;
    for (const e of scene.entities) {
      if (!collidesWithSolids(e)) continue;
      for (const o of solids) {
        if (o === e || !o.solid) continue;
        // Hazards never push the player physically — interaction loop handles damage.
        // (But enemy-vs-platform must still resolve so enemies don't fall through.)
        if ((o.hazard && e.controllable) || (e.hazard && o.controllable)) continue;
        if (!intersects(e, o)) continue;
        anyHit = true;
        const A = aabb(e), B = aabb(o);
        const pushLeft  = A.x + A.w - B.x;
        const pushRight = B.x + B.w - A.x;
        const pushUp    = A.y + A.h - B.y;
        const pushDown  = B.y + B.h - A.y;
        const minX = Math.min(pushLeft, pushRight);
        const minY = Math.min(pushUp, pushDown);

        // Strict MTV: resolve on the axis with the smallest penetration.
        // Only bias to "land on top" if Y is already the smaller axis AND
        // we're moving downward — never override when X penetration is
        // clearly smaller (that's a side hit; player must NOT teleport up).
        const resolveY = minY <= minX;

        if (resolveY) {
          if (pushUp <= pushDown) {
            e.y -= pushUp + EPS;
            if (o.spring) {
              e.vy = -(o.spring.force || 720);
            } else {
              if (e.vy > 0) e.vy = 0;
              grounded.add(e.id);
              groundedOn.set(e.id, o);
            }
          } else {
            e.y += pushDown + EPS;
            if (e.vy < 0) e.vy = 0;
          }
        } else {
          if (pushLeft <= pushRight) {
            e.x -= pushLeft + EPS;
            if (e.kind === "enemy") e.vx = -Math.abs(e.vx || 60);
            else if (e.vx > 0) e.vx = 0;
          } else {
            e.x += pushRight + EPS;
            if (e.kind === "enemy") e.vx = Math.abs(e.vx || 60);
            else if (e.vx < 0) e.vx = 0;
          }
        }
      }
    }
    if (!anyHit) break;
  }

  // Persist grounded flag + floor entity for next-frame predictive checks
  for (const e of scene.entities) {
    if (e.kind === "platform") continue;
    (e as Entity & { _grounded?: boolean })._grounded = grounded.has(e.id);
    (e as Entity & { _floor?: Entity | undefined })._floor = groundedOn.get(e.id);
  }



  // Enemy patrol (with ledge detection so enemies don't fall off platforms)
  for (const e of scene.entities) {
    if (e.kind !== "enemy" || !e.patrol) continue;
    if (e.patrol._origin === undefined) e.patrol._origin = e.x;
    if (e.x - e.patrol._origin > e.patrol.range) { e.x = e.patrol._origin + e.patrol.range; e.vx = -Math.abs(e.vx || 60); }
    else if (e.x - e.patrol._origin < -e.patrol.range) { e.x = e.patrol._origin - e.patrol.range; e.vx = Math.abs(e.vx || 60); }

    // Ledge detection — only when grounded; probe a small cell just past the
    // leading edge to see if any solid is underneath. If not, turn around.
    if (grounded.has(e.id) && (e.patrol.ledgeSafe ?? true)) {
      const ahead = e.vx >= 0 ? e.x + e.w + 2 : e.x - 2;
      const probeY = e.y + e.h + 2;
      const probeW = 4, probeH = 6;
      let hasGround = false;
      for (const o of solids) {
        if (o === e) continue;
        if (
          ahead < o.x + o.w &&
          ahead + probeW > o.x &&
          probeY < o.y + o.h &&
          probeY + probeH > o.y
        ) { hasGround = true; break; }
      }
      // also keep them inside scene bounds (treat scene floor as ground)
      if (!hasGround) {
        // reverse and step back to keep enemy safely on the platform
        e.vx = e.vx >= 0 ? -Math.abs(e.vx || 60) : Math.abs(e.vx || 60);
        e.x += e.vx >= 0 ? 2 : -2;
      }
    }
  }

  // Player jump + interactions — coyote time, jump buffer, variable-height jump.
  const COYOTE = 0.10;        // 100 ms grace after leaving ground
  const JUMP_BUFFER = 0.12;   // 120 ms pre-input buffer before landing
  const JUMP_CUT = 0.45;      // vy multiplier when jump released early
  for (const e of scene.entities) {
    if (!e.controllable) continue;
    const onGround = grounded.has(e.id);
    if (onGround) {
      state.djumpAvailable = true;
      state.coyoteT = COYOTE;
    } else {
      state.coyoteT = Math.max(0, state.coyoteT - dt);
    }

    const jumpEdge = input.jump && !state.jumpPrev;
    if (jumpEdge) state.jumpBufferT = JUMP_BUFFER;
    else state.jumpBufferT = Math.max(0, state.jumpBufferT - dt);

    // Initial jump: buffered press meets ground (or coyote window).
    if (state.jumpBufferT > 0 && state.coyoteT > 0) {
      e.vy = -JUMP;
      state.jumpBufferT = 0;
      state.coyoteT = 0;
    } else if (jumpEdge && !onGround && state.djumpAvailable) {
      if ((state as RuntimeState & { canDjump?: boolean }).canDjump) {
        e.vy = -JUMP;
        (state as RuntimeState & { canDjump?: boolean }).canDjump = false;
      }
    }

    // Variable jump height — only cut ONCE on the frame the button is released.
    // (Cutting every frame while button is up kills the jump arc — feels like
    // hitting a ceiling on short taps.)
    if (state.jumpPrev && !input.jump && e.vy < 0) {
      e.vy *= JUMP_CUT;
    }

    // world bounds
    if (e.y > scene.height + 200) {
      if (state.checkpoint) { e.x = state.checkpoint.x; e.y = state.checkpoint.y; e.vx = 0; e.vy = 0; }
      else state.dead = true;
    }

    // dialog triggers (touch / interact)
    if (!state.dialog) {
      const jumpEdge = input.jump && !state.jumpPrev;
      for (const o of scene.entities) {
        if (!o.dialog || o === e) continue;
        if (o.dialog.once && o._dialogPlayed) continue;
        if (o.dialog.trigger !== "touch" && o.dialog.trigger !== "interact") continue;
        if (!intersects(e, o)) continue;
        if (o.dialog.trigger === "interact" && !jumpEdge) continue;
        startDialog(state, o);
        break;
      }
    }

    // interact
    for (const o of interactables) {
      if (o === e) continue;
      if (o.x < -9000) continue;
      if (!intersects(e, o)) continue;
      // Crumble start when stood on
      if (o.crumble && grounded.has(e.id) && groundedOn.get(e.id) === o && o.crumble._state !== "break" && o.crumble._state !== "gone") {
        o.crumble._state = "break"; o.crumble._t = 0;
      }
      if (o.checkpoint) {
        state.checkpoint = { x: o.x, y: o.y - e.h };
        o.color = "#22c55e";
      }
      if (o.collectible) {
        emit(state, { x: o.x + o.w / 2, y: o.y + o.h / 2, color: o.color, count: 8 });
        const pu = o.powerup;
        if (pu === "speed") state.speedT = 6;
        else if (pu === "djump") (state as RuntimeState & { canDjump?: boolean }).canDjump = true;
        else if (pu === "invuln") state.invulnT = 5;
        else state.score += o.value ?? 10;
        o.x = -9999;
      } else if (o.hazard) {
        if (state.invulnT <= 0) {
          emit(state, { x: e.x + e.w / 2, y: e.y + e.h / 2, color: "#f43f5e", count: 14 });
          // Knockback player away from hazard so they don't get stuck inside
          const A = aabb(e), B = aabb(o);
          const dirX = (A.x + A.w / 2) < (B.x + B.w / 2) ? -1 : 1;
          e.vx = dirX * 260;
          e.vy = -320;
          if (state.lives > 1) { state.lives -= 1; state.invulnT = 1.2; if (state.checkpoint) { e.x = state.checkpoint.x; e.y = state.checkpoint.y; e.vx = 0; e.vy = 0; } }
          else state.dead = true;
        }

      } else if (o.goal) {
        state.win = true;
        if (typeof window !== "undefined") {
          try {
            window.dispatchEvent(new CustomEvent("asternal:goal", {
              detail: { nextSceneId: o.nextSceneId ?? null, endsGame: !!o.endsGame },
            }));
          } catch { /* ignore */ }
        }
      } else if (o.switchId) {
        if (!state.switches[o.switchId]) {
          state.switches[o.switchId] = true;
          o.color = "#22c55e";
          // open matching doors
          for (const d of scene.entities) {
            if (d.doorId === o.switchId) { d.solid = false; d.opacity = 0.25; }
          }
        }
      }
    }
    // camera follow
    state.cameraX = Math.max(0, Math.min(scene.width - 360, e.x - 160));
  }

  state.jumpPrev = input.jump;
}


// ---- UI helpers ----
export function resolveUIRect(el: UIElement, screenW: number, screenH: number) {
  let ax = 0, ay = 0;
  const a = el.anchor;
  if (a.includes("c") && a.length === 1) { ax = screenW / 2; ay = screenH / 2; }
  else {
    if (a[0] === "t") ay = 0;
    else if (a[0] === "c") ay = screenH / 2;
    else if (a[0] === "b") ay = screenH;
    if (a[1] === "l") ax = 0;
    else if (a[1] === "c") ax = screenW / 2;
    else if (a[1] === "r") ax = screenW;
  }
  return { x: ax + el.x, y: ay + el.y, w: el.w, h: el.h };
}

export function newUIElement(kind: UIElementKind): UIElement {
  const base = { id: uid(), kind, name: kind, x: 20, y: 20, w: 120, h: 48, anchor: "tl" as UIAnchor, opacity: 1, visible: true };
  switch (kind) {
    case "button":
      return { ...base, anchor: "br", x: -100, y: -100, w: 80, h: 80, radius: 999, bg: "#0ea5e9", color: "#fff", border: "#7dd3fc", text: "JUMP", fontSize: 14, action: "jump" };
    case "label":
      return { ...base, anchor: "tl", x: 16, y: 16, w: 160, h: 28, color: "#7dd3fc", text: "SCORE: 0", fontSize: 16, bind: "score" };
    case "image":
      return { ...base, anchor: "tr", x: -80, y: 16, w: 64, h: 64, image: null };
    case "panel":
      return { ...base, anchor: "tc", x: -120, y: 12, w: 240, h: 40, bg: "rgba(2,6,23,0.6)", border: "#7dd3fc", radius: 8 };
    case "bar":
      return { ...base, anchor: "tl", x: 16, y: 52, w: 180, h: 14, bg: "rgba(2,6,23,0.6)", color: "#22c55e", border: "#7dd3fc", radius: 6, bind: "lives", max: 3 };
    case "joystick":
      return { ...base, anchor: "bl", x: 24, y: -160, w: 140, h: 140, bg: "rgba(2,6,23,0.4)", border: "#7dd3fc", color: "#7dd3fc", radius: 999 };
  }
}

```

--------------------------------------------------------
MÓDULO: scripts.ts (sistema de scripting — código completo)
--------------------------------------------------------
```ts
// Block-based scripting (events + actions) for Asternal Engine
import type { Entity, EntityKind, RuntimeInput, RuntimeState, Scene } from "./core";
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
  | "onLose";

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
  | "setObjectSize";

export interface Block {
  id: string;
  kind: BlockKind;
  value?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  soundUrl?: string;   // dataURL/URL del sonido del usuario
  soundName?: string;  // nombre visible del sonido
  color?: string;
  bool?: boolean;
  cond?: "scoreGte" | "scoreLte";
  thenBlocks?: Block[];
}

export interface Script {
  id: string;
  event: EventType;
  withKind?: EntityKind | "any";          // onCollide
  key?: "left" | "right" | "jump";        // onKeyDown
  threshold?: number;                     // onScoreReach
  interval?: number;                      // onTimer (ms)
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
};

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
  "log", "comment", "if", "wait",
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
    // Cambia el tamaño de un objeto concreto (no solo el de este script):
    // text = "self" o un EntityKind; w/h = nuevo ancho/alto (>=4 px);
    // bool = false aplica al primer objeto de ese tipo, true a todos.
    case "setObjectSize": {
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
    case "wait": break; // no-op marker; sub-frame waits handled via onTimer
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

    case "if": {
      const v = b.value ?? 0;
      const ok =
        b.cond === "scoreGte" ? ctx.state.score >= v :
        b.cond === "scoreLte" ? ctx.state.score <= v : false;
      if (ok) for (const sub of b.thenBlocks ?? []) execBlock(sub, ctx);
      break;
    }
  }
}

function runScript(s: Script, ctx: ExecCtx) {
  for (const b of s.blocks) execBlock(b, ctx);
}

export interface ScriptRunner {
  step: (scene: Scene, state: RuntimeState, input: RuntimeInput, hooks: RuntimeHooks, dt: number) => void;
}

export function createScriptRunner(): ScriptRunner {
  const started = new Set<string>();
  const destroyed = new Set<string>();
  const left = new Set<string>();
  const colliding = new Set<string>();
  const prevVy = new Map<string, number>();
  const timerAcc = new Map<string, number>();
  let prevInput: RuntimeInput = { left: false, right: false, jump: false };
  let prevScore = 0;
  let prevWin = false;
  let prevDead = false;

  return {
    step(scene, state, input, hooks, dt) {
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
          for (const s of scripts) if (s.event === "onDestroyed" || s.event === "onDestroy")
            runScript(s, { self: e, scene, state, hooks });
        }
        if (e.x < -9000) continue;

        const outside = e.x + e.w < 0 || e.x > scene.width || e.y > scene.height + 200 || e.y + e.h < -200;
        if (outside && !left.has(e.id)) {
          left.add(e.id);
          for (const s of scripts) if (s.event === "onLeaveScreen")
            runScript(s, { self: e, scene, state, hooks });
        } else if (!outside) {
          left.delete(e.id);
        }

        if (!started.has(e.id)) {
          for (const s of scripts) if (s.event === "onStart" || s.event === "onCreate")
            runScript(s, { self: e, scene, state, hooks });
          started.add(e.id);
        }

        const pv = prevVy.get(e.id) ?? 0;
        const landed = pv > 80 && e.vy === 0;

        for (const s of scripts) {
          if (s.event === "onUpdate") {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onKeyDown" && s.key && keyEdges[s.key]) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onScoreReach") {
            const t = s.threshold ?? 0;
            if (prevScore < t && state.score >= t)
              runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onTimer") {
            const iv = Math.max(0.05, (s.interval ?? 1000) / 1000);
            const acc = (timerAcc.get(s.id) ?? 0) + dt;
            if (acc >= iv) { timerAcc.set(s.id, 0); runScript(s, { self: e, scene, state, hooks }); }
            else timerAcc.set(s.id, acc);
          } else if (s.event === "onLand" && landed) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onWin" && winEdge) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onLose" && loseEdge) {
            runScript(s, { self: e, scene, state, hooks });
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
              runScript(s, { self: a, other: b, scene, state, hooks });
            }
          }
        }
      }
      colliding.clear();
      now.forEach(k => colliding.add(k));

      prevInput = { ...input };
      prevScore = state.score;
      prevWin = state.win;
      prevDead = state.dead;
    },
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

```

--------------------------------------------------------
MÓDULO: storage.ts — firmas de la API
--------------------------------------------------------
```ts
export interface ProjectMeta {
export function setProjectCloudId(id: string, cloudId: string) {
export function getProjectCloudId(id: string): string | undefined {
export function listProjects(): ProjectMeta[] {
export function getCurrentProjectId(): string {
export function setCurrentProjectId(id: string) {
export function loadProjectById(id: string): Project | null {
export function loadProject(): Project {
export function saveProject(p: Project) {
export function saveProjectById(id: string, p: Project) {
export function createProject(name?: string): string {
export function deleteProjectById(id: string) {
export function renameProject(id: string, name: string) {
export function duplicateProject(id: string): string | null {
```

--------------------------------------------------------
MÓDULO: animations.ts — firmas de la API
--------------------------------------------------------
```ts
export type AnimState = "idle" | "walk" | "run" | "jump" | "fall" | "attack" | string
export interface AnimationClip {
export const DEFAULT_ANIM_NAMES: AnimState[] = ["idle", "walk", "run", "jump", "fall", "attack"];  /** Pick which animation should play for an entity right now. */
export function pickAnimState(e: Entity): AnimState {
export function findClip(e: Entity, state: AnimState): AnimationClip | null {
export function currentFrameSrc(e: Entity, time: number, state?: AnimState): string | null {
export function currentFrameImage(e: Entity, time: number, state?: AnimState): HTMLImageElement | null {
export function currentFrameRenderable(e: Entity, time: number, state?: AnimState): HTMLImageElement | ImageBitmap | null {
```

--------------------------------------------------------
MÓDULO: sfx.ts — firmas de la API
--------------------------------------------------------
```ts
export function setVolume(v: number) { volume = Math.max(0, Math.min(1, v)); if (musicEl) musicEl.volume = volume; }
export function setMuted(v: boolean) { muted = v; if (v) stopMusic(); }
export interface CustomSound { id: string; name: string; url: string }
export function loadCustomSounds(): CustomSound[]
export function saveCustomSounds(list: CustomSound[])
export function addCustomSound(name: string, url: string, id?: string): CustomSound[]
export function playSoundUrl(url?: string | null): boolean
export function playRandomCustomSound(): boolean
export function vibrate(ms: number) {
export function startMusic(url?: string | null) {
export function stopMusic() {
```

--------------------------------------------------------
MÓDULO: images.ts — firmas de la API
--------------------------------------------------------
```ts
export type RenderableImage = HTMLImageElement | ImageBitmap
export function getImage(src: string): HTMLImageElement | null {
export function getRenderableImage(src: string): RenderableImage | null {
export function preloadImage(src: string): Promise<HTMLImageElement> {
export async function fileToDataURL(file: File): Promise<string> {
export function drawTransparencyGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell = 12) {
```

--------------------------------------------------------
MÓDULO: cloud-sync.ts — firmas de la API
--------------------------------------------------------
```ts
export function schedulePushToCloud(localId: string, project: Project) {
export async function importCloudMissing(): Promise<{ imported: number; total: number }> {
export async function fetchCloudProjects(): Promise<CloudProject[]> {
export async function syncAllProjects(): Promise<{ pushed: number; imported: number }> {
```