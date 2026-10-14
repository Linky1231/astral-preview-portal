/**
 * Forum storage — Asternal
 * Sistema de foros con hilos, categorías y comentarios anidados.
 * Backend: Supabase (sincronizado entre todos los dispositivos).
 */

import { supabase } from "@/integrations/supabase/client";

/* ─── Types ─── */

export interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  threadCount: number;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  categoryId: string;
  title: string;
  content: string;
  authorId: string;
  authorUsername: string;
  tags: string[];
  upvotes: number;
  downvotes: number;
  mediaUrls: string[];
  mediaType: "image" | "video" | "none";
  documentUrls: string[];
  documentNames: string[];
  pinned: boolean;
  closed: boolean;
  solutionPostId: string | null;
  views: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
  lastPostAt: string;
  lastPostAuthor: string;
}

export interface ForumThreadVote {
  threadId: string;
  userId: string;
  vote: "up" | "down";
}

export interface ForumPost {
  id: string;
  threadId: string;
  content: string;
  authorId: string;
  authorUsername: string;
  parentPostId: string | null;
  quotePostId: string | null;
  quoteContent: string | null;
  quoteAuthor: string | null;
  upvotes: number;
  downvotes: number;
  myVote: "up" | "down" | null;
  createdAt: string;
  editedAt: string | null;
}

export interface ForumVote {
  postId: string;
  userId: string;
  vote: "up" | "down";
}

/* ─── Available tags ─── */

export const FORUM_TAGS = [
  "Programación",
  "IA",
  "UI",
  "Pixel Art",
  "Música",
  "Física",
  "Animación",
  "Assets",
  "Publicación",
  "Render",
  "General",
] as const;

/* ─── Auto-tagging ─── */

const TAG_KEYWORDS: Record<string, string[]> = {
  "Programación": ["código", "programar", "script", "javascript", "typescript", "función", "variable", "bucle", "condición", "lógica", "algoritmo", "depurar", "debug", "compilar", "api", "backend", "frontend", "librería"],
  "IA": ["inteligencia artificial", "ai", "machine learning", "aprendizaje", "gpt", "claude", "gemini", "modelo", "red neuronal", "prompt", "entrenar", "clasificar", "predicción", "automático"],
  "UI": ["interfaz", "botón", "menú", "pantalla", "diseño", "ui", "ux", "usuario", "layout", "componente", "responsive", "css", "html", "tema", "oscuro", "claro"],
  "Pixel Art": ["pixel", "arte", "sprite", "gráfico", "dibujo", "spritesheet", "tileset", "resolución", "paleta", "color", "png", "animación sprite", "personaje pixel"],
  "Música": ["música", "sonido", "audio", "melodía", "canción", "efecto de sonido", "sfx", "bso", "banda sonora", "instrumento", "nota", "volumen", "reproducir"],
  "Física": ["física", "gravedad", "colisión", "movimiento", "velocidad", "aceleración", "fuerza", "impulso", "rebote", "detección", "hitbox", "cuerpo rígido", "simulación"],
  "Animación": ["animación", "animar", "keyframe", "cuadro", "frame", "transición", "interpolación", "easing", "esqueleto", "rig", "walk", "idle", "run", "salto"],
  "Assets": ["asset", "recurso", "imagen", "modelo", "pack", "kit", "descargar", "textura", "material", "fuente", "icono", "logos", "prefab"],
  "Publicación": ["publicar", "lanzar", "subir", "compartir", "exportar", "build", "compilar", "distribuir", "app store", "google play", "itch", "steam", "web", "desplegar"],
  "Render": ["render", "renderizar", "efecto", "visual", "shader", "iluminación", "sombra", "partícula", "postprocess", "glow", "blur", "filtro", "cámara", "3d", "perspectiva"],
};

const DEFAULT_TAGS = ["General"];

function normalize(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, " ");
}

export function autoDetectTags(title: string, content: string): string[] {
  const combined = normalize(title + " " + content);
  const found = new Set<string>();

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        found.add(tag);
        break;
      }
    }
    if (found.size >= 4) break;
  }

  return found.size > 0 ? Array.from(found) : [...DEFAULT_TAGS];
}

/* ─── Default categories (seed) ─── */

