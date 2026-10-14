import { describe, expect, it } from "vitest";

import {
  ENTITY_EVENTS, UI_EVENTS, createScriptRunner,
  type Block, type EventType, type Script,
} from "./scripts";
import { newRuntimeState, newUIElement, type Entity, type Scene, type UIElement } from "./core";

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

function uiButton(scripts: Script[], extra: Partial<UIElement> = {}): UIElement {
  return { ...newUIElement("button"), id: id(), scripts, ...extra };
}

const hooks = { shake: () => {}, restart: () => {} };
const input = { left: false, right: false, jump: false };
const b = (kind: Block["kind"], extra: Partial<Block> = {}): Block => ({ id: id(), kind, ...extra });
const script = (event: EventType, blocks: Block[]): Script => ({ id: id(), event, blocks });
const dt = 1 / 60;

describe("scripts de un elemento de interfaz", () => {
  it("cada momento ejecuta solo su script: al pulsar, mientras se mantiene y al soltar", () => {
    const scene = makeScene([ent({ kind: "coin" })]);
    const state = newRuntimeState(scene);
    const button = uiButton([
      script("onTap", [b("addScore", { value: 1 })]),
      script("onHold", [b("addScore", { value: 10 })]),
      script("onRelease", [b("addScore", { value: 100 })]),
      // Este evento es de entidad: un toque nunca lo dispara.
      script("onUpdate", [b("addScore", { value: 1000 })]),
    ]);
    scene.ui = [button];

    const runner = createScriptRunner();
    runner.step(scene, state, input, hooks, dt);

    runner.runUI(button, "tap");
    expect(state.score).toBe(1);

    runner.runUI(button, "hold");
    expect(state.score).toBe(11);

    runner.runUI(button, "release");
    expect(state.score).toBe(111);
  });

  it("dentro del script el propio elemento es el sujeto: tamaño, posición, color, opacidad y visibilidad", () => {
    const scene = makeScene([ent({ kind: "coin" })]);
    const state = newRuntimeState(scene);
    const button = uiButton([
      script("onTap", [
        b("setSize", { x: 200, y: 80 }),
        b("setX", { value: 12 }),
        b("setColor", { color: "#ff0000" }),
        b("setOpacity", { value: 50 }),
        b("setVisible", { bool: false }),
      ]),
    ]);
    scene.ui = [button];

    const runner = createScriptRunner();
    runner.step(scene, state, input, hooks, dt);
    runner.runUI(button, "tap");

    expect(button.w).toBe(200);
    expect(button.h).toBe(80);
    expect(button.x).toBe(12);
    expect(button.color).toBe("#ff0000");
    expect(button.opacity).toBe(0.5);
    expect(button.visible).toBe(false);
  });

  it("un mensaje del script de interfaz llega a los scripts de la escena en el paso siguiente", () => {
    const watcher = ent({
      kind: "coin",
      scripts: [script("onMessage", [b("addScore", { value: 7 })])],
    });
    watcher.scripts![0].message = "empezar";
    const scene = makeScene([watcher]);
    const state = newRuntimeState(scene);
    const button = uiButton([script("onTap", [b("broadcast", { text: "empezar" })])]);
    scene.ui = [button];

    const runner = createScriptRunner();
    runner.step(scene, state, input, hooks, dt);

    runner.runUI(button, "tap");
    expect(state.score).toBe(0);   // el mensaje se reparte en el paso, no al vuelo

    runner.step(scene, state, input, hooks, dt);
    expect(state.score).toBe(7);
  });

  it("un `esperar` dentro de un script de interfaz se reanuda donde se quedó, sin reiniciarlo", () => {
    const scene = makeScene([ent({ kind: "coin" })]);
    const state = newRuntimeState(scene);
    const button = uiButton([
      script("onTap", [
        b("addScore", { value: 1 }),
        b("wait", { value: 200 }),
        b("addScore", { value: 10 }),
      ]),
    ]);
    scene.ui = [button];

    const runner = createScriptRunner();
    runner.step(scene, state, input, hooks, dt);
    runner.runUI(button, "tap");
    expect(state.score).toBe(1);

    // Pulsar otra vez mientras espera no lo reejecuta desde el principio.
    runner.runUI(button, "tap");
    expect(state.score).toBe(1);

    for (let i = 0; i < 14; i++) runner.step(scene, state, input, hooks, dt);
    expect(state.score).toBe(11);
  });

  it("si aún no ha habido ningún paso del motor, no hay escena donde ejecutar y no lanza", () => {
    const button = uiButton([script("onTap", [b("addScore", { value: 1 })])]);
    const runner = createScriptRunner();
    expect(() => runner.runUI(button, "tap")).not.toThrow();
  });
});

describe("eventos de interfaz y de entidad no se mezclan", () => {
  it("los eventos de interfaz son los tres momentos y no aparecen en el editor de entidades", () => {
    expect(UI_EVENTS).toEqual(["onTap", "onHold", "onRelease"]);
    for (const event of UI_EVENTS) expect(ENTITY_EVENTS).not.toContain(event);
    // Y el editor de entidades sigue ofreciendo todo lo demás.
    expect(ENTITY_EVENTS).toContain("onStart");
    expect(ENTITY_EVENTS).toContain("onCollide");
    expect(ENTITY_EVENTS).toContain("onMessage");
  });
});
