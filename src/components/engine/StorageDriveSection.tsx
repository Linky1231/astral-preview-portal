import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudDownload, ExternalLink, HardDrive, Link2Off, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { GOOGLE_CLIENT_ID_ENV, formatBytes, isDriveConfigured, type DriveProject } from "@/lib/engine/drive";
import {
  connectDriveAccount,
  disconnectDrive,
  driveFolderLink,
  loadDriveOverview,
  syncProjectsToDrive,
} from "@/lib/engine/drive-sync";
import {
  BackupList,
  SetupNotice,
  StorageAccountRow,
  StorageError,
  StorageNote,
  SyncButton,
} from "./storage-ui";

/** Barra de cuota de Drive (usado / límite / libre). */
function QuotaBar({
  usedBytes,
  limitBytes,
  usedPercent,
}: {
  usedBytes?: number;
  limitBytes?: number;
  usedPercent: number | null;
}) {
  if (usedPercent === null || limitBytes === undefined) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Google no informó de tu cuota. Espacio usado en Drive: <b className="text-foreground">{formatBytes(usedBytes)}</b>.
      </p>
    );
  }
  const free = usedBytes !== undefined ? Math.max(0, limitBytes - usedBytes) : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          {formatBytes(usedBytes)} de {formatBytes(limitBytes)} en Drive
        </span>
        <span className="font-mono text-foreground">{usedPercent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full grad-brand transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${Math.max(2, usedPercent)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Libre: {formatBytes(free)} · las copias de Asternal son archivos JSON pequeños.
      </p>
    </div>
  );
}

/** Cómo funciona, para quien todavía no ha conectado su cuenta. */
function ConnectIntro({ onConnect, busy }: { onConnect: () => void; busy: boolean }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
        <li className="flex gap-2">
          <Upload size={14} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Se guarda una copia de cada juego en una carpeta <b className="text-foreground">Asternal</b> de tu Drive:
            el navegador solo tiene ~5 MB y ahí no entra nada más.
          </span>
        </li>
        <li className="flex gap-2">
          <CloudDownload size={14} className="mt-0.5 shrink-0 text-primary" />
          <span>Si entras desde otro dispositivo con la misma cuenta, tus juegos se descargan solos desde esa carpeta.</span>
        </li>
        <li className="flex gap-2">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
          <span>
            El permiso es el mínimo de Google (`drive.file`): la app solo ve los archivos que ella misma crea, nunca el
            resto de tu Drive. Puedes revocarlo cuando quieras.
          </span>
        </li>
      </ul>
      <Button variant="gradient" className="w-full font-display tracking-widest" onClick={onConnect} disabled={busy}>
        {busy ? <Spinner /> : <HardDrive size={16} />}
        CONECTAR GOOGLE DRIVE
      </Button>
    </div>
  );
}

/**
 * Sección de Google Drive: conecta la cuenta de la persona y guarda los juegos
 * en su propia carpeta. Todo el trabajo vive en `drive-sync.ts`; aquí solo se
 * muestra el estado y se ofrecen las acciones.
 */
export function StorageDriveSection({ active }: { active: boolean }) {
  const configured = isDriveConfigured();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<DriveProject[]>([]);
  const [usedBytes, setUsedBytes] = useState<number | undefined>(undefined);
  const [limitBytes, setLimitBytes] = useState<number | undefined>(undefined);
  const [usedPercent, setUsedPercent] = useState<number | null>(null);

  const applyOverview = useCallback((overview: Awaited<ReturnType<typeof loadDriveOverview>>) => {
    if (!overview) {
      setConnected(false);
      return;
    }
    setConnected(true);
    setEmail(overview.email);
    setFiles(overview.files);
    setUsedBytes(overview.usedBytes);
    setLimitBytes(overview.limitBytes);
    setUsedPercent(overview.usedPercent);
  }, []);

  // Al abrirse se comprueba el estado real (sesión guardada, cuota y copias).
  // Dos cuidados que se notan al usar el panel:
  //   · Solo se mira la sesión ya existente: abrir el panel nunca lanza la
  //     ventana de Google — eso pasa al pulsar CONECTAR.
  //   · El estado se toca después del primer `await`; hacerlo de forma síncrona
  //     dentro del efecto provocaría un render en cascada.
  useEffect(() => {
    if (!active || !configured) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const overview = await loadDriveOverview();
        if (cancelled) return;
        applyOverview(overview);
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, configured, applyOverview]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const overview = await connectDriveAccount();
      applyOverview(overview);
      toast.success("Google Drive conectado", {
        description: `Carpeta «Asternal» lista${overview.email ? ` en ${overview.email}` : ""}.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar Google Drive.");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await syncProjectsToDrive();
      applyOverview(await loadDriveOverview());
      toast.success("Drive al día", {
        description: `${result.pushed} guardados · ${result.pulled} recuperados · ${result.total} en la carpeta.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo sincronizar con Drive.";
      setError(message);
      toast.error("No se pudo sincronizar con Drive", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = () => {
    disconnectDrive();
    setConnected(false);
    setEmail(undefined);
    setFiles([]);
    setUsedPercent(null);
    setError(null);
    toast.message("Drive desconectado", { description: "Tus juegos siguen guardados; solo se cerró la sesión." });
  };

  const folderLink = driveFolderLink();

  if (!configured) {
    return (
      <div className="space-y-3">
        <SetupNotice title="Falta la credencial de Google">
          Añade <b className="text-foreground">{GOOGLE_CLIENT_ID_ENV}</b> (Client ID de OAuth de Google, tipo aplicación
          web) en Keys y autoriza este origen en Google Cloud. Después vuelve aquí.
        </SetupNotice>
        <StorageNote>
          Mientras no esté, el respaldo de Firebase sigue disponible: no necesita ninguna credencial tuya.
        </StorageNote>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
        <Spinner /> Comprobando tu Drive…
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-4">
        <ConnectIntro onConnect={handleConnect} busy={busy} />
        <StorageError message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StorageAccountRow
        icon={<HardDrive size={16} />}
        title={email ?? "Cuenta de Google conectada"}
        subtitle={`carpeta «Asternal» · ${files.length} ${files.length === 1 ? "copia" : "copias"}`}
        action={
          folderLink ? (
            <a
              href={folderLink}
              target="_blank"
              rel="noreferrer"
              title="Abrir la carpeta en Drive"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-ink-2 hover:border-primary/40 hover:text-primary active:scale-95 transition"
            >
              <ExternalLink size={13} />
            </a>
          ) : undefined
        }
      />

      <QuotaBar usedBytes={usedBytes} limitBytes={limitBytes} usedPercent={usedPercent} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <SyncButton busy={busy} onClick={handleSync} />
        <Button variant="ghost" className="sm:w-auto" onClick={handleDisconnect} disabled={busy}>
          <Link2Off size={15} />
          Desconectar
        </Button>
      </div>

      <BackupList items={files.map((file) => ({ id: file.fileId, name: file.name, size: file.size, updatedAt: file.modifiedTime }))} />

      <StorageError message={error} />

      <StorageNote>
        Asternal nunca borra tus juegos locales: Drive es una copia extra. Si borras un borrador aquí, su copia de Drive
        no se vuelve a descargar.
      </StorageNote>
    </div>
  );
}