export function getDefaultCategories(): ForumCategory[] {
  return [
    { id: "00000000-0000-4000-8000-000000000001", name: "General",     description: "Charlas, anuncios y temas generales de la comunidad", icon: "globe", sortOrder: 0, threadCount: 0, createdAt: new Date(0).toISOString() },
    { id: "00000000-0000-4000-8000-000000000002", name: "Ayuda",       description: "Dudas sobre el editor, scripts, física y más",          icon: "life-buoy", sortOrder: 1, threadCount: 0, createdAt: new Date(0).toISOString() },
    { id: "00000000-0000-4000-8000-000000000003", name: "Showcase",    description: "Comparte tus juegos, arte y creaciones",               icon: "trophy", sortOrder: 2, threadCount: 0, createdAt: new Date(0).toISOString() },
    { id: "00000000-0000-4000-8000-000000000004", name: "Feedback",    description: "Sugerencias y mejoras para Asternal",                  icon: "message-circle-more", sortOrder: 3, threadCount: 0, createdAt: new Date(0).toISOString() },
    { id: "00000000-0000-4000-8000-000000000005", name: "Off-Topic",   description: "Todo lo demás: memes, música, charla libre",           icon: "coffee", sortOrder: 4, threadCount: 0, createdAt: new Date(0).toISOString() },
  ];
}

/* ─── Row mappers (snake_case → camelCase) ─── */

type CatRow = { id: string; name: string; description: string; icon: string; sort_order: number; created_at: string; threadCount?: number };

function mapCategory(r: CatRow): ForumCategory {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    sortOrder: r.sort_order,
    threadCount: r.threadCount ?? 0,
    createdAt: r.created_at,
  };
}

type ThreadRow = {
  id: string; category_id: string; title: string; content: string;
  author_id: string; author_username: string; tags: string[] | null;
  upvotes: number; downvotes: number; media_urls: string[] | null;
  media_type: string | null; document_urls: string[] | null; document_names: string[] | null;
  pinned: boolean; closed: boolean; solution_post_id: string | null;
  views: number; post_count: number; created_at: string; updated_at: string;
  last_post_at: string; last_post_author: string;
};

function mapThread(r: ThreadRow): ForumThread {
  return {
    id: r.id,
    categoryId: r.category_id,
    title: r.title,
    content: r.content,
    authorId: r.author_id,
    authorUsername: r.author_username,
    tags: r.tags ?? [],
    upvotes: r.upvotes ?? 0,
    downvotes: r.downvotes ?? 0,
    mediaUrls: r.media_urls ?? [],
    mediaType: (r.media_type as "image" | "video" | "none") ?? "none",
    documentUrls: r.document_urls ?? [],
    documentNames: r.document_names ?? [],
    pinned: r.pinned ?? false,
    closed: r.closed ?? false,
    solutionPostId: r.solution_post_id ?? null,
    views: r.views ?? 0,
    postCount: r.post_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    lastPostAt: r.last_post_at ?? r.created_at,
    lastPostAuthor: r.last_post_author ?? "",
  };
}

type PostRow = {
  id: string; thread_id: string; content: string; author_id: string; author_username: string;
  parent_post_id: string | null; quote_post_id: string | null; quote_content: string | null;
  quote_author: string | null; upvotes: number; downvotes: number; created_at: string; edited_at: string | null;
};

function mapPost(r: PostRow): ForumPost {
  return {
    id: r.id,
    threadId: r.thread_id,
    content: r.content,
    authorId: r.author_id,
    authorUsername: r.author_username,
    parentPostId: r.parent_post_id ?? null,
    quotePostId: r.quote_post_id ?? null,
    quoteContent: r.quote_content ?? null,
    quoteAuthor: r.quote_author ?? null,
    upvotes: r.upvotes ?? 0,
    downvotes: r.downvotes ?? 0,
    myVote: null,
    createdAt: r.created_at,
    editedAt: r.edited_at ?? null,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* ─── Categories ─── */

export async function initForumCategories(): Promise<ForumCategory[]> {
  const cats = await getForumCategories();
  if (cats.length > 0) return cats;
  return getDefaultCategories();
}

export async function getForumCategories(): Promise<ForumCategory[]> {
  const { data, error } = await supabase
    .from("forum_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[foros] error leyendo categorías:", error.message);
    return getDefaultCategories();
  }
  const rows = (data ?? []) as CatRow[];
  // Count threads per category (works in both real and local modes)
  const { data: threadRows } = await supabase.from("forum_threads").select("category_id");
  const counts = new Map<string, number>();
  for (const t of (threadRows ?? []) as { category_id: string }[]) {
    counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
  }
  return rows.map(r => mapCategory({ ...r, threadCount: counts.get(r.id) ?? 0 }));
}

export async function createForumCategory(name: string, description: string, icon: string): Promise<ForumCategory> {
  const { data, error } = await supabase
    .from("forum_categories")
    .insert({ name: name.trim(), description: description.trim(), icon: icon || "globe", sort_order: 0 })
    .select()
    .single();
  if (error) throw error;
  return mapCategory(data as CatRow);
}

export async function deleteForumCategory(categoryId: string): Promise<boolean> {
  const defaultIds = getDefaultCategories().map(c => c.id);
  if (defaultIds.includes(categoryId)) return false;
  const { error } = await supabase.from("forum_categories").delete().eq("id", categoryId);
  return !error;
}

/* ─── Hot score (same algorithm as before) ─── */

async function postsByThread(threadIds: string[]): Promise<Map<string, PostRow[]>> {
  const map = new Map<string, PostRow[]>();
  if (!threadIds.length) return map;
  const { data } = await supabase.from("forum_posts").select("*").in("thread_id", threadIds);
  for (const p of (data ?? []) as PostRow[]) {
    const arr = map.get(p.thread_id) ?? [];
    arr.push(p);
    map.set(p.thread_id, arr);
  }
  return map;
}

function getThreadHotScore(t: ForumThread, threadPosts: PostRow[]): number {
  const totalPostUpvotes = threadPosts.reduce((s, p) => s + (p.upvotes ?? 0), 0);
  const totalPostDownvotes = threadPosts.reduce((s, p) => s + (p.downvotes ?? 0), 0);
  const interactions = t.postCount * 5 + t.views + (totalPostUpvotes + t.upvotes) * 3 - (totalPostDownvotes + t.downvotes);
  const ageHours = Math.max(1, (Date.now() - new Date(t.createdAt).getTime()) / 3600000);
  return Math.round(interactions / Math.pow(ageHours + 2, 0.6));
}

async function sortThreads(threads: ForumThread[]): Promise<ForumThread[]> {
  const postsMap = await postsByThread(threads.map(t => t.id));
  return threads.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const sa = getThreadHotScore(a, postsMap.get(a.id) ?? []);
    const sb = getThreadHotScore(b, postsMap.get(b.id) ?? []);
    return sb - sa;
  });
}

