import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Mail, Lock, User, ArrowRight, Loader2, AlertCircle,
  LogIn, UserPlus, Eye, EyeOff,
} from "lucide-react";

import { AsternalLogo } from "@/components/brand/AsternalLogo";
import { SegmentedControl } from "@/components/ui/segmented";
import { supabase, clearSupabaseCredentials, resolveLocalUsernameEmail } from "@/integrations/supabase/client";
import { AUTH_FIELD_INPUT_FOCUS_CLASS } from "@/lib/auth/field-focus";
import { friendlyAuthError } from "@/lib/auth/friendly-error";
import { cleanUsername, looksLikeEmail, lookupLoginEmail, saveLoginAlias } from "@/lib/auth/login-alias";

/**
 * Pantalla de inicio de sesión con panel lateral («sign-in-side»).
 *
 * Es la adaptación para Asternal de la plantilla `sign-in-side` de Material:
 * a un lado la marca con lo que ofrece el producto y al otro la tarjeta de
 * acceso. Se usa solo cuando no hay sesión; con sesión iniciada la app muestra
 * su panel normal.
 *
 * La marca se cuenta sin lista de funciones, sin simulacro del editor y sin
 * escena animada: solo el logotipo y una línea, que es lo que deja el centro de
 * la pantalla para la tarjeta. La tarjeta de acceso lleva su propio conmutador
 * Entrar/Crear cuenta, así que cambiar de modo no obliga a buscar un enlace al
 * pie.
 *
 * Reutiliza el flujo real de acceso de la app: se puede entrar con usuario o
 * correo (traduciendo el usuario a sus cuentas posibles) y también crear una
 * cuenta nueva, con los mismos alias locales y mensajes de error.
 */

interface SignInSideProps {
  /** Se llama al completar el acceso (la app lo usa para recargar el panel). */
  onSignedIn?: () => void;
  /** Destino si no se pasa `onSignedIn` y el acceso se hace desde otra pantalla. */
  returnTo?: string;
  /** Mensaje contextual (p. ej. «inicia sesión para ver este perfil»). */
  notice?: string;
}

type Mode = "signin" | "signup";

/* ─── Campo de acceso: etiqueta + control con icono ─── */
function Field({
  label, icon: Icon, type, value, onChange, placeholder,
  autoComplete, error, maxLength, minLength, hint, trailing,
}: {
  label: string;
  icon: React.ElementType;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
  maxLength?: number;
  minLength?: number;
  hint?: React.ReactNode;
  /** Control al final del recuadro (p. ej. el ojo de la contraseña). */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
      <div
        className={`glass-control relative isolate flex items-center overflow-hidden rounded-xl transition focus-within:border-primary/65 focus-within:ring-1 focus-within:ring-primary/30 ${
          error ? "border-destructive/40" : ""
        }`}
      >
        <span className="relative z-10 flex w-10 shrink-0 justify-center text-muted-foreground/40">
          <Icon size={15} />
        </span>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          minLength={minLength}
          required
          aria-invalid={!!error}
          className={`w-full bg-transparent px-2.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/35 ${AUTH_FIELD_INPUT_FOCUS_CLASS}`}
        />
        {/* Control del final del recuadro: el ojo de siempre para
            mostrar/ocultar la contraseña. */}
        {trailing}
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-destructive/80">
          <AlertCircle size={11} className="shrink-0" /> {error}
        </p>
      ) : hint}
    </div>
  );
}

