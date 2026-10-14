import { describe, expect, it } from "vitest";

import {
  CLONE_OFFSET,
  KIND_PRESETS,
  duplicateEntityInScene,
  isPlayerEntity,
  newScene,
  uid,
  type Entity,
  type Scene,
} from "./core";

function sceneWith(entities: Entity[]): Scene {
  return { ...newScene("Prueba"), entities };
}

function make(patch: Partial<Entity> = {}): Entity {
  return { ...KIND_PRESETS.platform, id: uid(), x: 100, y: 200, ...patch };
}

describe("duplicar una entidad en la escena", () => {
  it("añade una copia con id nuevo, desplazada y sin tocar la escena original", () => {
    const source = make();
    const scene = sceneWith([source]);

    const result = duplicateEntityInScene(scene, source.id);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(scene.entities).toHaveLength(1); // la escena original no se muta
    expect(result.scene.entities).toHaveLength(2);
    const clone = result.scene.entities[1];
    expect(clone.id).not.toBe(source.id);
    expect(clone.id).toBe(result.cloneId);
    expect(clone.x).toBe(source.x + CLONE_OFFSET);
    expect(clone.y).toBe(source.y + CLONE_OFFSET);
    expect(clone.kind).toBe(source.kind);
    expect(clone.layerId).toBe(source.layerId);
  });

  it("respeta el desplazamiento pedido (rejilla o paso propio)", () => {
    const source = make({ x: 0, y: 0 });
    const result = duplicateEntityInScene(sceneWith([source]), source.id, 8);
    expect(result?.scene.entities[1].x).toBe(8);
    expect(result?.scene.entities[1].y).toBe(8);
  });

  it("copia el personaje como doble sin mando: el motor admite un solo jugador", () => {
    const hero = make({ ...KIND_PRESETS.player, id: uid(), x: 40, y: 560 });
    expect(isPlayerEntity(hero)).toBe(true);

    const result = duplicateEntityInScene(sceneWith([hero]), hero.id);

    expect(result).not.toBeNull();
    if (!result) return;
    const clone = result.scene.entities[1];
    expect(clone.kind).toBe("player");
    expect(clone.controllable).toBe(false);
    // El doble no es "el jugador": se puede seleccionar, mover y borrar.
    expect(isPlayerEntity(clone)).toBe(false);
    // El original sigue siendo el único que responde al mando.
    expect(result.scene.entities[0].controllable).toBe(true);
  });

  it("conserva comportamientos y ajustes de la entidad clonada", () => {
    const source = make({ kind: "enemy", z: 3, hazard: true, value: 7 });
    const result = duplicateEntityInScene(sceneWith([source]), source.id);
    const clone = result?.scene.entities[1];
    expect(clone?.hazard).toBe(true);
    expect(clone?.value).toBe(7);
    expect(clone?.z).toBe(3);
  });

  it("devuelve null si la entidad ya no está en la escena", () => {
    const scene = sceneWith([make()]);
    expect(duplicateEntityInScene(scene, "no-existe")).toBeNull();
  });
});

describe("quién es el jugador protegido", () => {
  it("solo la entidad controlable", () => {
    expect(isPlayerEntity(make({ ...KIND_PRESETS.player, id: uid() }))).toBe(true);
    expect(isPlayerEntity(make({ kind: "player", controllable: false }))).toBe(false);
    expect(isPlayerEntity(make())).toBe(false);
  });
});
