// ───── Búsqueda global ─────
// Busca mensajes (de todos los chats), usuarios, proyectos del motor y
// archivos de los chats de trabajo, con filtros por persona, canal y fecha.
// Funciona igual en modo local y con Supabase conectado.

import type { Profile } from "./api";
import {
  getCommunityChat,
  fetchMyDmChats,
  fetchMyGroupChats,
  searchProfilesForMention,
} from "./chat";
import {
  listWorkChats,
  listAllWorkFiles,
  listAllThreads,
  listAllThreadMessages,
  type WorkFile,
} from "./work";
import { supabase } from "@/integrations/supabase/client";

export type SearchScope = "all" | "community" | "work";

export type SearchChannel = {
  id: string;
  name: string;
  kind: "community" | "direct" | "group";
  isWork: boolean;
};

export type SearchMessage = {
  id: string;
  chat_id: string;
  sender_id: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  kind: string | null;
  created_at: string;
  thread_title?: string;
};

export type SearchProject = { id: string; name: string; updatedAt: number };

export type SearchFilters = {
  scope: SearchScope;
  channelId: string; // "" = todos
  personId: string; // "" = todos
  dateFrom: string; // yyyy-mm-dd o ""
  dateTo: string; // yyyy-mm-dd o ""
};

/** Lista los canales disponibles: comunidad, chats individuales y grupos (con su tipo de trabajo). */
export async function buildChannels(): Promise<SearchChannel[]> {
  const channels: SearchChannel[] = [];
  try {
    const community = await getCommunityChat();
    channels.push({ id: community.id, name: community.name, kind: "community", isWork: false });
  } catch {
    /* noop */
  }
  try {
    const dms = await fetchMyDmChats();
    for (const d of dms) {
      channels.push({
        id: d.chat_id,
        name: d.other?.display_name || d.other?.username || "Chat individual",
        kind: "direct",
        isWork: false,
      });
    }
  } catch {
    /* noop */
  }
  const workIds = new Set(listWorkChats());
  try {
    const groups = await fetchMyGroupChats();
    for (const g of groups) {
      channels.push({
        id: g.chat_id,
        name: g.name,
        kind: "group",
        isWork: workIds.has(g.chat_id),
      });
    }
  } catch {
    /* noop */
  }
  return channels;
}

function inScope(channels: SearchChannel[], chatId: string, scope: SearchScope): boolean {
  if (scope === "all") return true;
  const ch = channels.find((c) => c.id === chatId);
  if (!ch) return false;
  // Comunidad = solo el chat comunitario; Trabajo = chats de equipo (grupos).
  if (scope === "community") return ch.kind === "community";
  return ch.isWork || ch.kind === "group";
}

function matchDate(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return true;
  if (from) {
    const f = new Date(`${from}T00:00:00`).getTime();
    if (isFinite(f) && t < f) return false;
  }
  if (to) {
    const d = new Date(`${to}T23:59:59`).getTime();
    if (isFinite(d) && t > d) return false;
  }
  return true;
}

/** Etiqueta legible de un mensaje según su contenido/media. */
export function messagePreview(m: Pick<SearchMessage, "kind" | "media_type" | "content">): string {
  const media = (m.media_type ?? "").toLowerCase();
  if (media.startsWith("video")) return "🎬 Vídeo";
  if (media === "audio") return "🎤 Audio de voz";
  if (media === "sticker") return "🖼️ Sticker";
  if (media.startsWith("image")) return "🖼️ Foto";
  if (m.kind === "poll") return `📊 Encuesta: ${m.content ?? ""}`;
  if (m.kind === "gift") return `🎁 Paquete de regalos: ${m.content ?? ""}`;
  if (m.kind === "announcement") return `📢 Aviso: ${m.content ?? ""}`;
  return m.content ?? "";
}

/** Busca mensajes en todos los chats (y en los hilos de los chats de trabajo). */
export async function searchMessages(
  q: string,
  channels: SearchChannel[],
  f: SearchFilters
): Promise<SearchMessage[]> {
  const query = q.trim();
  if (!query) return [];
  const out: SearchMessage[] = [];

  // Mensajes del chat (modo local y Supabase a través del mismo cliente).
  try {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(80);
    const rows = (data ?? []) as SearchMessage[];
    for (const m of rows) {
      if (!inScope(channels, m.chat_id, f.scope)) continue;
      if (f.channelId && m.chat_id !== f.channelId) continue;
      if (f.personId && m.sender_id !== f.personId) continue;
      if (!matchDate(m.created_at, f.dateFrom, f.dateTo)) continue;
      out.push(m);
    }
  } catch {
    /* sin acceso o tabla ausente: se ignora */
  }

  // Mensajes de los hilos (los hilos viven en chats de trabajo, en este dispositivo).
  try {
    const threads = listAllThreads();
    const titleById = new Map(threads.map((t) => [t.id, t.title]));
    const chatOfThread = new Map(threads.map((t) => [t.id, t.chat_id]));
    const ql = query.toLowerCase();
    for (const m of listAllThreadMessages()) {
      if (!(m.content ?? "").toLowerCase().includes(ql)) continue;
      const chatId = chatOfThread.get(m.thread_id) ?? m.chat_id;
      if (!inScope(channels, chatId, f.scope)) continue;
      if (f.channelId && chatId !== f.channelId) continue;
      if (f.personId && m.sender_id !== f.personId) continue;
      if (!matchDate(m.created_at, f.dateFrom, f.dateTo)) continue;
      out.push({
        id: m.id,
        chat_id: chatId,
        sender_id: m.sender_id,
        content: m.content,
        media_url: null,
        media_type: null,
        kind: "thread",
        created_at: m.created_at,
        thread_title: titleById.get(m.thread_id),
      });
    }
  } catch {
    /* noop */
  }

  out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return out.slice(0, 60);
}

/** Busca usuarios por nombre de usuario o nombre visible. */
export async function searchUsers(q: string): Promise<Profile[]> {
  const query = q.trim();
  if (!query) return [];
  try {
    return await searchProfilesForMention(query, 20);
  } catch {
    return [];
  }
}

/** Busca proyectos del motor (sin crear uno por defecto). */
export function searchProjects(q: string): SearchProject[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  try {
    const raw = localStorage.getItem("asternal:projects:index");
    if (!raw) return [];
    const arr = JSON.parse(raw) as SearchProject[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && typeof p.name === "string" && p.name.toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** Busca archivos de los chats de trabajo (cualquier extensión). */
export function searchFiles(q: string, channels: SearchChannel[], f: SearchFilters): WorkFile[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return listAllWorkFiles()
    .filter((file) => {
      if (!file.name.toLowerCase().includes(query) && !(file.uploaded_by_name || "").toLowerCase().includes(query))
        return false;
      if (f.scope !== "all" && !inScope(channels, file.chat_id, f.scope)) return false;
      if (f.channelId && file.chat_id !== f.channelId) return false;
      if (f.personId && file.uploaded_by !== f.personId) return false;
      if (!matchDate(file.created_at, f.dateFrom, f.dateTo)) return false;
      return true;
    })
    .slice(0, 30);
}
