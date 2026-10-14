import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudDownload, Database, ShieldCheck, Upload } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/engine/remote-backup";
import {
  DEFAULT_FIREBASE_CONFIG,
  FIREBASE_ENV_KEYS,
  STORAGE_RULES,
  firebaseErrorMessage,
  isFirebaseConfigured,
} from "@/lib/engine/firebase-app";
import { loadFirebaseOverview, syncProjectsToFirebase, type FirebaseBackup } from "@/lib/engine/firebase-sync";
import {
  BackupList,
  SetupNotice,
  StorageAccountRow,
  StorageError,
  StorageNote,
  SyncButton,
} from "./storage-ui";

/** Copia de las reglas del bucket para pegarlas en la consola de Firebase. */
function RulesBlock() {
  return (
    <details className="rounded-xl border border-border/70 bg-surface px-3.5 py-2.5">
      <summary className="cursor-pointer font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Reglas del bucket (una sola vez)
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Firebase → Storage → Reglas. Cada cuenta solo puede leer y escribir su propia carpeta. El archivo{" "}
        <b className="text-foreground">storage.rules</b> del repositorio las despliega con{" "}
        <b className="text-foreground">bun run deploy:rules</b>.
      </p>
      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-input/40 p-2 font-mono text-[10px] leading-relaxed text-foreground">
        {STORAGE_RULES}
      </pre>
    </details>
  );
}

/**
 * Sección de Firebase Storage: el espacio del proyecto, con cuenta anónima.
 *
 * A diferencia de Drive, aquí no hay nada que conectar: la primera vez se crea
 * una cuenta anónima y el navegador la recuerda. La contrapartida (espacio por
 * navegador, no por persona) se explica en el propio panel.
 */
export function StorageFirebaseSection({ active }: { active: boolean }) {
  const configured = isFirebaseConfigured();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [files, setFiles] = useState<FirebaseBackup[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);

  const applyOverview = useCallback((overview: Awaited<ReturnType<typeof loadFirebaseOverview>>) => {
    if (!overview) {
      setUid(null);
      return;
    }
    setUid(overview.uid);
    setFiles(overview.files);
    setUsedBytes(overview.usedBytes);
  }, []);

  // Igual que en Drive: el estado se toca después del primer `await` para no
  // provocar un render en cascada al abrir el panel.
  useEffect(() => {
    if (!active || !configured) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const overview = await loadFirebaseOverview();
        if (cancelled) return;
        applyOverview(overview);
      } catch (err) {
        if (!cancelled) setError(firebaseErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, configured, applyOverview]);

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await syncProjectsToFirebase();
      applyOverview(await loadFirebaseOverview());
      toast.success("Firebase al día", {
        description: `${result.pushed} guardados · ${result.pulled} recuperados · ${result.total} en el bucket.`,
      });
    } catch (err) {
      const message = firebaseErrorMessage(err);
      setError(message);
      toast.error("No se pudo sincronizar con Firebase", { description: message });
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <SetupNotice title="Falta el proyecto de Firebase">
        Añade <b className="text-foreground">{FIREBASE_ENV_KEYS.apiKey}</b> y{" "}
        <b className="text-foreground">{FIREBASE_ENV_KEYS.storageBucket}</b> en Keys para usar otro proyecto. Con el
        proyecto por defecto ({DEFAULT_FIREBASE_CONFIG.projectId}) ya funciona sin configurar nada.
      </SetupNotice>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
        <Spinner /> Abriendo tu espacio de Firebase…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {uid ? (
        <StorageAccountRow
          icon={<Database size={16} />}
          title="Cuenta anónima de Firebase"
          subtitle={`${uid.slice(0, 12)}… · ${files.length} ${files.length === 1 ? "copia" : "copias"} · ${formatBytes(usedBytes)}`}
        />
      ) : (
        <ul className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <Upload size={14} className="mt-0.5 shrink-0 text-primary" />
            <span>
              Tus juegos se guardan en el bucket del proyecto: te libera los ~5 MB del navegador y sus imágenes y sonidos
              ya no compiten por ese espacio.
            </span>
          </li>
          <li className="flex gap-2">
            <CloudDownload size={14} className="mt-0.5 shrink-0 text-primary" />
            <span>
              Al pulsar SINCRONIZAR se crea una cuenta anónima (sin correo ni contraseña) y se suben los proyectos que
              aún no tengan copia.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
            <span>
              Cada cuenta solo puede leer y escribir su propia carpeta: las reglas del bucket usan el id de la cuenta
              anónima, no un nombre que se pueda escribir a mano.
            </span>
          </li>
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <SyncButton busy={busy} onClick={handleSync} />
      </div>

      <BackupList
        items={files.map((file) => ({ id: file.remoteId, name: file.name, size: file.size, updatedAt: file.updatedAt }))}
      />

      <StorageError message={error} />

      <RulesBlock />

      <StorageNote>
        Este espacio pertenece a este navegador: la cuenta anónima no se puede usar en otro dispositivo. Para llevar tus
        juegos a otro equipo, usa la pestaña de Google Drive. Si borras los datos del sitio, se pierde el acceso a las
        copias (siguen en el bucket hasta que las borres en la consola).
      </StorageNote>
    </div>
  );
}
