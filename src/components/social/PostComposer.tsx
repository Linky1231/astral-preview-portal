import { useState, useEffect, useRef, useCallback } from "react";
import { Avatar } from "./Avatar";
import { Button } from "@/components/ui/button";
import { createPost, fetchMyGamesLite, getMyProfile, type MediaType, type Profile } from "@/lib/social/api";
import { reviewPost } from "@/lib/moderation/engine";
import { filterStateClass } from "@/lib/ui/filter-control";
import {
  Image as ImageIcon, Film, Link as LinkIcon, X, Send, Loader2, Tag,
  FileText, Code2, Palette, BarChart3, Lock, Gamepad2, Plus, Trash2, Share2, Sparkles,
} from "lucide-react";

type Poll = { question: string; options: string[] };

// === Constants ===
const MAX_MEDIA_FILES = 5;
const MAX_DOC_FILES = 5;
const MAX_DOC_SIZE_MB = 25;
const MAX_TAGS = 10;
const TAG_REGEX = /^[a-zA-Z0-9_\u00C0-\u017F]+$/;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED_DOC_MIMES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "application/zip", "text/csv",
  "application/x-7z-compressed", "application/x-rar-compressed",
  "application/json", "text/json",
]);
const DRAFT_KEY = "asternal_post_draft";

// === Auto-draft helpers ===
type DraftData = {
  content: string;
  linkUrl: string;
  tagInput: string;
  htmlContent: string;
  textColor: string;
  lockedContent: string;
  unlockGoal: number | "";
  unlockAt: string;
  pinnedGameId: string;
  postTypes: string[];
  panels: string[];
};

function saveDraft(d: DraftData) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota */ }
}
function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// === Email color validator (safe CSS color) ===
function isValidCssColor(c: string): boolean {
  if (!c) return false;
  if (HEX_COLOR_REGEX.test(c)) return true;
  // Allow named CSS colors and rgb/hsl
  if (/^(rgb|hsl)a?\([^)]+\)$/i.test(c)) return true;
  const s = new Option().style;
  s.color = c;
  return s.color !== "";
}

// === MIME validator for documents ===
function isAllowedDocMime(f: File): boolean {
  if (ALLOWED_DOC_MIMES.has(f.type)) return true;
  // Fallback: check extension for cases where browser sets empty MIME
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain", csv: "text/csv", zip: "application/zip",
    rar: "application/x-rar-compressed", "7z": "application/x-7z-compressed",
    json: "application/json", ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return !!extMap[ext];
}

