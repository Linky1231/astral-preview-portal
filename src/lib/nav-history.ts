/**
 * Historial local de páginas.
 *
 * Cada navegación queda registrada en una pila temporal (sessionStorage, solo
 * en este dispositivo/pestaña) para que el botón «Volver» sepa exactamente a
 * qué pantalla devolverse.
 *
 * La pila es temporal a propósito: al cerrar la pestaña se pierde y la app
 * vuelve a arrancar en su ruta principal.
 */

export type NavEntry = {
  /** Ruta completa con su query (p. ej. `/editor?mode=mini`). */
  href: string;
  /** Título legible de la pantalla, para el botón flotante. */
  title: string;
  at: number;
};

const STORAGE_KEY = "asternal:nav-history";
const MAX_ENTRIES = 40;

const TITLES: Record<string, string> = {
  "/": "Inicio",
  "/feed": "Feed",
  "/editor": "Editor",
  "/admin": "Administración",
  "/search": "Buscar",
  "/history": "Historial",
  "/orbes": "Panel de orbes",
  "/plus": "Centro Plus",
  "/about": "Acerca de nosotros",
  "/profile": "Mi perfil",
  "/auth": "Acceso",
  "/paint": "Pintura",
  "/reset-password": "Restablecer contraseña",
};

/** Título legible para una ruta (mejor esfuerzo, nunca lanza). */
export function pageTitleFor(href: string): string {
  try {
    const path = href.split("?")[0] || "/";
    if (TITLES[path]) return TITLES[path];
    if (path.startsWith("/profile/")) return "Perfil";
    const seg = path.split("/").filter(Boolean).pop();
    if (!seg) return "Inicio";
    const clean = decodeURIComponent(seg).replace(/[-_]+/g, " ").trim();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Página";
  } catch {
    return "Página";
  }
}

function read(): NavEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is NavEntry =>
        !!e && typeof e === "object" && typeof (e as NavEntry).href === "string",
    );
  } catch {
    return [];
  }
}

let stack: NavEntry[] = typeof sessionStorage === "undefined" ? [] : read();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    /* modo privado o cuota llena: seguimos solo en memoria */
  }
  listeners.forEach((cb) => cb());
}

export function subscribeNavHistory(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getNavHistory(): NavEntry[] {
  return stack;
}

/**
 * Registra la página actual.
 *  - Si coincide con la última entrada no hace nada (evita duplicados).
 *  - Si coincide con la anterior es que hemos vuelto atrás: se hace pop.
 *  - En cualquier otro caso se empuja una entrada nueva.
 */
export function recordVisit(href: string, title?: string): void {
  if (!href) return;
  const top = stack[stack.length - 1];
  if (top?.href === href) return;
  const prev = stack[stack.length - 2];
  if (prev?.href === href) {
    stack.pop();
    persist();
    return;
  }
  stack.push({ href, title: title || pageTitleFor(href), at: Date.now() });
  if (stack.length > MAX_ENTRIES) stack = stack.slice(stack.length - MAX_ENTRIES);
  persist();
}

/** ¿Hay alguna página anterior a la que volver? */
export function canGoBack(): boolean {
  return stack.length > 1 || (stack.length > 0 && canUseBrowserBack());
}

function canUseBrowserBack(): boolean {
  try {
    return typeof window !== "undefined" && window.history.length > 1;
  } catch {
    return false;
  }
}

/** Entrada anterior (la destino del botón «Volver»). */
export function peekPrevious(): NavEntry | null {
  return stack.length > 1 ? stack[stack.length - 2] : null;
}

/**
 * Vuelve a la página anterior usando el historial local. Si no hay historial
 * (primera visita) se usa el historio del navegador y, en último caso, se va al
 * inicio. Devuelve true si había algo a lo que volver.
 */
export function goBack(push: (href: string) => void): boolean {
  if (stack.length > 1) {
    stack.pop();
    const target = stack[stack.length - 1];
    persist();
    push(target.href);
    return true;
  }
  if (canUseBrowserBack()) {
    try {
      window.history.back();
      return true;
    } catch {
      /* seguimos con el fallback */
    }
  }
  // Sin historial previo (enlace directo o pestaña nueva): al inicio.
  push("/");
  return true;
}

/** Reinicia el historial (se usa al cerrar sesión). */
export function clearNavHistory(): void {
  stack = [];
  persist();
}
