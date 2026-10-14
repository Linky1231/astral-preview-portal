import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  checkSchemaReady,
  runSchemaSetup,
  hasSupabaseConfig,
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSchemaSql,
  getSchemaSqlBlocks,
  sqlEditorUrl,
  SUPABASE_ACCESS_TOKEN,
  type SetupResult,
} from "@/lib/supabase/setup";
import {
  saveSupabaseCredentials,
} from "@/integrations/supabase/client";
import {
  Database, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, KeyRound, ExternalLink, Plug, RefreshCw, Save, Link2, Copy, TerminalSquare, Download, Sparkles,
} from "lucide-react";

type Status = "checking" | "local" | "ready" | "missing";

export function SupabaseSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [status, setStatus] = useState<Status>("checking");
  const [token, setToken] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [anonInput, setAnonInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const [showSqlRaw, setShowSqlRaw] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sqlBlocks = getSchemaSqlBlocks();

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setToken(SUPABASE_ACCESS_TOKEN ?? "");
    setUrlInput(getSupabaseUrl() ?? "");
    setAnonInput(getSupabaseAnonKey() ?? "");
    if (!hasSupabaseConfig()) {
      setStatus("local");
      return;
    }
    setStatus("checking");
    checkSchemaReady().then(ready => setStatus(ready ? "ready" : "missing"));
  }, [open]);

  const doSetup = async () => {
    setBusy(true);
    setResult(null);
    const r = await runSchemaSetup(token);
    setResult(r);
    if (r.ok) setStatus("ready");
    setBusy(false);
  };

  const recheck = () => {
    setStatus("checking");
    checkSchemaReady().then(ready => setStatus(ready ? "ready" : "missing"));
  };

  const saveAndConnect = () => {
    const res = saveSupabaseCredentials(urlInput, anonInput);
    if (!res.ok) {
      setSaveError(res.error ?? "No se pudieron guardar las credenciales");
      return;
    }
    window.location.reload();
  };

  const canSave = urlInput.trim().startsWith("https://") && anonInput.trim().length > 20;

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(getSchemaSql());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // En móviles/iframes el portapapeles puede estar bloqueado: muestra el
      // textarea seleccionable para copiar de forma nativa (mantener pulsado).
      setShowSqlRaw(true);
      setCopied(false);
    }
  };

  const copyBlock = async (i: number, sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedBlock(i);
      setTimeout(() => setCopiedBlock(null), 2500);
    } catch {
      setShowSqlRaw(true);
    }
  };

  const downloadSql = () => {
    try {
      const blob = new Blob([getSchemaSql()], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "supabase-setup.sql";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { /* ignore */ }
  };

  const selectAllSql = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.select();
    try { el.setSelectionRange(0, el.value.length); } catch { /* noop */ }
  };

  const editorUrl = sqlEditorUrl(urlInput.trim() || getSupabaseUrl() || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md panel border-border/60 rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database size={18} className="text-primary" />
            Configurar Supabase
          </DialogTitle>
          <DialogDescription>
            Conecta la plataforma a tu base de datos en la nube para sincronizar entre dispositivos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {/* ── Estado ── */}
          {status === "checking" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 size={14} className="animate-spin" /> Comprobando esquema…
            </div>
          )}

          {status === "local" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Modo local activo</div>
                    <div className="text-amber-700/80 dark:text-amber-300/70 mt-0.5">
                      La app aún no detecta las claves. Tienes dos opciones:
                    </div>
                  </div>
                </div>

                <div className="font-mono text-[11px] bg-white/70 dark:bg-black/20 rounded-lg px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all"><b>VITE_SUPABASE_URL</b></span>
                    {getSupabaseUrl() ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} /> detectada
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <AlertTriangle size={11} /> falta
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all"><b>VITE_SUPABASE_ANON_KEY</b></span>
                    {getSupabaseAnonKey() ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={11} /> detectada
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <AlertTriangle size={11} /> falta
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-blue-200/60 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800/40 p-3 text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed space-y-1">
                <div className="flex items-start gap-1.5">
                  <KeyRound size={11} className="shrink-0 mt-0.5" />
                  <span>
                    En el tab <b>Keys</b> usa el nombre <b>exacto</b> con prefijo{" "}
                    <span className="font-mono">VITE_</span>: p. ej.{" "}
                    <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>. Sin el prefijo la app no puede leerla.
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <RefreshCw size={11} className="shrink-0 mt-0.5" />
                  <span>
                    Las variables se «hornean» al compilar: si ya la guardaste y aquí sigue diciendo «falta»,
                    guarda cualquier cambio en el código (o recarga con el botón de abajo) para forzar la recompilación.
                  </span>
                </div>
              </div>

              {/* Pegar credenciales directamente */}
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Link2 size={14} className="shrink-0 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold text-foreground">Opción rápida: pega tus claves aquí</div>
                    <div className="mt-0.5">
                      Si no quieres depender de las variables de entorno, pega la URL y la anon key de Supabase
                      (<b>Project Settings → API Keys</b>) y pulsa guardar. Se usará en este navegador al instante.
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    URL del proyecto
                  </label>
                  <input
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    type="text"
                    placeholder="https://xxxxxxxx.supabase.co"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-white/70 dark:bg-input/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Anon / public key
                  </label>
                  <input
                    value={anonInput}
                    onChange={e => { setAnonInput(e.target.value); setSaveError(null); }}
                    type="password"
                    placeholder="eyJhbGciOi… (anon key — nunca tu token sbp_…)"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-white/70 dark:bg-input/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  ⚠️ El token de acceso personal (sbp_…) <b>solo</b> se usa en el botón de creación del
                  esquema y no se guarda. Si lo pegas aquí como anon key, toda la app fallará con «Invalid
                  API key». La anon key es el JWT que empieza por <span className="font-mono">eyJ…</span>.
                </p>

                {saveError && (
                  <div className="rounded-xl border border-rose-200/60 bg-rose-50/60 dark:bg-rose-950/20 dark:border-rose-800/40 p-3 text-[11px] text-rose-800 dark:text-rose-300 flex items-start gap-2">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span className="break-words">{saveError}</span>
                  </div>
                )}

                <button
                  onClick={saveAndConnect}
                  disabled={!canSave}
                  className="w-full py-2.5 rounded-xl grad-brand text-primary-foreground text-xs font-display font-semibold tracking-wider disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                >
                  <Save size={14} /> GUARDAR Y CONECTAR
                </button>
              </div>

              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 rounded-xl border border-amber-300/50 bg-white/70 dark:bg-black/20 text-amber-800 dark:text-amber-300 text-[11px] font-semibold tracking-wide hover:bg-white dark:hover:bg-black/30 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={12} /> RECARGAR LA APP PARA DETECTAR LAS CLAVES DE KEYS
              </button>
            </div>
          )}

          {status === "ready" && (
            <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">¡Esquema listo!</div>
                <div className="text-emerald-700/80 dark:text-emerald-300/70 mt-0.5">
                  Supabase está conectado y la base de datos está creada. Todo sincroniza entre dispositivos.
                </div>
              </div>
            </div>
          )}

          {status === "missing" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 text-xs text-muted-foreground space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck size={14} className="shrink-0 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold text-foreground">La base de datos está vacía</div>
                    <div className="mt-0.5">
                      Tu clave anon no puede crear tablas (es una medida de seguridad de Supabase).
                      Con tu token de acceso personal la app crea todo el esquema automáticamente.
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Opción 1 (principal): automático con el token ── */}
              <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-3.5 space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Sparkles size={14} className="shrink-0 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold text-foreground">Opción 1 · Automático (solo pega el token)</div>
                    <div className="mt-0.5 leading-relaxed">
                      Pega tu token y pulsa el botón: la app crea tablas, funciones, permisos y almacenamiento al instante.
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                    <KeyRound size={12} /> Token de acceso personal (sbp_…)
                  </label>
                  <input
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    type="password"
                    placeholder="sbp_xxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    className="w-full bg-white/70 dark:bg-input/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                  <p className="text-[10px] text-muted-foreground/50 leading-relaxed flex items-start gap-1.5">
                    <ExternalLink size={10} className="shrink-0 mt-0.5" />
                    Cómo obtenerlo: Supabase Dashboard → <b>Account → Access Tokens → Generate new token</b>.
                    El token solo se usa para esta instalación y no se guarda.
                  </p>
                </div>

                <button
                  onClick={doSetup}
                  disabled={busy || !token.trim().startsWith("sbp_")}
                  className="w-full py-2.5 rounded-xl grad-brand text-primary-foreground text-xs font-display font-semibold tracking-wider disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                  {busy ? "CREANDO ESQUEMA…" : "CREAR ESQUEMA AUTOMÁTICAMENTE"}
                </button>

                {result && (
                  <div className={`rounded-xl border p-3 text-[11px] flex items-start gap-2 ${
                    result.ok
                      ? "border-emerald-200/60 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                      : "border-rose-200/60 bg-rose-50/60 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                  }`}>
                    {result.ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                    <span className="break-words">{result.message}</span>
                  </div>
                )}

                <button
                  onClick={recheck}
                  className="w-full py-2 rounded-xl border border-border/70 bg-background text-muted-foreground text-[11px] font-semibold tracking-wide hover:bg-muted/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={12} /> COMPROBAR DE NUEVO
                </button>
              </div>

              {/* ── Opción 2 (respaldo): SQL Editor manual ── */}
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 dark:bg-emerald-950/15 dark:border-emerald-800/40 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <TerminalSquare size={14} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-semibold text-foreground">Opción 2 · SQL Editor (manual)</div>
                    <div className="mt-0.5 leading-relaxed">
                      Si el botón automático no está disponible, copia el SQL y pégalo en el SQL Editor de tu proyecto.
                    </div>
                  </div>
                </div>

                <button
                  onClick={copySql}
                  className="w-full py-2.5 rounded-xl grad-brand text-primary-foreground text-xs font-display font-semibold tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                >
                  {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copied ? "¡SQL COPIADO!" : "COPIAR TODO EL SQL"}
                </button>

                <button
                  onClick={downloadSql}
                  className="w-full py-2 rounded-xl border border-border/70 bg-background text-muted-foreground text-[11px] font-semibold tracking-wide hover:bg-muted/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Download size={12} /> DESCARGAR ARCHIVO .SQL
                </button>

                {editorUrl && (
                  <a
                    href={editorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 rounded-xl border border-border/70 bg-background text-muted-foreground text-[11px] font-semibold tracking-wide hover:bg-muted/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={12} /> ABRIR SQL EDITOR DE MI PROYECTO
                  </a>
                )}

                <button
                  onClick={() => setShowBlocks(v => !v)}
                  className="w-full py-2 rounded-xl border border-border/70 bg-background text-muted-foreground text-[11px] font-semibold tracking-wide hover:bg-muted/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Copy size={12} /> {showBlocks ? "OCULTAR COPIA POR PARTES" : "COPIAR POR PARTES (FÁCIL EN MÓVIL)"}
                </button>

                {showBlocks && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      Copia cada bloque, pégalo en el SQL Editor y pulsa <b>Run</b>. El script es idempotente: puedes ejecutarlo en partes, en orden, una a una.
                    </p>
                    {sqlBlocks.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-[10px] text-muted-foreground truncate">{b.title}</span>
                        <button
                          onClick={() => copyBlock(i, b.sql)}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-semibold tracking-wide hover:bg-primary/20 active:scale-[0.97] transition-all flex items-center gap-1"
                        >
                          {copiedBlock === i ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                          {copiedBlock === i ? "COPIADO" : "COPIAR"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowSqlRaw(v => !v)}
                  className="w-full py-2 rounded-xl border border-border/70 bg-background text-muted-foreground text-[11px] font-semibold tracking-wide hover:bg-muted/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Copy size={12} /> {showSqlRaw ? "OCULTAR TEXTO SQL" : "VER TEXTO SQL MANUALMENTE"}
                </button>

                {showSqlRaw && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                      El portapapeles está bloqueado aquí. Pulsa «Seleccionar todo», luego copia manteniendo pulsado el texto.
                    </p>
                    <button
                      onClick={() => selectAllSql(document.getElementById("sb-setup-sql-raw") as HTMLTextAreaElement | null)}
                      className="w-full py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-[11px] font-semibold tracking-wide hover:bg-primary/10 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 size={12} /> SELECCIONAR TODO
                    </button>
                    <textarea
                      id="sb-setup-sql-raw"
                      readOnly
                      value={getSchemaSql()}
                      onFocus={e => e.currentTarget.select()}
                      spellCheck={false}
                      className="w-full h-44 font-mono text-[10px] leading-relaxed bg-white/70 dark:bg-black/25 border border-border/70 rounded-xl p-3 outline-none focus:border-primary/40 resize-y"
                    />
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  Después de pegar el SQL en el editor: pulsa <b>Run</b> y espera a que termine (~10 s). Luego vuelve aquí y pulsa «Comprobar de nuevo».
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
