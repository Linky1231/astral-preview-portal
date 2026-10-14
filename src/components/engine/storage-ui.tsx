import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatBackupDate, formatBytes } from "@/lib/engine/remote-backup";

/** Copia tal como la pinta la lista, venga de Drive o del bucket. */
export type BackupListItem = {
  id: string;
  name: string;
  size?: number;
  updatedAt?: number;
};

/** Lista de copias guardadas en el remoto. */
export function BackupList({ items }: { items: BackupListItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="max-h-[30vh] space-y-1.5 overflow-y-auto no-scrollbar">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-input/30 px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{item.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatBytes(item.size)} · {formatBackupDate(item.updatedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Botón principal de sincronización, con su estado de trabajo. */
export function SyncButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button variant="gradient" className="flex-1 font-display tracking-widest" onClick={onClick} disabled={busy}>
      {busy ? <Spinner /> : <RefreshCw size={15} />}
      SINCRONIZAR AHORA
    </Button>
  );
}

/** Aviso de error de una operación con el remoto. */
export function StorageError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] leading-relaxed text-destructive">{message}</p>
  );
}

/** Bloque que explica un paso de configuración que falta. */
export function SetupNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-destructive/25 bg-destructive/[0.04] px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
      <p className="font-display text-[11px] font-semibold uppercase tracking-wider text-destructive">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Texto pequeño al pie de cada panel. */
export function StorageNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-relaxed text-muted-foreground/70">{children}</p>;
}

/** Fila de cuenta/proyecto conectado con una acción opcional a la derecha. */
export function StorageAccountRow({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[12px] font-semibold text-foreground">{title}</p>
        <p className="text-[10px] font-mono text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
