import { useState, useEffect, useRef } from "react";
import { Avatar } from "./Avatar";
import { Play, Heart, MessageCircle, Share2, GitFork, Loader2, Sparkles, Lock, X, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Gamepad2 } from "lucide-react";
import { useNavigate, Link } from "@tanstack/react-router";
import { type PostWithMeta, toggleReaction, loadGameProject, remixGame, purchaseGame, getMyOrbes, recordGamePlay } from "@/lib/social/api";
import { coverFrameFromPreset, coverFrameStyle } from "@/lib/social/cover-frame";
import { logPlaySession } from "@/lib/social/history";
import type { Project, Scene } from "@/lib/engine/core";
import { GameRuntime } from "@/components/engine/GameRuntime";
import { CommentSection } from "./CommentSection";
import { createProject, saveProjectById, setProjectCloudId, setCurrentProjectId } from "@/lib/engine/storage";
import { GameIconPlaceholder } from "./GameIcon";

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function extractTitle(content: string): { title: string; body: string } {
  const line = content.split("\n")[0] || "Juego";
  const title = line.replace(/^🎮\s*/, "").trim() || "Juego";
  const body = content.split("\n").slice(1).join("\n").trim();
  return { title, body };
}

export function GameCard({
  post, myId, isMod, onChange,
}: {
  post: PostWithMeta; myId: string | null; isMod: boolean; onChange: () => void;
}) {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState<Scene | null>(null);
  // Marca de inicio de la partida actual (para registrar la sesión en el historial).
  const sessionRef = useRef<{ startedAt: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [remixing, setRemixing] = useState(false);
  const { title, body } = extractTitle(post.content);
  const mine = myId === post.author_id;
  const canRemix = post.allow_remix !== false;
  const price = post.price_orbes ?? 0;
  const coverUrl = post.signed_cover ?? post.signed_screenshots[0] ?? null;
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [coverUrl]);
  const hasCover = Boolean(coverUrl) && !coverFailed;
  const coverFrame = coverFrameFromPreset(post.asset_preset);
  const [owned, setOwned] = useState<boolean>(post.owned ?? (price <= 0 || mine));
  useEffect(() => { setOwned(post.owned ?? (price <= 0 || mine)); }, [post.owned, price, mine]);
  const needsPurchase = !owned && price > 0 && !mine;

  // Purchase modal state
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyState, setBuyState] = useState<"idle" | "loading" | "success" | "insufficient" | "error">("idle");
  const [buyMsg, setBuyMsg] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.requestFullscreen?.().catch(() => {/* ignore */});
    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {/* ignore */});
    };
  }, [playing]);

  // Cierra la sesión de juego y la guarda en el historial real (historial panel).
  // Se ignora si duró menos de 3 segundos (abrir y salir al instante no cuenta).
  const endSession = () => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    const dur = Math.round((Date.now() - s.startedAt) / 1000);
    if (dur < 3) return;
    const endedAt = new Date().toISOString();
    try {
      logPlaySession({
        gameId: post.id,
        gameTitle: title,
        coverUrl,
        startedAt: new Date(s.startedAt).toISOString(),
        endedAt,
        durationSeconds: dur,
      });
    } catch { /* el historial nunca debe romper la partida */ }
  };

  const closeGame = () => { endSession(); setPlaying(null); };

  // Si el componente se desmonta con la partida abierta (navegar, cerrar feed),
  // igualmente se registra la sesión con lo jugado hasta ese momento.
  useEffect(() => () => { endSession(); }, []);

  const launchScene = async () => {
    if (!post.signed_media[0]) { setErr("Sin datos"); return; }
    const proj = (await loadGameProject(post.signed_media[0])) as Project;
    const scene = proj.scenes.find(s => s.id === proj.activeSceneId) ?? proj.scenes[0];
    if (!scene) throw new Error("Escena inválida");
    setPlaying(scene);
    sessionRef.current = { startedAt: Date.now() };
    // Registra la jugada para el ranking de «más jugados (24h)».
    void recordGamePlay(post.id);
  };

  const play = async () => {
    if (!post.signed_media[0]) { setErr("Sin datos"); return; }
    if (needsPurchase) {
      // Open confirm modal, fetch balance in parallel
      setBuyOpen(true);
      setBuyState("idle");
      setBuyMsg("");
      setBalance(null);
      getMyOrbes().then(setBalance).catch(() => setBalance(null));
      return;
    }
    setLoading(true); setErr(null);
    try { await launchScene(); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  const confirmPurchase = async () => {
    setBuyState("loading");
    setBuyMsg("");
    try {
      const res = await purchaseGame(post.id);
      if (!res.ok) throw new Error("No se pudo completar la compra");
      setOwned(true);
      setBuyState("success");
      setBuyMsg(`¡Compra realizada! ${typeof res.balance === "number" ? `Te quedan ${res.balance} orbes.` : ""}`);
      onChange();
      // Auto-launch after brief success flash
      setTimeout(async () => {
        setBuyOpen(false);
        setLoading(true);
        try { await launchScene(); } catch (e) { setErr((e as Error).message); }
        finally { setLoading(false); }
      }, 900);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (/insufficient/i.test(msg)) {
        setBuyState("insufficient");
        setBuyMsg("No tienes suficientes orbes para comprar este juego.");
      } else {
        setBuyState("error");
        setBuyMsg(msg || "Ocurrió un error al procesar la compra.");
      }
    }
  };

  const like = async () => { await toggleReaction({ postId: post.id, type: "like" }); onChange(); };
  const share = async () => {
    const url = window.location.origin + "/?g=" + post.id;
    try { await navigator.share({ url, title, text: body.slice(0, 80) }); }
    catch { await navigator.clipboard.writeText(url); }
  };
  const doRemix = async () => {
    if (!canRemix) { setErr("El autor no permite remixes"); return; }
    setRemixing(true); setErr(null);
    try {
      const { cloudId, name } = await remixGame(post);
      // Auto-import locally so aparece en "Mis juegos" del editor al instante
      const project = (await loadGameProject(post.signed_media[0])) as Project;
      try { (project as { name?: string }).name = name; } catch { /* ignore */ }
      const localId = createProject(name);
      saveProjectById(localId, project);
      setProjectCloudId(localId, cloudId);
      setCurrentProjectId(localId);
      navigate({ to: "/editor" });
    } catch (e) { setErr((e as Error).message); }
    finally { setRemixing(false); }
  };

  if (playing) {
    return (
      <div className="fixed inset-0 z-[100] bg-background" style={{ height: "100dvh", width: "100vw" }}>
        <GameRuntime
          scene={playing}
          fpsCap={60}
          showHUD={true}
          onExit={closeGame}
        />
        <button
          onClick={closeGame}
          className="fixed top-3 right-3 z-[110] px-3 py-2 rounded-xl glass text-xs font-display tracking-widest active:scale-95"
        >SALIR</button>
      </div>
    );
  }

  return (
    <article className="panel rounded-2xl overflow-hidden border border-border/50 shadow-sm">
      <div className="p-3 pb-0">
        <div className={`relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted/20 ${hasCover ? "" : "tile-blueprint"}`}>
        {hasCover ? (
          <img src={coverUrl!} alt={`Portada de ${title}`} onError={() => setCoverFailed(true)} className="absolute inset-0 w-full h-full object-contain" style={coverFrameStyle(coverFrame)} />
        ) : <GameIconPlaceholder iconSize={112} />}
        </div>
        <div className="flex items-start justify-between gap-3 pt-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <Link
              to="/profile/$userId" params={{ userId: post.author_id }}
              className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-border/60 block"
            >
              <Avatar p={post.author} className="w-full h-full" />
            </Link>
            <div className="min-w-0">
              <div className="font-display text-base leading-tight truncate text-foreground">{title}</div>
              <Link
                to="/profile/$userId" params={{ userId: post.author_id }}
                className="block text-[10px] font-mono truncate text-muted-foreground hover:underline"
              >
                @{post.author?.username ?? "jugador"} · {timeAgo(post.created_at)}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 shadow-sm border border-primary/20 shrink-0">
            <Sparkles size={12} className={price === 0 || owned ? "text-emerald-500" : "text-primary"} fill="currentColor" />
            <span className={`text-[10px] font-display font-semibold tracking-wide ${price === 0 ? "text-emerald-600 dark:text-emerald-300" : "text-foreground"}`}>
              {price === 0 ? "GRATIS" : owned ? "TUYO" : `${price} ORBES`}
            </span>
          </div>
        </div>
        <button
          onClick={play}
          disabled={loading}
          className="mt-3 h-12 w-full rounded-xl grad-brand text-primary-foreground font-display tracking-widest text-xs flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70"
          aria-label={needsPurchase ? `Comprar ${title} y jugar` : `Jugar ${title}`}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : needsPurchase ? <Lock size={17} /> : <Play size={17} fill="currentColor" />}
          {loading ? "ABRIENDO" : needsPurchase ? `COMPRAR · ${price} ORBES` : "JUGAR AHORA"}
        </button>
      </div>

      {/* Galería de capturas */}
      {post.signed_screenshots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pt-2.5">
          {post.signed_screenshots.map((src, i) => (
            <button
              key={i}
              onClick={() => setViewer(i)}
              className="relative w-28 h-[72px] shrink-0 rounded-xl overflow-hidden border border-border/60 group active:scale-95 transition"
              aria-label={`Ver captura ${i + 1}`}
            >
              <img src={src} alt={`Captura ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent opacity-0 group-hover:opacity-100 transition" />
            </button>
          ))}
        </div>
      )}


      {(body || err) && (
        <div className="px-3 pt-2 text-sm whitespace-pre-wrap break-words">
          {body}
          {err && <div className="text-xs text-destructive mt-1">{err}</div>}
        </div>
      )}

      {post.game_genre && (
        <div className="px-3 pt-2.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-display tracking-wide text-primary-glow">
            <Gamepad2 size={11} /> {post.game_genre}
          </span>
        </div>
      )}

      <footer className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-muted-foreground">
        <button onClick={like} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition ${post.my_like ? "text-primary-glow" : ""}`}>
          <Heart size={15} fill={post.my_like ? "currentColor" : "none"} /> {post.likes}
        </button>
        <button onClick={() => setOpenComments(o => !o)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition">
          <MessageCircle size={15} /> {post.comments_count}
        </button>
        {canRemix && !mine && (
          <button onClick={doRemix} disabled={remixing} title="Hacer remix"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition ml-auto text-primary-glow disabled:opacity-60">
            {remixing ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />}
            <span className="text-[10px] font-display tracking-widest">REMIX</span>
          </button>
        )}
        <button onClick={share} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition ${canRemix && !mine ? "" : "ml-auto"}`}>
          <Share2 size={15} />
        </button>
      </footer>

      {openComments && (
        <div className="px-3 pb-3">
          <CommentSection postId={post.id} myId={myId} isMod={isMod} onChange={onChange} />
        </div>
      )}

      {/* Visor de capturas a pantalla completa */}
      {viewer !== null && post.signed_screenshots.length > 0 && (
        <div
          className="fixed inset-0 z-[130] bg-black/90  grid place-items-center p-4 animate-in fade-in duration-200"
          onClick={() => setViewer(null)}
        >
          <button
            onClick={() => setViewer(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-90 transition z-10"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
          {post.signed_screenshots.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setViewer(v => (v! - 1 + post.signed_screenshots.length) % post.signed_screenshots.length); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-90 transition z-10"
                aria-label="Anterior"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setViewer(v => (v! + 1) % post.signed_screenshots.length); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-white/10 text-white grid place-items-center hover:bg-white/20 active:scale-90 transition z-10"
                aria-label="Siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden shadow-lg animate-in zoom-in-95 duration-200"
          >
            <img
              src={post.signed_screenshots[viewer]}
              alt={`Captura ${viewer + 1}`}
              className="w-full h-full max-h-[80vh] object-contain bg-black"
            />
          </div>
          <div className="absolute bottom-4 inset-x-0 text-center text-[11px] font-mono text-white/70">
            {viewer + 1} / {post.signed_screenshots.length}
          </div>
        </div>
      )}

      {buyOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/60  grid place-items-center p-4 animate-in fade-in duration-200"
          onClick={() => buyState !== "loading" && setBuyOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm panel rounded-3xl border border-primary/30 p-5 shadow-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative"
          >
            {buyState !== "loading" && (
              <button
                onClick={() => setBuyOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg grid place-items-center hover:bg-muted/60 active:scale-90 transition"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            )}

            {(buyState === "idle" || buyState === "loading") && (
              <>
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 grid place-items-center mb-3">
                  {buyState === "loading"
                    ? <Loader2 size={26} className="animate-spin text-primary" />
                    : <Sparkles size={26} className="text-primary" fill="currentColor" />}
                </div>
                <h3 className="font-display text-center text-lg">{buyState === "loading" ? "Procesando compra…" : "Comprar juego"}</h3>
                <p className="text-xs text-center text-muted-foreground mt-1 truncate">{title}</p>
                <div className="mt-4 rounded-2xl bg-muted/40 border border-border/60 p-3 space-y-1.5">
                  <Row label="Precio" value={<span className="flex items-center gap-1"><Sparkles size={12} className="text-primary" fill="currentColor" /> {price}</span>} />
                  <Row label="Saldo actual" value={balance === null ? "…" : <span className="tabular-nums">{balance}</span>} />
                  <div className="border-t border-border/50 my-1" />
                  <Row
                    label="Saldo tras compra"
                    value={
                      balance === null
                        ? "…"
                        : <span className={`tabular-nums font-semibold ${balance - price < 0 ? "text-rose-500" : "text-emerald-500"}`}>{balance - price}</span>
                    }
                  />
                </div>
                <button
                  onClick={confirmPurchase}
                  disabled={buyState === "loading" || (balance !== null && balance < price)}
                  className="mt-4 w-full h-11 rounded-2xl grad-brand text-primary-foreground font-display tracking-widest text-xs disabled:opacity-50 active:scale-[0.99] transition"
                >
                  {buyState === "loading" ? <Loader2 size={16} className="animate-spin mx-auto" /> : "CONFIRMAR COMPRA"}
                </button>
                {balance !== null && balance < price && buyState === "idle" && (
                  <div className="mt-2 text-[11px] text-center text-rose-500">Saldo insuficiente. Te faltan {price - balance} orbes.</div>
                )}
              </>
            )}

            {buyState === "success" && (
              <div className="text-center py-2">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 grid place-items-center mb-3 animate-in zoom-in-50 duration-300">
                  <CheckCircle2 size={30} className="text-emerald-500" />
                </div>
                <h3 className="font-display text-lg">¡Juego desbloqueado!</h3>
                <p className="text-xs text-muted-foreground mt-1">{buyMsg}</p>
              </div>
            )}

            {(buyState === "insufficient" || buyState === "error") && (
              <div className="text-center py-2">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/15 grid place-items-center mb-3">
                  <AlertTriangle size={26} className="text-rose-500" />
                </div>
                <h3 className="font-display text-lg">{buyState === "insufficient" ? "Orbes insuficientes" : "No se pudo comprar"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{buyMsg}</p>
                <button
                  onClick={() => setBuyOpen(false)}
                  className="mt-4 w-full h-10 rounded-2xl border border-border font-display tracking-widest text-xs active:scale-[0.99] transition"
                >
                  ENTENDIDO
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