export function SignInSide({ onSignedIn, returnTo = "/", notice }: SignInSideProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [loaded, setLoaded] = useState(false);

  const finish = () => {
    if (onSignedIn) onSignedIn();
    else window.location.assign(returnTo || "/");
  };

  const switchMode = (m: Mode) => {
    setErr(null);
    setSuccess(null);
    setFieldErrors({});
    setMode(m);
  };

  useEffect(() => {
    // Si ya hay sesión (p. ej. al abrir de nuevo la app), no mostrar el acceso.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) finish();
    });
    requestAnimationFrame(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Candidatos de correo para entrar: un nombre de usuario se traduce a las
   * cuentas posibles (alias de este dispositivo, perfil local y la cuenta
   * determinista <usuario>@asternal.app).
   */
  const buildCandidates = (raw: string): { candidates: string[]; username: string | null } => {
    const value = raw.trim();
    if (looksLikeEmail(value)) return { candidates: [value.toLowerCase()], username: null };
    const u = cleanUsername(value);
    const out: string[] = [];
    const push = (mail?: string | null) => {
      const m = (mail || "").trim().toLowerCase();
      if (m.includes("@") && !out.includes(m)) out.push(m);
    };
    push(lookupLoginEmail(u));
    push(resolveLocalUsernameEmail(value));
    push(`${u || "usuario"}@asternal.app`);
    if (value.includes("@")) push(value);
    return { candidates: out, username: u || null };
  };

  const recordAliasFromUser = async (user: unknown) => {
    try {
      const u = user as { id?: unknown; email?: unknown } | null;
      const id = u && typeof u.id === "string" ? u.id : null;
      const mail = u && typeof u.email === "string" ? u.email : null;
      if (!id || !mail) return;
      const { data } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
      const name = (data as { username?: unknown } | null)?.username;
      if (typeof name === "string" && name) saveLoginAlias(name, mail);
    } catch {
      /* mejor esfuerzo: no bloquear el acceso */
    }
  };

  const resetConnection = () => {
    clearSupabaseCredentials();
    window.location.reload();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!identifier.trim()) errors.identifier = mode === "signin" ? "Escribe tu usuario o correo" : "Escribe un usuario o correo";
    if (mode === "signup" && !cleanUsername(username)) errors.username = "Elige un nombre de usuario";
    if (!password) errors.password = "La contraseña es obligatoria";
    else if (password.length < 6) errors.password = "Mínimo 6 caracteres";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const u = cleanUsername(username);
        const emailFinal = identifier.trim() || `${u}@asternal.app`;
        const { error } = await supabase.auth.signUp({
          email: emailFinal,
          password,
          options: { data: { username: u } },
        });
        if (error) throw error;
        if (remember) saveLoginAlias(u, emailFinal);
        setSuccess("Cuenta creada. Entrando…");
        setTimeout(finish, 700);
      } else {
        const { candidates, username: resolved } = buildCandidates(identifier);
        let lastError: Error | null = null;
        for (const candidate of candidates) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: candidate, password });
          if (!error) {
            if (remember) {
              if (resolved) saveLoginAlias(resolved, candidate);
              else await recordAliasFromUser(data?.user);
            }
            finish();
            return;
          }
          lastError = error;
          if (!/incorrect|invalid/i.test(error.message)) break;
        }
        throw lastError ?? new Error("No se pudo iniciar sesión");
      }
    } catch (e2) {
      const friendly = friendlyAuthError((e2 as Error).message);
      setErr(friendly);
      if (/email|user|rate|usuario/i.test((e2 as Error).message)) setFieldErrors({ identifier: friendly });
      else if (/password|contraseña/i.test((e2 as Error).message)) setFieldErrors({ password: friendly });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-full overflow-y-auto bg-background text-foreground">
      {/* Fondo M3: una única superficie con tinte de marca. Sin halos radiales,
          retículas ni grano: M3 separa planos con contenedores y elevación, no
          con texturas ni luces de fondo. */}
      <div className="pointer-events-none fixed inset-0 grad-brand-soft" />

      <main
        className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col-reverse items-center justify-center gap-10 px-5 py-10 lg:flex-row lg:items-center lg:gap-16 ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-500`}
      >
        {/* Panel de marca: el logotipo y una línea, nada más. Hasta lg no se
            enseña (una sola marca en pantalla: la lleva la tarjeta), así que en
            móvil la pantalla es la tarjeta de acceso centrada. */}
        <section className="hidden w-full max-w-md lg:block lg:max-w-xl lg:flex-1">
          <AsternalLogo size={44} />
          <p className="mt-6 max-w-md text-[13px] font-normal leading-relaxed text-muted-foreground">
            Descubre y juega creaciones hechas con Asternal, y publica las tuyas al instante.
          </p>
        </section>

        {/* Tarjeta de acceso */}
        <section className="w-full max-w-[420px] lg:shrink-0">
          <div className="glass-surface relative overflow-hidden rounded-3xl p-6 shadow-[var(--m3-elev-2)] sm:p-7">
            {/* Filo de marca: hilo de degradado en el borde superior */}
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] grad-brand" />

            <div className="mb-5 lg:hidden">
              <AsternalLogo size={38} />
            </div>

            {/* Encabezado de la página: en esta pantalla el título de la
                tarjeta es lo que la identifica. */}
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {mode === "signin" ? "Iniciar sesión" : "Crear tu cuenta"}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {mode === "signin"
                ? "Entra con tu nombre de usuario o tu correo."
                : "Elige un usuario; el correo es opcional."}
            </p>

            <SegmentedControl<Mode>
              items={[
                { id: "signin", label: "ENTRAR", icon: <LogIn size={13} /> },
                { id: "signup", label: "CREAR CUENTA", icon: <UserPlus size={13} /> },
              ]}
              value={mode}
              onChange={switchMode}
              className="mt-4"
            />

            {notice && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.06] px-3.5 py-2.5 text-[12px] text-primary">
                {notice}
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
              {mode === "signup" && (
                <Field
                  label="Nombre de usuario"
                  icon={User}
                  type="text"
                  value={username}
                  onChange={setUsername}
                  placeholder="tu_usuario"
                  autoComplete="username"
                  maxLength={32}
                  error={fieldErrors.username}
                />
              )}

              <Field
                label={mode === "signup" ? "Correo (opcional)" : "Usuario o correo"}
                icon={mode === "signup" || looksLikeEmail(identifier) ? Mail : User}
                type="text"
                value={identifier}
                onChange={setIdentifier}
                placeholder={mode === "signup" ? "email@ejemplo.com" : "tu_usuario o email@ejemplo.com"}
                autoComplete={mode === "signup" ? "email" : "username"}
                error={fieldErrors.identifier}
                hint={
                  mode === "signin" && identifier.trim() ? (
                    <p className="px-1 text-[11px] text-muted-foreground/60">
                      {looksLikeEmail(identifier) ? "Detectado: correo electrónico" : "Detectado: nombre de usuario"}
                    </p>
                  ) : undefined
                }
              />

              <Field
                label="Contraseña"
                icon={Lock}
                type={showPw ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "••••••••"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                error={fieldErrors.password}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={showPw}
                    title={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground/55 transition hover:bg-primary/10 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-[var(--primary)]"
                  />
                  Recordarme aquí
                </label>
                <Link to="/reset-password" className="inline-flex min-h-11 items-center text-[12px] font-medium text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              {err && !fieldErrors.identifier && !fieldErrors.password && !fieldErrors.username && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/15 bg-destructive/[0.05] px-3.5 py-2.5 text-xs text-destructive">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              {err && /invalid api key|apikey|invalid key/i.test(err) && (
                <button
                  type="button"
                  onClick={resetConnection}
                  className="w-full rounded-lg border border-dashed border-amber-400/50 bg-amber-50/50 py-2.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100/70 dark:bg-amber-950/20 dark:text-amber-400"
                >
                  Restablecer conexión y recargar
                </button>
              )}

              {success && (
                <div className="rounded-lg border border-success/25 bg-success/10 px-3.5 py-2.5 text-xs text-success-ink">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-grad inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-display text-sm font-semibold tracking-wide transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    {mode === "signin" ? "Accediendo…" : "Creando cuenta…"}
                  </>
                ) : (
                  <>
                    {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
            Al continuar aceptas las normas de la comunidad de Asternal.
          </p>
        </section>
      </main>
    </div>
  );
}
