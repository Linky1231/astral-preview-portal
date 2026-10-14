import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Check, Loader2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fetchCommunitySettings, saveCommunitySettings } from "@/lib/community/settings";
import { isAdmin } from "@/lib/social/api";
import type { CommunitySettings } from "@/lib/community/about";
import { BackButton } from "@/components/ui/back-button";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
  const [settings, setSettings] = useState<CommunitySettings | null>(null);
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([fetchCommunitySettings(), isAdmin()])
      .then(([loaded, role]) => { setSettings(loaded); setAdmin(role); })
      .catch(() => setSettings(null));
  }, []);

  const update = <K extends keyof CommunitySettings>(key: K, value: CommunitySettings[K]) => {
    setSettings(current => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await saveCommunitySettings(settings);
      setSettings(saved);
      setEditing(false);
      toast.success("Las reglas de la comunidad se actualizaron.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground"><Loader2 className="animate-spin mr-2" size={18} /> Cargando información…</div>;
  }

  return (
    <main className="min-h-screen bg-background text-foreground pb-12">
      {/* M3: barra superior opaca (surface), sin cristal ni desenfoque. */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton
            label="Volver"
            showLabel={false}
            variant="solid"
            className="w-9 h-9 justify-center"
          />
          <div className="min-w-0 flex-1"><p className="text-[10px] font-display tracking-[0.18em] text-primary uppercase">Comunidad</p><h1 className="text-base font-display font-semibold truncate">Acerca de nosotros</h1></div>
          {admin && <button onClick={() => setEditing(value => !value)} className="h-9 px-3 rounded-xl border border-primary/20 bg-primary/10 text-primary text-xs font-medium active:scale-[0.97] transition">{editing ? "Cancelar" : "Administrar"}</button>}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <section className="panel rounded-3xl border border-primary/15 bg-card p-5 sm:p-6 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-1 grad-brand-fade" />
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 text-primary grid place-items-center mb-4"><Sparkles size={19} /></div>
          {editing ? <input value={settings.title} onChange={event => update("title", event.target.value)} className="w-full bg-transparent text-xl font-display font-semibold outline-none border-b border-border/60 pb-2" maxLength={80} /> : <h2 className="text-xl font-display font-semibold">{settings.title}</h2>}
          {editing ? <textarea value={settings.about} onChange={event => update("about", event.target.value)} rows={4} className="mt-3 w-full rounded-xl bg-muted/35 border border-border/60 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary/45" maxLength={1200} /> : <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{settings.about}</p>}
        </section>

        <section className="panel rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
          <div className="flex gap-3"><div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><BookOpen size={17} /></div><div><h2 className="font-display font-semibold">Reglas de la comunidad</h2><p className="text-xs text-muted-foreground mt-1">Orión revisa cada publicación antes de publicarla según estas reglas.</p></div></div>
          {editing ? <textarea value={settings.rules} onChange={event => update("rules", event.target.value)} rows={8} className="mt-4 w-full rounded-xl bg-muted/35 border border-border/60 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary/45" maxLength={4000} /> : <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{settings.rules}</p>}
        </section>

        <section className="panel rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
          <div className="flex gap-3"><div className="w-9 h-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><LockKeyhole size={17} /></div><div><h2 className="font-display font-semibold">Privacidad</h2><p className="text-xs text-muted-foreground mt-1">Información pública sobre el tratamiento y la visibilidad dentro de Asternal.</p></div></div>
          {editing ? <textarea value={settings.privacy} onChange={event => update("privacy", event.target.value)} rows={7} className="mt-4 w-full rounded-xl bg-muted/35 border border-border/60 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary/45" maxLength={4000} /> : <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{settings.privacy}</p>}
        </section>

        {editing && <section className="panel rounded-3xl border border-border/70 bg-card p-5 space-y-3">
          <h2 className="font-display font-semibold flex gap-2 items-center"><ShieldCheck size={17} className="text-primary" /> Controles de Orión</h2>
          <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={settings.moderationEnabled} onChange={event => update("moderationEnabled", event.target.checked)} className="mt-1 accent-primary" /><span><span className="block text-sm font-medium">Revisar antes de publicar</span><span className="block text-xs text-muted-foreground mt-0.5">Bloquea publicaciones que no cumplan las reglas.</span></span></label>
          <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={settings.personalizedRecommendations} onChange={event => update("personalizedRecommendations", event.target.checked)} className="mt-1 accent-primary" /><span><span className="block text-sm font-medium">Orden recomendado por Orión</span><span className="block text-xs text-muted-foreground mt-0.5">Usa contenido, etiquetas, variedad y cuentas seguidas; nunca conteos de reacciones.</span></span></label>
          <button onClick={() => void save()} disabled={saving} className="mt-2 h-10 px-4 rounded-xl btn-grad text-xs font-display tracking-[0.12em] flex items-center gap-2 disabled:opacity-50 active:scale-[0.97] transition">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {saving ? "GUARDANDO…" : "GUARDAR AJUSTES"}</button>
        </section>}
      </div>
    </main>
  );
}
