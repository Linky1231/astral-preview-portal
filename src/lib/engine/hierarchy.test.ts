import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYER_ID,
  KIND_PRESETS,
  attachEntityToParent,
  canAttachAsChild,
  childrenOf,
  createChildEntity,
  createChildFromPreset,
  descendantIds,
  detachEntityFromParent,
  hierarchyDepth,
  moveEntityWithChildren,
  newRuntimeState,
  newScene,
  removeEntityWithChildren,
  setEntityPosition,
  stepScene,
  syncChildrenWithParents,
  uid,
  type Entity,
  type Scene,
} from "./core";

function make(patch: Partial<Entity> = {}): Entity {
  return { ...KIND_PRESETS.platform, id: uid(), x: 100, y: 200, ...patch };
}

function sceneWith(entities: Entity[]): Scene {
  return { ...newScene("Jerarquía"), entities };
}

const step = (scene: Scene, dt = 1 / 60, input = { left: false, right: false, jump: false }) => {
  const state = newRuntimeState(scene);
  stepScene(scene, input, state, dt);
  return state;
};

describe("vincular objetos como hijos", () => {
  it("crea el hijo centrado en el padre, en su capa, por delante y sin gravedad", () => {
    const parent = make({ id: "padre", x: 100, y: 100, w: 400, h: 200, z: 3, layerId: "capa-1" });
    const result = createChildEntity(sceneWith([parent]), parent.id, "decor");

    expect(result).not.toBeNull();
    if (!result) return;
    const child = result.scene.entities.find(e => e.id === result.childId);
    expect(child).toBeDefined();
    if (!child) return;
    expect(child.parentId).toBe(parent.id);
    // Centrado dentro del padre.
    expect(child.x).toBe(Math.round(parent.x + (parent.w - child.w) / 2));
    expect(child.y).toBe(Math.round(parent.y + (parent.h - child.h) / 2));
    expect(child.w).toBeLessThan(parent.w);
    expect(child.h).toBeLessThan(parent.h);
    expect(child.layerId).toBe("capa-1");
    expect(child.z).toBe(4);
    expect(child.gravity).toBe(false);
    expect(child.controllable).toBe(false);
    // La escena original no se muta y el padre sigue siendo raíz.
    expect(sceneWith([parent]).entities).toHaveLength(1);
    expect(parent.parentId ?? null).toBeNull();
  });

  it("mantiene los flags del tipo elegido (una plataforma hija sigue siendo sólida)", () => {
    const parent = make({ id: "padre", w: 400, h: 200 });
    const result = createChildEntity(sceneWith([parent]), "padre", "platform");
    const child = result?.scene.entities.find(e => e.id === result.childId);
    expect(child?.solid).toBe(true);
    expect(child?.gravity).toBe(false);
  });

  it("crea el hijo desde un asset guardado (Biblioteca): conserva su textura, scripts y ajustes", () => {
    const parent = make({ id: "padre", x: 100, y: 100, w: 400, h: 200, z: 3, layerId: "capa-1" });
    // Un asset de la Biblioteca: nada de un tipo predeterminado, con sus propios
    // ajustes (color, textura y scripts) tal y como se guardó.
    const saved = {
      ...KIND_PRESETS.enemy,
      w: 60,
      h: 60,
      color: "#ff00ff",
      texture: "data:image/png;base64,AAA",
      scripts: [{ id: "s1", event: "onStart" as const, blocks: [] }],
    };

    const result = createChildFromPreset(sceneWith([parent]), "padre", saved);

    expect(result).not.toBeNull();
    if (!result) return;
    const child = result.scene.entities.find(e => e.id === result.childId);
    expect(child).toBeDefined();
    if (!child) return;
    expect(child.kind).toBe("enemy");
    expect(child.color).toBe("#ff00ff");
    expect(child.texture).toBe("data:image/png;base64,AAA");
    expect(child.scripts).toEqual(saved.scripts);
    // Lo propio de un hijo: vínculo, capa del padre, por delante y sin gravedad.
    expect(child.parentId).toBe("padre");
    expect(child.layerId).toBe("capa-1");
    expect(child.z).toBe(4);
    expect(child.gravity).toBe(false);
  });

  it("devuelve null si el padre ya no está en la escena", () => {
    expect(createChildEntity(sceneWith([make()]), "no-existe")).toBeNull();
    expect(createChildFromPreset(sceneWith([make()]), "no-existe", KIND_PRESETS.decor)).toBeNull();
  });

  it("vincula y desvincula sin tocar la posición ni el resto de la entidad", () => {
    const parent = make({ id: "padre" });
    const child = make({ id: "hijo", x: 10, y: 20, scripts: [{ id: "s1", event: "onStart", blocks: [] }] });
    const scene = sceneWith([parent, child]);

    const linked = attachEntityToParent(scene, child.id, parent.id);
    const linkedChild = linked.entities.find(e => e.id === "hijo");
    expect(linkedChild?.parentId).toBe("padre");
    expect(linkedChild?.x).toBe(10);
    expect(linkedChild?.scripts).toHaveLength(1); // conserva sus propios scripts

    const unlinked = detachEntityFromParent(linked, child.id);
    expect(unlinked.entities.find(e => e.id === "hijo")?.parentId).toBeNull();
    // Desvincular una entidad raíz no cambia nada.
    expect(detachEntityFromParent(scene, "padre")).toBe(scene);
  });

  it("impide los ciclos: no se puede vincular a sí mismo ni a un descendiente", () => {
    const root = make({ id: "raiz" });
    const mid = make({ id: "medio", parentId: "raiz" });
    const leaf = make({ id: "hoja", parentId: "medio" });
    const scene = sceneWith([root, mid, leaf]);

    expect(descendantIds(scene, "raiz")).toEqual(new Set(["medio", "hoja"]));
    expect(hierarchyDepth(scene, leaf)).toBe(2);
    expect(canAttachAsChild(scene, "raiz", "raiz")).toBe(false);
    expect(canAttachAsChild(scene, "raiz", "hoja")).toBe(false);
    expect(canAttachAsChild(scene, "hoja", "raiz")).toBe(true);
    expect(canAttachAsChild(scene, "raiz", "no-existe")).toBe(false);
    // Un vínculo imposible deja la escena intacta.
    expect(attachEntityToParent(scene, "raiz", "hoja")).toBe(scene);
  });
});

