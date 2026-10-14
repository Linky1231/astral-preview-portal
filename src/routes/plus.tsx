import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Palette, Rocket, Link2, Check, Loader2,
  Youtube, Instagram, Music2, Globe, Gift,
  Wand2, Ban, UserRound,
} from "lucide-react";

import { PlusIcon } from "@/components/social/PlusIcon";
import { Avatar } from "@/components/social/Avatar";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { PLUS_FRAMES, plusFrameColor } from "@/lib/social/plus-frames";
import { NAME_EFFECTS, nameEffectClass, nameEffectLabel } from "@/lib/social/name-effects";
import { filterStateClass } from "@/lib/ui/filter-control";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyProfile, claimPlusOrbes, updatePlusSettings,
  isPlusActive,
  type Profile, type SocialLinks,
} from "@/lib/social/api";


export const Route = createFileRoute("/plus")({
  head: () => ({
    meta: [
      { title: "Centro Plus · Asternal" },
      { name: "description", content: "Tu Centro Plus: efectos de nombre, marcos de perfil, tarjeta de creador y más." },
    ],
  }),
  component: PlusPage,
});

/* Los marcos de perfil viven en @/lib/social/plus-frames y los efectos de
   nombre en @/lib/social/name-effects: cada catálogo tiene un único origen, así
   que lo que se elige aquí es exactamente lo que se pinta en el perfil. */

type PlusSectionId = "apariencia" | "beneficios" | "redes" | "pruebas";

const PLUS_SECTIONS: { id: PlusSectionId; label: string; icon: React.ReactNode }[] = [
  { id: "apariencia", label: "Apariencia", icon: <Wand2 size={13} /> },
  { id: "beneficios", label: "Beneficios", icon: <Gift size={13} /> },
  { id: "redes", label: "Redes", icon: <Link2 size={13} /> },
  { id: "pruebas", label: "Pruebas", icon: <Rocket size={13} /> },
];

type PlusPatch = Parameters<typeof updatePlusSettings>[0];

