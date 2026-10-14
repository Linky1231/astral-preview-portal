import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addComment, deleteComment, fetchComments, toggleReaction, reportContent, type CommentRow } from "@/lib/social/api";
import { Avatar } from "./Avatar";

export function CommentSection({ postId, myId, isMod, onChange }: {
  postId: string; myId: string | null; isMod: boolean; onChange: () => void;
}) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const reload = async () => setRows(await fetchComments(postId));
  useEffect(() => { reload(); }, [postId]);

  const send = async (parentId?: string, text?: string) => {
    const v = (text ?? content).trim();
    if (!v || sending) return;
    setSending(true);
    try {
      await addComment(postId, v, parentId);
      if (!parentId) setContent("");
      await reload();
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al comentar");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Compose */}
      <div className="flex gap-2">
        <input value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Escribe un comentario…"
          className="flex-1 bg-input/40 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-shadow" />
        <button type="button" onClick={() => send()}
          disabled={!content.trim() || sending}
          className="text-[10px] font-semibold px-3 py-1.5 rounded-xl bg-primary text-primary-foreground active:scale-[0.96] transition-all duration-200 disabled:opacity-40 shrink-0">
          {sending ? "…" : "Enviar"}
        </button>
      </div>
      {/* List */}
      <ul className="space-y-2">
        {rows.map(c => (
          <CommentItem key={c.id} c={c} myId={myId} isMod={isMod} onReply={(t) => send(c.id, t)} onChanged={reload} />
        ))}
      </ul>
    </div>
  );
}

function CommentItem({ c, myId, isMod, onReply, onChanged }: {
  c: CommentRow; myId: string | null; isMod: boolean;
  onReply: (text: string) => void; onChanged: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const mine = myId === c.author_id;
  const canDel = mine || isMod;
  const isDeleted = !!c.deleted_at;

  const like = async () => {
    await toggleReaction({ commentId: c.id, type: "like" });
    onChanged();
  };
  const del = () => {
    toast("¿Borrar comentario?", {
      description: "Se eliminará este comentario.",
      action: {
        label: "Borrar",
        onClick: async () => {
          try {
            await deleteComment(c.id);
            toast.success("Comentario borrado");
            onChanged();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error");
          }
        },
      },
    });
  };
  const report = () => {
    toast("Reportar comentario", {
      description: "Señalará este comentario a los moderadores.",
      action: {
        label: "Reportar",
        onClick: async () => {
          try {
            await reportContent({ commentId: c.id, reason: "Reporte desde el feed" });
            toast.success("Reporte enviado");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error");
          }
        },
      },
    });
  };

  return (
    <li className="text-xs group/comment">
      <div className="flex gap-2">
        <Avatar p={c.author} size={24} className="mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="bg-muted/25 rounded-xl px-2.5 py-1.5">
            <div className="text-[10px] font-semibold text-foreground/80 mb-0.5">@{c.author?.username ?? "?"}</div>
            <div className="text-foreground/70 break-words leading-relaxed">{isDeleted ? <em className="text-muted-foreground/60">[borrado]</em> : c.content}</div>
          </div>
          {!isDeleted && (
            <div className="flex gap-3 text-[10px] text-muted-foreground/60 mt-1 px-1">
              <button type="button" onClick={like}
                className={`transition-colors ${c.my_like ? "text-primary font-semibold" : "hover:text-primary"}`}>
                ♥ {c.likes ?? 0}
              </button>
              <button type="button" onClick={() => setReplyOpen(o => !o)}
                className="hover:text-foreground transition-colors">Responder</button>
              {canDel && <button type="button" onClick={del} className="hover:text-destructive transition-colors">Borrar</button>}
              {!mine && <button type="button" onClick={report} className="hover:text-foreground transition-colors">Reportar</button>}
            </div>
          )}
          {replyOpen && (
            <div className="flex gap-2 mt-2">
              <input value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { onReply(reply); setReply(""); setReplyOpen(false); } }}
                placeholder="Responder…"
                className="flex-1 bg-input/40 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40" />
              <button type="button" onClick={() => { onReply(reply); setReply(""); setReplyOpen(false); }}
                disabled={!reply.trim()}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-xl bg-primary text-primary-foreground active:scale-[0.96] transition disabled:opacity-40">
                OK
              </button>
            </div>
          )}
          {c.replies && c.replies.length > 0 && (
            <ul className="mt-2 pl-2 border-l-2 border-border/30 space-y-2">
              {c.replies.map(r => (
                <CommentItem key={r.id} c={r} myId={myId} isMod={isMod} onReply={onReply} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