/* ─── Threads ─── */

export async function getForumThreads(categoryId?: string): Promise<ForumThread[]> {
  let q = supabase.from("forum_threads").select("*");
  if (categoryId) q = q.eq("category_id", categoryId);
  const { data, error } = await q;
  if (error) return [];
  const threads = ((data ?? []) as ThreadRow[]).map(mapThread);
  return sortThreads(threads);
}

export async function searchForumThreads(query: string, categoryId?: string): Promise<ForumThread[]> {
  if (!query.trim()) return getForumThreads(categoryId);
  const q = query.toLowerCase().trim();
  const threads = await getForumThreads(categoryId);
  return threads
    .filter(t => t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aScore = (a.title.toLowerCase().startsWith(q) ? 100 : 0) + a.postCount * 3;
      const bScore = (b.title.toLowerCase().startsWith(q) ? 100 : 0) + b.postCount * 3;
      return bScore - aScore;
    });
}

export async function getForumThreadsWithVotes(categoryId?: string, userId?: string | null): Promise<(ForumThread & { myVote: "up" | "down" | null })[]> {
  const threads = await getForumThreads(categoryId);
  if (!userId || !threads.length) return threads.map(t => ({ ...t, myVote: null }));
  const { data } = await supabase.from("forum_thread_votes").select("thread_id,vote").eq("user_id", userId).in("thread_id", threads.map(t => t.id));
  const vmap = new Map((data ?? []).map((v: { thread_id: string; vote: string }) => [v.thread_id, v.vote]));
  return threads.map(t => ({ ...t, myVote: (vmap.get(t.id) as "up" | "down") ?? null }));
}

export async function getForumThread(threadId: string): Promise<(ForumThread & { myVote: "up" | "down" | null }) | null> {
  const { data, error } = await supabase.from("forum_threads").select("*").eq("id", threadId).maybeSingle();
  if (error || !data) return null;
  const thread = mapThread(data as ThreadRow);
  const me = await currentUserId();
  let myVote: "up" | "down" | null = null;
  if (me) {
    const { data: v } = await supabase.from("forum_thread_votes").select("vote").eq("thread_id", threadId).eq("user_id", me).maybeSingle();
    myVote = ((v as { vote?: string } | null)?.vote as "up" | "down") ?? null;
  }
  return { ...thread, myVote };
}

export async function voteForumThread(threadId: string, userId: string, vote: "up" | "down"): Promise<{ upvotes: number; downvotes: number }> {
  const { data } = await supabase.rpc("forum_vote_thread", { _thread_id: threadId, _user_id: userId, _vote: vote });
  const r = (data as { upvotes?: number; downvotes?: number } | null) ?? {};
  return { upvotes: r.upvotes ?? 0, downvotes: r.downvotes ?? 0 };
}

