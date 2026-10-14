export function donationValidationMessage(amount: number, balance: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) {
    return "Elige una cantidad válida de orbes";
  }

  if (amount > balance) {
    return "No tienes suficientes orbes";
  }

  return null;
}
