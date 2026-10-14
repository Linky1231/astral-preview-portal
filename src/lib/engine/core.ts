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
  /** Datos de autoría libres para que los scripts no dependan de casos por tipo. */
  variables?: Record<string, string | number | boolean>;
  tags?: string[];
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
  /**
   * Objeto padre. El hijo es una entidad normal —con sus propios scripts,
   * comportamientos y ajustes— que además **hereda el movimiento** del padre y se
   * desplaza por su cuenta dentro de él (ver «Jerarquía de objetos»).
   */
  parentId?: string | null;
  /** Posición del fotograma anterior: solo la usa el reparto de movimiento. */
  _px?: number;
  _py?: number;
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
  /**
   * Scripts de bloque del elemento (mismos que una entidad).
   *
   * Se ejecutan al interactuar con el elemento: los eventos de interfaz
   * (`onTap`, `onHold`, `onRelease`) los dispara el toque, y `self` es el
   * propio elemento, así que los bloques de interfaz (mostrar/ocultar, tamaño,
   * posición, color, opacidad) actúan sobre él.
   */
  scripts?: Script[];
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
  /** Estado compartido por escena, accesible desde los bloques visuales. */
  variables?: Record<string, string | number | boolean>;
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

/**
 * Añade una capa nueva a la escena.
 *
 * El selector de capas permite crear tantas como haga falta (antes no había
 * forma de añadirlas). La capa nace con un id único, un nombre legible y por
 * delante de las existentes, para verla de inmediato al colocar objetos.
 */
export function addSceneLayer(
  scene: Scene,
  patch: Partial<SceneLayer> = {},
): { scene: Scene; layerId: string } {
  const layers = scene.layers ?? [];
  const id = uid();
  const topZ = layers.reduce((m, l) => Math.max(m, l.z), 0);
  const layer: SceneLayer = {
    id,
    name: patch.name ?? `Capa ${layers.length + 1}`,
    z: patch.z ?? Math.min(10, topZ + 1),
    visible: patch.visible ?? true,
    locked: patch.locked ?? false,
    opacity: patch.opacity ?? 1,
  };
  return { scene: { ...scene, layers: [...layers, layer] }, layerId: id };
}

/**
 * Borra una capa y reasigna sus objetos a otra capa.
 *
 * Nunca deja entidades huérfanas apuntando a una capa que ya no existe: sus
 * objetos pasan a la primera capa restante (o a la «Principal» por defecto si
 * era la última).
 */
export function removeSceneLayer(scene: Scene, layerId: string): Scene {
  const layers = scene.layers ?? [];
  if (!layers.some(l => l.id === layerId)) return scene;
  const remaining = layers.filter(l => l.id !== layerId);
  const fallbackId = remaining[0]?.id ?? DEFAULT_LAYER_ID;
  const nextLayers: SceneLayer[] = remaining.length > 0
    ? remaining
    : [{ id: DEFAULT_LAYER_ID, name: "Principal", z: 0, visible: true, locked: false, opacity: 1 }];
  const entities = scene.entities.map(e =>
    (e.layerId ?? DEFAULT_LAYER_ID) === layerId ? { ...e, layerId: fallbackId } : e,
  );
  return { ...scene, layers: nextLayers, entities };
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
  /** 120 solo está disponible en el motor beta (función en pruebas). */
  fpsCap: 30 | 60 | 120;
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

/** Desplazamiento por defecto (px de mundo) de una copia respecto al original. */
export const CLONE_OFFSET = 24;

/**
 * ¿Es el jugador de verdad?
 *
 * La marca fiable es `controllable` (es quien responde al mando), no el tipo:
 * un clon del personaje es de tipo `player` pero no controla, así que se puede
 * mover y borrar como cualquier otra entidad. Solo el original queda protegido.
 */
export function isPlayerEntity(e: Entity): boolean {
  return e.controllable === true;
}

/**
 * Duplica una entidad dentro de su escena.
 *
 * Lo usan por igual el botón «Duplicar» de la fila de acciones, el atajo
 * Ctrl+D y el botón del inspector, así que el clon sale siempre igual: id
 * nuevo, desplazado y listo para seleccionar.
 *
 * El motor admite un único personaje jugable: si la entidad original controla
 * al jugador, el clon nace como doble (visible, con física, pero sin mando).
 * Devuelve `null` si la entidad ya no existe en la escena.
 */
export function duplicateEntityInScene(
  scene: Scene,
  entityId: string,
  offset: number = CLONE_OFFSET,
): { scene: Scene; cloneId: string } | null {
  const source = scene.entities.find((e) => e.id === entityId);
  if (!source) return null;
  const clone: Entity = {
    ...source,
    id: uid(),
    x: source.x + offset,
    y: source.y + offset,
    controllable: isPlayerEntity(source) ? false : source.controllable,
  };
  return { scene: { ...scene, entities: [...scene.entities, clone] }, cloneId: clone.id };
}

// ── Jerarquía de objetos (padre → hijos) ──────────────────────────
//
// Un objeto hijo es una entidad normal más un vínculo `parentId`: conserva sus
// scripts, comportamientos y configuración, y sigue moviéndose por su cuenta.
// El vínculo solo aporta **movimiento heredado**: cuando el padre se desplaza,
// sus hijos se desplazan exactamente igual, sin matrices ni transformaciones
// intermedias (por eso mover un padre nunca descoloca a sus hijos).

/** Entidad por id (o null si no existe). */
export function entityById(scene: Scene, id: string | null | undefined): Entity | null {
  if (!id) return null;
  return scene.entities.find(e => e.id === id) ?? null;
}

/** Hijos directos de una entidad, en el orden de la escena. */
export function childrenOf(scene: Scene, parentId: string | null | undefined): Entity[] {
  if (!parentId) return [];
  return scene.entities.filter(e => e.parentId === parentId);
}

/** ¿Esta entidad tiene hijos? */
export function hasChildren(scene: Scene, id: string): boolean {
  return scene.entities.some(e => e.parentId === id);
}

/** Ids de todos los descendientes (hijos, nietos…), en cualquier profundidad. */
export function descendantIds(scene: Scene, id: string): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const e of scene.entities) {
      if (e.parentId !== current || e.id === id || out.has(e.id)) continue;
      out.add(e.id);
      queue.push(e.id);
    }
  }
  return out;
}

