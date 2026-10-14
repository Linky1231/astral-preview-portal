// omega-proxy: Edge Function para proyectar llamadas a OmegaTech API
// desde el navegador (CORS-safe). Soporta múltiples modelos.

const OMEGA_BASE = "https://api.omegatech.app/api/ai";

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
    const { message, model } = await req.json();
    const modelName = model || "Gpt-4-mini";
    const omegaRes = await fetch(`${OMEGA_BASE}/${modelName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await omegaRes.json();

    return new Response(JSON.stringify(data), {
      status: omegaRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
