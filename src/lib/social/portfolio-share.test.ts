import { describe, expect, it } from "vitest";
import {
  parsePortfolioShare,
  serializePortfolioShare,
  stripPortfolioShare,
} from "./portfolio-share";

const snapshot = {
  owner: { id: "user-123", displayName: "Lina Creadora", username: "lina" },
  portfolio: {
    userId: "user-123",
    headline: "Diseñadora de mundos",
    bio: "Creo experiencias jugables.",
    accentColor: "#3b82f6",
    skills: ["Game Design", "Pixel Art"],
    links: [{ id: "link-1", label: "Mi sitio", url: "https://example.com" }],
    achievements: [{ id: "ach-1", title: "Jam de verano", description: "Finalista", date: "2026-08-01", icon: "trophy" as const }],
    layout: "list" as const,
    updatedAt: "2026-08-20T12:00:00.000Z",
  },
};

describe("portfolio share payload", () => {
  it("serializa, recupera y elimina un snapshot de Portafolio sin mostrar el transporte interno", () => {
    const encoded = serializePortfolioShare(snapshot);
    const content = `Mira mi trabajo\n${encoded}`;
    const parsed = parsePortfolioShare(content);

    expect(parsed?.owner).toEqual(snapshot.owner);
    expect(parsed?.portfolio.headline).toBe("Diseñadora de mundos");
    expect(parsed?.portfolio.skills).toEqual(["Game Design", "Pixel Art"]);
    expect(stripPortfolioShare(content)).toBe("Mira mi trabajo");
  });

  it("rechaza snapshots alterados y limita datos no seguros", () => {
    expect(parsePortfolioShare("[[asternal:portfolio:v1:not-valid-json]]")).toBeNull();

    const encoded = serializePortfolioShare({
      ...snapshot,
      portfolio: {
        ...snapshot.portfolio,
        accentColor: "url(javascript:alert(1))",
        links: [{ id: "bad", label: "No", url: "javascript:alert(1)" }],
      },
    });
    const parsed = parsePortfolioShare(encoded);

    expect(parsed?.portfolio.accentColor).toBe("#3b82f6");
    expect(parsed?.portfolio.links).toEqual([]);
  });
});