function PlusPage() {
  const navigate = useNavigate();

  // Bug de navegación: si entras a Plus desde tu perfil (o desde cualquier
  // pantalla), el botón/gesto de «atrás» del navegador volvía a la pantalla
  // anterior (p. ej. la página aislada de tu perfil) en vez del menú principal.
  // Interceptamos el popstate: al salir de Plus, SIEMPRE se va al menú
  // principal (/) en lugar de a la ruta anterior.
  useEffect(() => {
    const onPop = () => {
      navigate({ to: "/", replace: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate]);
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<PlusSectionId>("apariencia");
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [socials, setSocials] = useState<SocialLinks>({});
  const [savedSocials, setSavedSocials] = useState<null | "saving" | "saved">(null);
  // Estado de guardado compartido: cada tarjeta sabe si su cambio está en curso
  // (`pending`), acaba de guardarse (`saved`) o falló (`errorMsg`). Antes los
  // errores se perdían en silencio y la selección parecía no aplicarse.
  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      const p = await getMyProfile();
      setMe(p);
      setSocials((p?.social_links as SocialLinks) ?? {});
      setLoading(false);
    })();
  }, [navigate]);

  const isPlus = isPlusActive(me);

  const refresh = async () => setMe(await getMyProfile());

  /** Guarda un ajuste con confirmación visible y revierte el estado si falla. */
  const saveSetting = async (key: string, patch: PlusPatch) => {
    setPending(key);
    setErrorMsg(null);
    try {
      const updated = await updatePlusSettings(patch);
      setMe(updated ?? me);
      setSaved(key);
      window.setTimeout(() => setSaved((current) => (current === key ? null : current)), 1600);
    } catch (e) {
      setErrorMsg((e as Error).message || "No se pudo guardar el cambio.");
    } finally {
      setPending(null);
    }
  };

  const claim = async () => {
    setClaiming(true); setClaimMsg(null);
    try {
      const r = await claimPlusOrbes();
      if (r.ok) { setClaimMsg(`+${r.amount} orbes reclamados 🎉`); await refresh(); }
      else if (r.reason === "already_claimed") {
        const next = r.next_at ? new Date(r.next_at).toLocaleDateString() : "";
        setClaimMsg(`Ya reclamaste este mes. Próximo: ${next}`);
      }
    } catch (e) { setClaimMsg((e as Error).message); }
    finally { setClaiming(false); }
  };

  const toggleBadge = () => {
    if (!me) return;
    void saveSetting("badge", { show_plus_badge: !(me.show_plus_badge ?? true) });
  };

  const setFrame = (id: string | null) => {
    if (!me) return;
    void saveSetting("frame", { avatar_frame: id });
  };
  const setNameFx = (id: string | null) => {
    if (!me) return;
    void saveSetting("fx", { name_effect: id });
  };

  const saveSocials = async () => {
    setSavedSocials("saving");
    try {
      await updatePlusSettings({ social_links: socials });
      setSavedSocials("saved");
      setErrorMsg(null);
    } catch (e) {
      setSavedSocials(null);
      setErrorMsg((e as Error).message || "No se pudieron guardar tus redes.");
      return;
    }
    window.setTimeout(() => setSavedSocials(null), 1500);
  };

  const canClaim = isPlus && (!me?.last_plus_claim_at || (Date.now() - new Date(me.last_plus_claim_at).getTime()) > 30 * 24 * 3600 * 1000);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;

  // Vista previa real: el mismo avatar, marco y efecto que verán los demás.
  const frameColor = plusFrameColor(me?.avatar_frame);
  const effectClass = nameEffectClass(me?.name_effect);
  const previewName = me?.display_name?.trim() || me?.username || "Tu nombre";
  const effectLabel = nameEffectLabel(me?.name_effect);
  const frameLabel = PLUS_FRAMES.find((frame) => frame.id === me?.avatar_frame)?.label ?? null;

  return (
    <div className="plus-page min-h-screen w-full flex flex-col bg-background text-foreground">
      <SubPageHeader
        title="CENTRO PLUS"
        icon={<PlusIcon size={14} className="text-[color:var(--plus)]" />}
        subtitle={me ? `@${me.username ?? "…"} · Beneficios de Asternal Plus` : undefined}
        right={
          isPlus ? (
            <span className="text-[10px] font-display tracking-widest px-2.5 py-1 rounded-full text-white shadow-sm btn-grad">ACTIVO</span>
          ) : undefined
        }
        below={
          <div className="flex gap-1.5 m3-scroll-x no-scrollbar">
            {PLUS_SECTIONS.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  aria-pressed={active}
                  className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[10px] font-display font-semibold tracking-wide whitespace-nowrap border transition active:scale-[0.97] ${filterStateClass(active)}`}
                >
                  {item.icon} {item.label.toUpperCase()}
                </button>
              );
            })}
          </div>
        }
      />

      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full px-3 py-4 pb-24 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Hero + vista previa */}
        <section className="plus-glass-hero relative overflow-hidden rounded-3xl p-5 shadow-lg border">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full blur-3xl opacity-30 bg-primary/30" />
          <div className="relative space-y-4">
            <div>
              <div className="btn-grad inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-display tracking-[0.2em] uppercase text-white">
                <PlusIcon size={11} /> Plus
              </div>
              <h1 className="mt-2.5 text-2xl font-display font-bold">Asternal Plus</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Personaliza cómo aparece tu nombre y tu foto en toda la comunidad.
              </p>
            </div>

            <div className="plus-glass-note rounded-2xl border p-3 flex items-center gap-3">
              <div
                className="shrink-0 rounded-2xl p-[2px]"
                style={{ background: frameColor ?? "var(--line-strong)" }}
              >
                <div className="w-[52px] h-[52px] rounded-[13px] overflow-hidden">
                  <Avatar p={me} className="w-full h-full" rounded="xl" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-display text-base font-semibold truncate ${effectClass ?? ""}`}
                    data-effect={effectClass ? me?.name_effect ?? undefined : undefined}
                  >
                    {previewName}
                  </span>
                  {me?.show_plus_badge !== false && (
                    <span className="inline-flex items-center px-1 py-0.5 rounded shrink-0" style={{ background: "var(--plus)", color: "var(--plus-on-primary)" }} title="Asternal Plus">
                      <PlusIcon size={9} strokeWidth={2.4} />
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                  {effectLabel ? `Nombre: ${effectLabel}` : "Nombre: sin efecto"}
                  {frameLabel ? ` · Marco: ${frameLabel}` : ""}
                </div>
              </div>
              <Link to="/profile" className="shrink-0 inline-flex min-h-11 items-center text-[11px] font-display font-semibold text-primary hover:underline">
                VER PERFIL
              </Link>
            </div>

            {(pending || saved || errorMsg) && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status" aria-live="polite">
                {pending && (<><Loader2 size={12} className="animate-spin" /> Guardando cambios…</>)}
                {!pending && saved && (<><Check size={12} className="text-emerald-500" /> Cambios guardados</>)}
                {!pending && !saved && errorMsg && <span className="text-destructive">{errorMsg}</span>}
              </div>
            )}
          </div>
        </section>

        {section === "apariencia" && (
          <div className="space-y-3">
            {/* Efectos de nombre */}
            <FeatureCard icon={<Wand2 size={18} />} title="Efectos de nombre"
              desc="Se aplican a tu nombre en tu perfil, publicaciones, chats y comentarios." locked={!isPlus}>
              <div className="grid grid-cols-2 gap-2">
                <EffectChoice
                  selected={!me?.name_effect}
                  disabled={!isPlus}
                  busy={pending === "fx" && !me?.name_effect}
                  onClick={() => setNameFx(null)}
                  preview={<span className="text-sm font-display text-muted-foreground">Nombre normal</span>}
                  label="Ninguno"
                />
                {NAME_EFFECTS.map((fx) => {
                  const selected = me?.name_effect === fx.id;
                  return (
                    <EffectChoice
                      key={fx.id}
                      selected={selected}
                      disabled={!isPlus}
                      busy={pending === "fx" && selected}
                      onClick={() => setNameFx(fx.id)}
                      preview={<span className={`name-fx name-fx-${fx.id} text-sm font-display max-w-full truncate`}>{previewName}</span>}
                      label={fx.label}
                      hint={fx.hint}
                    />
                  );
                })}
              </div>
            </FeatureCard>

            {/* Marcos de perfil */}
            <FeatureCard icon={<Palette size={18} />} title="Marcos de perfil"
              desc="Un anillo de color alrededor de tu foto. Se ve en tu perfil y en cada publicación." locked={!isPlus}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                <button onClick={() => setFrame(null)} disabled={!isPlus} aria-pressed={!me?.avatar_frame}
                  className={`plus-choice relative flex items-center gap-2 rounded-2xl border-2 p-2 transition text-left disabled:opacity-40 ${!me?.avatar_frame ? "border-primary" : "border-border"}`}>
                  <span className="w-8 h-8 rounded-xl grid place-items-center bg-muted/50 text-muted-foreground shrink-0">
                    <Ban size={14} />
                  </span>
                  <span className="text-[11px] font-display truncate">Sin marco</span>
                  {!me?.avatar_frame && <SelectedMark />}
                </button>
                {PLUS_FRAMES.map((f) => {
                  const selected = me?.avatar_frame === f.id;
                  return (
                    <button key={f.id} onClick={() => setFrame(f.id)} disabled={!isPlus} aria-pressed={selected}
                      className={`plus-choice relative flex items-center gap-2 rounded-2xl border-2 p-2 transition text-left disabled:opacity-40 ${selected ? "border-primary" : "border-border"}`}>
                      <span className="w-8 h-8 rounded-xl shrink-0" style={{ background: f.color }} aria-hidden="true" />
                      <span className="text-[11px] font-display truncate">{f.label}</span>
                      {selected && <SelectedMark />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">Los marcos son colores planos para que tu foto siga siendo lo más visible.</p>
            </FeatureCard>
          </div>
        )}

        {section === "beneficios" && (
          <div className="space-y-3">
            <FeatureCard icon={<Gift size={18} />} title="10.000 Orbes mensuales"
              desc={isPlus ? (canClaim ? "Disponibles para reclamar." : "Ya reclamaste este mes.") : "Reclama orbes cada mes."}
              locked={!isPlus}>
              <button disabled={!isPlus || !canClaim || claiming} onClick={claim}
                className="btn-grad w-full h-10 rounded-xl text-sm font-display tracking-widest text-white active:scale-[0.98] transition disabled:opacity-40">
                {claiming ? <Loader2 size={14} className="inline animate-spin" /> : canClaim ? "RECLAMAR AHORA" : "RECLAMADO"}
              </button>
              {claimMsg && <div className="text-[11px] text-muted-foreground mt-2 text-center">{claimMsg}</div>}
            </FeatureCard>

            <FeatureCard icon={<PlusIcon size={18} />} title="Insignia Plus"
              desc="Muestra tu insignia junto a tu nombre." locked={!isPlus}>
              <button disabled={!isPlus} onClick={toggleBadge} aria-pressed={!!me?.show_plus_badge}
                className="w-full h-10 rounded-xl text-sm font-display tracking-widest border transition active:scale-[0.98] disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                style={me?.show_plus_badge
                  ? { background: "var(--plus)", borderColor: "var(--plus)", color: "var(--plus-on-primary)" }
                  : { background: "transparent", borderColor: "var(--plus-outline)", color: "var(--plus-on-container)" }}>
                {me?.show_plus_badge ? (<><PlusIcon size={13} /> VISIBLE</>) : "OCULTA"}
              </button>
            </FeatureCard>

            <section className="plus-glass-note relative overflow-hidden rounded-2xl border-2 p-4">
              <div className="flex items-center gap-2.5">
                <UserRound size={18} className="text-[color:var(--plus)] shrink-0" />
                <div className="text-[11px] text-muted-foreground">
                  Los beneficios habilitados en tu cuenta se gestionan desde este centro.
                </div>
              </div>
            </section>
          </div>
        )}

        {section === "redes" && (
          <FeatureCard icon={<Link2 size={18} />} title="Redes sociales"
            desc="Se muestran como iconos en tu perfil." locked={!isPlus}>
            <div className="space-y-2">
              <SocialInput icon={<Youtube size={14} />} placeholder="URL de YouTube"
                value={socials.youtube ?? ""} onChange={v => setSocials({ ...socials, youtube: v })} disabled={!isPlus} />
              <SocialInput icon={<Music2 size={14} />} placeholder="URL de TikTok"
                value={socials.tiktok ?? ""} onChange={v => setSocials({ ...socials, tiktok: v })} disabled={!isPlus} />
              <SocialInput icon={<Instagram size={14} />} placeholder="URL de Instagram"
                value={socials.instagram ?? ""} onChange={v => setSocials({ ...socials, instagram: v })} disabled={!isPlus} />
              <SocialInput icon={<Globe size={14} />} placeholder="Sitio web"
                value={socials.website ?? ""} onChange={v => setSocials({ ...socials, website: v })} disabled={!isPlus} />
              <button disabled={!isPlus || savedSocials === "saving"} onClick={saveSocials}
                className="btn-grad w-full h-9 rounded-xl text-xs font-display tracking-widest text-white active:scale-[0.98] transition disabled:opacity-40">
                {savedSocials === "saving" ? "GUARDANDO…" : savedSocials === "saved" ? "✓ GUARDADO" : "GUARDAR"}
              </button>
            </div>
          </FeatureCard>
        )}

        {section === "pruebas" && (
          <FeatureCard icon={<Rocket size={18} />} title="Herramientas en prueba"
            desc="Funciones disponibles para probar con tu cuenta." locked={!isPlus}>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2 py-1 rounded-full border" style={{ borderColor: "var(--plus-outline)", color: "var(--plus)" }}>Editor de animaciones</span>
              <span className="px-2 py-1 rounded-full border" style={{ borderColor: "var(--plus-outline)", color: "var(--plus)" }}>Encuestas</span>
              <span className="px-2 py-1 rounded-full border" style={{ borderColor: "var(--plus-outline)", color: "var(--plus)" }}>Contenido desbloqueable</span>
            </div>
          </FeatureCard>
        )}

        <div className="text-center pt-1">
          <Link to="/" className="inline-flex min-h-11 items-center text-[11px] text-muted-foreground underline">Volver al inicio</Link>
        </div>
      </main>
    </div>
  );
}

/** Marca de selección reutilizable (esquina de una opción elegida). */
function SelectedMark() {
  return (
    <span className="absolute right-1.5 top-1.5 w-4 h-4 rounded-full grid place-items-center" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }} aria-hidden="true">
      <Check size={10} strokeWidth={3} />
    </span>
  );
}

/**
 * Opción de efecto de nombre: la vista previa usa el MISMO efecto que se aplica
 * en el perfil (`name-fx name-fx-<id>`), así que lo que se elige es lo que se ve.
 */
function EffectChoice({ selected, disabled, busy, onClick, preview, label, hint }: {
  selected: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  preview: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={selected} title={hint}
      className={`plus-choice relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2.5 min-h-16 transition disabled:opacity-40 ${selected ? "border-primary" : "border-border"}`}>
      <span className="flex items-center justify-center w-full min-w-0">{busy ? <Loader2 size={14} className="animate-spin" /> : preview}</span>
      <span className="text-[10px] font-display text-muted-foreground truncate max-w-full">{label}</span>
      {selected && <SelectedMark />}
    </button>
  );
}

function FeatureCard({ icon, title, desc, locked, children }: {
  icon: React.ReactNode; title: string; desc: string; locked: boolean; children: React.ReactNode;
}) {
  return (
    <section className="plus-glass-card rounded-2xl border border-border/70 bg-surface p-4 space-y-3 relative">
      <div className="flex items-start gap-3">
        <div className="btn-grad w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold flex items-center gap-2">
            {title}
            {locked && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">PLUS</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
      </div>
      <div className={locked ? "opacity-60 pointer-events-none select-none" : ""}>{children}</div>
    </section>
  );
}

function SocialInput({ icon, placeholder, value, onChange, disabled }: {
  icon: React.ReactNode; placeholder: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="plus-social-input flex items-center gap-2 bg-input/40 rounded-xl px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        className="flex-1 bg-transparent text-xs outline-none disabled:opacity-50" />
    </div>
  );
}