describe("mover el padre mueve a sus hijos", () => {
  it("arrastra a toda la rama la misma distancia", () => {
    const root = make({ id: "raiz", x: 100, y: 100, w: 300, h: 300 });
    const mid = make({ id: "medio", x: 140, y: 140, w: 100, h: 100, parentId: "raiz" });
    const leaf = make({ id: "hoja", x: 160, y: 160, w: 40, h: 40, parentId: "medio" });
    const scene = sceneWith([root, mid, leaf]);

    const moved = moveEntityWithChildren(scene, "raiz", 25, -15);
    const at = (id: string) => moved.entities.find(e => e.id === id)!;

    expect(at("raiz").x).toBe(125);
    expect(at("raiz").y).toBe(85);
    expect(at("medio").x).toBe(165);
    expect(at("medio").y).toBe(125);
    expect(at("hoja").x).toBe(185);
    expect(at("hoja").y).toBe(145);
    // La escena original queda intacta (el editor se apoya en esto para el undo).
    expect(scene.entities.find(e => e.id === "hoja")?.x).toBe(160);
  });

  it("mover un hijo no mueve al padre", () => {
    const parent = make({ id: "padre", x: 100, y: 100, w: 300, h: 300 });
    const child = make({ id: "hijo", x: 150, y: 150, w: 40, h: 40, parentId: "padre" });
    const moved = moveEntityWithChildren(sceneWith([parent, child]), "hijo", 20, 20);

    expect(moved.entities.find(e => e.id === "padre")?.x).toBe(100);
    expect(moved.entities.find(e => e.id === "hijo")?.x).toBe(170);
  });

  it("mantiene al hijo dentro del padre cuando cabe (y libera al que no cabe)", () => {
    const parent = make({ id: "padre", x: 100, y: 100, w: 200, h: 200 });
    const child = make({ id: "hijo", x: 120, y: 120, w: 40, h: 40, parentId: "padre" });
    const scene = sceneWith([parent, child]);

    const inside = setEntityPosition(scene, "hijo", 500, 500);
    const clamped = inside.entities.find(e => e.id === "hijo")!;
    expect(clamped.x).toBe(100 + 200 - 40);
    expect(clamped.y).toBe(100 + 200 - 40);

    const big = make({ id: "grande", x: 0, y: 0, w: 400, h: 400, parentId: "padre" });
    const free = setEntityPosition(sceneWith([parent, big]), "grande", 900, 900);
    expect(free.entities.find(e => e.id === "grande")?.x).toBe(900);
  });

  it("los deslizadores del inspector mueven al padre con su rama", () => {
    const parent = make({ id: "padre", x: 100, y: 100, w: 300, h: 300 });
    const child = make({ id: "hijo", x: 150, y: 150, w: 40, h: 40, parentId: "padre" });
    const moved = setEntityPosition(sceneWith([parent, child]), "padre", 130, 100);

    expect(moved.entities.find(e => e.id === "hijo")?.x).toBe(180);
    expect(childrenOf(moved, "padre")).toHaveLength(1);
  });
});