/**
 * Profundidad en el árbol (0 = objeto raíz).
 *
 * Corta ciclos por si llega un guardado incoherente: nunca entra en bucle.
 */
export function hierarchyDepth(scene: Scene, e: Entity): number {
  let depth = 0;
  let current: Entity | null = e;
  const seen = new Set<string>([e.id]);
  while (current?.parentId) {
    const parent = entityById(scene, current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    depth += 1;
    current = parent;
  }
  return depth;
}

/**
 * ¿Se puede vincular `childId` como hijo de `parentId`?
 *
 * Evita los casos imposibles: que falte alguna de las dos entidades, que sea
 * ella misma y que el «padre» elegido sea en realidad un descendiente suyo
 * (lo que crearía un ciclo en el árbol).
 */
export function canAttachAsChild(scene: Scene, childId: string, parentId: string): boolean {
  if (childId === parentId) return false;
  if (!entityById(scene, childId) || !entityById(scene, parentId)) return false;
  return !descendantIds(scene, childId).has(parentId);
}

/** Vincula un objeto como hijo de otro, sin tocar nada más (ni su posición). */
export function attachEntityToParent(scene: Scene, childId: string, parentId: string): Scene {
  if (!canAttachAsChild(scene, childId, parentId)) return scene;
  return { ...scene, entities: scene.entities.map(e => e.id === childId ? { ...e, parentId } : e) };
}

/** Desvincula un objeto de su padre: sigue en la escena, ya independiente. */
export function detachEntityFromParent(scene: Scene, childId: string): Scene {
  const child = entityById(scene, childId);
  if (!child?.parentId) return scene;
  return { ...scene, entities: scene.entities.map(e => e.id === childId ? { ...e, parentId: null } : e) };
}

/**
 * Mantiene al hijo dentro del rectángulo de su padre.
 *
 * Solo actúa cuando el hijo cabe: uno más grande que su padre se deja libre
 * (recortarlo no tendría sentido). Es lo que hace que los hijos se coloquen
 * «de forma organizada» dentro del padre en lugar de salirse sin querer.
 */
export function clampChildWithinParent(scene: Scene, child: Entity): Entity {
  const parent = entityById(scene, child.parentId);
  if (!parent) return child;
  const clampAxis = (value: number, size: number, from: number, total: number) => {
    if (size > total) return value;
    return Math.min(Math.max(value, from), from + total - size);
  };
  const x = clampAxis(child.x, child.w, parent.x, parent.w);
  const y = clampAxis(child.y, child.h, parent.y, parent.h);
  return x === child.x && y === child.y ? child : { ...child, x, y };
}

/**
 * Desplaza una entidad y, con ella, todos sus descendientes.
 *
 * Lo usan el arrastre del lienzo y los deslizadores del inspector: mover el
 * padre nunca deja atrás a sus hijos, y mover un hijo solo lo mueve a él (y se
 * mantiene dentro del padre).
 */
export function moveEntityWithChildren(scene: Scene, id: string, dx: number, dy: number): Scene {
  if (!dx && !dy) return scene;
  const moving = new Set<string>([id, ...descendantIds(scene, id)]);
  const entities = scene.entities.map(e =>
    moving.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e,
  );
  const moved: Scene = { ...scene, entities };
  const clamped = entities.map(e => (e.parentId && moving.has(e.id) ? clampChildWithinParent(moved, e) : e));
  return clamped.every((e, i) => e === entities[i]) ? moved : { ...moved, entities: clamped };
}

/** Coloca una entidad en (x, y) arrastrando a sus hijos (deslizadores del inspector). */
export function setEntityPosition(scene: Scene, id: string, x: number, y: number): Scene {
  const target = entityById(scene, id);
  if (!target) return scene;
  return moveEntityWithChildren(scene, id, x - target.x, y - target.y);
}

/**
 * Crea un objeto hijo dentro de un padre a partir de un asset guardado.
 *
 * El preset aporta el aspecto y los ajustes del asset (textura, color, tamaño,
 * scripts, comportamientos…), así que el hijo es exactamente lo que la persona
 * guardó en su Biblioteca y no un tipo por defecto. La jerarquía aporta lo que
 * es propio de un hijo: nace centrado en el padre, en su misma capa, por delante
 * suyo y **sin gravedad propia** (no se cae del padre). Después se edita como
 * cualquier entidad.
 */
export function createChildFromPreset(
  scene: Scene,
  parentId: string,
  preset: Omit<Entity, "id" | "x" | "y">,
): { scene: Scene; childId: string } | null {
  const parent = entityById(scene, parentId);
  if (!parent) return null;
  const w = Math.max(12, Math.min(preset.w, Math.round(parent.w * 0.4)));
  const h = Math.max(12, Math.min(preset.h, Math.round(parent.h * 0.4)));
  const child: Entity = {
    ...preset,
    id: uid(),
    x: Math.round(parent.x + (parent.w - w) / 2),
    y: Math.round(parent.y + (parent.h - h) / 2),
    w,
    h,
    vx: 0,
    vy: 0,
    gravity: false,
    controllable: false,
    z: (parent.z ?? 0) + 1,
    layerId: parent.layerId ?? DEFAULT_LAYER_ID,
    parentId,
  };
  return { scene: { ...scene, entities: [...scene.entities, child] }, childId: child.id };
}

/**
 * Crea un objeto hijo a partir de un tipo del motor (assets predeterminados).
 *
 * El editor usa `createChildFromPreset` con los assets guardados de la
 * Biblioteca; esta variante se conserva para pruebas y para crear un hijo por
 * tipo sin pasar por la Biblioteca.
 */
export function createChildEntity(
  scene: Scene,
  parentId: string,
  kind: EntityKind = "decor",
): { scene: Scene; childId: string } | null {
  return createChildFromPreset(scene, parentId, KIND_PRESETS[kind]);
}

/**
 * Borra una entidad con todos sus descendientes.
 *
 * Un árbol borrado por la mitad dejaría hijos sueltos por la escena; el editor
 * permite deshacerlo (Ctrl+Z), así que se borra la rama completa.
 */
export function removeEntityWithChildren(scene: Scene, id: string): Scene {
  const doomed = new Set<string>([id, ...descendantIds(scene, id)]);
  return { ...scene, entities: scene.entities.filter(e => !doomed.has(e.id)) };
}

/**
 * Reparte el movimiento del padre entre sus hijos, dentro del bucle del juego.
 *
 * `_px`/`_py` guardan la posición del fotograma anterior. Recorriendo el árbol
 * **de arriba abajo**, el delta de cada objeto (lo que se movió por sí mismo más
 * lo que heredó) se suma a sus hijos: una cadena de cualquier profundidad se
 * mueve igual que su raíz sin perder su propio desplazamiento.
 */
export function syncChildrenWithParents(scene: Scene): void {
  const byId = new Map(scene.entities.map(e => [e.id, e]));
  const childrenByParent = new Map<string, Entity[]>();
  for (const e of scene.entities) {
    const parentId = e.parentId && e.parentId !== e.id && byId.has(e.parentId) ? e.parentId : null;
    if (!parentId) continue;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(e);
    childrenByParent.set(parentId, list);
  }
  if (childrenByParent.size === 0) {
    for (const e of scene.entities) { e._px = e.x; e._py = e.y; }
    return;
  }
  const order = [...scene.entities].sort((a, b) => hierarchyDepth(scene, a) - hierarchyDepth(scene, b));
  for (const e of order) {
    const dx = e.x - (e._px ?? e.x);
    const dy = e.y - (e._py ?? e.y);
    // Una entidad destruida (enviada fuera de la escena) no arrastra a sus hijos.
    if ((dx || dy) && e.x > -9000 && e.y > -9000) {
      for (const child of childrenByParent.get(e.id) ?? []) {
        child.x += dx;
        child.y += dy;
      }
    }
    e._px = e.x;
    e._py = e.y;
  }
}

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

  // Referencia de posición del fotograma anterior. Se toma al empezar el paso
  // —también en el primero— para que el reparto de movimiento a los hijos
  // funcione desde el primer fotograma; si no, un hijo perdería ese primer
  // tramo del recorrido de su padre.
  for (const e of scene.entities) {
    if (e._px === undefined) { e._px = e.x; e._py = e.y; }
  }

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

  // Los objetos hijos se mueven junto a su padre: al final del paso ya están
  // resueltas la física y la entrada, así que el reparto usa el movimiento real
  // de este fotograma.
  syncChildrenWithParents(scene);

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
