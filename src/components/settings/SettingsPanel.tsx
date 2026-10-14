import { Languages, Lock, Moon, Palette, Settings2, Sun } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setTheme, usePreferences } from "@/lib/preferences";

/* ─── Control segmentado (dos opciones) ─── */
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</p>
    </section>
  );
}

function SettingsContent() {
  const prefs = usePreferences();

  return (
    <div className="space-y-5">
      <Section
        icon={<Palette size={13} />}
        title="Tema"
        hint="Alterna entre el tema claro y el oscuro de la aplicación. Se aplica al instante en todas las pantallas."
      >
        <Segmented
          value={prefs.theme}
          onChange={(v) => setTheme(v === "dark" ? "dark" : "light")}
          options={[
            { value: "light", label: "Claro", icon: <Sun size={13} /> },
            { value: "dark", label: "Oscuro", icon: <Moon size={13} /> },
          ]}
        />
      </Section>

      <div className="border-t border-border/50" />

      <Section
        icon={<Languages size={13} />}
        title="Idioma"
        hint="Disponible, pero bloqueada hasta que se implemente la traducción de la aplicación. Se activará automáticamente."
      >
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/50 px-3.5 py-2.5 text-left text-sm text-muted-foreground/60 cursor-not-allowed opacity-70"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden>Español</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              ES
            </span>
          </span>
          <Lock size={14} />
        </button>
      </Section>

      <p className="rounded-xl bg-muted/60 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground/70">
        Los cambios se guardan en este dispositivo y funcionan también antes de iniciar sesión.
      </p>
    </div>
  );
}

/**
 * Panel de configuración (tema e idioma) como diálogo controlado.
 *
 * Su único acceso es el menú de tres líneas de Inicio: el botón flotante que
 * aparecía sobre el resto de pantallas se retiró para no duplicar entradas.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Settings2 size={16} className="text-primary" />
            Configuración
          </DialogTitle>
          <DialogDescription>Tema e idioma de Asternal.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <SettingsContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}
