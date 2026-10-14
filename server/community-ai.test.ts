import { describe, expect, it } from "vitest";
import { mergeRecommendedIds, normalizeCommunitySubmission, normalizeOriginalityCandidate, parseModerationDecision } from "./community-ai";

describe("decisiones comunitarias de Orión", () => {
  it("acepta una respuesta JSON de moderación y limita sus textos", () => {
    expect(parseModerationDecision('```json\n{"allowed":false,"reason":"Falta contexto seguro","summary":"Revisar la regla 2"}\n```')).toEqual({
      allowed: false,
      reason: "Falta contexto seguro",
      summary: "Revisar la regla 2",
    });
  });

  it("preserva todos los posts y elimina ids duplicados o inventados del ranking", () => {
    expect(mergeRecommendedIds(["a", "b", "c"], ["b", "desconocido", "b"])).toEqual(["b", "a", "c"]);
  });

  it("normaliza metadatos creativos sin aceptar métricas sociales ni URLs de adjuntos", () => {
    const candidate = normalizeOriginalityCandidate({
      id: "post-a",
      content: "Un mundo hecho de sombras",
      media: { type: "image", count: 99, hasCover: true, screenshotCount: 2 },
      documentNames: ["diseno.pdf"],
      poll: { question: "¿Qué final prefieres?", optionCount: 3 },
      likes: 500,
      documentUrls: ["https://untrusted.example/file.pdf"],
    });

    expect(candidate).toMatchObject({
      id: "post-a",
      media: { type: "image", count: 4, hasCover: true, screenshotCount: 2 },
      documentNames: ["diseno.pdf"],
      poll: { question: "¿Qué final prefieres?", optionCount: 3 },
    });
    expect(candidate).not.toHaveProperty("likes");
    expect(candidate).not.toHaveProperty("documentUrls");
  });

  it("normaliza juegos para moderación sin serializar el proyecto ni aceptar vistas previas externas", () => {
    const game = normalizeCommunitySubmission({
      kind: "game", title: "Ruta orbital", description: "Explora una estación.", tags: ["aventura"],
      project: { sceneCount: 2, entityCount: 20, scriptCount: 3, uiElementCount: 4, textSamples: ["Bienvenido", "data:image/png;base64,fuera"] },
      previewImage: "https://untrusted.example/cover.png", likes: 900,
    });
    expect(game).toMatchObject({ kind: "game", title: "Ruta orbital", project: { sceneCount: 2, textSamples: ["Bienvenido", "data:image/png;base64,fuera"] } });
    expect(game).not.toHaveProperty("likes");
    expect(game).not.toHaveProperty("previewImage");
  });

  it("conserva una vista previa local válida y limita los metadatos de una obra", () => {
    const art = normalizeCommunitySubmission({
      kind: "artwork", title: "Luz azul", priceOrbes: 12, artwork: { width: 5120, height: 256, frameCount: 999 },
      previewImage: "data:image/png;base64,aGVsbG8=",
    });
    expect(art).toEqual({
      kind: "artwork", title: "Luz azul", priceOrbes: 12,
      artwork: { width: 2048, height: 256, frameCount: 120 }, previewImage: "data:image/png;base64,aGVsbG8=",
    });
  });
});
