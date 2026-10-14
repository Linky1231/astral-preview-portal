import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_BLOCKS, BLOCK_LABELS, applyScriptEdit, createScriptRunner, normalizeScript, normalizeScripts, type Block, type Script } from "./scripts";
import { newRuntimeState, type Entity, type Scene } from "./core";

afterEach(() => vi.restoreAllMocks());

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
const dt = 1 / 60;

describe("script runner · varios bloques en un mismo script", () => {
  it("aplica cada bloque de forma independiente", () => {
    const player = ent({ kind: "player", controllable: true });
    player.scripts = [
      script({
        event: "onStart",
        blocks: [
          b("addScore", { value: 10 }),
          b("moveX", { value: 5 }),
          b("setVariable", { text: "n", value: 0, scope: "entity" }),
          b("changeVariable", { text: "n", value: 3, scope: "entity" }),
          b("ifVariable", { text: "n", operator: "gte", value: 3, scope: "entity", thenBlocks: [b("addScore", { value: 100 })] }),
          b("repeat", { repeat: 3, thenBlocks: [b("moveY", { value: 2 })] }),
          b("comment", { text: "note" }),
          b("broadcast", { text: "ping" }),
        ],
      }),
      script({ event: "onMessage", message: "ping", blocks: [b("setColor", { color: "#123456" })] }),
    ];
    const scene = makeScene([player]);
    const state = newRuntimeState(scene);

    createScriptRunner().step(scene, state, input, hooks, dt);

    expect(state.score).toBe(110);          // addScore + ifVariable(then)
    expect(player.x).toBe(5);               // moveX
    expect(player.y).toBe(6);               // repeat × moveY
    expect(player.variables?.n).toBe(3);    // setVariable + changeVariable
    expect(player.color).toBe("#123456");   // broadcast consumido por onMessage
  });

  it("cambia el tamaño de un objeto concreto por tipo, dejando al resto intacto", () => {
    const player = ent({ kind: "player", w: 20, h: 20 });
    const first = ent({ kind: "coin", w: 10, h: 10, x: 300 });
    const second = ent({ kind: "coin", w: 12, h: 12, x: 400 });
    player.scripts = [
      script({ event: "onStart", blocks: [b("setObjectSize", { text: "coin", w: 40, h: 60 })] }),
    ];
    const scene = makeScene([player, first, second]);

    createScriptRunner().step(scene, newRuntimeState(scene), input, hooks, dt);

    expect(first.w).toBe(40);
    expect(first.h).toBe(60);
    expect(second.w).toBe(12);        // solo el primero del tipo
    expect(player.w).toBe(20);        // no toca al objeto que ejecuta el script
  });

  it("con bool aplica el tamaño a todos los objetos de ese tipo", () => {
    const player = ent({ kind: "player" });
    const a = ent({ kind: "enemy", w: 10, h: 10 });
    const c = ent({ kind: "enemy", w: 10, h: 10 });
    player.scripts = [
      script({ event: "onStart", blocks: [b("setObjectSize", { text: "enemy", w: 50, h: 50, bool: true })] }),
    ];
    const scene = makeScene([player, a, c]);

    createScriptRunner().step(scene, newRuntimeState(scene), input, hooks, dt);

    expect(a.w).toBe(50);
    expect(a.h).toBe(50);
    expect(c.w).toBe(50);
    expect(c.h).toBe(50);
  });

  it("setObjectSize con self ajusta la propia entidad sin tocar a las demás", () => {
    const player = ent({ kind: "player", w: 20, h: 20 });
    const other = ent({ kind: "player", w: 30, h: 30 });
    player.scripts = [
      script({ event: "onStart", blocks: [b("setObjectSize", { text: "self", w: 64, h: 8 })] }),
    ];
    const scene = makeScene([player, other]);

    createScriptRunner().step(scene, newRuntimeState(scene), input, hooks, dt);

    expect(player.w).toBe(64);
    expect(player.h).toBe(8);
    expect(other.w).toBe(30);
  });

  it("no rompe cuando dos entidades cercanas comparten el mismo script", () => {
    const a = ent({ kind: "coin" });
    const c = ent({ kind: "coin" });
    const shared = script({ event: "onStart", blocks: [b("addScore", { value: 1 })] });
    a.scripts = [shared];
    c.scripts = [shared];
    const scene = makeScene([a, c]);
    const state = newRuntimeState(scene);

    createScriptRunner().step(scene, state, input, hooks, dt);

    expect(state.score).toBe(2);
  });

  it("ejecuta onCollide de cada entidad sin que una anule a la otra", () => {
    const p = ent({ kind: "player", controllable: true, x: 100, y: 100 });
    const e1 = ent({ kind: "enemy", x: 105, y: 102 });
    const e2 = ent({ kind: "enemy", x: 108, y: 104 });
    p.scripts = [script({ event: "onCollide", withKind: "enemy", blocks: [b("addScore", { value: 7 })] })];
    e1.scripts = [script({ event: "onUpdate", blocks: [b("chase", { text: "player", value: 80 })] })];
    e2.scripts = [script({ event: "onUpdate", blocks: [b("chase", { text: "player", value: 80 })] })];
    const scene = makeScene([p, e1, e2]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();

    runner.step(scene, state, input, hooks, dt);
    expect(state.score).toBe(14);        // una vez por pareja
    expect(e1.vx).toBeLessThan(0);       // chase
    expect(e2.vx).toBeLessThan(0);

    runner.step(scene, state, input, hooks, dt);
    expect(state.score).toBe(14);        // sigue solapado: no repite
  });

  it("aplica todos los bloques de un onCollide aunque uno destruya al otro", () => {
    const p = ent({ kind: "player", controllable: true, x: 100, y: 100 });
    const e1 = ent({ kind: "enemy", x: 105, y: 102 });
    const e2 = ent({ kind: "enemy", x: 108, y: 104 });
    p.scripts = [script({ event: "onCollide", withKind: "enemy", blocks: [b("destroyOther"), b("addScore", { value: 1 })] })];
    const scene = makeScene([p, e1, e2]);
    const state = newRuntimeState(scene);

    createScriptRunner().step(scene, state, input, hooks, dt);

    expect(state.score).toBe(2);
    expect(e1.x).toBeLessThan(-9000);
    expect(e2.x).toBeLessThan(-9000);
  });

  it("mantiene independientes los temporizadores de cada entidad", () => {
    const a = ent({ kind: "coin" });
    const c = ent({ kind: "coin" });
    a.scripts = [script({ event: "onTimer", interval: 100, blocks: [b("addScore", { value: 1 })] })];
    c.scripts = [script({ event: "onTimer", interval: 200, blocks: [b("addScore", { value: 10 })] })];
    const scene = makeScene([a, c]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();

    for (let i = 0; i < 12; i++) runner.step(scene, state, input, hooks, dt);

    expect(state.score).toBe(12);        // 2×1 + 1×10
  });

  it("ignora bloques desconocidos sin dejar de ejecutar los siguientes", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [script({ event: "onStart", blocks: [b("nope" as Block["kind"]), b("addScore", { value: 3 })] })];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);

    expect(() => createScriptRunner().step(scene, state, input, hooks, dt)).not.toThrow();
    expect(state.score).toBe(3);
  });

  it("anida bloques con varios niveles", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [
      script({
        event: "onStart",
        blocks: [
          b("repeat", {
            repeat: 2,
            thenBlocks: [b("ifVariable", { text: "k", operator: "eq", value: 0, thenBlocks: [b("addScore", { value: 1 })] })],
          }),
        ],
      }),
    ];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);

    createScriptRunner().step(scene, state, input, hooks, dt);

    expect(state.score).toBe(2);
  });

  it("cada bloque del catálogo se ejecuta sin abortar los siguientes", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {}); // el bloque `log` escribe
    for (const kind of ALL_BLOCKS) {
      const a = ent({ kind: "player", controllable: true, x: 50, y: 50 });
      const scene = makeScene([a]);
      const state = newRuntimeState(scene);
      // Bloque bajo prueba + testigo: si el primero lanza o aborta, el testigo no suma.
      a.scripts = [
        script({
          event: "onStart",
          blocks: [b(kind), b("addScore", { value: 1 })],
        }),
      ];
      let error: unknown = null;
      try {
        createScriptRunner().step(scene, state, input, hooks, dt);
      } catch (e) {
        error = e;
      }
      expect(error, `${kind} (${BLOCK_LABELS[kind]}) lanzó: ${String(error)}`).toBeNull();
      // `addScore` sin valor suma 1, así que su propia suma se añade a la del testigo.
      const expected = kind === "addScore" ? 2 : 1;
      expect(state.score, `${kind} (${BLOCK_LABELS[kind]}) abortó los bloques siguientes`).toBe(expected);
    }
    log.mockRestore();
  });

  it("un `esperar` retrasa los bloques siguientes en vez de ignorarlos", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [
      script({
        event: "onStart",
        blocks: [
          b("addScore", { value: 1 }),
          b("wait", { value: 250 }),
          b("addScore", { value: 10 }),
          b("wait", { value: 250 }),
          b("addScore", { value: 100 }),
        ],
      }),
    ];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();
    const step = () => runner.step(scene, state, input, hooks, 0.25); // dt exacto

    step();
    expect(state.score).toBe(1);        // solo el primer bloque
    step();
    expect(state.score).toBe(11);       // el bloque tras la primera espera
    step();
    expect(state.score).toBe(111);      // el bloque tras la segunda espera
  });

  it("un `esperar` dentro de un ciclo reanuda en el punto exacto", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [
      script({
        event: "onStart",
        blocks: [b("repeat", { repeat: 2, thenBlocks: [b("addScore", { value: 1 }), b("wait", { value: 250 })] })],
      }),
    ];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();
    const step = () => runner.step(scene, state, input, hooks, 0.25);

    step();
    expect(state.score).toBe(1);
    step();
    expect(state.score).toBe(2);
    step();
    expect(state.score).toBe(2);        // el ciclo ya terminó
  });

  it("los scripts en espera de cada entidad avanzan por separado", () => {
    const e1 = ent({ kind: "coin" });
    const e2 = ent({ kind: "coin" });
    e1.scripts = [script({ event: "onStart", blocks: [b("addScore", { value: 1 }), b("wait", { value: 250 }), b("addScore", { value: 10 })] })];
    e2.scripts = [script({ event: "onStart", blocks: [b("addScore", { value: 1 }), b("wait", { value: 500 }), b("addScore", { value: 100 })] })];
    const scene = makeScene([e1, e2]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();
    const step = () => runner.step(scene, state, input, hooks, 0.25);

    step();
    expect(state.score).toBe(2);        // 1 + 1
    step();
    expect(state.score).toBe(12);       // e1 reanuda, e2 sigue esperando
    step();
    expect(state.score).toBe(112);      // e2 reanuda (onStart no vuelve a empezar)
  });

  it("un script en espera no se reinicia con cada emisión del evento", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [script({ event: "onUpdate", blocks: [b("addScore", { value: 1 }), b("wait", { value: 500 }), b("addScore", { value: 10 })] })];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();
    const step = () => runner.step(scene, state, input, hooks, 0.25);

    step();
    expect(state.score).toBe(1);        // arranca una vez
    step();
    expect(state.score).toBe(1);        // en espera: no se reinicia
    step();
    expect(state.score).toBe(11);       // reanuda y completa
  });

  it("normaliza valores numéricos escritos como texto", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [
      script({
        event: "onStart",
        blocks: [
          b("setX", { value: "100" as unknown as number }),
          b("moveY", { value: "abc" as unknown as number }),   // no debe producir NaN
          b("addScore", { value: "5" as unknown as number }),
        ],
      }),
    ];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);

    createScriptRunner().step(scene, state, input, hooks, dt);

    expect(a.x).toBe(100);
    expect(Number.isNaN(a.y)).toBe(false);
    expect(a.y).toBe(0);
    expect(state.score).toBe(5);
  });

  it("tolera scripts y bloques mutilados sin lanzar ni abortar el resto", () => {
    const a = ent({ kind: "coin" });
    a.scripts = [
      { id: id(), event: "onStart" } as unknown as Script,                                    // sin blocks
      script({ event: "onUpdate", blocks: [b("if", { thenBlocks: "nope" as unknown as Block[] }), b("addScore", { value: 4 })] }),
    ];
    const scene = makeScene([a]);
    const state = newRuntimeState(scene);
    const runner = createScriptRunner();

    expect(() => runner.step(scene, state, input, hooks, dt)).not.toThrow();
    expect(state.score).toBe(4);
  });

  it("dispara onDestroyed sin afectar a los scripts de otras entidades", () => {
    const victim = ent({ kind: "enemy", x: 100, y: 100 });
    const killer = ent({ kind: "player", controllable: true, x: 100, y: 100 });
    victim.scripts = [script({ event: "onDestroyed", blocks: [b("addScore", { value: 5 })] })];
    killer.scripts = [script({ event: "onStart", blocks: [b("comment", { text: "hi" }), b("moveX", { value: 2 })] })];
    const scene = makeScene([victim, killer]);
    const state = newRuntimeState(scene);

    victim.x = -10000;
    createScriptRunner().step(scene, state, input, hooks, dt);

    expect(state.score).toBe(5);
    expect(killer.x).toBe(102);
  });
});

