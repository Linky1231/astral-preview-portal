import { DIALOG_CONTENT_LAYER, DIALOG_OVERLAY_LAYER } from "../src/components/ui/dialog";
import { FLOATING_BACK_BUTTON_LAYER } from "../src/components/ui/back-button";
import { describe, expect, it } from "vitest";

/** Convierte una clase de Tailwind (`z-[130]`) en su número de capa. */
function zIndexOf(layer: string): number {
  const match = /z-\[(\d+)\]/.exec(layer);
  if (!match) throw new Error(`Capa sin valor numérico: ${layer}`);
  return Number(match[1]);
}

describe("jerarquía de los diálogos modales", () => {
  it("el diálogo queda por encima del botón flotante «Volver»", () => {
    expect(zIndexOf(DIALOG_OVERLAY_LAYER)).toBeGreaterThan(
      zIndexOf(FLOATING_BACK_BUTTON_LAYER),
    );
    expect(zIndexOf(DIALOG_CONTENT_LAYER)).toBeGreaterThan(zIndexOf(DIALOG_OVERLAY_LAYER));
  });
});
