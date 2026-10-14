import { describe, expect, it } from "vitest";
import { donationValidationMessage } from "../src/lib/social/donation-confirmation";

describe("confirmación de donaciones", () => {
  it("solo permite confirmar importes enteros positivos dentro del saldo", () => {
    expect(donationValidationMessage(25, 100)).toBeNull();
    expect(donationValidationMessage(0, 100)).toBe("Elige una cantidad válida de orbes");
    expect(donationValidationMessage(12.5, 100)).toBe("Elige una cantidad válida de orbes");
    expect(donationValidationMessage(101, 100)).toBe("No tienes suficientes orbes");
  });
});
