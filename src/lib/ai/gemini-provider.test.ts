import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGeminiScriptEditPrompt,
  buildGeminiScriptPrompt,
  buildChatPrompt,
  geminiChat,
  GEMINI_API_ENDPOINT,
  GEMINI_DEFAULT_SESSION,
  PROMPT_LIMIT,
  REQUEST_TIMEOUT_MS,
  parseAiJson,
} from "./gemini-provider";

/** Respuesta con la forma real del servicio (verificada contra la API). */
function okResponse(response: string, service = "Google Gemini") {
  return new Response(JSON.stringify({ status: true, statusCode: 200, response, service }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** `fetch` que se queda pendiente hasta que se cancela la petición. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prompt que se envía al servicio de IA", () => {
  it("junta el sistema y los turnos, etiquetando quién habla", () => {
    const prompt = buildChatPrompt(
      [
        { role: "system", content: "ignorado" },
        { role: "user", content: "¿Cómo salto?" },
        { role: "assistant", content: "Con el bloque jump." },
      ],
      "Eres el asistente de scripts.",
    );
    expect(prompt.startsWith("Eres el asistente de scripts.")).toBe(true);
    expect(prompt).toContain("USUARIO: ¿Cómo salto?");
    expect(prompt).toContain("ASISTENTE: Con el bloque jump.");
    expect(prompt).not.toContain("ignorado");
  });

  it("recorta los turnos más antiguos pero conserva el sistema y lo reciente", () => {
    const largo = "x".repeat(PROMPT_LIMIT);
    const prompt = buildChatPrompt(
      [
        { role: "user", content: "mensaje viejo" },
        { role: "assistant", content: "respuesta vieja" },
        { role: "user", content: largo },
        { role: "assistant", content: "última respuesta" },
      ],
      "SISTEMA",
    );
    expect(prompt.startsWith("SISTEMA")).toBe(true);
    expect(prompt).toContain("última respuesta");
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_LIMIT);
  });
});

describe("llamada a la API integrada", () => {
  it("hace un POST con el prompt y el hilo, y devuelve el texto", async () => {
    const fetchMock = vi.fn(async () => okResponse("¡Hola!"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await geminiChat([{ role: "user", content: "hola" }], {
      systemPrompt: "Eres el asistente de scripts.",
      sessionId: "asternal-scripts_v2!",
    });

    expect(result).toEqual({ text: "¡Hola!", model: "Google Gemini" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GEMINI_API_ENDPOINT);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as { prompt: string; session_id: string };
    expect(body.prompt).toContain("Eres el asistente de scripts.");
    expect(body.prompt).toContain("USUARIO: hola");
    // El identificador se sanea: sin signos que rompan la URL ni el servicio.
    expect(body.session_id).toBe("asternal-scripts_v2");
  });

  it("usa un hilo por defecto cuando no se indica conversación", async () => {
    const fetchMock = vi.fn(async () => okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await geminiChat([{ role: "user", content: "hola" }]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { session_id: string }).session_id).toBe(GEMINI_DEFAULT_SESSION);
  });

  it("explica el motivo cuando el servicio rechaza la petición", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ status: false, message: "Prompt demasiado largo" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    await expect(geminiChat([{ role: "user", content: "hola" }])).rejects.toThrow("Prompt demasiado largo");
  });

  it("no acepta una respuesta vacía", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("")));
    await expect(geminiChat([{ role: "user", content: "hola" }])).rejects.toThrow("respuesta vacía");
  });

  it("avisa sin conexión en lugar de propagar el fallo de red", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(geminiChat([{ role: "user", content: "hola" }])).rejects.toThrow("No se pudo contactar con la IA");
  });

  it("propaga la cancelación para que la interfaz la distinga de un error", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const controller = new AbortController();
    const promise = geminiChat([{ role: "user", content: "hola" }], { signal: controller.signal });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
  });

  it("corta la espera cuando el servicio no contesta", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const promise = geminiChat([{ role: "user", content: "hola" }]);
    const assertion = expect(promise).rejects.toThrow("tardó demasiado");
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
    await assertion;
  });

  it("rechaza un prompt vacío sin llamar al servicio", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(geminiChat([])).rejects.toThrow("Escribe una instrucción");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("lectura del JSON de la IA", () => {
  it("acepta el JSON limpio y con bloque de código", () => {
    expect(parseAiJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(parseAiJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("deshace el escape sobrante del servicio (JSON dentro de una cadena)", () => {
    const escapado = JSON.stringify([{ id: "b1", kind: "chase" }]).replace(/"/g, '\\"');
    expect(parseAiJson<{ id: string }[]>(escapado)).toEqual([{ id: "b1", kind: "chase" }]);
  });

  it("acepta el JSON con las comillas escapadas y saltos reales (lo que devuelve hoy el servicio)", () => {
    const conSaltos = JSON.stringify([{ id: "b1", kind: "chase" }, { id: "b2", kind: "hurtPlayer" }], null, 2);
    const comillasEscapadas = conSaltos.replace(/"/g, '\\"');
    expect(comillasEscapadas).toContain("\n");
    expect(parseAiJson<{ kind: string }[]>(comillasEscapadas)).toEqual([
      { id: "b1", kind: "chase" },
      { id: "b2", kind: "hurtPlayer" },
    ]);
  });

  it("avisa cuando no hay JSON utilizable", () => {
    expect(() => parseAiJson("esto no es json")).toThrow("no devolvió un JSON válido");
    expect(() => parseAiJson("   ")).toThrow("no devolvió nada");
  });
});

describe("petición de scripts", () => {
  it("incluye el conocimiento del motor, el objetivo y el formato JSON", () => {
    const prompt = buildGeminiScriptPrompt({
      userRequest: "haz que persiga al jugador",
      engineKnowledge: "BlockKind = chase",
      targetEntityKind: "enemy",
    });
    expect(prompt).toContain("BlockKind = chase");
    expect(prompt).toContain("Entidad objetivo: enemy");
    expect(prompt).toContain("haz que persiga al jugador");
    expect(prompt).toContain("array de Script[]");
    expect(prompt).toContain("sin escapar las comillas");
  });
});

describe("petición de edición de un script existente", () => {
  it("envía el script actual para que la IA conserve el contexto y los cambios", () => {
    const actual = {
      id: "s1",
      event: "onUpdate",
      blocks: [{ id: "b1", kind: "chase", text: "player", value: 80 }],
    };
    const prompt = buildGeminiScriptEditPrompt({
      instruction: "que persiga más rápido",
      engineKnowledge: "BlockKind = chase",
      currentScript: actual,
      targetEntityKind: "enemy",
    });
    expect(prompt).toContain("BlockKind = chase");
    expect(prompt).toContain("Entidad objetivo: enemy");
    // El script completo viaja en el prompt: es el contexto que debe conservar.
    expect(prompt).toContain('"kind": "chase"');
    expect(prompt).toContain('"value": 80');
    expect(prompt).toContain("que persiga más rápido");
    expect(prompt).toContain("objeto Script actualizado");
    expect(prompt).toContain("No inventes APIs");
    // Obligaciones que garantizan que la edición no pierda el trabajo previo.
    expect(prompt).toContain("Conserva `id` y `event`");
    expect(prompt).toContain("Conserva los bloques que ya existen");
  });
});
