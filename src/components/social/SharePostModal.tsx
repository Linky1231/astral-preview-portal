import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Send, Users, MessageCircle, Globe, Link2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchMyDmChats,
  fetchMyGroupChats,
  getCommunityChat,
  sendChatMessage,
  type DmChat,
  type GroupChat,
} from "@/lib/social/chat";
import { serializePostShare, type PostShareInput } from "@/lib/social/post-share";

type ShareTarget =
  | { kind: "community"; chatId: string; name: string }
  | { kind: "dm"; chatId: string; name: string; username: string; avatarUrl: string | null }
  | { kind: "group"; chatId: string; name: string; memberCount: number };

export function SharePostModal({
  post,
  open,
  onClose,
}: {
  post: PostShareInput;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [community, setCommunity] = useState<ShareTarget | null>(null);
  const [dms, setDms] = useState<(ShareTarget & { kind: "dm"; username: string })[]>([]);
  const [groups, setGroups] = useState<ShareTarget[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setQuery("");
    (async () => {
      try {
        const [dmChats, groupChats, commChat] = await Promise.all([
          fetchMyDmChats().catch(() => [] as DmChat[]),
          fetchMyGroupChats().catch(() => [] as GroupChat[]),
          getCommunityChat().catch(() => null),
        ]);
        if (commChat?.id) {
          setCommunity({ kind: "community", chatId: commChat.id, name: commChat.name });
        }
        setDms(
          dmChats
            .filter((d) => d.chat_id && d.other)
            .map((d) => ({
              kind: "dm" as const,
              chatId: d.chat_id,
              name: d.other!.display_name || d.other!.username,
              username: d.other!.username,
              avatarUrl: d.other!.avatar_url,
            }))
        );
        setGroups(
          groupChats
            .filter((g) => g.chat_id)
            .map((g) => ({
              kind: "group" as const,
              chatId: g.chat_id,
              name: g.name,
              memberCount: g.member_count,
            }))
        );
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const shareUrl = `${window.location.origin}/feed?p=${post.post.id}`;
  const shareText = serializePostShare({
    ...post,
    post: { ...post.post, sourceUrl: post.post.sourceUrl || shareUrl },
  });

  const handleShare = async (target: ShareTarget) => {
    setSending(target.chatId);
    try {
      if (target.kind === "community") {
        await sendChatMessage(target.chatId, { content: shareText });
      } else if (target.kind === "dm") {
        await sendChatMessage(target.chatId, { content: shareText });
      } else {
        await sendChatMessage(target.chatId, { content: shareText });
      }
      toast.success(`Compartido en ${target.name}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al compartir");
    } finally {
      setSending(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const q = query.toLowerCase();
  const filteredDms = dms.filter(
    (d) =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.username.toLowerCase().includes(q)
  );
  const filteredGroups = groups.filter(
    (g) => !q || g.name.toLowerCase().includes(q)
  );
  const showCommunity = community && (!q || community.name.toLowerCase().includes(q) || "comunidad".includes(q))
    ? community
    : null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120]"
          style={{ height: "100dvh" }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px] sm:bg-foreground/35" />

          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 h-[100dvh] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:w-full sm:max-w-md sm:max-h-[min(85vh,85dvh)] sm:-translate-x-1/2 sm:-translate-y-1/2 bg-background border-0 sm:border sm:border-border/70 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/50">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/15 grid place-items-center shrink-0">
                <Send size={17} className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold">Compartir publicación</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Elige el chat donde quieres enviarla
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-2xl grid place-items-center border border-border/60 bg-muted/25 hover:bg-muted/60 transition-colors"
                aria-label="Cerrar selector para compartir"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-5 pt-4 pb-3">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar chat..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/30 border border-border/50 text-xs outline-none focus:border-primary/40 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Cargando chats…
                </div>
              ) : (
                <>
                  {showCommunity && (
                    <>
                      <ShareSectionLabel icon={<Globe size={12} />} label="Chat comunitario" />
                      <ShareRow target={showCommunity} sending={sending} onShare={handleShare} />
                    </>
                  )}

                  <ShareSectionLabel icon={<Users size={12} />} label="Chats grupales" />
                  {filteredGroups.length > 0 ? (
                    <>
                      {filteredGroups.map((g) => (
                        <ShareRow
                          key={g.chatId}
                          target={g}
                          sending={sending}
                          onShare={handleShare}
                        />
                      ))}
                    </>
                  ) : !query ? (
                    <div className="mx-3 rounded-xl border border-dashed border-border/55 bg-muted/15 px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
                      Aún no tienes chats grupales. Cuando formes parte de uno, aparecerá aquí como destino para compartir.
                    </div>
                  ) : null}

                  {filteredDms.length > 0 && (
                    <>
                      <ShareSectionLabel icon={<MessageCircle size={12} />} label="Mensajes directos" />
                      {filteredDms.map((d) => (
                        <ShareRow
                          key={d.chatId}
                          target={d}
                          sending={sending}
                          onShare={handleShare}
                        />
                      ))}
                    </>
                  )}

                  {!loading &&
                    filteredDms.length === 0 &&
                    filteredGroups.length === 0 &&
                    !showCommunity && (
                      <div className="text-center py-8 text-xs text-muted-foreground/50">
                        No hay chats disponibles
                      </div>
                    )}

                  <div className="pt-3 mt-2 border-t border-border/45">
                    <button
                      onClick={copyLink}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/45 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-muted/70 border border-border/50 grid place-items-center shrink-0">
                        <Link2 size={15} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">Copiar enlace</div>
                        <div className="text-[10px] text-muted-foreground truncate">Compartir fuera de Asternal</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ShareSectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-muted-foreground/65">
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
    </div>
  );
}

function ShareRow({
  target,
  sending,
  onShare,
}: {
  target: ShareTarget;
  sending: string | null;
  onShare: (t: ShareTarget) => void;
}) {
  const isSending = sending === target.chatId;
  const icon =
    target.kind === "community" ? (
      <Globe size={15} className="text-primary" />
    ) : target.kind === "group" ? (
      <Users size={15} className="text-primary" />
    ) : (
      <MessageCircle size={15} className="text-primary" />
    );
  const subtitle =
    target.kind === "community"
      ? "Enviar a toda la comunidad"
      : target.kind === "group"
        ? `${target.memberCount} miembros`
        : `@${target.kind === "dm" ? target.username : ""}`;

  return (
    <button
      onClick={() => onShare(target)}
      disabled={isSending}
      className="group w-full flex items-center gap-3 px-3 py-3 rounded-2xl border border-border/55 bg-muted/25 hover:bg-muted/55 hover:border-primary/25 transition-[background-color,border-color,transform] duration-200 ease-out active:scale-[0.985] text-left disabled:opacity-50"
    >
      <div className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{target.name}</div>
        <div className="text-[10px] text-muted-foreground">{subtitle}</div>
      </div>
      <div className="shrink-0">
        {isSending ? (
          <Loader2 size={14} className="animate-spin text-primary" />
        ) : (
          <Send
            size={14}
            className="text-muted-foreground/30 group-hover:text-primary transition-colors"
          />
        )}
      </div>
    </button>
  );
}
