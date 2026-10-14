import { describe, expect, it } from "vitest";
import { parsePostShare, serializePostShare, stripPostShare } from "./post-share";

const snapshot = {
  owner: {
    id: "creator-42",
    displayName: "Lina Creadora",
    username: "lina",
    avatarUrl: "https://cdn.example.com/lina.png",
  },
  post: {
    id: "post-88",
    content: "La primera escena de mi aventura ya está lista.",
    kind: "game" as const,
    imageUrl: "https://cdn.example.com/scene.png",
    sourceUrl: "https://asternal.example/feed?p=post-88",
  },
};

describe("post share payload", () => {
  it("serializa, recupera y oculta una publicación compartida", () => {
    const encoded = serializePostShare(snapshot);
    const content = `Mira esto\n${encoded}`;
    const parsed = parsePostShare(content);

    expect(parsed?.owner.displayName).toBe("Lina Creadora");
    expect(parsed?.post).toMatchObject(snapshot.post);
    expect(parsed?.post.mediaUrls).toEqual([]);
    expect(parsed?.post.documents).toEqual([]);
    expect(parsed?.post.poll).toBeNull();
    expect(stripPostShare(content)).toBe("Mira esto");
  });

  it("conserva un resumen rico de las funciones reales dentro de límites seguros", () => {
    const encoded = serializePostShare({
      ...snapshot,
      post: {
        ...snapshot.post,
        mediaType: "video",
        mediaUrls: ["https://cdn.example.com/1.mp4", "https://cdn.example.com/2.mp4", "https://cdn.example.com/3.mp4", "https://cdn.example.com/4.mp4", "https://cdn.example.com/5.mp4"],
        documents: [{ name: "Guion.pdf", url: "https://cdn.example.com/guion.pdf" }],
        textColor: "#1A73E8",
        linkUrl: "https://asternal.example/demo",
        hasHtml: true,
        pinnedGame: { id: "game-1", title: "Nebula Runner", coverUrl: "https://cdn.example.com/cover.png" },
        poll: { question: "¿Qué escena seguimos?", options: ["Bosque", "Ciudad", "Mar"], votes: [4, 7, 2], total: 13 },
        locked: { isUnlocked: false, text: "Final secreto", goal: 20, current: 13, unlockAt: "2026-08-24T12:00:00.000Z" },
        postTypes: ["update", "tutorial", "unknown"],
        tags: ["motor", "aventura"],
      },
    });
    const parsed = parsePostShare(encoded);

    expect(parsed?.post.mediaUrls).toHaveLength(4);
    expect(parsed?.post.documents).toEqual([{ name: "Guion.pdf", url: "https://cdn.example.com/guion.pdf" }]);
    expect(parsed?.post.textColor).toBe("#1A73E8");
    expect(parsed?.post.poll?.votes).toEqual([4, 7, 2]);
    expect(parsed?.post.locked?.current).toBe(13);
    expect(parsed?.post.postTypes).toEqual(["update", "tutorial"]);
    expect(parsed?.post.tags).toEqual(["motor", "aventura"]);
  });

  it("rechaza URLs, colores y metadatos no seguros", () => {
    const encoded = serializePostShare({
      ...snapshot,
      owner: { ...snapshot.owner, avatarUrl: "javascript:alert(1)" },
      post: {
        ...snapshot.post,
        kind: "unknown" as "game",
        imageUrl: "data:text/html,bad",
        mediaUrls: ["javascript:alert(1)", "https://cdn.example.com/ok.png"],
        documents: [{ name: "Malo", url: "data:text/html,bad" }],
        textColor: "url(https://evil.example)",
        linkUrl: "file:///private",
        poll: { question: "x", options: ["solo una"], votes: [2], total: 2 },
        postTypes: ["script"],
        tags: ["#válido", "<script>"],
      },
    });
    const parsed = parsePostShare(encoded);

    expect(parsed?.owner.avatarUrl).toBe("");
    expect(parsed?.post.kind).toBe("post");
    expect(parsed?.post.imageUrl).toBe("");
    expect(parsed?.post.mediaUrls).toEqual(["https://cdn.example.com/ok.png"]);
    expect(parsed?.post.documents).toEqual([]);
    expect(parsed?.post.textColor).toBe("");
    expect(parsed?.post.linkUrl).toBe("");
    expect(parsed?.post.poll).toBeNull();
    expect(parsed?.post.postTypes).toEqual([]);
    expect(parsed?.post.tags).toEqual(["válido"]);
    expect(parsePostShare("[[asternal:post:v1:not-json]]")).toBeNull();
  });
});
