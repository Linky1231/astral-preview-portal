/**
 * Revisión de juegos y monetización (vibe coding).
 *
 * Al publicar, el creador puede marcar su juego como «hecho con IA» (vibe
 * coding). Ese dato y su estado de revisión viven dentro de `posts.asset_preset`
 * (jsonb) para no necesitar columnas nuevas:
 *
 *   asset_preset.ai = { declared, status, auto?, reviewerId?, … }
 *
 * Reglas de negocio:
 *   - Declarado por el creador como IA  → estado "ia": sin ganancias y bloqueado
 *     hasta que se pida una nueva verificación.
 *   - Hecho con el motor nativo de Asternal → "no_ia" verificado automáticamente.
 *   - El resto (GDevelop, página estática…) → "pendiente": enviado a un
 *     desarrollador; no genera ganancias hasta que se revise.
 */

export type AiStatus = "pendiente" | "no_ia" | "ia";

export type Monetization = "activas" | "en_espera" | "bloqueadas";

export interface GameAiState {
  /** Lo que declaró el creador (vibe coding). */
  declared: boolean;
  status: AiStatus;
  /** true si se verificó solo por estar hecho con el motor nativo. */
  auto?: boolean;
  reviewerId?: string;
  reviewedAt?: number;
  /** Momento en que se pidió una nueva verificación. */
  requestedAt?: number;
  updatedAt?: number;
}

export const AI_STATUS_LABEL: Record<AiStatus, string> = {
  pendiente: "En revisión",
  no_ia: "Verificado · no IA",
  ia: "Bloqueado · hecho con IA",
};

export const MONETIZATION_LABEL: Record<Monetization, string> = {
  activas: "Ganancias activas",
  en_espera: "Ganancias en espera",
  bloqueadas: "Sin ganancias",
};

export function monetizationOf(state: GameAiState | null | undefined): Monetization {
  if (!state) return "en_espera";
  if (state.status === "no_ia") return "activas";
  if (state.status === "ia") return "bloqueadas";
  return "en_espera";
}

/**
 * Estado inicial al publicar.
 *   - vibeCoding → declarado IA (bloqueado).
 *   - motor nativo → no IA verificado automáticamente.
 *   - cualquier otro motor → pendiente de revisión por un desarrollador.
 */
export function initialGameAiState(input: {
  vibeCoding?: boolean;
  nativeEngine: boolean;
}): GameAiState {
  const now = Date.now();
  if (input.vibeCoding) return { declared: true, status: "ia", updatedAt: now };
  if (input.nativeEngine) return { declared: false, status: "no_ia", auto: true, updatedAt: now };
  return { declared: false, status: "pendiente", updatedAt: now };
}

/** Lee el estado guardado en `asset_preset`. Nunca lanza. */
export function readGameAiState(preset: Record<string, unknown> | null | undefined): GameAiState | null {
  const raw = preset && typeof preset === "object" ? (preset as { ai?: unknown }).ai : undefined;
  if (!raw || typeof raw !== "object") return null;
  const ai = raw as Partial<GameAiState>;
  const status: AiStatus | undefined =
    ai.status === "pendiente" || ai.status === "no_ia" || ai.status === "ia" ? ai.status : undefined;
  if (!status) return null;
  return {
    declared: typeof ai.declared === "boolean" ? ai.declared : status === "ia",
    status,
    auto: ai.auto === true || undefined,
    reviewerId: typeof ai.reviewerId === "string" ? ai.reviewerId : undefined,
    reviewedAt: typeof ai.reviewedAt === "number" ? ai.reviewedAt : undefined,
    requestedAt: typeof ai.requestedAt === "number" ? ai.requestedAt : undefined,
    updatedAt: typeof ai.updatedAt === "number" ? ai.updatedAt : undefined,
  };
}

/** Devuelve `preset` con el estado de IA dentro (conserva el resto de claves). */
export function withGameAiState(
  preset: Record<string, unknown> | null | undefined,
  state: GameAiState | null,
): Record<string, unknown> {
  const base = { ...(preset ?? {}) } as Record<string, unknown>;
  if (!state) return base;
  base.ai = state;
  return base;
}

/** Decisión de un desarrollador en el panel de administración. */
export function applyReview(
  current: GameAiState | null,
  decision: "no_ia" | "ia",
  reviewerId: string,
): GameAiState {
  const now = Date.now();
  return {
    declared: decision === "ia",
    status: decision,
    reviewerId,
    reviewedAt: now,
    updatedAt: now,
    requestedAt: current?.requestedAt,
  };
}

/**
 * El creador pide una nueva verificación: desbloquea el estado "ia" y vuelve a
 * poner el juego en cola de revisión. Solo tiene sentido si está bloqueado.
 */
export function requestReverification(current: GameAiState | null): GameAiState {
  const now = Date.now();
  return {
    declared: current?.declared ?? true,
    status: "pendiente",
    reviewerId: current?.reviewerId,
    reviewedAt: current?.reviewedAt,
    requestedAt: now,
    updatedAt: now,
  };
}
