import {
  ALERT_DIALOG_CONTENT_LAYER,
  ALERT_DIALOG_OVERLAY_LAYER,
} from "../src/components/ui/alert-dialog";
import { DIALOG_CONTENT_LAYER, DIALOG_OVERLAY_LAYER } from "../src/components/ui/dialog";
import { FLOATING_BACK_BUTTON_LAYER } from "../src/components/ui/back-button";
import { describe, expect, it } from "vitest";

/** Convierte una clase de Tailwind (`z-[130]`) en su número de capa. */
function zIndexOf(layer: string): number {
  const match = /z-\[(\d+)\]/.exec(layer);
  if (!match) throw new Error(`Capa sin valor numérico: ${layer}`);
  return Number(match[1]);
}

describe("jerarquía de los diálogos de alerta", () => {
  it("queda por encima de los paneles de juego a pantalla completa y del botón flotante", () => {
    const back = zIndexOf(FLOATING_BACK_BUTTON_LAYER);

    // Paneles a pantalla completa (z-[90]) y menú lateral (z-[101]) incluidos.
    expect(back).toBeGreaterThan(101);
    expect(zIndexOf(ALERT_DIALOG_OVERLAY_LAYER)).toBeGreaterThan(back);
    expect(zIndexOf(ALERT_DIALOG_CONTENT_LAYER)).toBeGreaterThan(
      zIndexOf(ALERT_DIALOG_OVERLAY_LAYER),
    );
  });

  it("comparte capa con los diálogos normales para que anidar no esconda la alerta", () => {
    expect(ALERT_DIALOG_OVERLAY_LAYER).toBe(DIALOG_OVERLAY_LAYER);
    expect(ALERT_DIALOG_CONTENT_LAYER).toBe(DIALOG_CONTENT_LAYER);
  });
});
