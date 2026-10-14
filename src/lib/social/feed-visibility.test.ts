import { describe, expect, it } from "vitest";
import { hasPublicationContent, isCommunityPublication } from "./feed-visibility";

describe("publications visibility", () => {
  it("excludes game cards such as Un clicker from community publications", () => {
    expect(isCommunityPublication({ category: "game", content: "🎮 Un clicker" })).toBe(false);
    expect(isCommunityPublication({ category: "artwork" })).toBe(false);
    expect(isCommunityPublication({ category: "system" })).toBe(false);
    expect(isCommunityPublication({ category: null, content: "Hola" })).toBe(true);
  });
  it("hides genuinely empty cards without hiding media-only or poll posts", () => {
    expect(hasPublicationContent({ content: "  ", signed_media: [] })).toBe(false);
    expect(hasPublicationContent({ signed_media: ["image.png"] })).toBe(true);
    expect(hasPublicationContent({ poll: { question: "Pregunta" } })).toBe(true);
    expect(hasPublicationContent({ signed_documents: [{ url: "document.pdf" }] })).toBe(true);
  });
});