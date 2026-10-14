import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Send, Users, MessageCircle, Globe, Search, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  fetchMyDmChats,
  fetchMyGroupChats,
  getCommunityChat,
  sendChatMessage,
  type DmChat,
  type GroupChat,
} from "@/lib/social/chat";
import { serializePortfolioShare } from "@/lib/social/portfolio-share";
import type { Profile } from "@/lib/social/api";
import type { Portfolio } from "./PortfolioPanel";

type ShareTarget =
  | { kind: "community"; chatId: string; name: string }
  | { kind: "dm"; chatId: string; name: string; username: string }
  | { kind: "group"; chatId: string; name: string; memberCount: number };

export function SharePortfolioModal({
  portfolio,
  profile,
  open,
  onClose,
}: {
  portfolio: Portfolio | null;
  profile: Profile;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [community, setCommunity] = useState<ShareTarget | null>(null);
  const [dms, setDms] = useState<Extract<ShareTarget, { kind: "dm" }>[]>([]);
  const [groups, setGroups] = useState<Extract<ShareTarget, { kind: "group" }>[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setQuery("");
    (async () => {
      const [dmChats, groupChats, commChat] = await Promise.all([
        fetchMyDmChats().catch(() => [] as DmChat[]),
        fetchMyGroupChats().catch(() => [] as GroupChat[]),
        getCommunityChat().catch(() => null),
      ]);
      if (!alive) return;
      setCommunity(commChat?.id ? { kind: "community", chatId: commChat.id, name: commChat.name } : null);
      setDms(
        dmChats
          .filter((chat) => chat.chat_id && chat.other)
          .map((chat) => ({
            kind: "dm" as const,
            chatId: chat.chat_id,
            name: chat.other!.display_name || chat.other!.username || "Mensaje directo",
            username: chat.other!.username || "",
          }))
      );
      setGroups(
        groupChats
          .filter((chat) => chat.chat_id)
          .map((chat) => ({
            kind: "group" as const,
            chatId: chat.chat_id,
            name: chat.name,
            memberCount: chat.member_count,
          }))
      );
      setLoading(false);
    })().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const handleShare = async (target: ShareTarget) => {
    if (!portfolio) return;
    setSending(target.chatId);
    try {
      const payload = serializePortfolioShare({
        owner: {
          id: profile.id,
          displayName: profile.display_name || profile.username || "Creador de Asternal",
          username: profile.username || "",
        },
        portfolio,
      });
      await sendChatMessage(target.chatId, { content: payload });
      toast.success(`Portafolio compartido en ${target.name}`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo compartir el Portafolio");
    } finally {
      setSending(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filteredDms = dms.filter((chat) => !q || chat.name.toLowerCase().includes(q) || chat.username.toLowerCase().includes(q));
  const filteredGroups = groups.filter((chat) => !q || chat.name.toLowerCase().includes(q));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-stretch sm:items-center sm:justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Compartir Portafolio"
        >
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="w-full h-[100dvh] sm:h-auto sm:max-w-md rounded-none sm:rounded-2xl border-0 sm:border sm:border-primary/20 bg-surface/95 shadow-xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/50 shrink-0">
              <div className="w-9 h-9 rounded-xl grad-brand text-primary-foreground grid place-items-center shrink-0">
                <Trophy size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-display font-semibold">Compartir Portafolio</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">Elige dónde mostrar tu trabajo</div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-foreground active:scale-95 transition" aria-label="Cerrar">
                <X size={15} />
              </button>
            </div>

            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar un chat..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/30 border border-border/60 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Cargando chats…</div>
              ) : (
                <>
                  {community && <ShareRow target={community} sending={sending} onShare={handleShare} />}
                  {filteredGroups.length > 0 && (
                    <ShareSection title="Grupos" icon={<Users size={11} />}>{filteredGroups.map((chat) => <ShareRow key={chat.chatId} target={chat} sending={sending} onShare={handleShare} />)}</ShareSection>
                  )}
                  {filteredDms.length > 0 && (
                    <ShareSection title="Mensajes directos" icon={<MessageCircle size={11} />}>{filteredDms.map((chat) => <ShareRow key={chat.chatId} target={chat} sending={sending} onShare={handleShare} />)}</ShareSection>
                  )}
                  {!community && filteredGroups.length === 0 && filteredDms.length === 0 && (
                    <div className="text-center py-10 text-xs text-muted-foreground/70">No hay chats disponibles todavía</div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShareSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="pt-2"><div className="flex items-center gap-2 px-3 pb-1 text-[10px] font-semibold text-muted-foreground/65 uppercase tracking-wider">{icon}{title}</div>{children}</div>;
}

function ShareRow({ target, sending, onShare }: { target: ShareTarget; sending: string | null; onShare: (target: ShareTarget) => void }) {
  const pending = sending === target.chatId;
  const Icon = target.kind === "community" ? Globe : target.kind === "group" ? Users : MessageCircle;
  const subtitle = target.kind === "community" ? "Comunidad" : target.kind === "group" ? `${target.memberCount} miembros` : `@${target.username}`;
  return (
    <button onClick={() => onShare(target)} disabled={pending} className="m3-list-item border border-line text-foreground disabled:opacity-55">
      <div className="w-9 h-9 rounded-xl !bg-muted text-primary grid place-items-center shrink-0"><Icon size={15} /></div>
      <div className="min-w-0 flex-1"><div className="text-xs font-medium text-foreground truncate">{target.name}</div><div className="text-[10px] text-muted-foreground/90">{subtitle}</div></div>
      {pending ? <Loader2 size={14} className="animate-spin text-primary shrink-0" /> : <Send size={14} className="text-muted-foreground/80 shrink-0" />}
    </button>
  );
}
