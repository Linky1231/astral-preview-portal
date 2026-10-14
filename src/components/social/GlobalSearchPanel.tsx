import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Search,
  X,
  MessageSquare,
  Users,
  FolderOpen,
  Gamepad2,
  ChevronRight,
  Loader2,
  Download,
  FileText,
} from "lucide-react";
import {
  buildChannels,
  searchMessages,
  searchUsers,
  searchProjects,
  searchFiles,
  messagePreview,
  type SearchChannel,
  type SearchMessage,
  type SearchScope,
  type SearchProject,
} from "@/lib/social/global-search";
import { fetchChatProfiles } from "@/lib/social/chat";
import { setCurrentProjectId } from "@/lib/engine/storage";
import { formatBytes, fileExt, fileEmoji } from "@/lib/social/work";
import type { Profile } from "@/lib/social/api";
import type { WorkFile } from "@/lib/social/work";

type Tab = "all" | "messages" | "users" | "projects" | "files";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function GlobalSearchPanel({
  defaultScope,
  onClose,
  onOpenMessage,
}: {
  defaultScope: SearchScope;
  onClose: () => void;
  onOpenMessage: (chatId: string) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scope, setScope] = useState<SearchScope>(defaultScope);
  const [tab, setTab] = useState<Tab>("all");
  const [channelId, setChannelId] = useState("");
  const [personId, setPersonId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [channels, setChannels] = useState<SearchChannel[]>([]);
  const [senders, setSenders] = useState<Map<string, Profile>>(new Map());
  const [personOptions, setPersonOptions] = useState<{ id: string; name: string }[]>([]);

  const [messages, setMessages] = useState<SearchMessage[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<SearchProject[]>([]);
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const sendersRef = useRef<Map<string, Profile>>(new Map());

  useEffect(() => {
    inputRef.current?.focus();
    void buildChannels().then(setChannels).catch(() => setChannels([]));
  }, []);

  // Debounce de la consulta.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = useCallback(async () => {
    const query = debounced.trim();
    if (!query) {
      setMessages([]);
      setUsers([]);
      setProjects([]);
      setFiles([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const f = { scope, channelId, personId, dateFrom, dateTo };
    const [msgs, usrs, prjs, fls] = await Promise.all([
      searchMessages(query, channels, f),
      searchUsers(query),
      searchProjects(query),
      searchFiles(query, channels, f),
    ]);
    // Resolver nombres de los remitentes de los mensajes.
    const ids = Array.from(new Set(msgs.map((m) => m.sender_id).filter(Boolean))) as string[];
    const need = ids.filter((id) => !sendersRef.current.has(id));
    if (need.length) {
      try {
        const map = await fetchChatProfiles(need);
        sendersRef.current = new Map([...sendersRef.current, ...map]);
      } catch {
        /* noop */
      }
    }
    setSenders(new Map(sendersRef.current));
    // Opciones de persona: solo cuando no hay filtro de persona activo.
    if (!personId) {
      const opts = new Map<string, string>();
      for (const m of msgs) {
        const p = sendersRef.current.get(m.sender_id ?? "");
        opts.set(m.sender_id ?? "", p?.display_name || p?.username || m.sender_id?.slice(0, 8) || "Usuario");
      }
      for (const fl of fls) {
        const p = sendersRef.current.get(fl.uploaded_by);
        opts.set(fl.uploaded_by, p?.display_name || p?.username || fl.uploaded_by_name || fl.uploaded_by.slice(0, 8));
      }
      setPersonOptions(
        Array.from(opts.entries())
          .filter(([id]) => id)
          .map(([id, name]) => ({ id, name }))
      );
    }
    setMessages(msgs);
    setUsers(usrs);
    setProjects(prjs);
    setFiles(fls);
    setSearched(true);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, scope, channelId, personId, dateFrom, dateTo, channels]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const total = messages.length + users.length + projects.length + files.length;

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "Chat";
  const senderOf = (m: SearchMessage) => senders.get(m.sender_id ?? "");

  const openProject = (id: string) => {
    setCurrentProjectId(id);
    router.navigate({ to: "/editor" });
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-display tracking-wider transition active:scale-95 ${
        active
          ? "bg-primary text-white"
          : "bg-card border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  const tabBtn = (t: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-1.5 rounded-lg text-[10px] font-display tracking-[0.12em] flex items-center justify-center gap-1 transition active:scale-[0.98] ${
        tab === t
          ? "bg-primary/15 text-primary border border-primary/30"
          : "border border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="px-1 py-0.5 rounded-full bg-primary/10 text-[9px] font-bold">{count}</span>
      )}
    </button>
  );

  const messageRow = (m: SearchMessage) => {
    const p = senderOf(m);
    return (
      <button
        key={`msg-${m.id}`}
        onClick={() => onOpenMessage(m.chat_id)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition text-left active:scale-[0.99]"
      >
        <Avatar p={p} size={36} label={(m.sender_id || "?")[0]?.toUpperCase()} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold">
              {p?.display_name || p?.username || "Usuario"}
            </span>
            <span className="text-[9px] text-muted-foreground/70">en {channelName(m.chat_id)}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/60 shrink-0">{fmtWhen(m.created_at)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 break-words">
            {messagePreview(m)}
            {m.thread_title && (
              <span className="ml-1 px-1 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold">
                #{m.thread_title}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-muted-foreground/50 shrink-0 mt-1" />
      </button>
    );
  };

  const userRow = (p: Profile) => (
    <Link
      key={`user-${p.id}`}
      to="/profile/$userId"
      params={{ userId: p.id }}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition group active:scale-[0.99]"
    >
      <Avatar p={p} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold truncate">{p.display_name || p.username}</div>
        <div className="text-[10px] font-mono text-muted-foreground truncate">@{p.username}</div>
        {p.bio && <div className="text-[10px] text-muted-foreground/70 truncate">{p.bio}</div>}
      </div>
      <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
    </Link>
  );

  const projectRow = (p: SearchProject) => (
    <button
      key={`prj-${p.id}`}
      onClick={() => openProject(p.id)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition text-left active:scale-[0.99]"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary grid place-items-center shrink-0">
        <Gamepad2 size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold truncate">{p.name}</div>
        <div className="text-[10px] text-muted-foreground/70">Proyecto · editado {fmtWhen(new Date(p.updatedAt).toISOString())}</div>
      </div>
      <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
    </button>
  );

  const fileRow = (f: WorkFile) => (
    <div
      key={`file-${f.id}`}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition"
    >
      <span className="text-lg shrink-0">{fileEmoji(fileExt(f.name))}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold truncate">{f.name}</div>
        <div className="text-[10px] text-muted-foreground/70 truncate">
          {formatBytes(f.size)} · {channelName(f.chat_id)} · {f.uploaded_by_name || "yo"} · {fmtWhen(f.created_at)}
        </div>
      </div>
      <a
        href={f.dataUrl}
        download={f.name}
        title="Descargar"
        onClick={(e) => e.stopPropagation()}
        className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 grid place-items-center active:scale-95 transition shrink-0"
      >
        <Download size={13} />
      </a>
    </div>
  );

  const emptyState = () => (
    <div className="text-center text-[11px] text-muted-foreground/60 py-10 px-6 leading-relaxed">
      {!searched ? (
        <>
          Escribe para buscar mensajes, usuarios,
          <br />
          proyectos y archivos.
        </>
      ) : (
        <>Sin resultados para «{debounced}».</>
      )}
    </div>
  );

  const listBlocks: { key: Tab; label: string; icon: ReactNode; items: ReactNode; count: number }[] = [
    { key: "messages", label: "Mensajes", icon: <MessageSquare size={11} />, items: messages.slice(0, 4).map(messageRow), count: messages.length },
    { key: "users", label: "Usuarios", icon: <Users size={11} />, items: users.slice(0, 4).map(userRow), count: users.length },
    { key: "projects", label: "Proyectos", icon: <Gamepad2 size={11} />, items: projects.slice(0, 4).map(projectRow), count: projects.length },
    { key: "files", label: "Archivos", icon: <FolderOpen size={11} />, items: files.slice(0, 4).map(fileRow), count: files.length },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[97] bg-black/60 backdrop-blur-md grid place-items-center p-3 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-md flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Cabecera: buscador */}
        <div className="p-3 border-b border-border/60 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2.5">
            <Search size={15} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar mensajes, usuarios, proyectos, archivos…"
              className="flex-1 bg-transparent outline-none text-sm min-w-0"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="w-5 h-5 rounded-full bg-muted text-muted-foreground grid place-items-center shrink-0"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95 shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Alcance: todo / comunidad / trabajo */}
        <div className="px-3 pt-2.5 flex items-center gap-1.5">
          {chip(scope === "all", "Todo", () => setScope("all"))}
          {chip(scope === "community", "Comunidad", () => setScope("community"))}
          {chip(scope === "work", "Trabajo", () => setScope("work"))}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`ml-auto shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-display tracking-wider transition active:scale-95 ${
              channelId || personId || dateFrom || dateTo
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Filtros{filtersOpen ? " ▴" : " ▾"}
          </button>
        </div>

        {/* Filtros por canal, persona y fecha */}
        {filtersOpen && (
          <div className="mx-3 mt-2 p-3 rounded-xl border border-border/60 bg-background space-y-2.5">
            <div>
              <label className="text-[9px] font-display tracking-[0.16em] text-muted-foreground/70 block mb-1">CANAL</label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full bg-input/50 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
              >
                <option value="">Todos los canales</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.isWork ? "💼 " : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-display tracking-[0.16em] text-muted-foreground/70 block mb-1">PERSONA</label>
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="w-full bg-input/50 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
              >
                <option value="">Todas las personas</option>
                {personOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[9px] font-display tracking-[0.16em] text-muted-foreground/70 block mb-1">DESDE</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-input/50 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] font-display tracking-[0.16em] text-muted-foreground/70 block mb-1">HASTA</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-input/50 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/40 border border-border/60"
                />
              </div>
            </div>
            {(channelId || personId || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setChannelId("");
                  setPersonId("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="w-full py-1.5 rounded-lg border border-border text-[10px] font-display tracking-widest text-muted-foreground hover:text-primary hover:border-primary/40 transition"
              >
                LIMPIAR FILTROS
              </button>
            )}
          </div>
        )}

        {/* Pestañas */}
        <div className="px-3 pt-2.5 flex items-center gap-1">
          {tabBtn("all", "Todos", total)}
          {tabBtn("messages", "Mensajes", messages.length)}
          {tabBtn("users", "Usuarios", users.length)}
          {tabBtn("projects", "Proyectos", projects.length)}
          {tabBtn("files", "Archivos", files.length)}
        </div>

        {/* Resultados */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2 no-scrollbar">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : !searched ? (
            emptyState()
          ) : tab === "all" ? (
            total === 0 ? (
              emptyState()
            ) : (
              listBlocks.map(
                (b) =>
                  b.count > 0 && (
                    <div key={b.key}>
                      <button
                        onClick={() => setTab(b.key)}
                        className="text-[9px] font-display tracking-[0.18em] text-muted-foreground/70 mb-1.5 flex items-center gap-1.5 hover:text-primary transition"
                      >
                        {b.icon} {b.label.toUpperCase()} · {b.count}
                        <ChevronRight size={9} />
                      </button>
                      <div className="space-y-1.5">{b.items}</div>
                    </div>
                  )
              )
            )
          ) : tab === "messages" ? (
            messages.length === 0 ? (
              emptyState()
            ) : (
              <div className="space-y-1.5">{messages.map(messageRow)}</div>
            )
          ) : tab === "users" ? (
            users.length === 0 ? (
              emptyState()
            ) : (
              <div className="space-y-1.5">{users.map(userRow)}</div>
            )
          ) : tab === "projects" ? (
            projects.length === 0 ? (
              emptyState()
            ) : (
              <div className="space-y-1.5">{projects.map(projectRow)}</div>
            )
          ) : files.length === 0 ? (
            emptyState()
          ) : (
            <div className="space-y-1.5">{files.map(fileRow)}</div>
          )}
        </div>

        {/* Pie */}
        {searched && !loading && (
          <div className="shrink-0 px-3 py-2 border-t border-border/60 text-center text-[9px] text-muted-foreground/60 flex items-center justify-center gap-1.5">
            <FileText size={9} /> {total} resultado{total === 1 ? "" : "s"} · toca un mensaje para abrir su chat
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
