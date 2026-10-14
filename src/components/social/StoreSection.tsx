import { useEffect, useState, useCallback } from "react";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { StoreOverlay, StoreImage } from "./StoreOverlay";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Store, Palette, Package, Sparkles, X, Loader2, Heart, Search,
  DollarSign, Gift, Eye, ShoppingCart, Star, TrendingUp, Clock,
  Upload, Plus, CheckCircle2, AlertTriangle, ExternalLink, EyeOff, ShieldCheck,
  Gamepad2, Layers, User, Box, Skull, CircleDollarSign, Flag, Flower2,
  MessageCircle, Bookmark, Download, ZoomIn,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  type PostWithMeta, type Profile,
  fetchArtworks, fetchMyArtworks, purchaseArtwork, publishArtwork,
  getMyProfile, getMyOrbes, toggleReaction,
} from "@/lib/social/api";
import { CommentSection } from "@/components/social/CommentSection";
import { socialActionStateClass } from "@/lib/social/interaction-state";
import { galleryPreviewAuthor, galleryPreviewPrice, isArtistGalleryArtwork } from "@/lib/social/gallery-preview";
import { galleryDetailMotion } from "@/lib/social/gallery-detail-motion";

/* ═══════════════════════════════════════════════════════
   IMAGE VIEWER — Lightbox para ver imágenes completas
   ═══════════════════════════════════════════════════════ */