export async function createForumThread(
  categoryId: string,
  title: string,
  content: string,
  author: { id: string; username: string },
  tags?: string[],
  media?: { mediaUrls: string[]; mediaType: "image" | "video" | "none"; documentUrls: string[]; documentNames: string[] },
): Promise<ForumThread> {
  const autoTags = autoDetectTags(title, content);
  const finalTags = tags && tags.length > 0 ? tags.slice(0, 4) : autoTags;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("forum_threads").insert({
    category_id: categoryId,
    title: title.trim(),
    content: content.trim(),
    author_id: author.id,
    author_username: author.username,
    tags: finalTags,
    upvotes: 0,
    downvotes: 0,
    media_urls: media?.mediaUrls ?? [],
    media_type: media?.mediaType ?? "none",
    document_urls: media?.documentUrls ?? [],
    document_names: media?.documentNames ?? [],
    pinned: false,
    closed: false,
    solution_post_id: null,
    views: 0,
    post_count: 1,
    created_at: now,
    updated_at: now,
    last_post_at: now,
    last_post_author: author.username,
  } as never).select().single();
  if (error) throw error;
  // Create the initial post
  await createForumPost((data as { id: string }).id, content, author);
  return mapThread(data as ThreadRow);
}

export async function incrementThreadView(threadId: string): Promise<void> {
  try {
    await supabase.rpc("forum_bump_views", { _thread_id: threadId });
  } catch { /* ignore */ }
}

/* ─── Solutions ─── */

export async function markAsSolution(threadId: string, postId: string): Promise<boolean> {
  const { error } = await supabase.from("forum_threads").update({ solution_post_id: postId }).eq("id", threadId);
  return !error;
}

export async function unmarkSolution(threadId: string): Promise<boolean> {
  const { error } = await supabase.from("forum_threads").update({ solution_post_id: null }).eq("id", threadId);
  return !error;
}

export async function togglePinThread(threadId: string): Promise<boolean> {
  const { data } = await supabase.from("forum_threads").select("pinned").eq("id", threadId).maybeSingle();
  const next = !((data as { pinned?: boolean } | null)?.pinned ?? false);
  await supabase.from("forum_threads").update({ pinned: next }).eq("id", threadId);
  return next;
}

export async function toggleCloseThread(threadId: string): Promise<boolean> {
  const { data } = await supabase.from("forum_threads").select("closed").eq("id", threadId).maybeSingle();
  const next = !((data as { closed?: boolean } | null)?.closed ?? false);
  await supabase.from("forum_threads").update({ closed: next }).eq("id", threadId);
  return next;
}

export async function deleteForumThread(threadId: string): Promise<void> {
  await supabase.from("forum_threads").delete().eq("id", threadId);
}

/* ─── Posts ─── */

export async function getForumPosts(threadId: string): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) return [];
  const posts = ((data ?? []) as PostRow[]).map(mapPost);
  const me = await currentUserId();
  if (me && posts.length) {
    const { data: votes } = await supabase.from("forum_votes").select("post_id,vote").eq("user_id", me).in("post_id", posts.map(p => p.id));
    const vmap = new Map((votes ?? []).map((v: { post_id: string; vote: string }) => [v.post_id, v.vote]));
    for (const p of posts) p.myVote = (vmap.get(p.id) as "up" | "down") ?? null;
  }
  return posts;
}

export async function createForumPost(
  threadId: string,
  content: string,
  author: { id: string; username: string },
  quote: { postId: string | null; content: string | null; author: string | null } = { postId: null, content: null, author: null },
): Promise<ForumPost> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("forum_posts").insert({
    thread_id: threadId,
    content: content.trim(),
    author_id: author.id,
    author_username: author.username,
    parent_post_id: null,
    quote_post_id: quote.postId,
    quote_content: quote.content,
    quote_author: quote.author,
    upvotes: 0,
    downvotes: 0,
    created_at: now,
    edited_at: null,
  } as never).select().single();
  if (error) throw error;
  await supabase.rpc("forum_touch_thread", { _thread_id: threadId, _author: author.username });
  return mapPost(data as PostRow);
}

export async function editForumPost(postId: string, newContent: string): Promise<boolean> {
  const { error } = await supabase.from("forum_posts").update({ content: newContent.trim(), edited_at: new Date().toISOString() }).eq("id", postId);
  return !error;
}

export async function deleteForumPost(postId: string): Promise<boolean> {
  const { data: post } = await supabase.from("forum_posts").select("thread_id").eq("id", postId).maybeSingle();
  const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
  if (!error && post) {
    try {
      await supabase.rpc("forum_touch_thread", { _thread_id: (post as { thread_id: string }).thread_id, _author: "" });
    } catch { /* ignore */ }
  }
  return !error;
}

/* ─── Votes ─── */

export async function voteForumPost(postId: string, userId: string, vote: "up" | "down"): Promise<{ upvotes: number; downvotes: number }> {
  const { data } = await supabase.rpc("forum_vote_post", { _post_id: postId, _user_id: userId, _vote: vote });
  const r = (data as { upvotes?: number; downvotes?: number } | null) ?? {};
  return { upvotes: r.upvotes ?? 0, downvotes: r.downvotes ?? 0 };
}
