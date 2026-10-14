import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { countUnreadNotifications } from "@/lib/social/api";
import { NotificationsPanel } from "./NotificationsPanel";
import { supabase } from "@/integrations/supabase/client";

/**
 * Campana de notificaciones: muestra el contador de no leídas en la cabecera y
 * abre el panel completo de estadísticas (NotificationsPanel) al tocarla.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
    try {
      setUnread(await countUnreadNotifications());
    } catch { /* noop */ }
  };

  // Carga inicial + refresco periódico + realtime (se sincroniza entre dispositivos).
  useEffect(() => {
    reload();
    const t = setInterval(reload, 45000);
    const onNotificationsChanged = () => { void reload(); };
    window.addEventListener("asternal-notifications:changed", onNotificationsChanged);
    let channel: unknown;
    try {
      if (typeof supabase.channel === "function") {
        channel = (supabase as any)
          .channel("my-notifications-count")
          .on("postgres_changes", { schema: "public", table: "notifications", event: "INSERT" }, () => { void reload(); })
          .on("postgres_changes", { schema: "public", table: "notifications", event: "UPDATE" }, () => { void reload(); });
        (channel as any).subscribe?.();
      }
    } catch {
      /* cliente local: sin realtime */
    }
    return () => {
      clearInterval(t);
      window.removeEventListener("asternal-notifications:changed", onNotificationsChanged);
      try {
        (supabase as any).removeChannel?.(channel);
      } catch { /* noop */ }
    };
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(true)}
        title="Notificaciones"
        className="relative w-10 h-10 rounded-lg border border-line-strong bg-card grid place-items-center active:scale-95 transition text-ink-2 hover:bg-muted/60 hover:text-foreground shrink-0"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-mono rounded-full min-w-4 h-4 px-0.5 grid place-items-center animate-in zoom-in">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && <NotificationsPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
