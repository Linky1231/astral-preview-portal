import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYER_ID,
  addSceneLayer,
  ensureSceneLayers,
  newScene,
  removeSceneLayer,
  uid,
  type Scene,
} from "./core";

describe("crear capas desde el selector", () => {
  it("añade una capa nueva con id propio, nombre legible y por delante", () => {
    const scene = ensureSceneLayers({ ...newScene("Capas"), layers: undefined });
    const { scene: next, layerId } = addSceneLayer(scene);

    expect(next.layers).toHaveLength(2);
    const created = next.layers!.find(l => l.id === layerId);
    expect(created).toBeDefined();
    expect(created?.name).toBe("Capa 2");
    // Nace visible y desbloqueada, y por delante de la existente (z mayor).
    expect(created?.visible).toBe(true);
    expect(created?.locked).toBe(false);
    expect(created?.z).toBeGreaterThan(scene.layers![0].z);
    // La escena original no se muta.
    expect(scene.layers).toHaveLength(1);
  });

  it("permite crear varias capas seguidas, cada una con un id distinto", () => {
    let scene = ensureSceneLayers({ ...newScene("Capas"), layers: undefined });
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const result = addSceneLayer(scene);
      scene = result.scene;
      ids.add(result.layerId);
    }
    expect(scene.layers).toHaveLength(6);
    expect(ids.size).toBe(5);
    expect(scene.layers!.map(l => l.name)).toEqual([
      "Principal", "Capa 2", "Capa 3", "Capa 4", "Capa 5", "Capa 6",
    ]);
  });

  it("respeta los ajustes pedidos al crear la capa", () => {
    const scene = ensureSceneLayers({ ...newScene("Capas"), layers: undefined });
    const { scene: next, layerId } = addSceneLayer(scene, { name: "Fondo", z: -5, opacity: 0.5 });
    const created = next.layers!.find(l => l.id === layerId);
    expect(created?.name).toBe("Fondo");
    expect(created?.z).toBe(-5);
    expect(created?.opacity).toBe(0.5);
  });
});

describe("borrar una capa", () => {
  it("reasigna sus objetos a otra capa para no dejarlos huérfanos", () => {
    let scene = ensureSceneLayers({ ...newScene("Capas"), layers: undefined });
    const added = addSceneLayer(scene);
    scene = added.scene;
    const extraLayerId = added.layerId;
    const entity = { ...scene.entities[0], id: uid(), layerId: extraLayerId };
    scene = { ...scene, entities: [...scene.entities, entity] };

    const next = removeSceneLayer(scene, extraLayerId);

    expect(next.layers!.some(l => l.id === extraLayerId)).toBe(false);
    expect(next.entities.find(e => e.id === entity.id)?.layerId).toBe(DEFAULT_LAYER_ID);
  });

  it("al borrar la última capa recrea la «Principal» y no deja objetos colgando", () => {
    const scene = ensureSceneLayers({ ...newScene("Capas"), layers: undefined });
    const entity = { ...scene.entities[0], id: uid(), layerId: DEFAULT_LAYER_ID };
    const single: Scene = { ...scene, entities: [entity] };

    const next = removeSceneLayer(single, DEFAULT_LAYER_ID);

    expect(next.layers).toHaveLength(1);
    expect(next.layers![0].id).toBe(DEFAULT_LAYER_ID);
    expect(next.entities[0].layerId).toBe(DEFAULT_LAYER_ID);
  });

  it("no hace nada si la capa no existe", () => {
    const scene = newScene("Capas");
    expect(removeSceneLayer(scene, "no-existe")).toBe(scene);
  });
});
