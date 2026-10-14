// vly-ai-proxy: Edge Function que proyecta llamadas al gateway VLY AI
// OpenAI-compatible: POST /v1/llm/chat/completions

const VLY_GATEWAY = "https://integrations.vly.ai/v1/llm/chat/completions";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, model } = await req.json();

    const vlyKey = Deno.env.get("VLY_INTEGRATION_KEY");

    if (!vlyKey) {
      return new Response(
        JSON.stringify({
          error: "VLY_INTEGRATION_KEY no está configurado en los secrets de Edge Functions.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const res = await fetch(VLY_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${vlyKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `VLY proxy error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