describe("borrar un objeto con sus hijos", () => {
  it("elimina la rama completa y deja el resto de la escena intacto", () => {
    const root = make({ id: "raiz" });
    const mid = make({ id: "medio", parentId: "raiz" });
    const leaf = make({ id: "hoja", parentId: "medio" });
    const other = make({ id: "suelto" });
    const scene = sceneWith([root, mid, leaf, other]);

    const after = removeEntityWithChildren(scene, "raiz");
    expect(after.entities.map(e => e.id)).toEqual(["suelto"]);
    expect(scene.entities).toHaveLength(4);
  });
});

describe("el runtime reparte el movimiento del padre", () => {
  it("una plataforma en movimiento lleva consigo a su hijo", () => {
    const platform = make({
      id: "plataforma",
      x: 100,
      y: 400,
      w: 200,
      h: 40,
      gravity: false,
      solid: true,
      moving: { axis: "x", range: 120, speed: 60 },
    });
    const coin = { ...KIND_PRESETS.coin, id: "moneda", x: 150, y: 360, parentId: "plataforma" };
    const scene = sceneWith([platform, coin]);

    const seconds = 0.5;
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds / dt); i++) step(scene, dt);

    const movedPlatform = scene.entities.find(e => e.id === "plataforma")!;
    const movedCoin = scene.entities.find(e => e.id === "moneda")!;
    expect(movedPlatform.x).toBeGreaterThan(100); // la plataforma se movió
    // El hijo recorrió exactamente la misma distancia y conserva su desplazamiento.
    expect(movedCoin.x - 150).toBeCloseTo(movedPlatform.x - 100, 6);
    expect(movedCoin.y).toBe(360);
  });

  it("encadena el movimiento por todo el árbol sin perder el desplazamiento propio", () => {
    const root = make({ id: "raiz", x: 0, y: 0, w: 200, h: 200, gravity: false, solid: false });
    const mid = make({ id: "medio", x: 10, y: 10, w: 100, h: 100, gravity: false, parentId: "raiz" });
    const leaf = make({ id: "hoja", x: 20, y: 20, w: 40, h: 40, gravity: false, parentId: "medio" });
    const scene = sceneWith([root, mid, leaf]);

    syncChildrenWithParents(scene); // fotograma anterior: fija la referencia
    // El padre se mueve 10 y el hijo 4 (movimiento propio) en el mismo fotograma.
    root.x += 10;
    mid.x += 4;
    syncChildrenWithParents(scene);

    expect(mid.x).toBe(24);   // 10 heredados + 4 propios
    expect(leaf.x).toBe(34);  // hereda los 14 completos del padre intermedio
  });

  it("hereda el movimiento ya en el primer fotograma del juego", () => {
    const parent = make({ id: "padre", x: 100, y: 400, w: 200, h: 40, gravity: false, moving: { axis: "x", range: 120, speed: 60 } });
    const child = { ...KIND_PRESETS.coin, id: "hijo", x: 150, y: 360, parentId: "padre" };
    const scene = sceneWith([parent, child]);

    step(scene);

    // Un solo fotograma: el hijo ya acompaña al padre (no se queda atrás ni uno).
    expect(scene.entities[1].x - 150).toBeCloseTo((parent.x - 100), 6);
  });

  it("una entidad destruida no arrastra a sus hijos fuera de la escena", () => {
    const parent = make({ id: "padre", x: 100, y: 100 });
    const child = make({ id: "hijo", x: 120, y: 120, parentId: "padre" });
    const scene = sceneWith([parent, child]);

    syncChildrenWithParents(scene); // fija la referencia del fotograma anterior
    parent.x = -99999;              // el script «destroySelf» manda al padre fuera
    syncChildrenWithParents(scene);

    expect(scene.entities.find(e => e.id === "hijo")?.x).toBe(120);
  });

  it("sin jerarquía solo se actualiza la referencia de posición", () => {
    const solo = make({ id: "suelta", x: 50, y: 60 });
    const scene = sceneWith([solo]);
    syncChildrenWithParents(scene);
    expect(solo._px).toBe(50);
    expect(solo._py).toBe(60);
    expect(childrenOf(scene, solo.id)).toHaveLength(0);
    expect(DEFAULT_LAYER_ID).toBe("default");
  });
});