export function PostComposer({ onCreated }: { onCreated: () => void }) {
  // === Load draft on mount ===
  const draft = useRef(loadDraft());

  const [me, setMe] = useState<Profile | null>(null);
  const [content, setContent] = useState(draft.current?.content ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [linkUrl, setLinkUrl] = useState(draft.current?.linkUrl ?? "");
  const [tagInput, setTagInput] = useState(draft.current?.tagInput ?? "");
  const [documents, setDocuments] = useState<File[]>([]);
  const [htmlContent, setHtmlContent] = useState(draft.current?.htmlContent ?? "");
  const [textColor, setTextColor] = useState<string>(draft.current?.textColor ?? "");
  const [poll, setPoll] = useState<Poll | null>(null);
  const [lockedContent, setLockedContent] = useState(draft.current?.lockedContent ?? "");
  const [unlockGoal, setUnlockGoal] = useState<number | "">(draft.current?.unlockGoal ?? "");
  const [unlockAt, setUnlockAt] = useState(draft.current?.unlockAt ?? "");
  const [pinnedGameId, setPinnedGameId] = useState<string>(draft.current?.pinnedGameId ?? "");
  const [postTypes, setPostTypes] = useState<string[]>(draft.current?.postTypes ?? []);
  const [myGames, setMyGames] = useState<{ id: string; title: string }[]>([]);
  const [panels, setPanels] = useState<Set<string>>(() => {
    const saved = draft.current?.panels;
    return saved ? new Set(saved) : new Set<string>();
  });
  const togglePanel = (id: string) => setPanels(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < 3) {
      next.add(id);
    }
    return next;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!!(
    draft.current?.content || draft.current?.linkUrl || draft.current?.htmlContent
  ));
  const [submitting, setSubmitting] = useState(false);

  // === Auto-save draft ===
  useEffect(() => {
    if (submitting) return; // Don't save while submitting
    const timer = setTimeout(() => {
      saveDraft({
        content, linkUrl, tagInput, htmlContent, textColor,
        lockedContent, unlockGoal, unlockAt, pinnedGameId, postTypes,
        panels: Array.from(panels),
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [content, linkUrl, tagInput, htmlContent, textColor, lockedContent,
      unlockGoal, unlockAt, pinnedGameId, postTypes, panels, submitting]);

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach(URL.revokeObjectURL); };
  }, [files]);

  useEffect(() => { fetchMyGamesLite().then(setMyGames).catch(() => { /* ignore */ }); }, []);
  useEffect(() => { getMyProfile().then(setMe).catch(() => { /* ignore */ }); }, []);

  const onMedia = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    if (files.length + list.length > MAX_MEDIA_FILES) {
      setErr(`Máximo ${MAX_MEDIA_FILES} archivos multimedia. Tienes ${files.length} + ${list.length} = ${files.length + list.length}.`);
      e.target.value = "";
      return;
    }
    setFiles(prev => [...prev, ...list]);
    setMediaType(kind);
    setExpanded(true);
    e.target.value = "";
  };

  const onDocs = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    // Validate MIME types
    const invalid = list.find(f => !isAllowedDocMime(f));
    if (invalid) {
      setErr(`"${invalid.name}" no es un tipo de archivo permitido.`);
      e.target.value = "";
      return;
    }
    const oversize = list.find(f => f.size > MAX_DOC_SIZE_MB * 1024 * 1024);
    if (oversize) { setErr(`"${oversize.name}" supera ${MAX_DOC_SIZE_MB} MB`); e.target.value = ""; return; }
    if (documents.length + list.length > MAX_DOC_FILES) {
      setErr(`Máximo ${MAX_DOC_FILES} documentos. Tienes ${documents.length} + ${list.length} = ${documents.length + list.length}.`);
      e.target.value = "";
      return;
    }
    setDocuments(prev => [...prev, ...list]);
    setExpanded(true);
    e.target.value = "";
  };

  const removeFile = (i: number) => {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    if (!next.length) setMediaType("none");
  };

  // === Tag validation ===
  const parseTags = useCallback((): string[] => {
    return tagInput
      .split(/[,]+/)
      .map(t => t.trim().replace(/^#/, "").toLowerCase())
      .filter(t => t.length > 0 && t.length <= 30 && TAG_REGEX.test(t))
      .slice(0, MAX_TAGS);
  }, [tagInput]);

  const tagCount = parseTags().length;
  const tagOverLimit = tagInput.split(/[,]+/).filter(t => t.trim()).length > MAX_TAGS;

  // === Color validation ===
  const validColor = textColor ? isValidCssColor(textColor) : true;

  // === Pinned game validation ===
  const validPinnedGame = pinnedGameId
    ? myGames.some(g => g.id === pinnedGameId)
    : true;

  // === Poll validation ===
  const validPoll = poll
    ? poll.question.trim().length > 0 && poll.options.filter(o => o.trim()).length >= 2
    : true;

  // === Can submit ===
  const hasContent = content.trim() || files.length || linkUrl.trim() || htmlContent.trim() || documents.length || poll || pinnedGameId;
  const canSubmit = hasContent && !busy && !submitting && validColor && validPinnedGame && validPoll && !tagOverLimit;

  // === Submit with debounce ===
  const submit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setBusy(true);
    setErr(null);
    try {
      const tags = parseTags();
      // Moderación en código: listas de groserías, contenido sexual, odio,
      // amenazas, estafa, spam y datos personales, con detección de variaciones
      // (tildes, leetspeak, letras repetidas y palabras separadas). Sin IA.
      const review = reviewPost({
        content: content.trim(),
        tags: [...tags, ...postTypes],
        linkUrl: linkUrl.trim() || undefined,
        html: htmlContent.trim() || undefined,
        documentNames: documents.map(document => document.name).slice(0, MAX_DOC_FILES),
        pollQuestion: poll?.question.trim() || undefined,
        lockedContent: lockedContent.trim() || undefined,
      });
      if (!review.allowed) {
        throw new Error(review.reason || "Esta publicación no cumple las reglas de la comunidad.");
      }
      await createPost({
        content: content.trim(),
        files,
        mediaType: files.length ? mediaType : linkUrl ? "link" : "none",
        linkUrl: linkUrl.trim() || undefined,
        tags,
        textColor: textColor || null,
        htmlContent: htmlContent.trim() || null,
        documents,
        pinnedGameId: pinnedGameId || null,
        postType: postTypes.length ? postTypes.join(",") : null,
        lockedContent: lockedContent.trim() || null,
        unlockReactionsGoal: typeof unlockGoal === "number" ? unlockGoal : null,
        unlockAt: unlockAt || null,
        poll: validPoll ? poll : null,
      });
      // Reset everything
      setContent(""); setFiles([]); setLinkUrl(""); setTagInput("");
      setDocuments([]); setHtmlContent(""); setTextColor("");
      setPoll(null); setLockedContent(""); setUnlockGoal(""); setUnlockAt("");
      setPinnedGameId(""); setPostTypes([]); setPanels(new Set()); setExpanded(false);
      clearDraft();
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); setSubmitting(false); }
  }, [canSubmit, submitting, content, files, mediaType, linkUrl, parseTags,
      textColor, htmlContent, documents, pinnedGameId, postTypes, lockedContent,
      unlockGoal, unlockAt, validPoll, poll, onCreated]);

  const Chip = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <Button type="button" variant="ghost" onClick={onClick} title={title}
      className={`relative shrink-0 h-9 px-3 rounded-xl grid grid-flow-col auto-cols-max items-center gap-1.5 text-[11px] font-medium transition-[transform,color,border-color,background-color,box-shadow] duration-200 ease-[var(--ease-out-expo)] active:scale-[0.95] ${active ? "text-primary-foreground border border-transparent" : "!bg-muted/50 text-muted-foreground border border-border/40 hover:text-foreground hover:!bg-surface-2 hover:border-border/70"}`}>
      <span
        aria-hidden
        className="absolute inset-0 rounded-xl grad-brand transition-[opacity,transform] duration-200 ease-[var(--ease-out-expo)]"
        style={{ opacity: active ? 1 : 0, transform: active ? "scale(1)" : "scale(0.92)" }}
      />
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </Button>
  );

  const avatarEl = <Avatar p={me} size={40} className="ring-1 ring-border/60" />;

  return (
    <div className={`post-composer panel relative isolate min-w-0 rounded-2xl border bg-card transition-all duration-300 ${expanded ? "border-primary/35 " : "border-border/60 shadow-sm hover:border-primary/25 hover:shadow-md"}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-0 h-[3px] grad-brand-fade rounded-full opacity-80" />
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2.5">
          {avatarEl}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="¿Qué quieres compartir?"
            aria-label="Texto de la publicación"
            rows={expanded ? 3 : 1}
            maxLength={2000}
            style={textColor ? { color: textColor } : undefined}
            className="min-w-0 w-full flex-1 bg-transparent rounded-md text-base sm:text-sm resize-none outline-none placeholder:text-muted-foreground p-2 leading-relaxed transition-all"
          />
        </div>

        {/* Media previews */}
        {previews.length > 0 && (
          <div className={`grid gap-2 ${previews.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {previews.map((url, i) => (
              <div key={url} className="relative rounded-xl overflow-hidden bg-muted/30 border border-border/50 group/media">
                {mediaType === "video" ? <video src={url} className="w-full max-h-64 object-cover" muted /> : <img src={url} alt="" className="w-full max-h-64 object-cover transition-transform duration-500 group-hover/media:scale-[1.02]" />}
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar archivo ${i + 1}`} onClick={() => removeFile(i)} className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-popover text-popover-foreground grid place-items-center active:scale-[0.92] transition-transform duration-200 ease-out shadow-md backdrop-blur-sm">
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <div className="space-y-1.5">
            {documents.map((d, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-input/40 rounded-xl px-3 py-2 text-xs border border-border/50">
                <span className="w-7 h-7 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                  <FileText size={13} className="text-primary" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span className="text-muted-foreground tabular-nums">{(d.size / 1024).toFixed(0)}KB</span>
                <Button type="button" variant="ghost" aria-label={`Quitar documento ${d.name}`} onClick={() => setDocuments(documents.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive transition-[transform,color] duration-200 ease-out active:scale-[0.92]">
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* === Panels === */}

        {panels.has("link") && (
          <div className="flex items-center gap-2 bg-input/40 rounded-xl px-3 py-2 animate-in fade-in slide-in-from-top-1 border border-border/50">
            <LinkIcon size={14} className="text-muted-foreground" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
              className="min-w-0 w-full flex-1 bg-transparent text-base sm:text-sm px-1 py-1 outline-none" />
          </div>
        )}

        {panels.has("type") && (
          <div className="bg-input/40 rounded-xl px-3 py-2 space-y-2 border border-border/50">
            <div className="text-xs font-medium flex items-center gap-2"><Share2 size={13} className="text-primary" /> ¿Qué estás compartiendo?</div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["update", "Actualización"],
                ["progress", "Progreso"],
                ["tutorial", "Tutorial"],
                ["question", "Pregunta"],
                ["resource", "Recurso"],
                ["achievement", "Logro"],
                ["announcement", "Anuncio"],
              ] as const).map(([val, label]) => {
                const active = postTypes.includes(val);
                return (
                  <Button type="button" variant="ghost" key={val} onClick={() => setPostTypes(prev => active ? prev.filter(t => t !== val) : [...prev, val])}
                    className={`h-7 px-2.5 rounded-lg text-[10px] font-semibold border transition-all ${filterStateClass(active)}`}>
                    {active && <span className="mr-1">✓</span>}{label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {panels.has("tags") && (
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 bg-input/40 rounded-xl px-3 py-2 border border-border/50">
              <Tag size={14} className="text-muted-foreground" />
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                placeholder="etiquetas separadas por coma (máx. 10)"
                className="min-w-0 w-full flex-1 bg-transparent text-base sm:text-sm px-1 py-1 outline-none" />
            </div>
            {tagOverLimit && (
              <div className="text-[10px] text-destructive px-1">Máximo {MAX_TAGS} etiquetas</div>
            )}
            {tagCount > 0 && !tagOverLimit && (
              <div className="text-[10px] text-muted-foreground px-1">{tagCount}/{MAX_TAGS} etiquetas válidas</div>
            )}
          </div>
        )}

        {panels.has("color") && (
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3 bg-input/40 rounded-xl px-3 py-2 text-xs border border-border/50">
              <Palette size={14} className="text-muted-foreground" />
              <span>Color del texto:</span>
              <input type="color" value={textColor || "#111827"} onChange={e => setTextColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border border-border/50" />
              {textColor && <Button type="button" variant="ghost" onClick={() => setTextColor("")} className="text-muted-foreground underline hover:text-primary transition-colors">quitar</Button>}
            </div>
            {textColor && !validColor && (
              <div className="text-[10px] text-destructive px-1">Color no válido</div>
            )}
          </div>
        )}

        {panels.has("html") && (
          <div className="space-y-2">
            <textarea value={htmlContent} onChange={e => setHtmlContent(e.target.value)}
              placeholder="Pega HTML aquí (se mostrará en un visor seguro)…"
              rows={4}
              className="min-w-0 max-w-full w-full bg-input/40 rounded-xl px-3 py-2 text-xs font-mono outline-none resize-y border border-border/50 focus:border-primary/40" />
            {htmlContent.trim() && (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="text-[10px] px-2 py-1 bg-muted/40 text-muted-foreground">Vista previa</div>
                <iframe srcDoc={htmlContent} sandbox="" className="w-full h-40 bg-background" title="html-preview" />
              </div>
            )}
          </div>
        )}

        {panels.has("game") && myGames.length > 0 && (
          <div className="bg-input/40 rounded-xl px-3 py-2 space-y-2 border border-border/50">
            <div className="text-xs flex items-center gap-2 font-medium"><Gamepad2 size={14} className="text-primary" /> Fijar un juego tuyo</div>
            <select value={pinnedGameId} onChange={e => setPinnedGameId(e.target.value)}
              className="min-w-0 max-w-full w-full bg-background rounded-lg px-2 py-2 text-xs border border-border/50 focus:border-primary/40">
              <option value="">— sin juego —</option>
              {myGames.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            {pinnedGameId && !validPinnedGame && (
              <div className="text-[10px] text-destructive">Este juego ya no existe</div>
            )}
          </div>
        )}
        {panels.has("game") && myGames.length === 0 && (
          <div className="text-xs text-muted-foreground px-2">Aún no tienes juegos publicados.</div>
        )}

        {panels.has("poll") && (
          <PollEditor poll={poll} setPoll={setPoll} />
        )}

        {panels.has("unlock") && (
          <div className="bg-input/40 rounded-xl px-3 py-2 space-y-2 border border-border/50">
            <div className="flex items-center gap-2 text-xs font-medium"><Lock size={13} className="text-primary" /> Contenido desbloqueable</div>
            <textarea value={lockedContent} onChange={e => setLockedContent(e.target.value)}
              placeholder="Este texto quedará oculto hasta cumplir la condición…"
              rows={2}
              className="min-w-0 max-w-full w-full bg-background rounded-lg px-2.5 py-2 text-xs outline-none border border-border/50 focus:border-primary/40" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <label className="min-w-0 space-y-1">
                <span className="text-muted-foreground">Meta de reacciones</span>
                <input type="number" min={1} value={unlockGoal}
                  onChange={e => setUnlockGoal(e.target.value ? Number(e.target.value) : "")}
                  placeholder="ej. 50"
                  className="min-w-0 max-w-full w-full bg-background rounded-lg px-2.5 py-2 border border-border/50 focus:border-primary/40" />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-muted-foreground">O fecha</span>
                <input type="datetime-local" value={unlockAt} onChange={e => setUnlockAt(e.target.value)}
                  className="min-w-0 max-w-full w-full bg-background rounded-lg px-2.5 py-2 border border-border/50 focus:border-primary/40" />
              </label>
            </div>
            <div className="text-[10px] text-muted-foreground">Se desbloquea al cumplir cualquiera de las dos.</div>
          </div>
        )}

        {err && <div className="text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2">{err}</div>}

        {expanded && (
          <div className="text-[10px] font-display px-1 flex items-center gap-2">
            <Sparkles size={11} className="text-primary-glow shrink-0" />
            <span className="text-gradient">AÑADIR A TU PUBLICACIÓN</span>
            <span className="flex-1 h-px bg-primary/20" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <label title={`Imagen o GIF (${files.length}/${MAX_MEDIA_FILES})`}
            className={`shrink-0 h-9 px-3 rounded-xl grid grid-flow-col auto-cols-max items-center gap-1.5 bg-muted/50 text-[11px] font-medium cursor-pointer active:scale-[0.95] transition-[transform,color,background-color,border-color] duration-300 ease-out border border-transparent hover:border-primary/25 ${files.length >= MAX_MEDIA_FILES ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}>
            <ImageIcon size={15} /> {expanded && <span>Imagen {files.length > 0 && <span className="text-[9px]">({files.length})</span>}</span>}
            <input type="file" hidden accept="image/*,image/gif" multiple onChange={e => onMedia(e, "image")} disabled={files.length >= MAX_MEDIA_FILES} />
          </label>
          <label title="Vídeo" className="shrink-0 h-9 px-3 rounded-xl grid grid-flow-col auto-cols-max items-center gap-1.5 bg-muted/50 text-muted-foreground text-[11px] font-medium hover:text-primary hover:bg-primary/10 cursor-pointer active:scale-[0.95] transition-[transform,color,background-color,border-color] duration-300 ease-out border border-transparent hover:border-primary/25">
            <Film size={15} /> {expanded && <span>Vídeo</span>}
            <input type="file" hidden accept="video/*" onChange={e => onMedia(e, "video")} />
          </label>
          <label title={`Documentos (${documents.length}/${MAX_DOC_FILES})`}
            className={`shrink-0 h-9 px-3 rounded-xl grid grid-flow-col auto-cols-max items-center gap-1.5 bg-muted/50 text-[11px] font-medium cursor-pointer active:scale-[0.95] transition-[transform,color,background-color,border-color] duration-300 ease-out border border-transparent hover:border-primary/25 ${documents.length >= MAX_DOC_FILES ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}>
            <FileText size={15} /> {expanded && <span>Documento {documents.length > 0 && <span className="text-[9px]">({documents.length})</span>}</span>}
            <input type="file" hidden multiple disabled={documents.length >= MAX_DOC_FILES}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/zip"
              onChange={onDocs} />
          </label>
          <Chip active={panels.has("link")} onClick={() => togglePanel("link")} title="Enlace"><LinkIcon size={15} />{expanded && <span>Enlace</span>}</Chip>
          <Chip active={panels.has("poll")} onClick={() => { togglePanel("poll"); if (!poll) setPoll({ question: "", options: ["", ""] }); }} title="Encuesta"><BarChart3 size={15} />{expanded && <span>Encuesta</span>}</Chip>
          <Chip active={panels.has("game")} onClick={() => togglePanel("game")} title="Fijar juego"><Gamepad2 size={15} />{expanded && <span>Juego</span>}</Chip>
          <Chip active={panels.has("color")} onClick={() => togglePanel("color")} title="Color del texto"><Palette size={15} />{expanded && <span>Color</span>}</Chip>
          <Chip active={panels.has("html")} onClick={() => togglePanel("html")} title="HTML"><Code2 size={15} />{expanded && <span>HTML</span>}</Chip>
          <Chip active={panels.has("unlock")} onClick={() => togglePanel("unlock")} title="Desbloqueable"><Lock size={15} />{expanded && <span>Desbloqueable</span>}</Chip>
          <Chip active={panels.has("type")} onClick={() => togglePanel("type")} title="Tipo"><Share2 size={15} />{expanded && <span>Tipo</span>}{postTypes.length > 0 && <span className="ml-0.5 px-1 py-0 rounded text-[8px] font-mono font-bold bg-primary-foreground/20">{postTypes.length}</span>}</Chip>
          <Chip active={panels.has("tags")} onClick={() => togglePanel("tags")} title="Etiquetas"><Tag size={15} />{expanded && <span>Etiquetas</span>}</Chip>
        </div>

        {panels.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="text-[9px] font-mono text-muted-foreground/50">{panels.size}/3 funciones activas</span>
            {panels.size >= 3 && <span className="text-[9px] font-mono text-warn-ink">· límite alcanzado</span>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
          <span className={`mr-auto shrink-0 text-xs font-mono tabular-nums text-muted-foreground ${content.length > 1900 ? "text-destructive" : ""}`}>{content.length}/2000</span>
          <Button type="button" variant="gradient" onClick={() => void submit()} disabled={!canSubmit}
            className="h-10 pl-4 pr-5 rounded-xl grad-brand text-primary-foreground font-display tracking-normal text-xs flex items-center gap-1.5 active:scale-[0.97] transition-[transform,box-shadow,opacity] duration-300 ease-out  disabled:opacity-40 disabled:pointer-events-none  ">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
            {busy ? "PUBLICANDO…" : "PUBLICAR"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PollEditor({ poll, setPoll }: { poll: Poll | null; setPoll: (p: Poll | null) => void }) {
  if (!poll) return null;
  const setOpt = (i: number, v: string) => {
    const next = [...poll.options];
    next[i] = v;
    setPoll({ ...poll, options: next });
  };
  const validOptions = poll.options.filter(o => o.trim()).length;
  const hasQuestion = poll.question.trim().length > 0;

  return (
    <div className="bg-input/40 rounded-xl px-3 py-2 space-y-2 border border-border/50">
      <div className="text-xs font-medium flex items-center gap-2"><BarChart3 size={13} className="text-primary" /> Encuesta</div>
      <input value={poll.question} onChange={e => setPoll({ ...poll, question: e.target.value })}
        placeholder="Pregunta…" className="min-w-0 max-w-full w-full bg-background rounded-lg px-2.5 py-2 text-xs border border-border/50 focus:border-primary/40 outline-none" />
      {poll.options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={o} onChange={e => setOpt(i, e.target.value)}
            aria-label={`Opción ${i + 1}`} placeholder={`Opción ${i + 1}`}
            className="min-w-0 w-full flex-1 bg-background rounded-lg px-2.5 py-2 text-xs border border-border/50 focus:border-primary/40 outline-none" />
          {poll.options.length > 2 && (
            <Button type="button" variant="ghost" aria-label={`Quitar opción ${i + 1}`} onClick={() => setPoll({ ...poll, options: poll.options.filter((_, idx) => idx !== i) })}
              className="text-muted-foreground hover:text-destructive transition-[transform,color] duration-200 ease-out active:scale-[0.92]">
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        {poll.options.length < 4 && (
          <Button type="button" variant="ghost" onClick={() => setPoll({ ...poll, options: [...poll.options, ""] })}
            className="text-[11px] flex items-center gap-1 text-primary-glow hover:underline">
            <Plus size={12} /> añadir opción
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setPoll(null)} className="ml-auto text-[11px] text-muted-foreground underline hover:text-primary transition-colors duration-300">
          quitar encuesta
        </Button>
      </div>
      {/* Poll preview */}
      <div className="border-t border-border/30 pt-2 space-y-1">
        <div className="text-[9px] text-muted-foreground font-display tracking-wider">VISTA PREVIA</div>
        {!hasQuestion && <div className="text-[10px] text-warn-ink">Escribe una pregunta</div>}
        {validOptions < 2 && <div className="text-[10px] text-warn-ink">Añade al menos 2 opciones</div>}
        {hasQuestion && validOptions >= 2 && (
          <div className="bg-background/60 rounded-lg p-2 border border-border/30 space-y-1">
            <div className="text-[11px] font-semibold break-words">{poll.question}</div>
            {poll.options.filter(o => o.trim()).map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <div className="shrink-0 w-3 h-3 rounded-full border border-border/60" />
                <span className="min-w-0 break-words">{o}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
