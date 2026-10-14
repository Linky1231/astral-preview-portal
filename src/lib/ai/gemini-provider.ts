// El generador de scripts (y cualquier editor que lo use) habla con Gemini a
// través de la API pública de Prexzy, integrada por defecto: no hay clave, ni
// modelo que elegir, ni ajuste previo.
//
// Antes esto llamaba directamente a Google AI Studio (BYOK). Ya no: la petición
// sale del navegador a `https://prexzyapis.com/ai/gemini`, un servicio con CORS
// abierto (`access-control-allow-origin: *`), sin cabeceras de autenticación.
//
// Contrato verificado contra el servicio real:
//   POST /ai/gemini   { "prompt": "...", "session_id": "..." }
//   → 200 { status:true, response:"<texto>", service:"Google Gemini", session_id }
//   · El texto de la respuesta viene en `response`.
//   · `session_id` guarda el hilo: el servicio recuerda los turnos anteriores
//     de esa conversación, así que se reutiliza uno estable por script.
//   · También acepta GET con parámetros, pero el prompt viaja en la URL y el
//     servidor devuelve 414 a partir de ~8 KB: por eso aquí siempre se usa POST.

/** API pública integrada por defecto (Google Gemini, sin clave). */
export const GEMINI_API_ENDPOINT = "https://prexzyapis.com/ai/gemini";

/** Hilo por defecto cuando la edición no aporta uno propio. */
export const GEMINI_DEFAULT_SESSION = "asternal-script-ai";

/**
 * Tope del prompt enviado. La API acepta cuerpos grandes (probado con 20 000
 * caracteres), así que el límite es una salvaguarda para no arrastrar historiales
 * enormes: si la conversación crece, se descartan los turnos más antiguos.
 */
export const PROMPT_LIMIT = 16_000;

/** Espera máxima antes de dar la petición por perdida. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Un turno de la petición, tal como lo entregan los editores del motor. */
export interface GeminiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GeminiChatOptions {
  /** Instrucciones + conocimiento del motor, siempre al principio del prompt. */
  systemPrompt?: string;
  /** Hilo del servicio asociado a esta conversación (memoria del lado del servicio). */
  sessionId?: string;
  /** Permite cancelar la petición en curso. */
  signal?: AbortSignal;
}

export interface GeminiChatResult {
  text: string;
  model: string;
}

/**
 * Convierte el historial en un único prompt etiquetado.
 *
 * El prompt del sistema siempre se conserva; si la conversación no cabe en
 * `PROMPT_LIMIT`, se van quitando los turnos más antiguos (nunca el del
 * sistema ni la pregunta actual).
 */
export function buildChatPrompt(history: GeminiChatMessage[], systemPrompt?: string): string {
  const system = systemPrompt?.trim() ?? "";
  const turns = history
    .filter((message) => message.role !== "system")
    .map((message) => {
      const text = message.content?.trim();
      if (!text) return "";
      return `${message.role === "assistant" ? "ASISTENTE" : "USUARIO"}: ${text}`;
    })
    .filter(Boolean);

  let prompt = [system, ...turns].join("\n\n");
  let first = 0;
  while (prompt.length > PROMPT_LIMIT && first < turns.length - 1) {
    first += 1;
    prompt = [system, ...turns.slice(first)].join("\n\n");
  }
  return prompt;
}

function sessionFor(sessionId?: string): string {
  const clean = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) ?? "";
  return clean || GEMINI_DEFAULT_SESSION;
}

/**
 * Consulta a Gemini y devuelve su texto.
 *
 * Nunca deja pasar un error del servicio en crudo: se traduce a un mensaje
 * legible. Si la persona cancela la petición, se propaga el `AbortError`
 * original para que quien llama pueda distinguirlo de un fallo real.
 */
export async function geminiChat(
  history: GeminiChatMessage[],
  opts: GeminiChatOptions = {},
): Promise<GeminiChatResult> {
  const prompt = buildChatPrompt(history, opts.systemPrompt).trim();
  if (!prompt) throw new Error("Escribe una instrucción para la IA.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(GEMINI_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, session_id: sessionFor(opts.sessionId) }),
      signal: controller.signal,
    });
  } catch (error) {
    // Canceló la persona: se propaga tal cual (la interfaz lo trata como «detenido»).
    if (opts.signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error("La IA tardó demasiado en responder. Inténtalo de nuevo.");
    throw new Error("No se pudo contactar con la IA. Revisa tu conexión.");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  const payload = (await response.json().catch(() => null)) as {
    response?: unknown;
    service?: unknown;
    status?: unknown;
    message?: unknown;
    error?: unknown;
  } | null;

  if (!response.ok || !payload || payload.status === false) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : `La IA no respondió (${response.status}).`;
    throw new Error(message);
  }

  const text = typeof payload.response === "string" ? payload.response.trim() : "";
  if (!text) throw new Error("La IA devolvió una respuesta vacía.");
  const model = typeof payload.service === "string" && payload.service.trim() ? payload.service.trim() : "Gemini";
  return { text, model };
}

