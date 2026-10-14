import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Mail, Lock, User, ArrowRight, Loader2, AlertCircle,
  LogIn, UserPlus, Eye, EyeOff, Sparkles, Gamepad2, Palette, Globe,
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
      <label className="block px-1 text-[11px] font-medium tracking-wide text-muted-foreground">{label}</label>
      <div
        className={`glass-control relative isolate flex items-center overflow-hidden rounded-2xl transition focus-within:border-primary/65 focus-within:ring-1 focus-within:ring-primary/30 ${
          error ? "border-destructive/40" : ""
        }`}
      >
        <span className="relative z-10 flex w-11 shrink-0 justify-center text-muted-foreground/40">
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
          className={`w-full min-w-0 bg-transparent px-1 py-3 text-sm outline-none placeholder:text-muted-foreground/35 ${AUTH_FIELD_INPUT_FOCUS_CLASS}`}
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
    <div className="auth-scene relative min-h-dvh w-full overflow-y-auto text-foreground">
      {/* Fondo: degradado azul profundo con auroras que derivan despacio y
          una retícula fina para dar profundidad al cristal. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="auth-orb auth-orb-1 -left-36 -top-36 h-[30rem] w-[30rem]" />
        <div className="auth-orb auth-orb-2 -right-28 top-1/4 h-[26rem] w-[26rem]" />
        <div className="auth-orb auth-orb-3 bottom-[-11rem] left-1/3 h-[28rem] w-[28rem]" />
        <div className="auth-grid absolute inset-0 opacity-70" />
      </div>

      <main
        className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center gap-10 px-5 py-12 lg:flex-row lg:items-center lg:gap-20 ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-700`}
      >
        {/* Panel de marca */}
        <section className="hidden w-full max-w-md lg:block lg:max-w-xl lg:flex-1">
          <span className="glass-control inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-accent-foreground">
            <Sparkles size={12} /> Plataforma de creación de juegos
          </span>
          <h2 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground xl:text-6xl">
            Crea, publica y juega <span className="auth-gradient-text">sin límites.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Diseña niveles, anima personajes y comparte tus juegos con una comunidad de creadores, todo desde el navegador.
          </p>
          <ul className="mt-9 grid max-w-md gap-3">
            {[
              { icon: Gamepad2, t: "Editor de juegos completo", d: "Escenas, sprites, scripts y física." },
              { icon: Palette, t: "Arte y animación integrados", d: "Pinta y anima sin salir de Asternal." },
              { icon: Globe, t: "Publica al instante", d: "Tu juego en la galería con un clic." },
            ].map(({ icon: I, t, d }) => (
              <li key={t} className="glass-surface flex items-center gap-3.5 rounded-2xl p-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <I size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t}</span>
                  <span className="block text-xs text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Tarjeta de acceso */}
        <section className="w-full max-w-[430px] lg:shrink-0">
          <div className="auth-card relative overflow-hidden rounded-[32px] p-6 sm:p-9">
            {/* Filo de marca: hilo de degradado en el borde superior */}
            <span aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

            <div className="mb-6 flex items-center justify-between lg:hidden">
              <AsternalLogo size={36} />
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary">CREADORES</span>
            </div>

            {/* Encabezado de la página: en esta pantalla el título de la
                tarjeta es lo que la identifica. */}
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground">
              {mode === "signin" ? "Bienvenido de nuevo" : "Crear tu cuenta"}
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
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
              className="mt-5"
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
                className="btn-grad inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm font-semibold tracking-wide transition active:scale-[0.98] disabled:opacity-50"
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
