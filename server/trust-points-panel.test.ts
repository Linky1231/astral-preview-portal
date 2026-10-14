import { describe, expect, it } from "vitest";
import { trustLevelPresentation } from "../src/lib/social/trust-points-panel";

describe("presentación de Puntos de confianza", () => {
  it("clasifica los niveles de forma consistente", () => {
    expect(trustLevelPresentation(2).label).toBe("crítico");
    expect(trustLevelPresentation(6).label).toBe("bajo");
    expect(trustLevelPresentation(7).label).toBe("normal");
  });

  it("usa únicamente intensidades de Azure Drift para todos los niveles", () => {
    expect(trustLevelPresentation(0).progressColor).toBe("var(--blue-600)");
    expect(trustLevelPresentation(4).progressColor).toBe("var(--primary)");
    expect(trustLevelPresentation(10).progressColor).toBe("var(--azure)");
    expect(trustLevelPresentation(10).textClass).toBe("text-primary");
  });
});
