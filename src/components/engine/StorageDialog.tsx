import { useState } from "react";
import { Database, HardDrive, HardDriveDownload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StorageDriveSection } from "./StorageDriveSection";
import { StorageFirebaseSection } from "./StorageFirebaseSection";

type StorageProviderId = "firebase" | "drive";

const PROVIDERS: { id: StorageProviderId; label: string; icon: React.ReactNode }[] = [
  { id: "firebase", label: "Firebase", icon: <Database size={13} /> },
  { id: "drive", label: "Google Drive", icon: <HardDrive size={13} /> },
];

/**
 * Espacio extra para los juegos: el navegador solo guarda ~5 MB, así que aquí se
 * elige dónde vive la copia de cada proyecto.
 *
 *   · Firebase — el bucket del proyecto, con cuenta anónima. Sin configurar
 *     nada por parte de quien juega, pero atado a ese navegador.
 *   · Google Drive — la carpeta del propio Drive de la persona. Requiere
 *     conectar su cuenta, y a cambio puede abrir sus juegos en cualquier
 *     dispositivo.
 *
 * Las dos son copias: el proyecto sigue viviendo en el navegador y nunca se
 * borra solo por sincronizar.
 */
export function StorageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [provider, setProvider] = useState<StorageProviderId>("firebase");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <HardDriveDownload size={16} className="text-primary" />
            Espacio extra
          </DialogTitle>
          <DialogDescription>
            Guarda una copia de tus juegos fuera del navegador para tener más espacio y no perderlos.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Dónde guardar">
            {PROVIDERS.map((item) => {
              const selected = item.id === provider;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setProvider(item.id)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          {/* Ambas secciones se montan con `active` para que solo la visible
              consulte su estado: cambiar de pestaña no dispara red de la otra. */}
          <div className={provider === "firebase" ? "" : "hidden"}>
            <StorageFirebaseSection active={open && provider === "firebase"} />
          </div>
          <div className={provider === "drive" ? "" : "hidden"}>
            <StorageDriveSection active={open && provider === "drive"} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
