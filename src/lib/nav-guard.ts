/**
 * Guarda de navegación.
 *
 * El botón «Volver» es global, pero algunas pantallas (el editor, con cambios
 * sin guardar) necesitan intervenir antes de salir. La pantalla registra aquí
 * su guarda y el botón le cede el control: la guarda decide cuándo continuar
 * llamando a `proceed()`.
 */

type NavGuard = (proceed: () => void) => void;

let active: NavGuard | null = null;

export function setNavGuard(guard: NavGuard | null): void {
  active = guard;
}

/**
 * Ejecuta la guarda activa (si la hay) y devuelve true cuando la navegación
 * queda en manos de la pantalla.
 */
export function runNavGuard(proceed: () => void): boolean {
  if (!active) return false;
  active(proceed);
  return true;
}
