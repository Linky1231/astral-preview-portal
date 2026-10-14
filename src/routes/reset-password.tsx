import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Restablecer contraseña · Asternal" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // Supabase recovery flow sets a session automatically via URL hash tokens
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setErr("Mínimo 6 caracteres"); return; }
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setOk(true);
      setTimeout(() => navigate({ to: "/" }), 1200);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 space-y-3 shadow-sm">
        <div className="text-sm font-semibold tracking-wide">Restablecer contraseña</div>
        {!ready && !ok && <div className="text-xs text-muted-foreground">Abre el enlace del email para continuar. Si ya lo hiciste, este formulario se activará solo.</div>}
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Nueva contraseña" minLength={6} required disabled={!ready || ok}
          className="w-full bg-surface-2 border border-line-strong rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 disabled:opacity-60 transition" />
        {err && <div className="text-xs text-destructive">{err}</div>}
        {ok && <div className="text-xs text-emerald-600">✅ Contraseña actualizada. Redirigiendo…</div>}
        <button disabled={!ready || busy || ok}
          className="w-full h-11 rounded-lg bg-primary text-white text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50">
          {busy ? "…" : "Guardar"}
        </button>
        <Link to="/auth" className="block text-center text-xs text-muted-foreground hover:text-foreground transition">← Volver</Link>
      </form>
    </div>
  );
}
