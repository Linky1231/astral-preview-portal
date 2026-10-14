import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProfileOverlay } from "./ProfileOverlay";
import { StoreImage } from "./StoreOverlay";
import { createProfileQr } from "@/lib/social/profile-qr";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Loader2, Camera, Save, Gamepad2, Newspaper, CheckCircle2, ChevronRight,
  ImagePlus, MapPin, Cake, Palette, Tag, Sparkles as SparklesIcon, Eye, EyeOff,
  Heart, MessageCircle, ChevronDown, ChevronUp, Share2, Link2, Check,
  Youtube, Instagram, Globe, UserPlus, UserCheck, X, Fingerprint, Copy, QrCode,
  MoreVertical, Shield, Trophy, Download,
} from "lucide-react";
import {
  type Profile,
  type PostWithMeta,
  type FollowStats,
  fetchProfileById,
  fetchUserPosts,
  fetchUserGames,
  updateMyProfile,
  getTrustPoints,
  deductTrustPoints,
  restoreTrustPoints,
  DEFAULT_TRUST_POINTS,
  uploadAvatar,
  uploadBanner,
  getMyProfile,
  isPlusActive,
  updatePlusSettings,
  getFollowStats,
  followUser,
  unfollowUser,
  fetchFollowers,
  fetchFollowing,
} from "@/lib/social/api";
import { GameCard } from "./GameCard";
import { PostCard } from "./PostCard";
import { CommentSection } from "./CommentSection";
import { UserName } from "./UserName";
import { Avatar } from "./Avatar";
import { PlusIcon } from "./PlusIcon";
import { SegmentedControl } from "@/components/ui/segmented";
import { TrustPointsHistory } from "./TrustPointsHistory";
import { PortfolioPanel } from "./PortfolioPanel";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { getUserCode } from "@/lib/social/avatar";
import { galleryPreviewAuthor, galleryPreviewPrice, isArtistGalleryArtwork } from "@/lib/social/gallery-preview";
import { optimisticFollowStats, profileControlStateClass } from "@/lib/social/interaction-state";
import { qrPreviewGeometry } from "@/lib/social/qr-preview";
import { createQrExportSvg, qrHex, safeExportFilename } from "@/lib/social/profile-export";
import { trustLevelPresentation } from "@/lib/social/trust-points-panel";
import { plusFrameColor } from "@/lib/social/plus-frames";
import { nameEffectClass } from "@/lib/social/name-effects";
import { formatPublicOrbes, shouldShowPublicOrbes } from "@/lib/social/profile-visibility";

const GENRES = ["Acción", "Aventura", "Puzzle", "RPG", "Estrategia", "Plataformas", "Casual", "Terror", "Simulación", "Deportes"];

