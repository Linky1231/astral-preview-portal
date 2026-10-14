import { useState, useEffect } from "react";
import {
  X, Loader2, Trophy, Plus, Trash2, Save, Edit3, Star, Award,
  Zap, Target, Gem, Flame, Rocket, Heart, Palette, Link2, Tag,
  ChevronDown, ChevronUp, GripVertical, Crown, Send,
} from "lucide-react";
import { type Profile } from "@/lib/social/api";
import { Avatar } from "./Avatar";
import { UserName } from "./UserName";
import { SharePortfolioModal } from "./SharePortfolioModal";

/* ── Icon registry: lucide icons only ── */
const ICON_OPTIONS = [
  { id: "trophy", Icon: Trophy, label: "Trofeo" },
  { id: "star", Icon: Star, label: "Estrella" },
  { id: "award", Icon: Award, label: "Insignia" },
  { id: "zap", Icon: Zap, label: "Rayo" },
  { id: "target", Icon: Target, label: "Objetivo" },
  { id: "gem", Icon: Gem, label: "Gema" },
  { id: "flame", Icon: Flame, label: "Llama" },
  { id: "rocket", Icon: Rocket, label: "Cohete" },
  { id: "heart", Icon: Heart, label: "Corazón" },
  { id: "crown", Icon: Crown, label: "Corona" },
] as const;

type IconId = (typeof ICON_OPTIONS)[number]["id"];

function getIcon(id: string) {
  return ICON_OPTIONS.find(o => o.id === id)?.Icon ?? Trophy;
}

/* ── Accent color presets ── */
const ACCENT_PRESETS = [
  { id: "blue", color: "#3b82f6", label: "Azul" },
  { id: "violet", color: "#8b5cf6", label: "Violeta" },
  { id: "emerald", color: "#10b981", label: "Esmeralda" },
  { id: "amber", color: "#f59e0b", label: "Ámbar" },
  { id: "rose", color: "#f43f5e", label: "Rosa" },
  { id: "cyan", color: "#06b6d4", label: "Cian" },
  { id: "orange", color: "#f97316", label: "Naranja" },
  { id: "primary", color: "var(--primary)", label: "Tema" },
];

/* ── Data types ── */
export interface PortfolioAchievement {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: IconId;
}

export interface PortfolioLink {
  id: string;
  label: string;
  url: string;
}

export interface Portfolio {
  userId: string;
  headline: string;
  bio: string;
  accentColor: string;
  skills: string[];
  links: PortfolioLink[];
  achievements: PortfolioAchievement[];
  layout: "list";
  updatedAt: string;
}

export const PORTFOLIO_STORAGE_KEY = "asternal_portfolios";
const PORTFOLIO_LAYOUT = "list" as const;
const SKILL_SUGGESTIONS = [
  "Game Design", "Pixel Art", "3D Modeling", "Programming", "Music",
  "Level Design", "Storytelling", "Unity", "Godot", "Unreal",
  "Indie", "Roguelike", "Platformer", "RPG", "Puzzle",
  "Sound Design", "Animation", "UI/UX", "Marketing", "Community",
];

export function getPortfolio(userId: string): Portfolio | null {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, Portfolio>;
    return all[userId] ?? null;
  } catch { return null; }
}

export function savePortfolio(p: Portfolio): void {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) as Record<string, Portfolio> : {};
    all[p.userId] = { ...p, layout: PORTFOLIO_LAYOUT, updatedAt: new Date().toISOString() };
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