export function buildGeminiScriptPrompt(args: {
  userRequest: string;
  engineKnowledge: string;
  targetEntityKind?: string;
  projectSummary?: string;
}): string {
  const { userRequest, engineKnowledge, targetEntityKind, projectSummary } = args;
  return [
    "Eres un programador del motor de Asternal. Solo puedes usar los tipos y bloques reales del motor listados abajo. No inventes APIs.",
    targetEntityKind ? `Entidad objetivo: ${targetEntityKind}.` : "",
    projectSummary ? `Resumen del proyecto:\n${projectSummary}` : "",
    "Conocimiento del motor:",
    engineKnowledge,
    "Petición del usuario:",
    userRequest,
    "Devuelve SOLO un JSON válido con un array de Script[] (tipo Script del conocimiento). Sin markdown, sin explicación y sin escapar las comillas.",
  ].filter(Boolean).join("\n\n");
}

/**
 * Prompt para **seguir editando un script ya existente** con instrucciones
 * nuevas.
 *
 * A diferencia de `buildGeminiScriptPrompt` (que crea scripts desde cero), aquí
 * el script actual viaja completo en el prompt: la IA parte de él y aplica solo
 * el cambio pedido, así se conservan el contexto y los cambios anteriores
 * —también los hechos a mano— en lugar de reescribirlo todo. El editor usa
 * además un `sessionId` por script, de modo que el servicio recuerda la
 * conversación de ese script entre ediciones.
 */
export function buildGeminiScriptEditPrompt(args: {
  instruction: string;
  engineKnowledge: string;
  currentScript: unknown;
  targetEntityKind?: string;
  projectSummary?: string;
}): string {
  const { instruction, engineKnowledge, currentScript, targetEntityKind, projectSummary } = args;
  return [
    "Eres un programador del motor de Asternal. Solo puedes usar los tipos y bloques reales del motor listados abajo. No inventes APIs.",
    "Estás EDITANDO un script que ya existe: devuelve ese mismo script con sus bloques cambiados, no uno nuevo.",
    targetEntityKind ? `Entidad objetivo: ${targetEntityKind}.` : "",
    projectSummary ? `Resumen del proyecto:\n${projectSummary}` : "",
    "Conocimiento del motor:",
    engineKnowledge,
    "Script actual (estado exacto que debes conservar):",
    JSON.stringify(currentScript, null, 2),
    "Nueva instrucción de edición:",
    instruction,
    "Reglas obligatorias de la edición:",
    "- Conserva `id` y `event` exactamente como están: el evento lo controla el usuario desde el editor.",
    "- Conserva los bloques que ya existen, con sus ids y sus valores ajustados, salvo que la instrucción pida cambiarlos o quitarlos.",
    "- Añade, modifica o quita únicamente los bloques necesarios para cumplir la instrucción.",
    "Devuelve SOLO un JSON válido con el objeto Script actualizado (uno solo, no un array). Sin markdown, sin explicación y sin escapar las comillas.",
  ].filter(Boolean).join("\n\n");
}

function stripFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Escapes que el servicio deja de más al devolver el JSON como texto. */
const EXTRA_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
};

function unescapeExtra(value: string): string {
  return value.replace(/\\(["\\/bfnrt])/g, (_match, escape: string) => EXTRA_ESCAPES[escape] ?? escape);
}

/**
 * Parseo del JSON que devuelve la IA.
 *
 * El servicio entrega a veces el JSON escapado de más, como si fuera el
 * contenido de una cadena: `\"id\"` en lugar de `"id"` y, a veces, `\n` en
 * lugar de saltos reales. Aquí se prueba el texto tal cual, luego como cadena
 * escapada y, por último, deshaciendo los escapes sobrantes. Si ninguna forma
 * da un JSON válido, lanza un error legible.
 */
export function parseAiJson<T = unknown>(value: string): T {
  const raw = stripFence(value ?? "");
  if (!raw) throw new Error("La IA no devolvió nada.");

  const attempts = [raw, unescapeExtra(raw)];
  try {
    const decoded = JSON.parse(`"${raw}"`);
    if (typeof decoded === "string" && decoded !== raw) attempts.push(decoded);
  } catch {
    // No era una cadena escapada: basta con el texto tal cual.
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(stripFence(attempt)) as T;
    } catch {
      // Se prueba el siguiente intento.
    }
  }
  throw new Error("La IA no devolvió un JSON válido.");
}