describe("normalización de scripts (IA o importación)", () => {
  it("acepta un script suelto y otro envuelto en { scripts }", () => {
    const suelto = normalizeScript({ event: "onUpdate", blocks: [{ kind: "chase" }] });
    expect(suelto?.event).toBe("onUpdate");
    expect(suelto?.blocks[0].kind).toBe("chase");
    expect(suelto?.id).toBeTruthy();

    const lista = normalizeScripts({ scripts: [{ event: "onStart", blocks: [] }] });
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBeTruthy();
  });

  it("descarta lo que no es un script utilizable", () => {
    expect(normalizeScript(null)).toBeNull();
    expect(normalizeScript("hola")).toBeNull();
    expect(normalizeScript({ event: "onInventado", blocks: [] })).toBeNull();
    expect(normalizeScripts("no soy una lista")).toEqual([]);
  });

  it("conserva el id indicado al seguir editando un script con IA", () => {
    const editado = normalizeScript({ event: "onUpdate", blocks: [{ kind: "chase" }] }, "s1");
    expect(editado?.id).toBe("s1");
  });

  it("da identidad a cada bloque, también a los anidados", () => {
    const s = normalizeScript({
      event: "onUpdate",
      blocks: [{ kind: "if", value: 1, thenBlocks: [{ kind: "addScore" }], elseBlocks: [{ kind: "lose" }] }],
    });
    expect(s?.blocks[0].id).toBeTruthy();
    expect(s?.blocks[0].thenBlocks?.[0].id).toBeTruthy();
    expect(s?.blocks[0].elseBlocks?.[0].id).toBeTruthy();
  });

  it("convierte números que llegan como texto y descarta los inválidos", () => {
    const s = normalizeScript({
      event: "onTimer",
      interval: "500",
      threshold: "mucho",
      blocks: [{ kind: "moveX", value: "20" }, { kind: "jump", value: "abc" }, { kind: "comment", text: "ok" }],
    });
    expect(s?.interval).toBe(500);
    expect(s?.threshold).toBeUndefined();
    expect(s?.blocks[0].value).toBe(20);
    // El valor inválido se descarta: el bloque usa su valor por defecto.
    expect(s?.blocks[1].value).toBeUndefined();
  });

  it("quita los bloques que no existen en el motor", () => {
    const s = normalizeScript({ event: "onStart", blocks: [{ kind: "inventado" }, { kind: "win" }] });
    expect(s?.blocks.map(x => x.kind)).toEqual(["win"]);
  });
});

