import { describe, expect, it } from "vitest";
import { filterStateClass } from "./filter-control";

describe("estado visual de los filtros", () => {
  it("marca el filtro activo con el degradado de marca", () => {
    const active = filterStateClass(true);
    expect(active).toContain("grad-brand");
    expect(active).toContain("text-primary-foreground");
    expect(active).toContain("border-transparent");
  });

  it("deja el filtro inactivo neutro y con realce al pasar el cursor", () => {
    const inactive = filterStateClass(false);
    expect(inactive).not.toContain("grad-brand");
    expect(inactive).toContain("bg-card");
    expect(inactive).toContain("border-line-strong");
    expect(inactive).toContain("hover:text-foreground");
  });
});
