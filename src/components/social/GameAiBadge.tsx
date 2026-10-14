import { useState } from "react";
import { Clock3, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { requestGameReverification } from "@/lib/social/api";
import {
  AI_STATUS_LABEL,
  readGameAiState,
  type AiStatus,
} from "@/lib/social/game-review";

const STYLES: Record<AiStatus, string> = {
  pendiente: "border-warn/30 bg-warn/10 text-warn-ink",
  no_ia: "border-success/30 bg-success/10 text-success-ink",
  ia: "border-destructive/30 bg-destructive/10 text-error-ink",
};

const ICONS: Record<AiStatus, React.ReactNode> = {
  pendiente: <Clock3 size={11} />,
  no_ia: <ShieldCheck size={11} />,
  ia: <Sparkles size={11} />,
};

const MONEY: Record<AiStatus, string> = {
  pendiente: "· ganancias en espera",
  no_ia: "· ganancias activas",
  ia: "· sin ganancias",
};

/**
 * Estado de revisión/vibe coding de un juego publicado. El autor puede pedir
 * una nueva verificación cuando su juego quedó bloqueado por IA.
 */
export function GameAiBadge({
  preset,
  isAuthor,
  postId,
  onRefresh,
}: {
  preset?: Record<string, unknown> | null;
  isAuthor?: boolean;
  postId: string;
  onRefresh?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const ai = readGameAiState(preset ?? null);
  if (!ai) return null;

  const requestNewReview = async () => {
    setBusy(true);
    try {
      await requestGameReverification(postId);
      toast.success("Verificación solicitada: tu juego vuelve a revisión.");
      onRefresh?.();
    } catch (e) {
      toast.error((e as Error).message || "No se pudo solicitar la verificación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-display font-semibold tracking-wide ${STYLES[ai.status]}`}
      >
        {ICONS[ai.status]} {AI_STATUS_LABEL[ai.status]}
      </span>
      <span className="text-[10px] text-muted-foreground">{MONEY[ai.status]}</span>
      {isAuthor && ai.status !== "no_ia" && (
        <button
          type="button"
          onClick={requestNewReview}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary active:scale-95 transition disabled:opacity-60"
        >
          {busy && <Loader2 size={10} className="animate-spin" />}
          Pedir verificación
        </button>
      )}
    </div>
  );
}