export function ProfilePanel({
  userId, myId, isMod, viewingOwn, onProfileChange,
}: {
  userId: string; myId: string | null; isMod: boolean; viewingOwn: boolean;
  onProfileChange?: (p: Profile) => void;
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showQREditor, setShowQREditor] = useState(false);

  // form state
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [accentColor, setAccentColor] = useState("#6B83D1");
  const [favoriteGenre, setFavoriteGenre] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [birthday, setBirthday] = useState("");
  const [showOrbes, setShowOrbes] = useState(true);
  const [interestsRaw, setInterestsRaw] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"games" | "posts" | "gallery">("games");

  const [games, setGames] = useState<PostWithMeta[]>([]);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [artworks, setArtworks] = useState<PostWithMeta[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [follow, setFollow] = useState<FollowStats>({ followers: 0, following: 0, i_follow: false });
  const [followBusy, setFollowBusy] = useState(false);
  const followRequestVersion = useRef(0);
  const [trustPoints, setTrustPoints] = useState<number>(DEFAULT_TRUST_POINTS);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustDeductAmt, setTrustDeductAmt] = useState(1);
  const [trustReason, setTrustReason] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showMorePanel, setShowMorePanel] = useState(false);
  const [followList, setFollowList] = useState<null | { kind: "followers" | "following"; items: Profile[]; loading: boolean }>(null);
  const [showTrustPanel, setShowTrustPanel] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [artDetail, setArtDetail] = useState<PostWithMeta | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const p = viewingOwn ? await getMyProfile() : await fetchProfileById(userId);
      setProfile(p);
      if (p) {
        onProfileChange?.(p);
        setUsername(p.username ?? "");
        setDisplayName(p.display_name ?? "");
        setBio(p.bio ?? "");
        setAvatarPreview(p.avatar_url ?? null);
        setBannerPreview(p.banner_url ?? null);
        setPronouns(p.pronouns ?? "");
        setLocation(p.location ?? "");
        setAccentColor(p.accent_color ?? "#6B83D1");
        setFavoriteGenre(p.favorite_genre ?? "");
        setCustomTitle(p.custom_title ?? "");
        setBirthday(p.birthday ?? "");
        setShowOrbes(p.show_orbes ?? true);
        setInterestsRaw((p.interests ?? []).join(", "));
      }
    } finally { setLoading(false); }
  };

  const loadContent = async () => {
    setContentLoading(true);
    try {
      const [g, ps, arts] = await Promise.all([
        fetchUserGames(userId),
        fetchUserPosts(userId, { games: false }),
        fetchUserPosts(userId, { artwork: true }),
      ]);
      setGames(g); setPosts(ps); setArtworks(arts);
    } finally { setContentLoading(false); }
  };

  const loadFollow = async () => {
    const requestVersion = followRequestVersion.current;
    try {
      const stats = await getFollowStats(userId);
      if (requestVersion === followRequestVersion.current) setFollow(stats);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadContent(); loadFollow(); getTrustPoints(userId).then(setTrustPoints).catch(() => {}); /* eslint-disable-next-line */ }, [userId]);

  const toggleFollow = async () => {
    if (followBusy) return;
    const previous = follow;
    const willFollow = !previous.i_follow;
    followRequestVersion.current += 1;
    setFollow(optimisticFollowStats(previous, willFollow));
    setFollowBusy(true);
    try {
      if (previous.i_follow) await unfollowUser(userId);
      else await followUser(userId);
    } catch {
      setFollow(previous);
      setErr("No se pudo actualizar el seguimiento. Inténtalo de nuevo.");
    } finally { setFollowBusy(false); }
  };

  const handleDeductTrust = async () => {
    if (trustBusy || !isMod || viewingOwn) return;
    if (trustDeductAmt < 1) return;
    const reason = trustReason.trim() || "Sin razón especificada";
    if (!confirm(`¿Quitar ${trustDeductAmt} punto(s) de confianza a @${profile?.username}?\nRazón: ${reason}`)) return;
    setTrustBusy(true);
    try {
      const result = await deductTrustPoints(userId, trustDeductAmt, reason);
      setTrustPoints(result.newPoints);
      if (result.banned) {
        alert(`@${profile?.username} alcanzó 0 puntos y fue baneado.`);
      }
      setTrustReason("");
      setTrustDeductAmt(1);
    } catch (e) { alert((e as Error).message); }
    finally { setTrustBusy(false); }
  };

  const handleRestoreTrust = async () => {
    if (trustBusy || !isMod || viewingOwn) return;
    setTrustBusy(true);
    try {
      const newPts = await restoreTrustPoints(userId, 1);
      setTrustPoints(newPts);
    } catch (e) { alert((e as Error).message); }
    finally { setTrustBusy(false); }
  };

  // ─── Compartir perfil: enlace directo + compartir en el chat grupal ───
  const shareLink = typeof window !== "undefined" ? window.location.origin + "/profile/" + userId : "";
  const shareToChat = () => {
    setShowSharePanel(false);
    try {
      sessionStorage.setItem("asternal_chat_share", shareLink);
      window.dispatchEvent(new CustomEvent("asternal_share_chat", { detail: { text: shareLink, view: "group" as const } }));
    } catch { /* noop */ }
    navigate({ to: "/" });
  };
  const shareDirect = () => {
    setShowSharePanel(false);
    try {
      sessionStorage.setItem("asternal_chat_share", shareLink);
      window.dispatchEvent(new CustomEvent("asternal_share_chat", { detail: { text: shareLink, view: "dms" as const } }));
    } catch { /* noop */ }
    navigate({ to: "/" });
  };
  const copyLink = async () => {
    setShowSharePanel(false);
    try { await navigator.clipboard.writeText(shareLink); } catch { /* noop */ }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };
  const shareMenu = (
    <Button variant="outline" onClick={() => { setShowMorePanel(false); setShowSharePanel(true); }}
      aria-label="Compartir perfil" aria-expanded={showSharePanel}
      className="h-10 w-10 p-0 sm:w-auto sm:px-3 rounded-xl border border-border bg-surface text-xs font-medium flex items-center justify-center gap-1.5 text-foreground hover:bg-muted/60 active:scale-95 transition">
      <Share2 size={14} /><span className="hidden sm:inline">Compartir</span>
    </Button>
  );

  const moreMenu = (
    <Button variant="outline" onClick={() => { setShowSharePanel(false); setShowMorePanel(true); }}
      aria-label="Más acciones de perfil" aria-expanded={showMorePanel}
      className="h-10 w-10 p-0 rounded-xl border border-border bg-surface grid place-items-center text-muted-foreground hover:text-foreground active:scale-95 transition">
      <MoreVertical size={14} />
    </Button>
  );

  // Abre la lista de seguidores o de "siguiendo" cargando los perfiles.
  const openFollowList = async (kind: "followers" | "following") => {
    setFollowList({ kind, items: [], loading: true });
    try {
      const items = kind === "followers" ? await fetchFollowers(userId) : await fetchFollowing(userId);
      setFollowList({ kind, items, loading: false });
    } catch {
      setFollowList({ kind, items: [], loading: false });
    }
  };

  const pickAvatar = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("Avatar máx 5MB"); return; }
    setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f));
  };
  const pickBanner = (f: File | null) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setErr("Banner máx 8MB"); return; }
    setBannerFile(f); setBannerPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      let avatar_url: string | undefined;
      let banner_url: string | undefined;
      if (avatarFile) avatar_url = await uploadAvatar(avatarFile);
      if (bannerFile) banner_url = await uploadBanner(bannerFile);
      const interests = interestsRaw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
      const updated = await updateMyProfile({
        username, display_name: displayName, bio,
        pronouns, location,
        accent_color: accentColor, favorite_genre: favoriteGenre, custom_title: customTitle,
        birthday: birthday || null, show_orbes: showOrbes, interests,
        ...(avatar_url ? { avatar_url } : {}),
        ...(banner_url ? { banner_url } : {}),
      });
      setProfile(updated);
      onProfileChange?.(updated);
      setEditing(false);
      setAvatarFile(null); setBannerFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="animate-spin inline mr-2" size={14} />Cargando…</div>;
  if (!profile) return <div className="p-8 text-center text-xs text-muted-foreground">Perfil no encontrado</div>;

  const interestsList = (profile.interests ?? []).filter(Boolean);
  const userCode = profile.user_code || getUserCode(profile.id);
  const profileHandle = profile.username?.trim() || userCode;
  const profileDisplayName = profile.display_name?.trim() || profileHandle || "Jugador";
  const publicOrbes = typeof profile.orbes === "number" ? profile.orbes : null;
  const publicOrbesVisible = shouldShowPublicOrbes(profile.show_orbes, publicOrbes);
  const galleryArtworks = artworks.filter(isArtistGalleryArtwork);
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(userCode); } catch { /* noop */ }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1600);
  };

  // Marco Plus del avatar: anillo de color sólido pegado a la foto (estilo PostCard).
  const frameRing = profile.avatar_frame && isPlusActive(profile) ? plusFrameColor(profile.avatar_frame) : null;
  // Efecto de nombre elegido en el Centro Plus: se aplica aquí igual que en las
  // publicaciones (antes el perfil pintaba el nombre sin efecto y parecía que
  // la selección no se guardaba).
  const nameFx = isPlusActive(profile) ? nameEffectClass(profile.name_effect) : null;
  const avatarButton = (
    <Button variant="outline"
      type="button"
      onClick={() => viewingOwn && editing && fileRef.current?.click()}
      className={`relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-[3px] border-background block ${viewingOwn && editing ? "cursor-pointer active:scale-95" : ""}`}
      aria-label={viewingOwn && editing ? "Cambiar foto de perfil" : "Foto de perfil"} disabled={!(viewingOwn && editing)}
    >
      {/* w-full h-full sin size fijo: la foto rellena exactamente la caja
          interior del botón y overflow-hidden hace el recorte. Antes un size
          fijo (72px) dejaba un hilo blanco entre la foto y el marco Plus. */}
      <Avatar
        p={avatarPreview ? { ...profile, avatar_url: avatarPreview } : profile}
        className="w-full h-full"
        rounded="xl"
      />
      {viewingOwn && editing && (
        <div className="absolute inset-0 bg-foreground/40 grid place-items-center">
          <Camera size={20} className="text-primary-foreground" />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => pickAvatar(e.target.files?.[0] ?? null)} />
    </Button>
  );

  return (
    <div className="profile-panel min-w-0 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header card with banner */}
      <section className="min-w-0 rounded-2xl border border-border/70 bg-surface/90 shadow-sm">
        <div className="relative h-28 overflow-hidden rounded-t-2xl bg-muted/35 sm:h-36">
          {bannerPreview && <img src={bannerPreview} alt="Portada del perfil" onError={e => { e.currentTarget.style.visibility = "hidden"; }} className="absolute inset-0 w-full h-full object-cover" />}
          {viewingOwn && editing && (
            <Button variant="outline" onClick={() => bannerRef.current?.click()}
              className="absolute right-2 top-2 h-8 px-3 rounded-md bg-foreground/50 text-primary-foreground text-[11px] font-medium flex items-center gap-1.5 active:scale-95">
              <ImagePlus size={12}/> Banner
            </Button>
          )}
          <input ref={bannerRef} type="file" accept="image/*" className="hidden"
            onChange={e => pickBanner(e.target.files?.[0] ?? null)} />
        </div>

        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="relative -mt-10 flex items-start gap-3 sm:-mt-12">
            {/* Avatar: marco de degradado ceñido a la foto (mismo lenguaje que PostCard),
                en vez del anillo animado flotante que se veía como un borde roto. */}
            {frameRing ? (
              <div className="relative shrink-0 rounded-2xl p-[2px] ring-1 ring-line-strong" style={{ background: frameRing }}>
                {avatarButton}
              </div>
            ) : (
              avatarButton
            )}
            <div className="min-w-0 flex-1 pt-10 sm:pt-12">
              {editing ? (
                <div className="space-y-2">
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} aria-label="Nombre visible" maxLength={40} placeholder="Nombre"
                    className="min-w-0 w-full bg-input/50 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
                  <input value={username} onChange={e => setUsername(e.target.value)} aria-label="Nombre de usuario" maxLength={24} placeholder="usuario"
                    className="min-w-0 w-full bg-input/50 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-display text-base sm:text-lg font-semibold truncate ${nameFx ?? "text-foreground"}`}
                      data-effect={nameFx ? profile.name_effect ?? undefined : undefined}
                      title={profileDisplayName}
                    >{profileDisplayName}</span>
                    {isPlusActive(profile) && profile.show_plus_badge !== false && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-display font-bold shrink-0"
                        style={{ background: "var(--plus)", color: "var(--plus-on-primary)" }}>
                        <PlusIcon size={9} strokeWidth={2.4} /> PLUS
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 max-w-full truncate text-xs font-medium text-muted-foreground" title={`@${profileHandle}`}>
                    @{profileHandle}{profile.pronouns ? ` · ${profile.pronouns}` : ""}
                  </div>
                </>
              )}
            </div>
          </div>

          {!editing && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void copyCode()}
                className="inline-flex max-w-full min-h-11 items-center gap-1.5 px-2.5 rounded-full bg-muted border border-line text-[10px] font-mono text-ink-2 hover:text-foreground hover:border-line-strong active:scale-95 transition"
                title="ID de usuario · toca para copiar">
                <Fingerprint size={10} />
                <span className="truncate">{userCode}</span>
                {codeCopied ? <Check size={9} className="text-primary shrink-0" /> : <Copy size={9} className="opacity-60 shrink-0" />}
              </Button>
              {publicOrbesVisible && publicOrbes !== null && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/25 bg-primary/[0.08] text-[10px] font-semibold text-primary" aria-label={`${formatPublicOrbes(publicOrbes)} orbes públicos`}>
                  <SparklesIcon size={10} aria-hidden="true" />
                  <span className="tabular-nums">{formatPublicOrbes(publicOrbes)}</span>
                  <span className="text-primary/75">orbes</span>
                </div>
              )}
              {profile.custom_title && (
                <div className="max-w-full truncate text-[11px] text-muted-foreground" style={profile.accent_color ? { color: profile.accent_color } : undefined}>
                  {profile.custom_title}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2 border-t border-border/40 pt-3 sm:flex sm:gap-3">
            {viewingOwn ? (
              editing ? (
                <div className="col-span-4 flex w-full flex-wrap gap-2">
                  <Button variant="outline" disabled={saving} onClick={() => { setEditing(false); setAvatarFile(null); setBannerFile(null); setAvatarPreview(profile.avatar_url ?? null); setBannerPreview(profile.banner_url ?? null); setDisplayName(profile.display_name ?? ""); setUsername(profile.username ?? ""); setBio(profile.bio ?? ""); setPronouns(profile.pronouns ?? ""); setLocation(profile.location ?? ""); setCustomTitle(profile.custom_title ?? ""); setBirthday(profile.birthday ?? ""); setAccentColor(profile.accent_color ?? "#6B83D1"); setFavoriteGenre(profile.favorite_genre ?? ""); setShowOrbes(profile.show_orbes ?? true); setInterestsRaw((profile.interests ?? []).join(", ")); setErr(null); }} className="h-11 flex-1 text-xs">Cancelar</Button>
                  <Button variant="gradient" onClick={save} disabled={saving} className="h-11 flex-1 text-xs">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}
                    className="h-9 px-2 rounded-xl border border-border bg-surface text-xs font-medium text-foreground hover:bg-muted/60 active:scale-95">Editar</Button>
                  <Button variant="outline" onClick={() => setShowQREditor(true)}
                    aria-haspopup="dialog"
                    className={`h-9 px-2 rounded-xl border text-xs font-semibold active:scale-95 flex items-center justify-center gap-1.5 transition-colors ${profileControlStateClass(false)}`}>
                    <QrCode size={15} /><span>Código QR</span>
                  </Button>
                  {shareMenu}
                  {moreMenu}
                </>
              )
            ) : (
              <>
                <Button variant={follow.i_follow ? "outline" : "gradient"} onClick={toggleFollow} disabled={followBusy}
                  className={`h-9 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-60 ${follow.i_follow ? "border-border bg-muted/60 text-foreground" : "border-border bg-surface text-foreground hover:bg-muted/60"}`}>
                  {follow.i_follow ? <><UserCheck size={12}/> Siguiendo</> : <><UserPlus size={12}/> Seguir</>}
                </Button>
                <Button variant="outline" onClick={() => setShowQREditor(true)}
                  aria-haspopup="dialog"
                  className={`h-9 px-2 rounded-xl border text-xs font-semibold active:scale-95 flex items-center justify-center gap-1.5 transition-colors ${profileControlStateClass(false)}`}>
                  <QrCode size={15} /><span>Código QR</span>
                </Button>
                {shareMenu}
                {moreMenu}
              </>
            )}
          </div>

          {/* Follow counts (tocables: muestran la lista de personas) */}
          {!editing && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
              <Button variant="outline" onClick={() => openFollowList("followers")}
                className="h-auto min-h-10 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/40 active:scale-95 transition text-left">
                <b className="text-foreground tabular-nums">{follow.followers}</b>
                <span className="text-muted-foreground">seguidores</span>
              </Button>
              <span className="text-muted-foreground/40">·</span>
              <Button variant="outline" onClick={() => openFollowList("following")}
                className="h-auto min-h-10 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/40 active:scale-95 transition text-left">
                <b className="text-foreground tabular-nums">{follow.following}</b>
                <span className="text-muted-foreground">siguiendo</span>
              </Button>
            </div>
          )}

          {followList && <FollowListModal list={followList} myId={myId} onClose={() => setFollowList(null)} onChanged={loadFollow} />}



          {/* Social links (Plus feature, always shown if present and Plus active) */}
          {!editing && isPlusActive(profile) && profile.social_links && (
            <SocialLinksRow links={profile.social_links} />
          )}

          {editing ? (
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={280}
              aria-label="Biografía" placeholder="Cuéntanos sobre ti…"
              className="min-w-0 w-full bg-input/50 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/40" />
          ) : profile.bio ? (
            <p className="mt-3 text-sm whitespace-pre-wrap break-words">{profile.bio}</p>
          ) : viewingOwn ? (
          <p className="mt-3 text-xs text-muted-foreground italic">Añade una descripción tocando Editar.</p>
          ) : null}

          {/* Meta chips */}
          {!editing && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/30 pt-3 text-[11px] text-muted-foreground">
              {profile.location && <span className="inline-flex max-w-full items-center gap-1 break-words px-2 py-0.5 rounded-full bg-muted/30 [&_svg]:shrink-0"><MapPin size={10}/>{profile.location}</span>}
              {profile.birthday && <span className="inline-flex max-w-full items-center gap-1 break-words px-2 py-0.5 rounded-full bg-muted/30 [&_svg]:shrink-0"><Cake size={10}/>{new Date(profile.birthday).toLocaleDateString()}</span>}
              {profile.favorite_genre && <span className="inline-flex max-w-full items-center gap-1 break-words px-2 py-0.5 rounded-full bg-muted/30 [&_svg]:shrink-0"><Heart size={10}/>{profile.favorite_genre}</span>}
            </div>
          )}

          {/* Interests */}
          {!editing && interestsList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {interestsList.map((t, i) => (
                <span key={i} className="max-w-full break-words px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: `color-mix(in oklab, ${profile.accent_color ?? "var(--primary)"} 15%, transparent)`, color: profile.accent_color ?? "var(--primary)" }}>
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Extended edit fields — agrupados por sección con etiqueta y
              descripción: cada bloque dice para qué sirve (IDENTIDAD / ESTILO /
              CONTENIDO / PRIVACIDAD) en vez de aparecer todo junto. */}
          {editing && (
            <div className="mt-5 space-y-3 border-t border-border/40 pt-3">
              <Button variant="outline" onClick={() => setShowMore(v => !v)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground">
                <span>Personalización</span>
                {showMore ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              </Button>
              {showMore && (
                <div className="space-y-2.5">
                  <EditSection label="Identidad" hint="Cómo te presentas ante la comunidad">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <LabeledInput label="Pronombres" value={pronouns} onChange={setPronouns} placeholder="el/ella" max={20}/>
                      <LabeledInput label="Ubicación" value={location} onChange={setLocation} placeholder="Ciudad" max={40}/>
                    </div>
                    <LabeledInput label="Título personalizado" value={customTitle} onChange={setCustomTitle} placeholder="Desarrolladora indie" max={40}/>
                    <div>
                      <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1"><Cake size={10}/>Cumpleaños</div>
                      <input aria-label="Cumpleaños" type="date" value={birthday} onChange={e => setBirthday(e.target.value)}
                        className="min-w-0 w-full bg-input/50 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"/>
                    </div>
                  </EditSection>

                  <EditSection label="Estilo" hint="Tu firma visual en el perfil">
                    <div>
                      <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1"><Palette size={10}/>Color de acento</div>
                      <div className="flex items-center gap-2">
                        <input aria-label="Color de acento" type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"/>
                        <input aria-label="Código del color de acento" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                          className="min-w-0 flex-1 bg-input/50 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"/>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1"><Gamepad2 size={10}/>Género favorito</div>
                      <div className="flex flex-wrap gap-1">
                        {GENRES.map(g => (
                          <Button variant="outline" key={g} onClick={() => setFavoriteGenre(g === favoriteGenre ? "" : g)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] border transition ${favoriteGenre === g ? "bg-primary text-primary-foreground border-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}>
                            {g}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </EditSection>

                  <EditSection label="Contenido" hint="Etiquetas que describen lo que te gusta">
                    <LabeledInput label="Intereses (separados por coma, máx 10)" value={interestsRaw} onChange={setInterestsRaw} placeholder="pixel art, roguelike, coop" max={200} icon={<Tag size={10}/>}/>
                  </EditSection>

                  <EditSection label="Privacidad" hint="Qué información muestras en tu perfil">
                    <div className="flex items-center gap-2 px-2 py-2 rounded-lg border border-border">
                      <Button variant="outline" type="button" onClick={() => setShowOrbes(v => !v)} aria-pressed={showOrbes} aria-label={showOrbes ? "Ocultar orbes del perfil" : "Mostrar orbes en el perfil"}
                        className={`shrink-0 w-10 h-6 p-0 rounded-full border transition-colors relative ${showOrbes ? "border-primary/45 bg-primary/15" : "border-border bg-muted/60"}`}>
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-transform ${showOrbes ? "translate-x-4 bg-primary" : "translate-x-0 bg-muted-foreground/60"}`}/>
                      </Button>
                      <span className="text-xs flex-1 flex items-center gap-1">
                        {showOrbes ? <Eye size={12} className="text-primary"/> : <EyeOff size={12}/>} 
                        Mostrar orbes en el perfil
                      </span>
                    </div>
                  </EditSection>
                </div>
              )}
            </div>
          )}

          {err && <div className="mt-3 text-xs text-destructive">{err}</div>}
        </div>
      </section>

      {/* Centro Plus card (unified — appears here for own profile) */}
      {viewingOwn && (
        <Link
          to="/plus"
          className="profile-plus-benefits block relative overflow-hidden rounded-2xl border p-3 sm:p-4 active:scale-[0.99] transition"
        >
          <div className="relative flex items-center gap-3">
            <div className="profile-plus-benefits-icon w-10 h-10 sm:w-11 sm:h-11 rounded-xl grid place-items-center text-primary-foreground shrink-0">
              <PlusIcon size={20} strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-base font-bold">Centro Plus</div>
              <div className="text-[11px] text-muted-foreground">
                {profile.is_plus ? "Gestiona tus beneficios activos" : "Suscríbete y desbloquea todo"}
              </div>
            </div>
            <ChevronRight size={18} className="profile-plus-benefits-chevron" />
          </div>
        </Link>
      )}

      <SegmentedControl
        items={[
          { id: "games", label: <>JUEGOS · {games.length}</>, icon: <Gamepad2 size={13} className="hidden sm:block shrink-0" /> },
          { id: "posts", label: <>PUBLICACIONES · {posts.length}</>, icon: <Newspaper size={13} className="hidden sm:block shrink-0" /> },
          { id: "gallery", label: <>GALERÍA · {galleryArtworks.length}</>, icon: <Palette size={13} className="hidden sm:block shrink-0" /> },
        ]}
        buttonClassName="h-11 px-1 text-[9px] sm:text-[11px]"
        value={tab}
        onChange={setTab}
      />

      <div className="space-y-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentLoading ? "loading" : tab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3"
          >
        {contentLoading ? (
          <div role="status" className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="animate-spin inline mr-2" size={14} />Cargando contenido…</div>
        ) : tab === "games" ? (
          games.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border bg-surface">Sin juegos publicados</div>
          ) : games.map(g => <GameCard key={g.id} post={g} myId={myId} isMod={isMod} onChange={loadContent} />)
        ) : tab === "gallery" ? (
          galleryArtworks.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border bg-surface">
              {viewingOwn ? "Aún no has publicado obras en la galería" : "Este artista aún no ha publicado obras"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {galleryArtworks.map(a => {
                const imgUrl = a.signed_media?.[0] ?? a.signed_cover;
                const title = (a.content.split("\n")[0] || "Obra sin título").replace(/^🎮🎨\s*/, "").replace(/^🎨\s*/, "");
                const authorLabel = galleryPreviewAuthor(a.author?.username ?? profile.username);
                const priceLabel = galleryPreviewPrice(a.price_orbes);
                return (
                  <article key={a.id} className="rounded-2xl border border-border/60 bg-surface overflow-hidden group hover:border-border-strong hover:shadow-md transition-[border-color,box-shadow]">
                    <Button variant="outline" type="button" onClick={() => setArtDetail(a)} className="block w-full aspect-square bg-muted/20 relative p-2 text-left" aria-label={`Abrir ${title}`}>
                      {imgUrl ? (
                        <StoreImage src={imgUrl} alt={title} className="w-full h-full object-contain rounded-xl group-hover:scale-[1.015] transition-transform duration-200" />
                      ) : (
                        <div className="w-full h-full rounded-xl border border-dashed border-border/60 grid place-items-center"><Palette size={28} className="text-muted-foreground/30" /></div>
                      )}
                    </Button>
                    <div className="border-t border-border/40 px-3 py-2.5">
                      <Button variant="outline" type="button" onClick={() => setArtDetail(a)} className="flex w-full min-w-0 items-center justify-between gap-3 text-left hover:opacity-80 transition" aria-label={`Abrir obra de ${authorLabel}`}>
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar p={a.author ?? profile} className="w-6 h-6" />
                          <span className="min-w-0 truncate text-[11px] font-semibold">{authorLabel}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-foreground/75" aria-label={`Precio: ${priceLabel}`}>
                          <SparklesIcon size={12} className="text-primary/75" />
                          {priceLabel}
                        </span>
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : (
          posts.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border bg-surface">Sin publicaciones</div>
          ) : posts.map(p => <PostCard key={p.id} post={p} myId={myId} isMod={isMod} onChange={loadContent} />)
        )}
          </motion.div>
        </AnimatePresence>
      </div>

      {artDetail && (
        <ProfileOverlay label="Detalle de obra" onClose={() => setArtDetail(null)}>
        <div className="h-full flex flex-col overflow-hidden bg-background/95 backdrop-blur-md">
          <header className="shrink-0 glass-header border-b" onClick={event => event.stopPropagation()}>
            <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Galería</div><h3 className="text-sm font-display font-bold truncate">{(artDetail.content.split("\n")[0] || "Obra sin título").replace(/^🎮🎨\s*/, "").replace(/^🎨\s*/, "")}</h3></div>
              <Button variant="outline" type="button" onClick={() => setArtDetail(null)} className="w-10 h-10 shrink-0 p-0 rounded-xl border border-border/60 bg-muted/40 grid place-items-center hover:bg-muted" aria-label="Cerrar detalle de obra"><X size={15} /></Button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
              <div className="rounded-2xl border border-border/60 bg-card aspect-square p-3 sm:p-5 grid place-items-center">
                {artDetail.signed_media?.[0] || artDetail.signed_cover ? <img src={artDetail.signed_media?.[0] ?? artDetail.signed_cover ?? ""} alt="" className="w-full h-full object-contain rounded-xl" /> : <Palette size={36} className="text-muted-foreground/30" />}
              </div>
              <div className="rounded-2xl border border-border/60 bg-card p-4"><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-3">Comentarios</div><CommentSection postId={artDetail.id} myId={myId} isMod={isMod} onChange={loadContent} /></div>
            </div>
            </div>
          </div>
        </div>
        </ProfileOverlay>
      )}

      {showQREditor && (
        <ProfileOverlay label="Editor de código QR" onClose={() => setShowQREditor(false)}>
        <div className="h-full bg-background/95 backdrop-blur-md overflow-y-auto" onClick={() => setShowQREditor(false)}>
          <div className="min-h-full max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-8" onClick={event => event.stopPropagation()}>
            <div className="rounded-2xl border border-border/70 bg-card shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Perfil</div>
                  <h2 className="font-display text-base font-bold truncate">Código QR</h2>
                </div>
                <Button variant="outline" type="button" onClick={() => setShowQREditor(false)} className="h-10 w-10 p-0 rounded-xl border border-border bg-surface grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition" aria-label="Cerrar editor QR"><X size={16} /></Button>
              </header>
              <div className="p-4 sm:p-5">
                <QRCustomizer userId={userId} username={profile.username ?? "user"} qrStyle={profile.qr_style ?? null} isPlus={viewingOwn && isPlusActive(profile)} viewingOwn={viewingOwn} />
              </div>
            </div>
          </div>
        </div>
        </ProfileOverlay>
      )}

      <Drawer open={showSharePanel} onOpenChange={setShowSharePanel}>
        <DrawerContent className="z-[120] max-h-[90dvh] overflow-y-auto max-w-xl mx-auto">
          <DrawerHeader className="text-left">
            <DrawerTitle>Compartir perfil</DrawerTitle>
            <DrawerDescription>Elige cómo quieres enviar este perfil.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            <Button variant="outline" type="button" onClick={shareToChat} className="w-full min-h-12 rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 text-left text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"><MessageCircle size={17} className="text-primary shrink-0" />Compartir en chat grupal</Button>
            <Button variant="outline" type="button" onClick={shareDirect} className="w-full min-h-12 rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 text-left text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"><MessageCircle size={17} className="text-primary shrink-0" />Compartir en chat directo</Button>
            <Button variant="outline" type="button" onClick={() => void copyLink()} className="w-full min-h-12 rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 text-left text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition">{copiedLink ? <Check size={17} className="text-primary shrink-0" /> : <Link2 size={17} className="text-primary shrink-0" />}{copiedLink ? "¡Enlace copiado!" : "Copiar enlace al perfil"}</Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={showMorePanel} onOpenChange={setShowMorePanel}>
        <DrawerContent className="z-[120] max-h-[90dvh] overflow-y-auto max-w-xl mx-auto">
          <DrawerHeader className="text-left">
            <DrawerTitle>Opciones de perfil</DrawerTitle>
            <DrawerDescription>Consulta herramientas y reconocimientos de este perfil.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            <Button variant="outline" type="button" onClick={() => { setShowMorePanel(false); setShowTrustPanel(true); }} className="w-full min-h-12 rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 text-left text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"><Shield size={17} className="text-primary shrink-0" />Puntos de confianza</Button>
            <Button variant="outline" type="button" onClick={() => { setShowMorePanel(false); setShowPortfolio(true); }} className="w-full min-h-12 rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 text-left text-sm font-medium hover:bg-muted/60 active:scale-[0.99] transition"><Trophy size={17} className="text-primary shrink-0" />Portafolio</Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Trust Points panel (full, from three-dot menu) */}
      {showTrustPanel && (
        <TrustPointsPanel
          userId={userId}
          trustPoints={trustPoints}
          isMod={isMod}
          viewingOwn={viewingOwn}
          onClose={() => setShowTrustPanel(false)}
          onTrustChange={setTrustPoints}
        />
      )}

      {/* Portfolio panel (from three-dot menu) */}
      {showPortfolio && (
        <PortfolioPanel
          userId={userId}
          profile={profile}
          viewingOwn={viewingOwn}
          onClose={() => setShowPortfolio(false)}
        />
      )}
    </div>
  );
}

/** Panel de código QR — personalizable solo para Plus, sincronizado con DB */
function QRCustomizer({ userId, username, qrStyle, isPlus, viewingOwn }: {
  userId: string; username: string; qrStyle: import("@/lib/social/api").QRStyle | null;
  isPlus: boolean; viewingOwn: boolean;
}) {
  const profileUrl = typeof window !== "undefined" ? `${window.location.origin}/profile/${userId}` : `/profile/${userId}`;
  const defaultStyle = { fg: "#000000", bg: "#ffffff", size: 180, cornerStyle: "rounded" as const };
  const [style, setStyle] = useState<Required<import("@/lib/social/api").QRStyle> & { cornerStyle: string }>(
    qrStyle ? { ...defaultStyle, ...qrStyle, cornerStyle: "rounded" } : defaultStyle
  );
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync from DB when qrStyle prop changes (e.g. viewing another user's profile)
  useEffect(() => {
    if (qrStyle) setStyle({ ...defaultStyle, ...qrStyle, cornerStyle: "rounded" });
  }, [qrStyle?.fg, qrStyle?.bg, qrStyle?.size, qrStyle?.cornerStyle]);

  const persist = async (next: typeof style) => {
    setStyle(next);
    if (viewingOwn && isPlus) {
      setSaving(true);
      try { await updatePlusSettings({ qr_style: next }); } catch { /* noop */ }
      finally { setSaving(false); }
    }
  };

  const PRESETS = [
    { label: "Clásico", fg: "#000000", bg: "#ffffff" },
    { label: "Azul", fg: "#2563eb", bg: "#f0f7ff" },
    { label: "Oscuro", fg: "#ffffff", bg: "#1a1a2e" },
    { label: "Primario", fg: "var(--primary)", bg: "#ffffff" },
    { label: "Gradiente", fg: "#6366f1", bg: "#f5f3ff" },
    { label: "Rosa", fg: "#ec4899", bg: "#fdf2f8" },
  ] as const;

  const SIZES = [120, 160, 200, 240] as const;
  const [qrSvg, setQrSvg] = useState("");
  const [qrError, setQrError] = useState(false);
  useEffect(() => {
    let active = true;
    setQrError(false);
    createProfileQr(profileUrl, style.fg, style.bg, style.size || 180)
      .then(svg => { if (active) setQrSvg(svg); })
      .catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [profileUrl, style.fg, style.bg, style.size]);
  const qrSrc = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : undefined;

  const handleDownload = async () => {
    try {
      if (!qrSvg) return;
      const rawQrSvg = qrSvg;
      const bytes = new TextEncoder().encode(rawQrSvg);
      let binary = "";
      bytes.forEach(byte => { binary += String.fromCharCode(byte); });
      const qrDataUri = `data:image/svg+xml;base64,${btoa(binary)}`;
      const { padding, frameSize } = qrPreviewGeometry(style.size || 180, style.cornerStyle);
      const blob = new Blob([createQrExportSvg({ qrDataUri, size: style.size || 180, padding, frameSize, background: style.bg.startsWith("#") ? style.bg : "#ffffff" })], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `qr-${safeExportFilename(username, "perfil")}.svg`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { /* noop */ }
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  const canCustomize = viewingOwn && isPlus;
  const { padding: qrPadding, frameSize } = qrPreviewGeometry(style.size || 180, style.cornerStyle);

  return (
    <div className="profile-panel min-w-0 space-y-4 animate-in fade-in duration-200">
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="border border-border/40 bg-card shadow-sm" style={{ background: style.bg, borderRadius: 16, boxSizing: "border-box", width: `min(100%, ${frameSize}px)`, padding: qrPadding }}>
          {qrSrc ? <img src={qrSrc} alt={`QR de ${username}`} width={style.size || 180} height={style.size || 180} className="block h-auto w-full max-w-full" /> : <div role="status" className="aspect-square grid place-items-center text-sm text-muted-foreground">{qrError ? "No se pudo generar el QR" : <Loader2 className="animate-spin" />}</div>}
        </div>
        <div className="text-[11px] font-mono text-muted-foreground text-center break-all max-w-full">{profileUrl}</div>
      </div>

      {/* Botón de guardar (solo Plus propio) */}
      {canCustomize && (
        <div className="text-center">
          {saving && <span className="text-[10px] text-muted-foreground/50">Guardando…</span>}
        </div>
      )}

      {/* Aviso para usuarios no-Plus */}
      {!canCustomize && !viewingOwn && (
        <div className="text-center text-[10px] text-muted-foreground/50">
          Escanea para ver el perfil de {username}
        </div>
      )}

      {!canCustomize && viewingOwn && (
        <div className="text-center py-2 px-3 rounded-lg bg-muted/35 border border-border/50">
          <div className="text-[11px] text-foreground font-medium">Personaliza tu QR con Plus</div>
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">Cambia colores, estilos y tamaño</div>
        </div>
      )}

      {/* Panel de personalización — solo usuarios Plus en su propio perfil */}
      {canCustomize && (
        <>
          {/* Presets de color */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">Color</div>
            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map(p => {
                const active = style.fg === p.fg && style.bg === p.bg;
                return (
                  <Button variant="outline" key={p.label} onClick={() => persist({ ...style, fg: p.fg, bg: p.bg })}
                    className={`h-8 px-2.5 rounded-lg text-[10px] font-medium border transition active:scale-95 ${active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 bg-surface text-muted-foreground hover:text-foreground"}`}>
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Colores personalizados */}
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Color</span>
              <input type="color" value={style.fg.startsWith("#") ? style.fg : "#000000"} onChange={e => persist({ ...style, fg: e.target.value })}
                className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Fondo</span>
              <input type="color" value={style.bg.startsWith("#") ? style.bg : "#ffffff"} onChange={e => persist({ ...style, bg: e.target.value })}
                className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
            </label>
          </div>

          {/* Tamaño */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">Tamaño</div>
            <div className="flex gap-1.5">
              {SIZES.map(s => (
                <Button variant="outline" key={s} onClick={() => persist({ ...style, size: s })}
                  className={`h-8 px-2.5 rounded-lg text-[10px] font-mono border transition active:scale-95 ${style.size === s ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 bg-surface text-muted-foreground hover:text-foreground"}`}>
                  {s}px
                </Button>
              ))}
            </div>
          </div>

        </>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        <Button variant="outline" disabled={!qrSvg} onClick={handleDownload}
          className="flex-1 h-9 rounded-lg border border-border/50 bg-surface text-[11px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition hover:bg-muted/40">
          <Download size={12} /> Descargar
        </Button>
        <Button variant="outline" onClick={handleCopy}
          className="flex-1 h-9 rounded-lg border border-border/50 bg-surface text-[11px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition hover:bg-muted/40">
          {copied ? <><Check size={12} className="text-primary" /> Copiado</> : <><Link2 size={12} /> Copiar enlace</>}
        </Button>
      </div>
    </div>
  );
}

/** Pantalla aislada de puntos de confianza — se abre desde el menú de tres puntos */
function TrustPointsPanel({ userId, trustPoints, isMod, viewingOwn, onClose, onTrustChange }: {
  userId: string;
  trustPoints: number;
  isMod: boolean;
  viewingOwn: boolean;
  onClose: () => void;
  onTrustChange: (pts: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deductAmt, setDeductAmt] = useState(1);
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const handleDeduct = async () => {
    if (busy || !isMod || viewingOwn || deductAmt < 1) return;
    const r = reason.trim() || "Sin razón especificada";
    if (!confirm(`¿Quitar ${deductAmt} punto(s) de confianza?\nRazón: ${r}`)) return;
    setBusy(true);
    try {
      const result = await deductTrustPoints(userId, deductAmt, r);
      onTrustChange(result.newPoints);
      if (result.banned) alert("El usuario alcanzó 0 puntos y fue baneado.");
      setReason(""); setDeductAmt(1);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleRestore = async () => {
    if (busy || !isMod || viewingOwn) return;
    setBusy(true);
    try {
      const newPts = await restoreTrustPoints(userId, 1);
      onTrustChange(newPts);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const level = trustLevelPresentation(trustPoints);

  return (
    <ProfileOverlay label="Puntos de confianza" onClose={onClose}>
    <section className="flex h-full flex-col overflow-hidden bg-background/95 backdrop-blur-md animate-in fade-in duration-200">
      <header className="glass-header shrink-0 border-b border-border/70">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-3 py-3 sm:px-6">
          <Button variant="outline" type="button" onClick={onClose} className="h-9 w-9 shrink-0 rounded-xl border border-primary/20 bg-primary/8 grid place-items-center text-primary hover:bg-primary/14 active:scale-95 transition" aria-label="Volver al perfil">
            <ChevronRight size={16} className="rotate-180" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Perfil</div>
            <h2 className="font-display text-base font-bold text-primary truncate">Puntos de confianza</h2>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground"><Shield size={14} className="text-primary" />Reputación de la comunidad</div>
          <Button variant="outline" type="button" onClick={onClose} className="h-9 w-9 shrink-0 rounded-xl border border-primary/20 bg-primary/8 grid place-items-center text-primary hover:bg-primary/14 active:scale-95 transition" aria-label="Cerrar puntos de confianza"><X size={16} /></Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <section className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Estado actual</div>
                  <div className="mt-2 flex flex-wrap items-end gap-2"><span className="font-display text-6xl font-bold tabular-nums text-primary">{trustPoints}</span><span className="mb-2 text-sm text-muted-foreground">de {DEFAULT_TRUST_POINTS} puntos</span></div>
                </div>
                <div className="grad-brand shrink-0 h-11 w-11 rounded-2xl grid place-items-center text-primary-foreground shadow-sm" aria-label="Protección de confianza"><Shield size={20} strokeWidth={2.25} /></div>
              </div>
              <div className="mt-5 h-2 rounded-full bg-muted/50 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, (trustPoints / DEFAULT_TRUST_POINTS) * 100))}%`, background: level.progressColor }} /></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Tu comportamiento dentro de la comunidad.</span><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${level.surfaceClass} ${level.textClass}`}>Nivel {level.label}</span></div>
            </section>

            <aside className="rounded-2xl border border-primary/20 bg-surface/80 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-display font-bold text-primary"><Trophy size={16} className="text-primary" />Cómo funciona</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Los puntos de confianza reflejan el cumplimiento de las reglas de la comunidad. Mantén una conducta respetuosa y protege tu cuenta.</p>
              <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">Al llegar a <strong className="text-primary">0 puntos</strong>, la cuenta queda bloqueada automáticamente. Los ajustes realizados por moderación quedan registrados.</div>
              <Button variant="outline" type="button" onClick={() => setShowHistory(true)} className="grad-brand mt-4 h-10 w-full rounded-xl text-xs font-semibold text-primary-foreground active:scale-[0.98] transition">Ver historial de puntos</Button>
            </aside>
          </div>

          {isMod && !viewingOwn && (
            <section className="mt-4 rounded-2xl border border-primary/20 bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2"><Shield size={15} className="text-primary" /><div><div className="text-sm font-display font-bold text-primary">Control de moderación</div><p className="text-xs text-muted-foreground">Los cambios se registran en el historial del perfil.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                <Button variant="outline" onClick={handleRestore} disabled={busy || trustPoints >= DEFAULT_TRUST_POINTS} className="h-10 rounded-xl border border-border/60 bg-surface px-4 text-xs font-semibold text-primary hover:bg-primary/10 active:scale-95 transition disabled:opacity-40">Restaurar +1</Button>
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-2">
                  <input type="number" min={1} max={10} value={deductAmt} onChange={e => setDeductAmt(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} aria-label="Puntos a retirar" className="h-10 rounded-xl border border-border/60 bg-surface px-2 text-center text-sm font-mono outline-none focus:border-primary/50" />
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Razón para quitar puntos…" className="min-w-0 h-10 rounded-xl border border-border/60 bg-surface px-3 text-xs outline-none focus:border-primary/50 placeholder:text-muted-foreground/50" />
                  <Button variant="outline" onClick={handleDeduct} disabled={busy || trustPoints <= 0} className="h-10 rounded-full bg-destructive px-4 text-xs font-bold text-destructive-foreground active:scale-95 transition disabled:opacity-50">{busy ? "Procesando…" : "Quitar"}</Button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {showHistory && <TrustPointsHistory userId={userId} onClose={() => setShowHistory(false)} />}
    </section>
    </ProfileOverlay>
  );
}

function FollowListModal({ list, myId, onClose, onChanged }: {
  list: { kind: "followers" | "following"; items: Profile[]; loading: boolean };
  myId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Profile[]>(list.items);
  const [iFollow, setIFollow] = useState<Set<string>>(new Set());
  const [followStateReady, setFollowStateReady] = useState(false);
  const followOverrides = useRef(new Map<string, boolean>());
  const pendingFollowIds = useRef(new Set<string>());

  // Sync items when parent re-renders with new data
  useEffect(() => {
    setItems(list.items);
  }, [list.items]);

  // Estado "¿yo sigo a esta persona?" para cada perfil de la lista.
  useEffect(() => {
    if (!myId || items.length === 0) {
      setIFollow(new Set());
      setFollowStateReady(true);
      return;
    }
    let cancelled = false;
    setFollowStateReady(false);
    (async () => {
      const results = await Promise.all(items.map(async p => {
        try { return [p.id, (await getFollowStats(p.id)).i_follow] as const; }
        catch { return [p.id, false] as const; }
      }));
      if (cancelled) return;
      const set = new Set(results.filter(([, following]) => following).map(([id]) => id));
      for (const [id, following] of followOverrides.current) {
        if (!items.some(p => p.id === id)) continue;
        if (following) set.add(id);
        else set.delete(id);
      }
      if (!cancelled) {
        setIFollow(set);
        setFollowStateReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [items, myId]);

  const toggle = async (p: Profile) => {
    if (!myId || pendingFollowIds.current.has(p.id)) return;
    const wasFollowing = iFollow.has(p.id);
    const willFollow = !wasFollowing;
    pendingFollowIds.current.add(p.id);
    followOverrides.current.set(p.id, willFollow);
    setIFollow(prev => {
      const next = new Set(prev);
      if (willFollow) next.add(p.id);
      else next.delete(p.id);
      return next;
    });
    try {
      if (wasFollowing) await unfollowUser(p.id);
      else await followUser(p.id);
      onChanged();
    } catch {
      followOverrides.current.set(p.id, wasFollowing);
      setIFollow(prev => {
        const next = new Set(prev);
        if (wasFollowing) next.add(p.id);
        else next.delete(p.id);
        return next;
      });
    } finally { pendingFollowIds.current.delete(p.id); }
  };

  const panel = (
    <div className="h-full overflow-hidden flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-foreground/35 backdrop-blur-[3px]" />
      <div className="relative w-full h-[min(80dvh,42rem)] max-h-[calc(100dvh-1rem)] sm:max-w-sm overflow-hidden rounded-t-2xl sm:rounded-2xl glass-menu shadow-xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-2 duration-300 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-border/70 bg-surface/50">
          <div className="flex-1 text-sm font-semibold">
            {list.kind === "followers" ? "Seguidores" : "Siguiendo"} · {items.length}
          </div>
          <Button variant="outline" aria-label="Cerrar lista" onClick={onClose} className="shrink-0 w-9 h-9 p-0 rounded-lg glass-control grid place-items-center text-muted-foreground hover:text-foreground active:scale-95 transition">
            <X size={14} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] bg-surface/75 p-2.5 space-y-1.5">
          {list.loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="animate-spin inline mr-2" size={14} /> Cargando…
            </div>
          ) : !followStateReady ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="animate-spin inline mr-2" size={14} /> Preparando seguidores…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {list.kind === "followers" ? "Aún no tiene seguidores" : "Aún no sigue a nadie"}
            </div>
          ) : (
            items.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-transparent bg-surface/40 hover:border-border/60 hover:bg-muted/60 transition">
                <Link to="/profile/$userId" params={{ userId: p.id }} onClick={onClose}
                  className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Avatar p={p} size={36} rounded="xl" className="border border-border/50" />
                  <div className="min-w-0">
                    <UserName p={p} size="sm" />
                    <div className="text-[10px] font-mono text-muted-foreground truncate">@{p.username}</div>
                  </div>
                </Link>
                {myId && myId !== p.id && (
                  <Button variant="outline" onClick={() => void toggle(p)}
                    className={`shrink-0 h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition ${iFollow.has(p.id) ? "border border-primary/30 bg-primary/12 text-primary shadow-sm" : "grad-brand text-primary-foreground shadow-sm"}`}>
                    {iFollow.has(p.id) ? <><UserCheck size={11} /> Siguiendo</> : <><UserPlus size={11} /> Seguir</>}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return <ProfileOverlay label={list.kind === "followers" ? "Seguidores" : "Siguiendo"} onClose={onClose}>{panel}</ProfileOverlay>;
}

/** Bloque de personalización con etiqueta + descripción (separa los apartados). */
function EditSection({ label, hint, children }: {
  label: string; hint: string; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-border/60 pt-3 space-y-2">
      <div>
        <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-primary-glow">{label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, max, icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; icon?: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">{icon}{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={max}
        className="min-w-0 w-full bg-input/50 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"/>
    </label>
  );
}

function TikTokIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.6 6.7a5.1 5.1 0 0 1-3.3-1.2 5.2 5.2 0 0 1-1.6-3H11v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V8.7a6.4 6.4 0 1 0 5.5 6.3V9.5c1.3.9 2.9 1.5 4.6 1.5V7.6c-.3 0-.5-.1-.7-.2Z"/>
    </svg>
  );
}


function SocialLinksRow({ links }: { links: import("@/lib/social/api").SocialLinks }) {
  const items: { key: string; url: string | undefined; icon: React.ReactNode; color: string; label: string }[] = [
    { key: "youtube", url: links.youtube, icon: <Youtube size={14} />, color: "#FF0033", label: "YouTube" },
    { key: "tiktok", url: links.tiktok, icon: <TikTokIcon />, color: "#000", label: "TikTok" },
    { key: "instagram", url: links.instagram, icon: <Instagram size={14} />, color: "#E1306C", label: "Instagram" },
    { key: "website", url: links.website, icon: <Globe size={14} />, color: "var(--primary)", label: "Web" },
  ].filter(x => !!x.url && String(x.url).trim().length > 0) as never;
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(it => (
        <a key={it.key} href={/^https?:\/\//.test(it.url ?? "") ? it.url : `https://${it.url}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border border-border/60 bg-muted/30 active:scale-95 transition"
          style={{ color: it.color }}>
          {it.icon}<span className="text-foreground">{it.label}</span>
        </a>
      ))}
    </div>
  );
}