export function deletePortfolio(userId: string): void {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, Portfolio>;
    delete all[userId];
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

function newId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
export function PortfolioPanel({
  userId,
  profile,
  viewingOwn,
  onClose,
  portfolioSnapshot,
}: {
  userId: string;
  profile: Profile;
  viewingOwn: boolean;
  onClose: () => void;
  portfolioSnapshot?: Portfolio | null;
}) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [editing, setEditing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const readOnlySnapshot = !!portfolioSnapshot;

  // editor state
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [links, setLinks] = useState<PortfolioLink[]>([]);
  const [achievements, setAchievements] = useState<PortfolioAchievement[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);

  useEffect(() => {
    const p = portfolioSnapshot ?? getPortfolio(userId);
    setPortfolio(p);
    if (p) {
      setHeadline(p.headline);
      setBio(p.bio ?? "");
      setAccentColor(p.accentColor ?? "#3b82f6");
      setSkills(p.skills ?? []);
      setLinks(p.links ?? []);
      setAchievements(p.achievements ?? []);
    }
  }, [userId, portfolioSnapshot]);

  const startEditing = () => {
    if (portfolio) {
      setHeadline(portfolio.headline);
      setBio(portfolio.bio ?? "");
      setAccentColor(portfolio.accentColor ?? "#3b82f6");
      setSkills(portfolio.skills ?? []);
      setLinks(portfolio.links ?? []);
      setAchievements(portfolio.achievements ?? []);
    }
    setEditing(true);
  };

  /* ── Achievement helpers ── */
  const addAchievement = () =>
    setAchievements(prev => [
      ...prev,
      { id: newId(), title: "", description: "", date: new Date().toISOString().slice(0, 10), icon: "trophy" },
    ]);
  const removeAchievement = (id: string) =>
    setAchievements(prev => prev.filter(a => a.id !== id));
  const updateAch = (id: string, field: keyof PortfolioAchievement, value: string) =>
    setAchievements(prev => prev.map(a => (a.id === id ? { ...a, [field]: value } : a)));

  /* ── Link helpers ── */
  const addLink = () =>
    setLinks(prev => [...prev, { id: newId(), label: "", url: "" }]);
  const removeLink = (id: string) =>
    setLinks(prev => prev.filter(l => l.id !== id));
  const updateLink = (id: string, field: keyof PortfolioLink, value: string) =>
    setLinks(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));

  /* ── Skill helpers ── */
  const addSkill = (skill: string) => {
    const s = skill.trim();
    if (s && !skills.includes(s) && skills.length < 15) setSkills(prev => [...prev, s]);
    setSkillInput("");
    setShowSkillPicker(false);
  };
  const removeSkill = (s: string) => setSkills(prev => prev.filter(sk => sk !== s));

  /* ── Save / Delete ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      const p: Portfolio = {
        userId,
        headline: headline.trim() || `Portafolio de ${profile.display_name || profile.username}`,
        bio: bio.trim(),
        accentColor,
        skills,
        links: links.filter(l => l.label.trim() && l.url.trim()),
        achievements: achievements.filter(a => a.title.trim()),
        layout: PORTFOLIO_LAYOUT,
        updatedAt: new Date().toISOString(),
      };
      savePortfolio(p);
      setPortfolio(p);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!confirm("¿Eliminar tu portafolio?")) return;
    deletePortfolio(userId);
    setPortfolio(null);
    setEditing(false);
  };

  /* ── No portfolio ── */
  if (!portfolio && !editing) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 backdrop-blur-md animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Portafolio">
        <div className="min-h-full max-w-6xl mx-auto px-3 py-3 sm:px-6 sm:py-6">
        <div className="relative min-h-[calc(100vh-1.5rem)] sm:min-h-[calc(100vh-3rem)] rounded-2xl border border-border bg-surface shadow-xl animate-in slide-in-from-bottom-2 duration-300 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
            <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-primary/10">
              <Trophy size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-display font-semibold">Portafolio</div>
              <div className="text-[10px] text-muted-foreground">Tus logros en Asternal</div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground active:scale-95 transition">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 grid place-items-center p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-muted/30 border border-border/30 grid place-items-center">
              <Trophy size={22} className="text-muted-foreground/25" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground/60 font-medium">
                {viewingOwn ? "Aún no tienes portafolio" : `${profile.display_name || profile.username} no tiene portafolio`}
              </div>
              {viewingOwn && !readOnlySnapshot && (
                <div className="text-[11px] text-muted-foreground/40 mt-1">
                  Crea uno para mostrar tus logros y habilidades
                </div>
              )}
            </div>
            {viewingOwn && (
              <button onClick={() => setEditing(true)}
                className="h-9 px-4 rounded-lg bg-primary text-white text-xs font-semibold active:scale-95 transition">
                Crear portafolio
              </button>
            )}
            <div className="text-[10px] text-muted-foreground/55">Crea un portafolio para compartir tus logros y habilidades.</div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  /* ═══════ EDITOR ═══════ */
  if (editing) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 backdrop-blur-md animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Editor de portafolio">
        <div className="min-h-full max-w-6xl mx-auto px-3 py-3 sm:px-6 sm:py-6">
        <div className="relative min-h-[calc(100vh-1.5rem)] sm:min-h-[calc(100vh-3rem)] rounded-2xl border border-border bg-surface shadow-xl animate-in slide-in-from-bottom-2 duration-300 flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
            <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: accentColor + "18" }}>
              <Trophy size={16} style={{ color: accentColor }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-display font-semibold">Editar portafolio</div>
              <div className="text-[10px] text-muted-foreground">Personaliza tu perfil de creador</div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground active:scale-95 transition">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── User preview ── */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card">
              <Avatar p={profile} size={40} rounded="xl" className="border border-border/50" />
              <div className="min-w-0">
                <UserName p={profile} size="sm" />
                <div className="text-[10px] font-mono text-muted-foreground truncate">@{profile.username}</div>
              </div>
            </div>

            {/* ── Headline ── */}
            <Section label="Titular" hint="Frase principal de tu portafolio">
              <input value={headline} onChange={e => setHeadline(e.target.value)} maxLength={80}
                placeholder={`Logros de ${profile.display_name || profile.username}`}
                className="w-full bg-input/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </Section>

            {/* ── Bio ── */}
            <Section label="Biografía" hint="Cuéntanos sobre ti como creador">
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={300}
                placeholder="Desarrollador indie apasionado por los roguelikes..."
                className="w-full bg-input/50 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/40" />
            </Section>

            {/* ── Accent color ── */}
            <Section label="Color de acento" hint="Color principal de tu portafolio">
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENT_PRESETS.map(p => (
                  <button key={p.id} onClick={() => setAccentColor(p.color)}
                    className={`w-8 h-8 rounded-lg border-2 transition grid place-items-center ${accentColor === p.color ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                    style={{ background: p.color }} title={p.label}>
                    {accentColor === p.color && <div className="w-2 h-2 rounded-full bg-white" />}
                  </button>
                ))}
                <input type="color" value={accentColor.startsWith("#") ? accentColor : "#3b82f6"}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-border cursor-pointer bg-transparent" title="Color personalizado" />
              </div>
            </Section>

            {/* ── Skills ── */}
            <Section label="Habilidades" hint="Etiquetas de tus habilidades (máx 15)">
              <div className="flex flex-wrap gap-1.5">
                {skills.map(s => (
                  <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition"
                    style={{ borderColor: accentColor + "40", color: accentColor, background: accentColor + "10" }}>
                    {s}
                    <button onClick={() => removeSkill(s)} className="hover:opacity-60"><X size={10} /></button>
                  </span>
                ))}
                {skills.length < 15 && (
                  <div className="relative">
                    <button onClick={() => setShowSkillPicker(v => !v)}
                      className="h-7 px-2 rounded-full border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition flex items-center gap-1">
                      <Plus size={10} /> Añadir
                    </button>
                    {showSkillPicker && (
                      <div className="absolute left-0 top-full mt-1 z-30 bg-surface border border-border rounded-lg shadow-md p-2 min-w-[200px] max-h-48 overflow-y-auto">
                        <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && skillInput.trim()) addSkill(skillInput); }}
                          placeholder="Escribe y pulsa Enter"
                          className="w-full h-7 px-2 rounded-md bg-input/50 text-[11px] outline-none mb-1.5" autoFocus />
                        {SKILL_SUGGESTIONS.filter(s => !skills.includes(s) && s.toLowerCase().includes(skillInput.toLowerCase())).slice(0, 10).map(s => (
                          <button key={s} onClick={() => addSkill(s)}
                            className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted/60 transition">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* ── Links ── */}
            <Section label="Enlaces" hint="Sitio web, itch.io, redes... (máx 5)">
              {links.map(link => (
                <div key={link.id} className="flex items-center gap-2 mb-2">
                  <Link2 size={12} className="text-muted-foreground shrink-0" />
                  <input value={link.label} onChange={e => updateLink(link.id, "label", e.target.value)}
                    placeholder="Etiqueta" maxLength={30}
                    className="w-24 h-8 px-2 rounded-md bg-input/50 text-[11px] outline-none" />
                  <input value={link.url} onChange={e => updateLink(link.id, "url", e.target.value)}
                    placeholder="https://..." maxLength={200}
                    className="flex-1 h-8 px-2 rounded-md bg-input/50 text-[11px] outline-none font-mono" />
                  <button onClick={() => removeLink(link.id)}
                    className="w-7 h-7 rounded-md border border-border/50 grid place-items-center text-red-400 hover:bg-red-50 active:scale-95 transition shrink-0">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {links.length < 5 && (
                <button onClick={addLink}
                  className="h-8 px-3 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40 transition flex items-center gap-1">
                  <Plus size={11} /> Añadir enlace
                </button>
              )}
            </Section>

            {/* ── Achievements ── */}
            <Section label="Logros" hint="Tus mayores hitos en la plataforma">
              <div className="space-y-2">
                {achievements.map(ach => {
                  const Icon = getIcon(ach.icon);
                  return (
                    <div key={ach.id} className="p-2.5 rounded-xl border border-border/40 bg-muted/20 space-y-2">
                      <div className="flex items-start gap-2">
                        {/* Icon picker */}
                        <div className="relative">
                          <button onClick={() => {
                            const idx = ICON_OPTIONS.findIndex(o => o.id === ach.icon);
                            const next = ICON_OPTIONS[(idx + 1) % ICON_OPTIONS.length].id;
                            updateAch(ach.id, "icon", next);
                          }}
                            className="h-8 w-8 rounded-md border border-border/50 grid place-items-center hover:bg-muted/60 transition"
                            style={{ color: accentColor }} title={getIcon(ach.icon).displayName ?? "Icono"}>
                            <Icon size={14} />
                          </button>
                        </div>
                        <input value={ach.title} onChange={e => updateAch(ach.id, "title", e.target.value)}
                          placeholder="Título del logro" maxLength={60}
                          className="flex-1 h-8 px-2.5 rounded-md bg-card border border-border/50 text-[11px] outline-none focus:border-primary/40" />
                        <button onClick={() => removeAchievement(ach.id)}
                          className="h-8 w-8 rounded-md border border-border/50 grid place-items-center text-red-400 hover:bg-red-50 active:scale-95 transition shrink-0">
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <input value={ach.description} onChange={e => updateAch(ach.id, "description", e.target.value)}
                        placeholder="Descripción (opcional)" maxLength={200}
                        className="w-full h-8 px-2.5 rounded-md bg-card border border-border/50 text-[11px] outline-none focus:border-primary/40" />
                      <input type="date" value={ach.date} onChange={e => updateAch(ach.id, "date", e.target.value)}
                        className="h-7 px-2 rounded-md bg-card border border-border/50 text-[10px] font-mono outline-none" />
                    </div>
                  );
                })}
                <button onClick={addAchievement}
                  className="w-full h-9 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40 transition flex items-center justify-center gap-1.5">
                  <Plus size={12} /> Añadir logro
                </button>
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 px-4 pb-4 pt-3 flex items-center gap-2 shrink-0 border-t border-border/30 bg-surface/95 backdrop-blur">
            <button onClick={handleDelete}
              className="h-9 px-3 rounded-lg border border-border bg-surface text-[11px] font-medium text-red-500 hover:bg-red-50 active:scale-95 transition">
              Eliminar
            </button>
            <div className="flex-1" />
            <button onClick={() => setEditing(false)}
              className="h-9 px-3 rounded-lg border border-border bg-surface text-[11px] font-medium active:scale-95 transition">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-4 rounded-lg bg-primary text-white text-[11px] font-semibold active:scale-95 transition disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  /* ═══════ VIEW MODE ═══════ */
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 backdrop-blur-md animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Portafolio">
      <div className="min-h-full max-w-6xl mx-auto px-3 py-3 sm:px-6 sm:py-6">
      <div className="relative min-h-[calc(100vh-1.5rem)] sm:min-h-[calc(100vh-3rem)] rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_right,rgba(99,178,255,0.1),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.99),rgba(242,248,255,0.98))] shadow-xl animate-in slide-in-from-bottom-2 duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
          <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
            style={{ background: (portfolio?.accentColor ?? "#3b82f6") + "18" }}>
            <Trophy size={16} style={{ color: portfolio?.accentColor ?? "#3b82f6" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-display font-semibold truncate">{portfolio?.headline}</div>
            {portfolio?.bio && (
              <div className="text-[10px] text-muted-foreground truncate">{portfolio.bio}</div>
            )}
          </div>
          {viewingOwn && !readOnlySnapshot && (
            <>
              <button onClick={() => setShareOpen(true)}
                className="h-8 px-2.5 rounded-md grad-brand text-primary-foreground text-[10px] font-semibold active:scale-95 transition flex items-center gap-1 shrink-0">
                <Send size={11} /> Compartir
              </button>
              <button onClick={startEditing}
                className="h-8 px-2.5 rounded-md border border-border bg-surface text-[10px] font-medium text-primary hover:bg-primary/5 active:scale-95 transition flex items-center gap-1 shrink-0">
                <Edit3 size={11} /> Editar
              </button>
            </>
          )}
          <button onClick={onClose}
            className="w-8 h-8 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground active:scale-95 transition shrink-0">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── User card ── */}
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-card/95 p-3 shadow-sm">
            <Avatar p={profile} size={48} rounded="xl" className="border-2" style={{ borderColor: portfolio?.accentColor ?? "#3b82f6" }} />
            <div className="min-w-0 flex-1">
              <UserName p={profile} size="md" />
              <div className="text-[10px] font-mono text-muted-foreground truncate">@{profile.username}</div>
            </div>
          </div>

          {/* ── Skills ── */}
          {portfolio && portfolio.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {portfolio.skills.map(s => (
                <span key={s} className="px-2.5 py-1 rounded-full text-[10px] font-medium border"
                  style={{ borderColor: (portfolio.accentColor ?? "#3b82f6") + "40", color: portfolio.accentColor ?? "#3b82f6", background: (portfolio.accentColor ?? "#3b82f6") + "10" }}>
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* ── Links ── */}
          {portfolio && portfolio.links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {portfolio.links.map(l => (
                <a key={l.id} href={l.url.startsWith("http") ? l.url : `https://${l.url}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-card px-2.5 py-1 text-[11px] shadow-sm transition hover:border-primary/35">
                  <Link2 size={10} style={{ color: portfolio.accentColor }} />
                  <span className="text-foreground">{l.label}</span>
                </a>
              ))}
            </div>
          )}

          {/* ── Achievements ── */}
          {portfolio && portfolio.achievements.length > 0 && (
            <div className="space-y-2">
              {portfolio.achievements.map(ach => {
                const Icon = getIcon(ach.icon);
                return (
                  <div key={ach.id} className="flex items-start gap-3 rounded-xl border border-primary/20 bg-card/95 p-3 shadow-sm transition hover:border-primary/35">
                    <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
                      style={{ background: (portfolio.accentColor ?? "#3b82f6") + "12" }}>
                      <Icon size={16} style={{ color: portfolio.accentColor ?? "#3b82f6" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-foreground">{ach.title}</div>
                      {ach.description && (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">{ach.description}</div>
                      )}
                      <div className="text-[9px] font-mono text-muted-foreground/30 mt-1">
                        {new Date(ach.date).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {portfolio && portfolio.achievements.length === 0 && !portfolio.skills.length && !portfolio.links.length && (
            <div className="p-6 text-center text-[11px] text-muted-foreground/40">
              Portafolio vacío — añade logros, habilidades o enlaces
            </div>
          )}
        </div>
      </div>
      </div>
      {!readOnlySnapshot && <SharePortfolioModal portfolio={portfolio} profile={profile} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </div>
  );
}

/* ── Reusable section wrapper ── */
function Section({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 space-y-2">
      <div>
        <div className="text-[9px] font-mono tracking-[0.14em] uppercase text-primary-glow">{label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      </div>
      {children}
    </div>
  );
}
