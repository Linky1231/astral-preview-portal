import { coverFrameFromPreset, DEFAULT_COVER_FRAME, normaliseCoverFrame, withCoverFrame } from "../src/lib/social/cover-frame";
import { describe, expect, it } from "vitest";

describe("cover frame", () => {
  it("mantiene valores seguros dentro de los límites admitidos", () => {
    expect(normaliseCoverFrame({ x: -20, y: 150, zoom: 8 })).toEqual({ x: 0, y: 100, zoom: 2.4 });
    expect(normaliseCoverFrame(null)).toEqual(DEFAULT_COVER_FRAME);
  });

  it("guarda el encuadre sin borrar otros ajustes del juego", () => {
    const preset = withCoverFrame({ atmosphere: "night", intensity: 0.4 }, { x: 32, y: 61, zoom: 1.45 });
    expect(preset).toMatchObject({ atmosphere: "night", intensity: 0.4, cover_frame: { x: 32, y: 61, zoom: 1.45 } });
    expect(coverFrameFromPreset(preset)).toEqual({ x: 32, y: 61, zoom: 1.45 });
  });
});
