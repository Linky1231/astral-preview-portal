import { buildOriginalityCandidate, preserveAllRankedPosts, rankingCacheKey, withCommunityRequestDeadline } from "./community-orion";
import { describe, expect, it, vi } from "vitest";

describe("caché de recomendación de Orión", () => {
  it("diferencia la recomendación cuando cambia una cuenta seguida", () => {
    const posts = [{ id: "post-a" }, { id: "post-b" }];
    expect(rankingCacheKey(posts, ["autor-a"])).not.toBe(rankingCacheKey(posts, ["autor-b"]));
  });

  it("mantiene una clave estable aunque cambie el orden de las cuentas seguidas", () => {
    const posts = [{ id: "post-a" }];
    expect(rankingCacheKey(posts, ["autor-b", "autor-a"])).toBe(rankingCacheKey(posts, ["autor-a", "autor-b"]));
  });

  it("conserva cada publicación cuando Orión devuelve una recomendación parcial", () => {
    const posts = [{ id: "post-a" }, { id: "post-b" }, { id: "post-c" }] as never[];
    const result = preserveAllRankedPosts(posts, ["post-b", "desconocida", "post-b"]);

    expect(result.map(post => post.id)).toEqual(["post-b", "post-a", "post-c"]);
    expect(new Set(result.map(post => post.id)).size).toBe(posts.length);
  });

  it("incluye contenido, adjuntos, capacidades y tiempo sin enviar reacciones", () => {
    const post = {
      id: "post-original",
      author_id: "autor-a",
      content: "Un puzzle cooperativo con gravedad compartida.",
      tags: ["puzzle", "cooperativo"],
      post_type: "game,idea",
      category: "juegos",
      created_at: "2026-08-24T12:00:00.000Z",
      updated_at: "2026-08-24T12:05:00.000Z",
      media_type: "image",
      signed_media: ["https://media.example/idea.png"],
      signed_cover: "https://media.example/cover.png",
      signed_screenshots: ["https://media.example/shot.png"],
      signed_documents: [{ name: "mecanicas.pdf", url: "https://docs.example/mecanicas.pdf" }],
      link_url: "https://example.com",
      html_content: "<section>prototipo</section>",
      text_color: "#123456",
      poll: { question: "¿Qué rol prefieres?", options: ["Piloto", "Constructor"] },
      pinned_game: { id: "game-a", title: "Orbital", cover_url: null },
      locked_content: "Borrador del nivel final",
      likes: 999,
      favorites: 99,
      comments_count: 88,
      reposts_count: 77,
      author: { display_name: "Aster" },
    } as never;

    const candidate = buildOriginalityCandidate(post, new Set(["autor-a"]));

    expect(candidate).toMatchObject({
      followedAuthor: true,
      media: { type: "image", count: 1, hasCover: true, screenshotCount: 1 },
      documentNames: ["mecanicas.pdf"],
      linkIncluded: true,
      htmlIncluded: true,
      textColorIncluded: true,
      poll: { question: "¿Qué rol prefieres?", optionCount: 2 },
      pinnedGame: { title: "Orbital" },
      lockedContentIncluded: true,
    });
    expect(candidate).not.toHaveProperty("likes");
    expect(candidate).not.toHaveProperty("favorites");
  });

  it("cancela una recomendación que no responde para liberar el feed", async () => {
    vi.useFakeTimers();
    const operation = vi.fn(() => new Promise<never>(() => {}));
    const pending = withCommunityRequestDeadline(operation, 120, "Tiempo agotado");
    const outcome = pending.then(
      () => null,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(120);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Tiempo agotado");
    expect(operation).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
