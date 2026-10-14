export type LLMTextContent = { type: "text"; text: string };
export type LLMImageContent = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type LLMMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<LLMTextContent | LLMImageContent>;
};

export type LLMRequest = {
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
};

const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

function requireForge() {
  if (!forgeUrl || !forgeKey) throw new Error("La IA integrada de Manus no está configurada en este entorno.");
  return { forgeUrl: forgeUrl.replace(/\/$/, ""), forgeKey };
}

/** Invoca los modelos integrados de Manus únicamente desde el servidor. */
export async function invokeLLM(request: LLMRequest) {
  const { forgeUrl: baseUrl, forgeKey: key } = requireForge();
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`La IA de Manus no respondió (${response.status}).`);
  return response.json() as Promise<{ choices?: Array<{ message?: { content?: string } }>; model?: string }>;
}

/** Lista los modelos que Manus expone actualmente al proyecto. */
export async function listLLMModels() {
  const { forgeUrl: baseUrl, forgeKey: key } = requireForge();
  const response = await fetch(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error("No se pudo consultar el catálogo de modelos de Manus.");
  return response.json() as Promise<{ data: Array<{ id: string }> }>;
}