function ImageViewer({
  src, alt, onClose,
}: {
  src: string; alt: string; onClose: () => void;
}) {
  if (!src) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-muted-foreground text-xs font-medium truncate max-w-[70%]">{alt || "Vista completa"}</span>
        <div className="flex items-center gap-2">
          <a href={src} download target="_blank" rel="noopener"
            onClick={e => e.stopPropagation()}
            aria-label="Descargar imagen" className="w-8 h-8 shrink-0 rounded-lg bg-muted/30 grid place-items-center hover:bg-muted/50 transition">
            <Download size={14} className="text-foreground" />
          </a>
          <Button variant="outline" size="icon" type="button" aria-label="Cerrar ventana" onClick={onClose}
            className="w-8 h-8 shrink-0 rounded-lg bg-muted/30 grid place-items-center hover:bg-muted/50 transition">
            <X size={14} className="text-foreground" />
          </Button>
        </div>
      </div>
      {/* Image — se adapta al tamaño de pantalla sin recortar */}
      <div className="min-h-0 flex-1 flex items-center justify-center px-4 pb-4 overflow-auto" onClick={e => e.stopPropagation()}>
        <img
          src={src} alt={alt}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          style={{ width: "auto", height: "auto" }}
          draggable={false}
        />
      </div>
    </motion.div>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

/* ═══════════════════════════════════════════════════════
   ASSET CARD — Mini-publicación completa
   ═══════════════════════════════════════════════════════ */
function AssetCard({
  post, myId, onBuy, onRefresh, onViewImage,
}: {
  post: PostWithMeta; myId: string | null;
  onBuy: (p: PostWithMeta) => void; onRefresh: () => void;
  onViewImage: (src: string, alt: string) => void;
}) {
  const [openComments, setOpenComments] = useState(false);
  const author = post.author;
  const isFree = !post.price_orbes || post.price_orbes === 0;
  const isOwn = post.author_id === myId;

  // Parse content: first line = title, rest = description + hashtags
  const lines = post.content.split("\n");
  const titleText = (lines[0] || "Asset").replace(/^🎮🎨\s*/, "").slice(0, 60);
  const descLines = lines.slice(1).filter(l => l.trim() && !l.startsWith("#"));
  const description = descLines.join(" ").trim();
  const hashtags = post.tags?.length
    ? post.tags
    : lines.filter(l => l.startsWith("#")).flatMap(l => l.match(/#[\w-]+/g) ?? []);
  const imgSrc = post.signed_cover || post.signed_media?.[0] || null;

  const react = async (type: "like" | "favorite") => {
    await toggleReaction({ postId: post.id, type });
    onRefresh();
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden hover:border-primary/25 transition-all duration-200 group">
      {/* Cover image — se adapta sin recortar */}
      <div className="relative w-full bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden">
        {imgSrc ? (
          <div className="relative w-full max-h-[280px] bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden cursor-pointer" onClick={() => onViewImage(imgSrc, titleText)}>
            <img src={imgSrc} alt=""
              className="min-w-0 max-w-full w-full h-full object-contain group-hover:opacity-90 transition-opacity duration-300" />
            {/* Zoom badge */}
            <div className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-foreground/20 backdrop-blur-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn size={13} className="text-primary-foreground" />
            </div>
          </div>
        ) : (
          <div className="min-w-0 max-w-full w-full h-40 grid place-items-center">
            <Package size={32} className="text-primary/20" />
          </div>
        )}
        {/* Price badge */}
        <div className="absolute top-2 right-2">
          {isFree ? (
            <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-success/10 text-success-ink border border-success/20">
              GRATIS
            </span>
          ) : (
            <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/15 flex items-center gap-1 tabular-nums">
              <Sparkles size={10} /> {post.price_orbes}
            </span>
          )}
        </div>
      </div>

      {/* Info — mini-publicación */}
      <div className="p-3 space-y-2">
        {/* Author */}
        {author && (
          <Link to="/profile/$userId" params={{ userId: post.author_id }} className="flex items-center gap-2 hover:opacity-80 transition">
            <Avatar p={author} className="w-6 h-6 shrink-0" />
            <div>
              <div className="text-[11px] font-semibold leading-tight">@{author.username}</div>
              <div className="text-[9px] text-muted-foreground/50">{timeAgo(post.created_at)}</div>
            </div>
          </Link>
        )}

        {/* Title */}
        <div className="text-sm font-bold leading-snug group-hover:text-primary transition-colors">
          {titleText}
        </div>

        {/* Description */}
        {description && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
            {description}
          </p>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.slice(0, 5).map((tag, i) => (
              <span key={i} className="text-[9px] text-primary/70 font-medium">{tag.startsWith("#") ? tag : `#${tag}`}</span>
            ))}
          </div>
        )}

        {/* Asset preset attributes */}
        {(() => {
          const ap = post.asset_preset as Record<string, unknown> | null | undefined;
          if (!ap) return null;
          const k = ap.kind as string | undefined;
          const c = ap.color as string | undefined;
          const w = ap.w as number | undefined;
          const h = ap.h as number | undefined;
          const hasScripts = Array.isArray(ap.scripts) && ap.scripts.length > 0;
          return (
            <div className="flex flex-wrap gap-1">
              {k && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider bg-primary/8 text-primary/70 border border-primary/10">{k.toUpperCase()}</span>}
              {c && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium bg-muted/40 border border-border/30"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c }} />color</span>}
              {w && h && <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-muted-foreground/50 bg-muted/30 border border-border/20">{w}×{h}</span>}
              {!!ap.solid && <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-amber-500/8 text-amber-600 border border-amber-500/10">solid</span>}
              {!!ap.texture && <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-violet-500/8 text-violet-600 border border-violet-500/10">textura</span>}
              {!!ap.moving && <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-cyan-500/8 text-cyan-600 border border-cyan-500/10">móvil</span>}
              {hasScripts && <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-emerald-500/8 text-emerald-600 border border-emerald-500/10">scripts</span>}
            </div>
          );
        })()}

        {/* Stats */}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="ghost" type="button" onClick={() => react("like")} aria-pressed={post.my_like} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${socialActionStateClass(post.my_like)}`}>
            <Heart size={14} className={post.my_like ? "fill-current" : ""} /> {post.likes}
          </Button>
          <Button variant="ghost" type="button" onClick={() => setOpenComments(!openComments)} aria-expanded={openComments} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${socialActionStateClass(openComments)} `}>
            <MessageCircle size={14} /> {post.comments_count}
          </Button>
          <Button variant="ghost" type="button" onClick={() => react("favorite")} aria-pressed={post.my_favorite} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${socialActionStateClass(post.my_favorite)}`}>
            <Bookmark size={14} className={post.my_favorite ? "fill-current" : ""} /> {post.favorites}
          </Button>
        </div>

        {/* Comments section */}
        {openComments && (
          <div className="pt-2 border-t border-border/30">
            <CommentSection postId={post.id} myId={myId} isMod={false} onChange={onRefresh} />
          </div>
        )}

        {/* Buy / Info */}
        <div className="flex gap-2 pt-1">
          {isOwn ? (
            <span className="flex-1 h-8 rounded-lg bg-muted/50 grid place-items-center text-[10px] text-muted-foreground font-medium">
              Tu objeto
            </span>
          ) : (
            <Button variant="ghost" type="button"
              onClick={() => onBuy(post)}
              className={`flex-1 h-8 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.97] ${
                isFree
                  ? "bg-success/10 text-success-ink hover:bg-success/15 border border-success/20"
                  : "bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20"
              }`}
            >
              {isFree ? <Gift size={12} /> : <ShoppingCart size={12} />}
              {isFree ? "Descargar" : `${post.price_orbes} orbes`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PUBLISH ASSET DIALOG
   ═══════════════════════════════════════════════════════ */
function PublishAssetDialog({
  open, onClose, onPublished,
}: {
  open: boolean; onClose: () => void; onPublished: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [price, setPrice] = useState(0);
  const [libraryItems, setLibraryItems] = useState<Array<{ id: string; name: string; preset: Record<string, unknown> }>>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loadingLib, setLoadingLib] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingLib(true);
    (async () => {
      try {
        const { pullAssetLibraryFromCloud } = await import("@/lib/engine/cloud-sync");
        const items = await pullAssetLibraryFromCloud();
        setLibraryItems((items ?? []).map((i) => ({ id: i.id, name: i.name, preset: i.preset as Record<string, unknown> })));
      } catch {
        setLibraryItems([]);
      } finally {
        setLoadingLib(false);
      }
    })();
  }, [open]);

  const selectedItem = libraryItems.find(i => i.id === selectedItemId);

  const handlePublish = async () => {
    if (!selectedItem) { setError("Selecciona un objeto de tu biblioteca"); return; }
    if (!title.trim()) { setError("Escribe un título"); return; }
    setPublishing(true); setError(null);
    try {
      const texture = selectedItem.preset.texture as string | undefined | null;
      const coverDataUrl = texture || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const parsedTags = tagsInput.split(/[, ]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
      await publishArtwork({
        title: title.trim(),
        description: description.trim() || undefined,
        imageDataUrl: coverDataUrl,
        priceOrbes: price,
        assetPreset: { ...selectedItem.preset, id: undefined },
        tags: parsedTags.length ? parsedTags : undefined,
      });
      setDone(true);
      setTimeout(() => {
        onPublished();
        onClose();
        setDone(false); setTitle(""); setDescription(""); setTagsInput(""); setPrice(0); setSelectedItemId(null);
      }, 1200);
    } catch (e) { setError((e as Error).message); setPublishing(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] rounded-2xl bg-card border border-border/50 flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <div>
            <h3 className="font-display text-sm font-bold">Publicar en la Tienda</h3>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Solo se pueden publicar objetos de tu biblioteca del editor</p>
          </div>
          <Button variant="outline" size="icon" type="button" aria-label="Cerrar ventana" onClick={onClose} className="w-9 h-9 shrink-0 rounded-lg hover:bg-muted grid place-items-center"><X size={14} /></Button>
        </div>

        {done ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 size={32} className="text-success-ink mx-auto" />
            <div className="text-sm font-semibold">¡Publicado!</div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-0 space-y-3">
            {/* Selector de objetos de la biblioteca */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Objeto de la biblioteca *</label>
              {loadingLib ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={16} className="animate-spin text-primary/40" />
                  <span className="text-xs text-muted-foreground/50">Cargando biblioteca…</span>
                </div>
              ) : libraryItems.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-muted/30 border border-border/30 grid place-items-center">
                    <Package size={18} className="text-muted-foreground/25" />
                  </div>
                  <div className="text-xs text-muted-foreground/60">No tienes objetos en la biblioteca</div>
                  <div className="text-[10px] text-muted-foreground/40">Guarda recursos en el editor para venderlos aquí</div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 mt-1.5 max-h-[180px] overflow-y-auto pr-1">
                  {libraryItems.map(item => {
                    const tex = item.preset.texture as string | undefined | null;
                    const kind = (item.preset.kind as string) || "entity";
                    const isSelected = selectedItemId === item.id;
                    return (
                      <Button variant="ghost" type="button" key={item.id} onClick={() => setSelectedItemId(item.id)}
                        className={`relative h-auto block min-w-0 whitespace-normal rounded-xl border p-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                            : "border-border/40 bg-muted/20 hover:border-primary/20"
                        }`}>
                        <div className="min-w-0 w-full aspect-square rounded-lg bg-muted/40 flex items-center justify-center overflow-hidden mb-1.5">
                          {tex ? (
                            <img src={tex} alt={item.name} className="min-w-0 max-w-full w-full h-full object-cover" />
                          ) : (
                            <Layers size={16} className="text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="text-[10px] font-medium truncate" title={item.name}>{item.name}</div>
                        <div className="truncate text-[9px] text-muted-foreground uppercase">{kind}</div>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary grid place-items-center">
                            <CheckCircle2 size={10} className="text-primary-foreground" />
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedItem && (
              <>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Título *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder={selectedItem.name || "Nombre del objeto"}
                    className="min-w-0 max-w-full w-full h-10 px-3 mt-1 rounded-lg bg-muted/40 border border-border/40 text-sm outline-none focus:border-primary/40 transition" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Descripción</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe tu objeto..."
                    rows={3} className="min-w-0 max-w-full w-full px-3 mt-1 rounded-lg bg-muted/40 border border-border/40 text-sm outline-none focus:border-primary/40 transition resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Hashtags</label>
                  <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="plataforma, pixel-art, aventura..."
                    className="min-w-0 max-w-full w-full h-9 px-3 mt-1 rounded-lg bg-muted/40 border border-border/40 text-sm outline-none focus:border-primary/40 transition" />
                  <div className="text-[9px] text-muted-foreground/40 mt-1">Separados por comas. Se publicarán como #hashtags</div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Precio en orbes</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" min={0} value={price} onChange={e => setPrice(Number(e.target.value))}
                      className="w-24 h-10 px-3 rounded-lg bg-muted/40 border border-border/40 text-sm outline-none focus:border-primary/40 transition" />
                    <span className="text-xs text-muted-foreground">0 = Gratis</span>
                  </div>
                </div>
              </>
            )}

            {error && <div className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle size={12} /> {error}</div>}

            <Button variant="ghost" type="button" onClick={handlePublish} disabled={publishing || !selectedItem || !title.trim()}
              className="min-w-0 max-w-full w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50">
              {publishing ? <><Loader2 size={14} className="animate-spin" /> Publicando…</> : <><Upload size={14} /> Publicar</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   BUY CONFIRMATION DIALOG
   ═══════════════════════════════════════════════════════ */
function BuyDialog({
  post, myId, balance, onClose, onBought,
}: {
  post: PostWithMeta; myId: string; balance: number;
  onClose: () => void; onBought: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"ok" | "insufficient" | "error" | null>(null);

  const isFree = !post.price_orbes || post.price_orbes === 0;
  const canAfford = isFree || balance >= (post.price_orbes ?? 0);

  const handleBuy = async () => {
    setLoading(true);
    try {
      await purchaseArtwork(post.id);
      setResult("ok");
      onBought();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("insufficient") || msg.includes("insuficiente")) setResult("insufficient");
      else setResult("error");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[145] bg-foreground/30 backdrop-blur-md grid place-items-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-xl border border-border/60 bg-card p-4 sm:p-6 space-y-4 shadow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">{isFree ? "Obtener obra" : "Comprar obra"}</h3>
          <Button variant="outline" size="icon" type="button" aria-label="Cerrar ventana" onClick={onClose} className="w-9 h-9 shrink-0 rounded-xl border border-border/60 bg-muted/40 hover:bg-muted grid place-items-center"><X size={15} /></Button>
        </div>
        {result === "ok" ? (
          <div className="py-6 text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-success/15 grid place-items-center mx-auto mb-2">
              <CheckCircle2 size={26} className="text-success-ink" />
            </div>
            <div className="font-display text-lg font-semibold">{isFree ? "¡Obra añadida!" : "¡Obra comprada!"}</div>
          </div>
        ) : result === "insufficient" ? (
          <div className="py-6 text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-warn/15 grid place-items-center mx-auto mb-2">
              <AlertTriangle size={26} className="text-warn-ink" />
            </div>
            <div className="font-display text-lg font-semibold">Orbes insuficientes</div>
            <div className="text-xs text-muted-foreground">Tienes {balance} orbes. Necesitas {post.price_orbes}.</div>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {isFree
                ? `Obtener "${(post.content.split("\n")[0] || "Obra").slice(0, 40)}" gratis`
                : `Comprar "${(post.content.split("\n")[0] || "Obra").slice(0, 40)}" por ${post.price_orbes} orbes`
              }
            </div>
            {!isFree && (
              <div className="text-xs text-muted-foreground/70">Tu saldo: {balance} orbes</div>
            )}
            {result === "error" && <div className="text-xs text-destructive">Error al procesar. Intenta de nuevo.</div>}
            <Button variant="ghost" type="button" onClick={handleBuy} disabled={loading || !canAfford}
              className="min-w-0 max-w-full w-full h-11 rounded-xl grad-brand text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 shadow-sm"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : isFree ? <Gift size={15} /> : <ShoppingCart size={15} />}
              {isFree ? "Obtener gratis" : `Pagar ${post.price_orbes} orbes`}
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   STORE SECTION — Main component
   ═══════════════════════════════════════════════════════ */
export function StoreSection({ myId, isMod: _isMod, onRefresh }: {
  myId: string | null; isMod: boolean; onRefresh?: () => void;
}) {
  const [artworks, setArtworks] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  // Dialogs
  const [buyPost, setBuyPost] = useState<PostWithMeta | null>(null);
  const [detailPost, setDetailPost] = useState<PostWithMeta | null>(null);
  const [viewImageSrc, setViewImageSrc] = useState<string | null>(null);
  const [viewImageAlt, setViewImageAlt] = useState("");
  const openImageViewer = (src: string, alt: string) => { setViewImageSrc(src); setViewImageAlt(alt); };
  const detailImage = detailPost?.signed_cover || detailPost?.signed_media?.[0] || null;
  const detailTitle = detailPost?.content.split("\n")[0].replace(/^🎮🎨\s*/, "").slice(0, 60) || "Obra de galería";
  const detailMotion = galleryDetailMotion(Boolean(reducedMotion));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [arts, p] = await Promise.all([
        fetchArtworks(),
        getMyProfile(),
      ]);
      setArtworks(arts);
      if (p) { setProfile(p); setBalance(p.orbes ?? 0); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleBuy = () => { setBuyPost(null); load(); onRefresh?.(); };

  // Tienda: obras originales de artistas, no objetos de la biblioteca del editor.
  const galleryItems = artworks
    .filter(isArtistGalleryArtwork)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="store-section min-w-0 space-y-4">
      <header className="flex items-start gap-3 border-b border-border/50 px-1 py-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 grid place-items-center"><Palette size={18} className="text-primary" /></span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold">Tienda</h2>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Obras originales publicadas y vendidas por artistas.</p>
        </div>
      </header>

      <motion.div key="artist-gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
        <GallerySubSection artworks={galleryItems} loading={loading} myId={myId} profile={profile} onRefresh={load} onOpenDetail={setDetailPost} />
      </motion.div>

      {/* Buy Dialog */}
      {buyPost && myId && balance !== null && (
        <StoreOverlay foreground label="Confirmar compra" onClose={() => setBuyPost(null)}><BuyDialog post={buyPost} myId={myId} balance={balance} onClose={() => setBuyPost(null)} onBought={handleBuy} /></StoreOverlay>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {detailPost && (
          <StoreOverlay label={`Detalle de ${detailTitle}`} onClose={() => setDetailPost(null)}><motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={detailMotion.overlay}
            className="fixed inset-0 h-dvh z-[140] flex flex-col overflow-hidden bg-background/95 backdrop-blur-md"
            onClick={() => setDetailPost(null)}
          >
            <motion.div
              initial={detailMotion.initialPanel}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.99 }}
              transition={detailMotion.panel}
              className="min-h-0 flex-1 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <header className="shrink-0 glass-header border-b">
                <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-muted/70 grid place-items-center"><Palette size={15} className="text-muted-foreground" /></span>
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Tienda</div>
                      <h3 className="font-display text-sm font-bold truncate">{detailTitle}</h3>
                    </div>
                  </div>
                  <Button variant="outline" size="icon" type="button" onClick={() => setDetailPost(null)} className="w-9 h-9 shrink-0 rounded-xl border border-border/60 bg-muted/40 hover:bg-muted grid place-items-center" aria-label="Cerrar detalle de obra"><X size={15} /></Button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
              <section className="min-w-0 overflow-hidden">
                <div className="aspect-square min-h-0 bg-muted/30 p-3 sm:p-5 grid place-items-center">
                  {detailImage ? (
                    <StoreImage src={detailImage} alt={detailTitle} className="min-h-0 min-w-0 max-w-full w-full h-full object-contain rounded-xl" />
                  ) : (
                    <div className="text-center text-muted-foreground/60 space-y-2"><Package size={34} className="mx-auto" /><p className="text-xs">Esta obra no incluye una imagen disponible.</p></div>
                  )}
                </div>
              </section>

              <aside className="min-w-0 space-y-4 lg:pl-4">
                <div className="flex items-center gap-2">
                  <Avatar p={detailPost.author} className="w-8 h-8" />
                  <div className="min-w-0"><div className="text-sm font-medium truncate">@{detailPost.author?.username ?? "artista"}</div><div className="text-[10px] text-muted-foreground">{timeAgo(detailPost.created_at)}</div></div>
                </div>
                {detailPost.content.split("\n").slice(1).filter(line => line.trim() && !line.startsWith("#")).length > 0 && (
                  <p className="break-words text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{detailPost.content.split("\n").slice(1).filter(line => line.trim() && !line.startsWith("#")).join(" ")}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2.5">
                  <div><div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Precio</div><div className="mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums"><Sparkles size={13} className="text-primary" />{galleryPreviewPrice(detailPost.price_orbes)} orbes</div></div>
                  {myId && detailPost.author_id !== myId && <Button variant="gradient" type="button" disabled={balance === null} onClick={() => setBuyPost(detailPost)} className="h-9 rounded-lg px-3 text-[11px] font-semibold">{balance === null ? "Saldo no disponible" : detailPost.price_orbes ? "Comprar obra" : "Obtener obra"}</Button>}
                </div>
                <div className="border-t border-border/50 pt-4"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Comentarios</div><CommentSection postId={detailPost.id} myId={myId} isMod={false} onChange={load} /></div>
              </aside>
            </div>
              </div>
              </div>
            </motion.div>
          </motion.div></StoreOverlay>
        )}
      </AnimatePresence>

      {/* Image Viewer / Lightbox */}
      <AnimatePresence>
        {viewImageSrc && (
          <ImageViewer src={viewImageSrc} alt={viewImageAlt} onClose={() => setViewImageSrc(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   GALLERY SUB-SECTION — obras de artistas
   ═══════════════════════════════════════════════════════ */
function GallerySubSection({
  artworks, loading, myId, profile: _profile, onRefresh, onOpenDetail,
}: {
  artworks: PostWithMeta[]; loading: boolean; myId: string | null;
  profile: Profile | null; onRefresh: () => void;
  onOpenDetail: (post: PostWithMeta) => void;
}) {
  const [filter, setFilter] = useState<"recent" | "popular" | "free">("recent");

  const items = artworks
    .filter(a => {
      if (filter === "free") return !a.price_orbes || a.price_orbes === 0;
      return true;
    })
    .sort((a, b) => {
      if (filter === "popular") return (b.likes ?? 0) - (a.likes ?? 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="grid grid-cols-3 gap-1.5">
        {([["recent", "Recientes", Clock], ["popular", "Populares", TrendingUp], ["free", "Gratis", Gift]] as const).map(([id, label, Icon]) => (
          <Button variant="ghost" type="button"
            aria-pressed={filter === id} key={id} onClick={() => setFilter(id)}
            className={`min-w-0 h-10 px-1 sm:px-3 rounded-lg text-[10px] font-semibold tracking-wide flex items-center gap-1 transition-all ${
              filter === id
                ? "grad-brand text-primary-foreground border border-transparent shadow-sm"
                : "bg-muted/40 text-muted-foreground border border-transparent hover:text-foreground"
            }`}
          >
            <Icon size={10} /> {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2">
          <Loader2 size={18} className="animate-spin text-primary/40" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-xs text-muted-foreground">
          {filter === "free" ? "No hay obras gratuitas disponibles" : "No hay obras en la tienda aún"}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map(p => {
            const lines = p.content.split("\n");
            const titleText = (lines[0] || "Sin título").replace(/^🎮🎨\s*/, "").slice(0, 60);
            const imageSrc = p.signed_cover || p.signed_media?.[0] || null;
            const authorLabel = galleryPreviewAuthor(p.author?.username);
            const priceLabel = galleryPreviewPrice(p.price_orbes);

            return (
              <article key={p.id} className="rounded-2xl border border-border/50 bg-card overflow-hidden hover:border-border-strong hover:shadow-md transition-[border-color,box-shadow] duration-200 group">
                <Button variant="ghost" type="button" onClick={() => onOpenDetail(p)} className="relative block h-auto min-w-0 w-full aspect-square bg-muted/30 p-2 text-left" aria-label={`Abrir ${titleText}`}>
                  {imageSrc ? <img src={imageSrc} alt={titleText} className="min-w-0 max-w-full w-full h-full object-contain rounded-xl transition-transform duration-200 pointer-fine:group-hover:scale-[1.015]" /> : <div className="min-w-0 max-w-full w-full h-full rounded-xl border border-dashed border-border/60 grid place-items-center"><Package size={26} className="text-muted-foreground/50" /></div>}
                  <span className="absolute bottom-3 right-3 w-7 h-7 rounded-lg border border-border bg-popover backdrop-blur-sm grid place-items-center opacity-0 pointer-fine:group-hover:opacity-100 transition-opacity"><ZoomIn size={13} className="text-primary-foreground" /></span>
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/40 px-2 sm:px-3 py-2.5">
                  <Link to="/profile/$userId" params={{ userId: p.author_id }} className="flex min-w-0 items-center gap-2 hover:opacity-80 transition" aria-label={`Ver perfil de ${authorLabel}`}>
                    <Avatar p={p.author} className="w-6 h-6 shrink-0" />
                    <span className="min-w-0 truncate text-[11px] font-semibold leading-tight">{authorLabel}</span>
                  </Link>
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-semibold tabular-nums text-foreground/75" aria-label={`Precio: ${priceLabel}`}>
                    <Sparkles size={12} className="text-primary/75" />
                    <span className="min-w-0 break-all">{priceLabel}</span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

          </div>
  );
}
