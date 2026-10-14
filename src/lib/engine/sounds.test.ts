import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addCustomSound,
  loadCustomSounds,
  playRandomCustomSound,
  playSoundUrl,
  setMuted,
  stopCustomSounds,
} from "./sfx";
import { createScriptRunner, type Block, type Script } from "./scripts";
import { newRuntimeState, type Entity, type Scene } from "./core";

/** Audio falso: registra qué url se pidió reproducir y respeta volume/muted. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  volume = 1;
  paused = true;
  ended = false;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

function installLocalStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const stub = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof stub }).localStorage = stub;
  return stub;
}

beforeEach(() => {
  installLocalStorage();
  FakeAudio.instances = [];
  (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
  setMuted(false);
});

afterEach(() => {
  stopCustomSounds();
  setMuted(false);
  delete (globalThis as unknown as { Audio?: unknown }).Audio;
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("biblioteca de sonidos personalizados", () => {
  it("empieza vacía y guarda/lee los sonidos del usuario", () => {
    expect(loadCustomSounds()).toEqual([]);
    addCustomSound("salto.wav", "data:audio/wav;base64,AAA");
    const list = loadCustomSounds();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "salto.wav", url: "data:audio/wav;base64,AAA" });
  });

  it("no duplica el mismo archivo y conserva el más reciente", () => {
    addCustomSound("viejo", "data:audio/wav;base64,AAA");
    addCustomSound("nuevo", "data:audio/wav;base64,AAA");
    const list = loadCustomSounds();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("nuevo");
  });

  it("no reproduce nada sin archivo ni con el audio silenciado", () => {
    expect(playSoundUrl(null)).toBe(false);
    expect(playSoundUrl("")).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
    setMuted(true);
    expect(playSoundUrl("data:audio/wav;base64,AAA")).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("reproduce el archivo del usuario y aplica el volumen", () => {
    expect(playSoundUrl("data:audio/wav;base64,BBB")).toBe(true);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe("data:audio/wav;base64,BBB");
  });

  it("elige un sonido aleatorio solo de la biblioteca del usuario", () => {
    expect(playRandomCustomSound()).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
    addCustomSound("uno", "data:audio/wav;base64,CCC");
    expect(playRandomCustomSound()).toBe(true);
    expect(FakeAudio.instances.map(a => a.src)).toEqual(["data:audio/wav;base64,CCC"]);
  });
});

// --- Scripts: el bloque de sonido nunca usa preajustes ---

let counter = 0;
const id = () => `id${++counter}`;

function ent(p: Partial<Entity> & { kind: Entity["kind"] }): Entity {
  return {
    id: id(), x: 0, y: 0, w: 20, h: 20, vx: 0, vy: 0, color: "#ffffff",
    solid: false, gravity: false, controllable: false, collectible: false,
    hazard: false, goal: false, ...p,
  } as Entity;
}

function makeScene(entities: Entity[]): Scene {
  return { id: "s", name: "s", bg: "#000000", gravity: 0, width: 800, height: 600, entities };
}

const hooks = { shake: () => {}, restart: () => {} };
const input = { left: false, right: false, jump: false };
const b = (kind: Block["kind"], extra: Partial<Block> = {}): Block => ({ id: id(), kind, ...extra });
const script = (s: Omit<Script, "id">): Script => ({ id: id(), ...s });

function run(blocks: Block[]) {
  const player = ent({ kind: "player", controllable: true, scripts: [script({ event: "onStart", blocks })] });
  const scene = makeScene([player]);
  createScriptRunner().step(scene, newRuntimeState(scene), input, hooks, 1 / 60);
}

describe("bloques de sonido sin preajustes", () => {
  it("un bloque sin archivo no suena (no hay sonido predeterminado)", () => {
    run([b("playSound")]);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("un bloque con archivo reproduce exactamente ese archivo", () => {
    run([b("playSound", { soundUrl: "data:audio/wav;base64,MI_PISTA", soundName: "mi-pista" })]);
    expect(FakeAudio.instances.map(a => a.src)).toEqual(["data:audio/wav;base64,MI_PISTA"]);
  });

  it("playRandomSound usa la biblioteca del usuario y no un preset", () => {
    run([b("playRandomSound")]);
    expect(FakeAudio.instances).toHaveLength(0);
    addCustomSound("explosion", "data:audio/wav;base64,BOOM");
    run([b("playRandomSound")]);
    expect(FakeAudio.instances.map(a => a.src)).toEqual(["data:audio/wav;base64,BOOM"]);
  });
});
