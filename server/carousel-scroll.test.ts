import { mobileCarouselScrollClassName } from "../src/lib/social/carousel-scroll";
import { describe, expect, it } from "vitest";

describe("carruseles táctiles", () => {
  it("prioriza el desplazamiento horizontal nativo y vuelve a cuadrícula en escritorio", () => {
    const classes = mobileCarouselScrollClassName.split(" ");

    expect(classes).toEqual(expect.arrayContaining([
      "overflow-x-auto",
      "no-scrollbar",
      "snap-x",
      "snap-proximity",
      "overscroll-x-contain",
      "[&>*]:snap-start",
      "md:flex-wrap",
      "md:overflow-visible",
      "md:snap-none",
    ]));
  });
});