describe("aplicar una edición de la IA a un script existente", () => {
  const original = {
    id: "s1",
    event: "onCollide",
    withKind: "player",
    blocks: [b("setSpeed", { value: 200 })],
  } as unknown as Script;

  it("conserva la cabecera y el id, y toma los bloques de la IA", () => {
    const result = applyScriptEdit(original, { id: "otro", event: "onUpdate", blocks: [{ kind: "addScore", value: "5" }] });
    expect(result?.script.id).toBe("s1");
    expect(result?.script.event).toBe("onCollide");
    expect(result?.script.withKind).toBe("player");
    expect(result?.script.blocks.map(x => x.kind)).toEqual(["addScore"]);
    // Los bloques que devuelve la IA se normalizan igual que al generar.
    expect(result?.script.blocks[0].value).toBe(5);
    expect(result?.script.blocks[0].id).toBeTruthy();
    // Y el evento propuesto se avisa en lugar de aplicarse.
    expect(result?.suggestedEvent).toBe("onUpdate");
  });

  it("no sugiere nada cuando la IA mantiene el evento", () => {
    const result = applyScriptEdit(original, { event: "onCollide", blocks: [] });
    expect(result?.suggestedEvent).toBeNull();
    expect(result?.script.event).toBe("onCollide");
  });

  it("devuelve null si la respuesta no es un script usable", () => {
    expect(applyScriptEdit(original, "no soy un script")).toBeNull();
    expect(applyScriptEdit(original, { event: "inventado", blocks: [] })).toBeNull();
  });
});
