// @ts-nocheck — Local DB adapter (types differ from Supabase generics)
import { supabase, isSchemaMissing } from "@/integrations/supabase/client";
import { isCommunityPublication, hasPublicationContent } from "./feed-visibility";
import { DEFAULT_COVER_FRAME, type CoverFrame, withCoverFrame } from "./cover-frame";
import {
  applyReview,
  initialGameAiState,
  readGameAiState,
  requestReverification,
  withGameAiState,
} from "./game-review";

export type SocialLinks = {
  youtube?: string;
  tiktok?: string;
  instagram?: string;
  twitter?: string;
  website?: string;
};

export type CreatorCardStyle = {
  theme?: "dark" | "light" | "neon" | "aurora" | "sunset";
  accent?: string;
  tagline?: string;
};

export type QRStyle = {
  fg?: string;
  bg?: string;
  size?: number;
  cornerStyle?: "square" | "rounded" | "dots";
};

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  user_code?: string | null;
  bio: string | null;
  orbes?: number;
  is_plus?: boolean;
  show_plus_badge?: boolean;
  avatar_frame?: string | null;
  social_links?: SocialLinks | null;
  last_plus_claim_at?: string | null;
  banner_url?: string | null;
  pronouns?: string | null;
  location?: string | null;
  status_text?: string | null;
  status_emoji?: string | null;
  accent_color?: string | null;
  favorite_genre?: string | null;
  custom_title?: string | null;
  birthday?: string | null;
  show_orbes?: boolean;
  theme_mode?: string | null;
  featured_post_id?: string | null;
  interests?: string[] | null;
  // Plus v2
  plus_expires_at?: string | null;
  name_effect?: string | null;
  profile_background?: string | null;
  post_effect?: string | null;
  creator_card_style?: CreatorCardStyle | null;
  // Trust
  trust_points?: number | null;
  // QR customization
  qr_style?: QRStyle | null;
};

export function isPlusActive(p: Profile | null | undefined): boolean {
  // Plus es gratuito para todos: la barrera de suscripción se eliminó.
  return true;
}

export function daysUntilPlusExpires(p: Profile | null | undefined): number | null {
  if (!p?.plus_expires_at) return null;
  const ms = new Date(p.plus_expires_at).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export type MediaType = "none" | "image" | "video" | "link";

export type PollData = {
  id: string;
  question: string;
  options: string[];
  votes: number[];
  my_vote: number | null;
  total: number;
};

export type PostRow = {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  media_type: MediaType;
  link_url: string | null;
  category: string | null;
  game_genre?: string | null;
  cover_url: string | null;
  screenshots?: string[] | null;
  allow_remix?: boolean;
  price_orbes?: number;
  seller_id?: string | null;
  resale_price_orbes?: number | null;
  current_owner_id?: string | null;
  text_color?: string | null;
  html_content?: string | null;
  document_paths?: string[];
  document_names?: string[];
  pinned_game_id?: string | null;
  locked_content?: string | null;
  unlock_reactions_goal?: number | null;
  unlock_at?: string | null;
  entrance_effect?: string | null;
  asset_preset?: Record<string, unknown> | null;
  post_type?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostWithMeta = PostRow & {
  author: Profile | null;
  tags: string[];
  likes: number;
  favorites: number;
  comments_count: number;
  reposts_count: number;
  my_like: boolean;
  my_favorite: boolean;
  my_repost: boolean;
  signed_media: string[];
  signed_cover: string | null;
  signed_screenshots: string[];
  signed_documents?: { name: string; url: string }[];
  poll?: PollData | null;
  pinned_game?: { id: string; title: string; cover_url: string | null } | null;
  is_unlocked?: boolean;
  owned?: boolean;
  seller?: Profile | null;
  asset_preset?: Record<string, unknown> | null;
  post_type?: string | null;
};




export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  author?: Profile | null;
  likes?: number;
  my_like?: boolean;
  replies?: CommentRow[];
};

const MEDIA_BUCKET = "post-media";

/** Convierte una ruta del bucket en una URL utilizable por imágenes y banners. */
export async function resolveMediaUrl(path: string | null | undefined): Promise<string | null> {
  const value = path?.trim();
  if (!value) return null;
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(value, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

export async function signMediaUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  // Paralelo: los chats con muchos stickers/audios firman todas las URLs a la vez.
  return Promise.all(
    paths.map(async (p) => (await resolveMediaUrl(p)) ?? "")
  );
}

export async function uploadMedia(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function fetchFeed(opts: { search?: string; tag?: string; category?: string; includeGames?: boolean; artistGallery?: boolean } = {}): Promise<PostWithMeta[]> {
  let q = supabase.from("posts").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (opts.search) q = q.ilike("content", `%${opts.search}%`);
  if (opts.category) q = q.eq("category", opts.category);
  // La Tienda histórica compartía category="artwork", pero sus recursos del
  // editor conservan asset_preset. La Galería solo admite obras artísticas.
  if (opts.artistGallery) q = q.is("asset_preset", null);
  // El feed normal solo muestra publicaciones: los juegos y las obras de la
  // galería (category = artwork) viven en sus propias secciones y no deben
  // colarse aquí.
  else if (!opts.includeGames) q = q.or("category.is.null,category.neq.game,category.neq.artwork,category.neq.system");
  const { data: posts, error } = await q;
  if (error) {
    // Esquema aún sin crear en Supabase: degradar a lista vacía en vez de crashear.
    if (isSchemaMissing(error)) return [];
    throw error;
  }
  if (!posts || !posts.length) return [];

  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;
  const enriched = await enrichPosts(posts as PostRow[], me, opts.tag);
  return enriched.filter(post =>
    hasPublicationContent(post) &&
    (opts.category || opts.includeGames || opts.artistGallery || isCommunityPublication(post))
  );
}

/**
 * Enriquecimiento común de posts: perfiles (incluido el vendedor actual en reventas),
 * reacciones, comentarios, media firmada y estado de propiedad.
 */
async function enrichPosts(rawPosts: PostRow[], me: string | null, tag?: string): Promise<PostWithMeta[]> {
  const posts = rawPosts;
  const ids = posts.map(p => p.id);
  const authorIds = Array.from(new Set(
    posts.map(p => p.author_id).concat(posts.filter(p => p.seller_id).map(p => p.seller_id!)),
  ));

  const [profiles, reactions, comments, reposts, tagsJoin, purchases] = await Promise.all([
    supabase.from("profiles").select("*").in("id", authorIds),
    supabase.from("reactions").select("post_id,user_id,type").in("post_id", ids),
    supabase.from("comments").select("post_id").in("post_id", ids).is("deleted_at", null),
    supabase.from("reposts").select("post_id,user_id").in("post_id", ids),
    supabase.from("post_tags").select("post_id,tags(name)").in("post_id", ids),
    me
      ? supabase.from("game_purchases").select("post_id").eq("user_id", me).in("post_id", ids)
      : Promise.resolve({ data: [] as { post_id: string }[] }),
  ]);

  const hydratedProfiles = await Promise.all(
    (profiles.data ?? []).map(profile => hydrateProfileMedia(profile as Profile)),
  );
  const pmap = new Map(hydratedProfiles.filter((profile): profile is Profile => !!profile).map(profile => [profile.id, profile]));
  const ownedIds = new Set((purchases.data ?? []).map(x => x.post_id));
  const tagMap = new Map<string, string[]>();
  for (const row of (tagsJoin.data ?? []) as Array<{ post_id: string; tags: { name: string } | null }>) {
    const arr = tagMap.get(row.post_id) ?? [];
    if (row.tags?.name) arr.push(row.tags.name);
    tagMap.set(row.post_id, arr);
  }

  let tagFiltered = posts;
  if (tag) tagFiltered = posts.filter(p => (tagMap.get(p.id) ?? []).includes(tag!));

  const result: PostWithMeta[] = [];
  for (const p of tagFiltered) {
    const r = (reactions.data ?? []).filter(x => x.post_id === p.id);
    const likes = r.filter(x => x.type === "like").length;
    const favs = r.filter(x => x.type === "favorite").length;
    const my_like = !!me && r.some(x => x.user_id === me && x.type === "like");
    const my_favorite = !!me && r.some(x => x.user_id === me && x.type === "favorite");
    const c = (comments.data ?? []).filter(x => x.post_id === p.id).length;
    const reps = (reposts.data ?? []).filter(x => x.post_id === p.id);
    const my_repost = !!me && reps.some(x => x.user_id === me);
    const signed = await signMediaUrls(p.media_urls ?? []);
    const signedCover = p.cover_url ? (await signMediaUrls([p.cover_url]))[0] ?? null : null;
    const signedScreens = (p as PostRow).screenshots?.length ? await signMediaUrls((p as PostRow).screenshots) : [];
    const priceOrbes = (p as PostRow).price_orbes ?? 0;
    const currentOwner = (p as PostRow).current_owner_id ?? null;
    const owned = priceOrbes <= 0 || currentOwner === me || (currentOwner == null && (p.author_id === me || ownedIds.has(p.id)));
    const post = p as PostRow;
    const docPaths = post.document_paths ?? [];
    const docNames = post.document_names ?? [];
    const signedDocs = docPaths.length
      ? (await signMediaUrls(docPaths)).map((url, i) => ({ url, name: docNames[i] ?? `Documento ${i + 1}` }))
      : [];
    // unlock check
    let isUnlocked = true;
    if (post.locked_content) {
      const goalHit = post.unlock_reactions_goal ? (likes + favs) >= post.unlock_reactions_goal : false;
      const dateHit = post.unlock_at ? new Date(post.unlock_at) <= new Date() : false;
      isUnlocked = post.author_id === me || goalHit || dateHit;
    }
    result.push({
      ...post,
      author: pmap.get(p.author_id) ?? null,
      seller: p.seller_id ? (pmap.get(p.seller_id) ?? null) : null,
      tags: tagMap.get(p.id) ?? [],
      likes, favorites: favs, comments_count: c, reposts_count: reps.length,
      my_like, my_favorite, my_repost,
      signed_media: signed,
      signed_cover: signedCover,
      signed_screenshots: signedScreens,
      signed_documents: signedDocs,
      is_unlocked: isUnlocked,
      owned,
    });

  }
  // Hydrate polls + pinned games in one pass
  await hydratePollsAndGames(result, me);
  return result;
}

async function hydratePollsAndGames(list: PostWithMeta[], me: string | null) {
  const ids = list.map(p => p.id);
  const pinnedIds = Array.from(new Set(list.map(p => p.pinned_game_id).filter(Boolean))) as string[];
  const [pollsRes, votesRes, gamesRes] = await Promise.all([
    supabase.from("post_polls").select("*").in("post_id", ids),
    me
      ? supabase.from("post_poll_votes").select("*").in("poll_id", []).then(async () => {
          const { data: allPolls } = await supabase.from("post_polls").select("id").in("post_id", ids);
          const pollIds = (allPolls ?? []).map(p => p.id);
          if (!pollIds.length) return { data: [] as { poll_id: string; user_id: string; option_index: number }[] };
          return supabase.from("post_poll_votes").select("poll_id,user_id,option_index").in("poll_id", pollIds);
        })
      : Promise.resolve({ data: [] as { poll_id: string; user_id: string; option_index: number }[] }),
    pinnedIds.length
      ? supabase.from("posts").select("id,content,cover_url").in("id", pinnedIds)
      : Promise.resolve({ data: [] as { id: string; content: string; cover_url: string | null }[] }),
  ]);
  const pollByPost = new Map<string, { id: string; question: string; options: string[] }>();
  for (const row of (pollsRes.data ?? []) as { id: string; post_id: string; question: string; options: string[] }[]) {
    pollByPost.set(row.post_id, { id: row.id, question: row.question, options: row.options });
  }
  const votesByPoll = new Map<string, { user_id: string; option_index: number }[]>();
  for (const v of (votesRes.data ?? [])) {
    const arr = votesByPoll.get(v.poll_id) ?? [];
    arr.push({ user_id: v.user_id, option_index: v.option_index });
    votesByPoll.set(v.poll_id, arr);
  }
  const gameById = new Map<string, { id: string; content: string; cover_url: string | null }>();
  for (const g of (gamesRes.data ?? [])) gameById.set(g.id, g);
  const gameCovers = await Promise.all(
    Array.from(gameById.values()).map(async g => ({
      id: g.id,
      signed: g.cover_url ? (await signMediaUrls([g.cover_url]))[0] ?? null : null,
    })),
  );
  const gameCoverMap = new Map(gameCovers.map(x => [x.id, x.signed]));
  for (const post of list) {
    const p = pollByPost.get(post.id);
    if (p) {
      const votes = votesByPoll.get(p.id) ?? [];
      const counts = p.options.map((_, i) => votes.filter(v => v.option_index === i).length);
      const myVote = me ? (votes.find(v => v.user_id === me)?.option_index ?? null) : null;
      post.poll = { id: p.id, question: p.question, options: p.options, votes: counts, my_vote: myVote, total: votes.length };
    } else {
      post.poll = null;
    }
    if (post.pinned_game_id && gameById.has(post.pinned_game_id)) {
      const g = gameById.get(post.pinned_game_id)!;
      const title = (g.content.split("\n")[0] || "Juego").replace(/^🎮\s*/, "").trim() || "Juego";
      post.pinned_game = { id: g.id, title, cover_url: gameCoverMap.get(g.id) ?? null };
    } else {
      post.pinned_game = null;
    }
  }
}



export async function createPost(input: {
  content: string;
  files: File[];
  mediaType: MediaType;
  linkUrl?: string;
  category?: string;
  tags: string[];
  textColor?: string | null;
  htmlContent?: string | null;
  documents?: File[];
  pinnedGameId?: string | null;
  postType?: string | null;
  lockedContent?: string | null;
  unlockReactionsGoal?: number | null;
  unlockAt?: string | null;
  poll?: { question: string; options: string[] } | null;
}): Promise<PostRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const paths: string[] = [];
  for (const f of input.files) paths.push(await uploadMedia(f, user.id));

  const docPaths: string[] = [];
  const docNames: string[] = [];
  for (const f of input.documents ?? []) {
    docPaths.push(await uploadMedia(f, user.id));
    docNames.push(f.name);
  }

  // Auto-apply the author's Plus post_effect (if active) as entrance_effect.
  let entranceEffect: string | null = null;
  const { data: myProfile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (myProfile && isPlusActive(myProfile as Profile) && (myProfile as Profile).post_effect) {
    entranceEffect = (myProfile as Profile).post_effect!;
  }

  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content: input.content,
    media_urls: paths,
    media_type: input.mediaType,
    link_url: input.linkUrl || null,
    category: input.category || null,
    text_color: input.textColor || null,
    html_content: input.htmlContent || null,
    document_paths: docPaths,
    document_names: docNames,
    pinned_game_id: input.pinnedGameId || null,
    post_type: input.postType || null,
    locked_content: input.lockedContent || null,
    unlock_reactions_goal: input.unlockReactionsGoal ?? null,
    unlock_at: input.unlockAt || null,
    entrance_effect: entranceEffect,
  } as never).select().single();
  if (error) throw error;

  if (input.poll && input.poll.options.filter(o => o.trim()).length >= 2) {
    await supabase.from("post_polls").insert({
      post_id: post!.id,
      question: input.poll.question.trim() || "Encuesta",
      options: input.poll.options.map(o => o.trim()).filter(Boolean),
    });
  }

  if (input.tags.length) {
    const names = Array.from(new Set(input.tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
    for (const name of names) {
      let { data: tag } = await supabase.from("tags").select("id").eq("name", name).maybeSingle();
      if (!tag) {
        const { data: created } = await supabase.from("tags").insert({ name }).select().single();
        tag = created;
      }
      if (tag) await supabase.from("post_tags").insert({ post_id: post!.id, tag_id: tag.id });
    }
  }
  return post as PostRow;
}


export async function updatePost(id: string, patch: { content?: string; category?: string | null }) {
  const { error } = await supabase.from("posts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePost(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Verify ownership or moderator status before deleting
  const { data: post } = await supabase.from("posts").select("author_id").eq("id", id).single();
  if (!post) throw new Error("Publicación no encontrada");
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  const isMod = role && (role.role === "moderator" || role.role === "admin");
  if (post.author_id !== user.id && !isMod) throw new Error("No tienes permiso para borrar esta publicación");
  const { error } = await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function toggleReaction(opts: { postId?: string; commentId?: string; type: "like" | "favorite" }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const q = supabase.from("reactions").select("id").eq("user_id", user.id).eq("type", opts.type);
  const { data: existing } = opts.postId
    ? await q.eq("post_id", opts.postId).maybeSingle()
    : await q.eq("comment_id", opts.commentId!).maybeSingle();
  if (existing) {
    await supabase.from("reactions").delete().eq("id", existing.id);
    return false;
  }
  await supabase.from("reactions").insert({
    user_id: user.id,
    post_id: opts.postId ?? null,
    comment_id: opts.commentId ?? null,
    type: opts.type,
  });
  // Notificar al autor del post/comentario (una sola vez hasta que se lea).
  void (async () => {
    try {
      const type = opts.type === "like" ? "like" : "favorite";
      if (opts.postId) {
        const { data: p } = await supabase.from("posts").select("author_id").eq("id", opts.postId).maybeSingle();
        if (p) await pushNotification({ userId: p.author_id, type, postId: opts.postId });
      } else if (opts.commentId) {
        const { data: c } = await supabase.from("comments").select("author_id").eq("id", opts.commentId).maybeSingle();
        if (c) await pushNotification({ userId: c.author_id, type, commentId: opts.commentId });
      }
    } catch { /* noop */ }
  })();
  return true;
}

export async function toggleRepost(postId: string, quote?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: existing } = await supabase.from("reposts").select("id").eq("user_id", user.id).eq("post_id", postId).maybeSingle();
  if (existing) {
    await supabase.from("reposts").delete().eq("id", existing.id);
    return false;
  }
  await supabase.from("reposts").insert({ user_id: user.id, post_id: postId, quote: quote || null });
  // Notificar al autor del post.
  void (async () => {
    try {
      const { data: p } = await supabase.from("posts").select("author_id").eq("id", postId).maybeSingle();
      if (p) await pushNotification({ userId: p.author_id, type: "repost", postId });
    } catch { /* noop */ }
  })();
  return true;
}

export async function fetchComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CommentRow[];
  const authorIds = Array.from(new Set(rows.map(r => r.author_id)));
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", authorIds);
  const pmap = new Map((profiles ?? []).map(p => [p.id, p as Profile]));
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;
  const ids = rows.map(r => r.id);
  const { data: reactions } = await supabase.from("reactions").select("comment_id,user_id,type").in("comment_id", ids);

  const byId = new Map<string, CommentRow>();
  rows.forEach(r => {
    const rs = (reactions ?? []).filter(x => x.comment_id === r.id && x.type === "like");
    byId.set(r.id, {
      ...r,
      author: pmap.get(r.author_id) ?? null,
      likes: rs.length,
      my_like: !!me && rs.some(x => x.user_id === me),
      replies: [],
    });
  });
  const top: CommentRow[] = [];
  byId.forEach(r => {
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id)!.replies!.push(r);
    else top.push(r);
  });
  return top;
}

export async function addComment(postId: string, content: string, parentId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("comments").insert({
    post_id: postId, author_id: user.id, parent_id: parentId ?? null, content,
  });
  if (error) throw error;

  // Notificaciones (best-effort): respuesta → autor del comentario padre;
  // comentario → autor del post; y menciones @usuario dentro del texto.
  void (async () => {
    try {
      if (parentId) {
        const { data: c } = await supabase.from("comments").select("author_id").eq("id", parentId).maybeSingle();
        if (c) await pushNotification({ userId: c.author_id, type: "reply", postId, commentId: parentId });
      } else {
        const { data: p } = await supabase.from("posts").select("author_id").eq("id", postId).maybeSingle();
        if (p) await pushNotification({ userId: p.author_id, type: "comment", postId });
      }
    } catch { /* noop */ }
    try {
      const mentions = Array.from(new Set(
        (content.match(/@([a-zA-Z0-9_]{2,24})/g) ?? []).map(t => t.slice(1))
      ));
      if (mentions.length) {
        const { data: rows } = await supabase.from("profiles").select("id, username").in("username", mentions);
        for (const row of rows ?? []) {
          await pushNotification({ userId: row.id, type: "mention", postId, commentId: parentId ?? undefined });
        }
      }
    } catch { /* noop */ }
  })();
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function reportContent(opts: { postId?: string; commentId?: string; reason: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    post_id: opts.postId ?? null,
    comment_id: opts.commentId ?? null,
    reason: opts.reason,
  });
  if (error) throw error;
}

export async function blockUser(blockedId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: blockedId });
}

export type NotifType = "comment" | "reply" | "reaction" | "repost" | "mention" | "follow" | "like" | "favorite" | "game";

/** Crea una notificación para otro usuario (best-effort). `push_notification` (SQL, security definer) aplica las reglas de «solo lo importante». */
export async function pushNotification(opts: {
  userId: string;
  type: NotifType;
  postId?: string;
  commentId?: string;
  actorId?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.rpc("push_notification", {
      _user_id: opts.userId,
      _actor_id: opts.actorId ?? user.id,
      _type: opts.type,
      _post_id: opts.postId ?? null,
      _comment_id: opts.commentId ?? null,
    } as never);
  } catch {
    /* best effort */
  }
}

export async function fetchNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map(r => r.actor_id).filter(Boolean))) as string[];
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", actorIds);
  const pmap = new Map((profiles ?? []).map(p => [p.id, p as Profile]));
  return rows.map(r => ({ ...r, actor: r.actor_id ? pmap.get(r.actor_id) ?? null : null }));
}

export async function markNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
}

/** Número total de notificaciones sin leer (para la campana). */
export async function countUnreadNotifications(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("read", false);
  if (error) throw error;
  return (data ?? []).length;
}

/**
 * TODAS las notificaciones de la cuenta (sin límite), con el perfil del actor.
 * El panel de estadísticas calcula los totales reales sobre esta lista, igual
 * que el panel de orbes lo hace con todas las transacciones.
 */
export async function fetchAllNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map(r => r.actor_id).filter(Boolean))) as string[];
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", actorIds);
  const pmap = new Map((profiles ?? []).map(p => [p.id, p as Profile]));
  return rows.map(r => ({ ...r, actor: r.actor_id ? pmap.get(r.actor_id) ?? null : null }));
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return hydrateProfileMedia((data as Profile) ?? null);
}

export async function isMod(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).some(r => r.role === "moderator" || r.role === "admin");
}

// ---------- Published games ----------
async function upsertTagsFor(postId: string, tags?: string[]) {
  if (!tags?.length) return;
  const names = Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
  for (const name of names) {
    let { data: tag } = await supabase.from("tags").select("id").eq("name", name).maybeSingle();
    if (!tag) {
      const { data: created } = await supabase.from("tags").insert({ name }).select().single();
      tag = created;
    }
    if (tag) await supabase.from("post_tags").insert({ post_id: postId, tag_id: tag.id }).select();
  }
}

export const GAME_GENRES = [
  "Acción", "Aventura", "Arcade", "Carreras", "Deportes",
  "Estrategia", "Plataformas", "Puzzle", "RPG", "Terror", "Educativo", "Otro",
] as const;

export async function publishGame(input: {
  project: unknown;
  title: string;
  description?: string;
  tags?: string[];
  coverFile?: File | null;
  screenshotFiles?: File[];
  allowRemix?: boolean;
  priceOrbes?: number;
  gameGenre?: string | null;
  coverFrame?: CoverFrame;
  /** El creador declara que el juego está hecho con IA (vibe coding). */
  vibeCoding?: boolean;
}): Promise<PostRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const json = JSON.stringify(input.project);
  const file = new File([json], `${input.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "game"}.asternal.json`, {
    type: "application/json",
  });
  const path = await uploadMedia(file, user.id);
  const coverPath = input.coverFile ? await uploadMedia(input.coverFile, user.id) : null;
  const screenshots = input.screenshotFiles?.length
    ? await Promise.all(input.screenshotFiles.map(f => uploadMedia(f, user.id)))
    : [];
  const content = `🎮 ${input.title}${input.description ? "\n\n" + input.description : ""}`;
  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content,
    media_urls: [path],
    media_type: "none",
    link_url: null,
    category: "game",
    game_genre: input.gameGenre?.trim() || null,
    cover_url: coverPath,
    screenshots,
    allow_remix: input.allowRemix ?? true,
    price_orbes: Math.max(0, Math.floor(input.priceOrbes ?? 0)),
    asset_preset: withGameAiState(
      withCoverFrame(null, input.coverFrame ?? DEFAULT_COVER_FRAME),
      // Juego hecho con el motor nativo: si no declara IA se verifica solo.
      initialGameAiState({ vibeCoding: input.vibeCoding, nativeEngine: true }),
    ),
  } as never).select().single();
  if (error) throw error;
  await upsertTagsFor(post!.id, input.tags);
  // Notifica a tus seguidores (best-effort): publicaste un juego nuevo.
  void (async () => {
    try {
      const { data: followers } = await supabase
        .from("follows" as never)
        .select("follower_id" as never)
        .eq("following_id" as never, user.id);
      for (const f of (followers ?? []) as { follower_id: string }[]) {
        await pushNotification({ userId: f.follower_id, type: "game", postId: post!.id });
      }
    } catch { /* noop */ }
  })();
  return post as PostRow;
}

export async function updateGame(postId: string, input: {
  project?: unknown;
  title: string;
  description?: string;
  tags?: string[];
  coverFile?: File | null;
  removeCover?: boolean;
  screenshotFiles?: File[];
  keepScreenshots?: string[];
  allowRemix?: boolean;
  priceOrbes?: number;
  gameGenre?: string | null;
  coverFrame?: CoverFrame;
  assetPreset?: Record<string, unknown> | null;
  /** Cambio del indicador de vibe coding al editar la ficha. */
  vibeCoding?: boolean;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const patch: Record<string, unknown> = {
    content: `🎮 ${input.title}${input.description ? "\n\n" + input.description : ""}`,
  };
  if (input.project !== undefined) {
    const json = JSON.stringify(input.project);
    const file = new File([json], `${input.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "game"}.asternal.json`, { type: "application/json" });
    const path = await uploadMedia(file, user.id);
    patch.media_urls = [path];
  }
  if (input.coverFile) {
    patch.cover_url = await uploadMedia(input.coverFile, user.id);
  } else if (input.removeCover) {
    patch.cover_url = null;
  }
  if (input.screenshotFiles || input.keepScreenshots) {
    // Se reemplaza la lista: conserva las marcadas + sube las nuevas.
    const keep = input.keepScreenshots ?? [];
    const uploads = input.screenshotFiles?.length
      ? await Promise.all(input.screenshotFiles.map(f => uploadMedia(f, user.id)))
      : [];
    patch.screenshots = [...keep, ...uploads];
  }
  if (typeof input.allowRemix === "boolean") patch.allow_remix = input.allowRemix;
  if (typeof input.priceOrbes === "number") patch.price_orbes = Math.max(0, Math.floor(input.priceOrbes));
  if (input.gameGenre !== undefined) patch.game_genre = input.gameGenre.trim() || null;
  if (input.coverFrame) patch.asset_preset = withCoverFrame(input.assetPreset, input.coverFrame);
  if (typeof input.vibeCoding === "boolean") {
    const previous = readGameAiState(input.assetPreset);
    if (input.vibeCoding !== (previous?.declared ?? false)) {
      const base = patch.asset_preset ?? withCoverFrame(input.assetPreset, input.coverFrame ?? DEFAULT_COVER_FRAME);
      patch.asset_preset = withGameAiState(base, initialGameAiState({
        vibeCoding: input.vibeCoding,
        // Solo el motor nativo recupera la verificación automática al quitar IA.
        nativeEngine: !input.vibeCoding && previous?.auto === true,
      }));
    }
  }
  const { error } = await supabase.from("posts").update(patch as never).eq("id", postId);
  if (error) throw error;
  if (input.tags) {
    await supabase.from("post_tags").delete().eq("post_id", postId);
    await upsertTagsFor(postId, input.tags);
  }
}

/**
 * Publica un juego que vive fuera de Asternal (GDevelop en gd.games o una
 * página estática hecha con otro motor). No hay proyecto interno: la ficha se
 * arma con título, descripción, icono y el enlace al juego.
 */
export async function publishWebGame(input: {
  title: string;
  description?: string;
  url: string;
  tags?: string[];
  coverFile?: File | null;
  gameGenre?: string | null;
  vibeCoding?: boolean;
}): Promise<PostRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const coverPath = input.coverFile ? await uploadMedia(input.coverFile, user.id) : null;
  const content = `🎮 ${input.title}${input.description ? "\n\n" + input.description : ""}`;
  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content,
    media_urls: [],
    media_type: "none",
    link_url: input.url,
    category: "game",
    game_genre: input.gameGenre?.trim() || null,
    cover_url: coverPath,
    screenshots: [],
    allow_remix: false,
    price_orbes: 0,
    asset_preset: withGameAiState(
      withCoverFrame(null, DEFAULT_COVER_FRAME),
      // Sin motor nativo: queda en espera de que un desarrollador lo revise.
      initialGameAiState({ vibeCoding: input.vibeCoding, nativeEngine: false }),
    ),
  } as never).select().single();
  if (error) throw error;
  await upsertTagsFor(post!.id, input.tags);
  void (async () => {
    try {
      const { data: followers } = await supabase
        .from("follows" as never)
        .select("follower_id" as never)
        .eq("following_id" as never, user.id);
      for (const f of (followers ?? []) as { follower_id: string }[]) {
        await pushNotification({ userId: f.follower_id, type: "game", postId: post!.id });
      }
    } catch { /* noop */ }
  })();
  return post as PostRow;
}

// ---------- Revisión de juegos (vibe coding / monetización) ----------

/** Juegos pendientes de revisión y ya revisados, para el panel de admin. */
export async function listGameReviews(limit = 150): Promise<PostRow[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("category", "game")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isSchemaMissing(error)) return [];
    throw error;
  }
  return (data ?? []) as PostRow[];
}

/** Decisión de un desarrollador: "no_ia" (gana) o "ia" (bloqueado). */
export async function reviewGameAi(postId: string, decision: "no_ia" | "ia"): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: post, error } = await supabase
    .from("posts")
    .select("asset_preset")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  const preset = (post?.asset_preset ?? null) as Record<string, unknown> | null;
  const next = withGameAiState(preset, applyReview(readGameAiState(preset), decision, user.id));
  const { error: upErr } = await supabase.from("posts")
    .update({ asset_preset: next } as never)
    .eq("id", postId);
  if (upErr) throw upErr;
}

/** El creador pide una nueva verificación de su juego bloqueado por IA. */
export async function requestGameReverification(postId: string): Promise<void> {
  const { data: post, error } = await supabase
    .from("posts")
    .select("asset_preset")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  const preset = (post?.asset_preset ?? null) as Record<string, unknown> | null;
  const next = withGameAiState(preset, requestReverification(readGameAiState(preset)));
  const { error: upErr } = await supabase.from("posts")
    .update({ asset_preset: next } as never)
    .eq("id", postId);
  if (upErr) throw upErr;
}

export async function purchaseGame(postId: string): Promise<{ ok: boolean; paid?: number; balance?: number; free?: boolean; already_owned?: boolean }> {
  const { data, error } = await supabase.rpc("purchase_game" as never, { _post_id: postId } as never);
  if (error) throw error;
  return (data as { ok: boolean; paid?: number; balance?: number; free?: boolean; already_owned?: boolean }) ?? { ok: false };
}

export async function getMyOrbes(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data } = await supabase.from("profiles").select("orbes").eq("id", user.id).maybeSingle();
  return (data as { orbes?: number } | null)?.orbes ?? 0;
}

export type OrbeTx = {
  id: string;
  user_id: string;
  amount: number;
  kind: "welcome_bonus" | "game_purchase" | "adjustment" | "refund";
  post_id: string | null;
  description: string | null;
  created_at: string;
};

export async function fetchOrbeTransactions(limit = 100): Promise<OrbeTx[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("orbe_transactions" as never)
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OrbeTx[];
}

/**
 * TODAS las transacciones de orbes de la cuenta (paginadas hasta 50k): las
 * estadísticas del panel se calculan sobre el total real, no sobre una muestra.
 */
export async function fetchAllOrbeTransactions(): Promise<OrbeTx[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const all: OrbeTx[] = [];
  const PAGE = 1000;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from("orbe_transactions" as never)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(i * PAGE, (i + 1) * PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as OrbeTx[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/**
 * Donate orbes from the current user to the author of a game post.
 * Deducts from donor, credits the author, records both transactions.
 */
export async function donateOrbs(
  postId: string,
  amount: number,
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (amount <= 0 || !Number.isFinite(amount)) return { ok: false, error: "Cantidad inválida" };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  // 1. Get the post author
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();
  if (postErr || !post) return { ok: false, error: "Juego no encontrado" };

  const authorId = (post as { author_id: string }).author_id;
  if (authorId === user.id) return { ok: false, error: "No puedes donar orbes a tu propio juego" };

  // 2. Check donor balance
  const { data: donorProfile } = await supabase
    .from("profiles")
    .select("orbes")
    .eq("id", user.id)
    .maybeSingle();
  const donorBalance = (donorProfile as { orbes?: number } | null)?.orbes ?? 0;
  if (donorBalance < amount) return { ok: false, error: "No tienes suficientes orbes" };

  // 3. Deduct from donor
  const { error: deductErr } = await supabase
    .from("profiles")
    .update({ orbes: donorBalance - amount })
    .eq("id", user.id);
  if (deductErr) return { ok: false, error: "Error al descontar orbes" };

  // 4. Credit author
  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("orbes")
    .eq("id", authorId)
    .maybeSingle();
  const authorBalance = (authorProfile as { orbes?: number } | null)?.orbes ?? 0;
  const { error: creditErr } = await supabase
    .from("profiles")
    .update({ orbes: authorBalance + amount })
    .eq("id", authorId);
  if (creditErr) return { ok: false, error: "Error al acreditar orbes" };

  // 5. Record donor transaction (negative)
  await supabase.from("orbe_transactions" as never).insert({
    user_id: user.id,
    amount: -amount,
    kind: "adjustment" as never,
    post_id: postId,
    description: `Donación a juego`,
  } as never);

  // 6. Record author transaction (positive)
  await supabase.from("orbe_transactions" as never).insert({
    user_id: authorId,
    amount: amount,
    kind: "adjustment" as never,
    post_id: postId,
    description: `Donación recibida de un jugador`,
  } as never);

  return { ok: true, balance: donorBalance - amount };
}


export async function remixGame(post: PostWithMeta): Promise<{ cloudId: string; name: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (post.allow_remix === false) throw new Error("El autor no permite remixes de este juego");
  if (!post.signed_media[0]) throw new Error("Juego sin datos");
  const project = await loadGameProject(post.signed_media[0]);
  const title = (post.content.split("\n")[0] || "Juego").replace(/^🎮\s*/, "").trim() || "Juego";
  const name = `${title} (remix)`;
  try { (project as { name?: string }).name = name; } catch { /* ignore */ }
  const { data, error } = await supabase.from("user_projects")
    .insert({ user_id: user.id, name, data: project as never })
    .select().single();
  if (error) throw error;
  return { cloudId: (data as { id: string }).id, name };
}


export async function fetchGames(opts: { search?: string } = {}): Promise<PostWithMeta[]> {
  return fetchFeed({ ...opts, category: "game" });
}

export async function loadGameProject(signedUrl: string): Promise<unknown> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error("No se pudo cargar el juego");
  return await res.json();
}

// ---------- Ranking: juegos más jugados (24h) ----------
const LOCAL_PLAYS_KEY = "_local_game_plays";
const PLAYS_WINDOW_MS = 24 * 3600 * 1000;

/**
 * Registra una jugada (al lanzar un juego). Best-effort: intenta guardarla en
 * la nube (tabla game_plays) y siempre la guarda localmente como respaldo.
 */
export async function recordGamePlay(postId: string): Promise<void> {
  if (!postId) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      try {
        await supabase.from("game_plays").insert({ user_id: user.id, post_id: postId });
      } catch {
        /* tabla sin crear en la BD → solo local */
      }
    }
  } catch {
    /* noop */
  }
  try {
    const raw = localStorage.getItem(LOCAL_PLAYS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ post_id: postId, at: Date.now() });
    // Poda: guarda solo lo relevante para el ranking (últimos 7 días).
    const cut = Date.now() - 7 * 24 * 3600 * 1000;
    const pruned = list.filter((x: { at: number }) => typeof x.at === "number" && x.at > cut).slice(-3000);
    localStorage.setItem(LOCAL_PLAYS_KEY, JSON.stringify(pruned));
  } catch {
    /* noop */
  }
}

/**
 * Cuenta las jugadas de cada juego en las últimas 24 horas.
 * Devuelve { counts, cloud }:
 *  - counts: mapa post_id → número de jugadas.
 *  - cloud: true si la nube respondió (la tabla game_plays existe y el ranking
 *    se sincroniza entre dispositivos); false si solo hay registro local del
 *    navegador (tabla sin crear o sin sesión → sin sincronización).
 * Cuando la nube funciona se usan SOLO sus datos: el registro local contiene
 * exactamente las mismas jugadas ya subidas por este navegador, así que
 * sumarlas duplicaría el conteo.
 */
export async function fetchGamePlayCounts24h(postIds: string[]): Promise<{ counts: Record<string, number>; cloud: boolean }> {
  const counts: Record<string, number> = {};
  if (!postIds.length) return { counts, cloud: false };
  const since = new Date(Date.now() - PLAYS_WINDOW_MS).toISOString();
  let cloudOk = false;
  try {
    const { data, error } = await supabase
      .from("game_plays")
      .select("post_id")
      .gte("created_at", since)
      .in("post_id", postIds);
    if (!error && Array.isArray(data)) {
      cloudOk = true;
      for (const r of data as { post_id: string }[]) {
        counts[r.post_id] = (counts[r.post_id] ?? 0) + 1;
      }
    }
  } catch {
    /* tabla sin crear → se usa solo el respaldo local */
  }
  if (!cloudOk) {
    try {
      const raw = localStorage.getItem(LOCAL_PLAYS_KEY);
      if (raw) {
        const list = JSON.parse(raw) as { post_id: string; at: number }[];
        const cut = Date.now() - PLAYS_WINDOW_MS;
        const ids = new Set(postIds);
        for (const x of list) {
          if (typeof x.at === "number" && x.at > cut && ids.has(x.post_id)) {
            counts[x.post_id] = (counts[x.post_id] ?? 0) + 1;
          }
        }
      }
    } catch {
      /* noop */
    }
  }
  return { counts, cloud: cloudOk };
}

// ---------- Cloud project sync ----------
export type CloudProject = {
  id: string;
  user_id: string;
  name: string;
  data: unknown;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function cloudListProjects(): Promise<CloudProject[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("user_projects").select("id,user_id,name,data,published_post_id,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) throw error;
  // La biblioteca de assets del editor vive en una fila reservada de esta tabla
  // (data.__kind = "asset-library"): no es un proyecto y no debe listarse como
  // juego ni importarse como tal en otros dispositivos.
  return ((data ?? []) as CloudProject[]).filter(r => {
    const d = r.data as { __kind?: string } | null;
    return !d || d.__kind !== "asset-library";
  });
}

export async function cloudSaveProject(input: { id?: string; name: string; data: unknown }): Promise<CloudProject> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (input.id) {
    const { data, error } = await supabase.from("user_projects")
      .update({ name: input.name, data: input.data as never })
      .eq("id", input.id).eq("user_id", user.id)
      .select().single();
    if (error) throw error;
    return data as CloudProject;
  }
  const { data, error } = await supabase.from("user_projects")
    .insert({ user_id: user.id, name: input.name, data: input.data as never })
    .select().single();
  if (error) throw error;
  return data as CloudProject;
}

export async function cloudDeleteProject(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_projects").delete().eq("id", id).eq("user_id", user.id);
}

// ---------- Admin ----------
export type ManagedUser = { id: string; username: string; display_name: string | null; avatar_url: string | null; is_mod: boolean; is_admin: boolean; trust_points: number | null };

export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).some(r => r.role === "admin");
}

export async function listManagedUsers(search?: string): Promise<ManagedUser[]> {
  let q = supabase.from("profiles").select("id,username,display_name,avatar_url,trust_points").limit(200);
  if (search) q = q.ilike("username", `%${search}%`);
  const { data: profs, error } = await q;
  if (error) throw error;
  const ids = (profs ?? []).map(p => p.id);
  if (!ids.length) return [];
  const { data: roles } = await supabase.from("user_roles").select("user_id,role").in("user_id", ids);
  const rmap = new Map<string, string[]>();
  (roles ?? []).forEach(r => {
    const arr = rmap.get(r.user_id) ?? [];
    arr.push(r.role);
    rmap.set(r.user_id, arr);
  });
  return (profs ?? []).map(p => {
    const rs = rmap.get(p.id) ?? [];
    return { ...p, is_mod: rs.includes("moderator"), is_admin: rs.includes("admin") };
  });
}

export async function setUserModerator(userId: string, on: boolean): Promise<void> {
  if (on) {
    await supabase.from("user_roles").insert({ user_id: userId, role: "moderator" });
  } else {
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "moderator");
  }
}

/**
 * Otorga (o retira) el rol de administrador. Solo un admin puede hacerlo
 * (RLS: roles_insert exige has_role('admin')).
 */
export async function setUserAdmin(userId: string, on: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (on) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" } as never);
    if (error && !/duplicate|conflict/i.test(error.message ?? "")) throw error;
  } else {
    if (userId === user.id) throw new Error("No puedes quitarte el rol de administrador a ti mismo.");
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    if (error) throw error;
  }
}


// ---------- Profile ----------
export async function updateMyProfile(patch: {
  username?: string; display_name?: string; bio?: string; avatar_url?: string | null;
  banner_url?: string | null; pronouns?: string; location?: string;
  status_text?: string; status_emoji?: string; accent_color?: string | null;
  favorite_genre?: string; custom_title?: string; birthday?: string | null;
  show_orbes?: boolean; theme_mode?: string; interests?: string[];
}): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const clean: Record<string, unknown> = {};
  if (patch.username !== undefined) clean.username = patch.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (patch.display_name !== undefined) clean.display_name = patch.display_name.trim();
  if (patch.bio !== undefined) clean.bio = patch.bio;
  if (patch.avatar_url !== undefined) clean.avatar_url = patch.avatar_url;
  if (patch.banner_url !== undefined) clean.banner_url = patch.banner_url;
  if (patch.pronouns !== undefined) clean.pronouns = patch.pronouns.trim() || null;
  if (patch.location !== undefined) clean.location = patch.location.trim() || null;
  if (patch.status_text !== undefined) clean.status_text = patch.status_text.trim() || null;
  if (patch.status_emoji !== undefined) clean.status_emoji = patch.status_emoji.trim() || null;
  if (patch.accent_color !== undefined) clean.accent_color = patch.accent_color;
  if (patch.favorite_genre !== undefined) clean.favorite_genre = patch.favorite_genre.trim() || null;
  if (patch.custom_title !== undefined) clean.custom_title = patch.custom_title.trim() || null;
  if (patch.birthday !== undefined) clean.birthday = patch.birthday;
  if (patch.show_orbes !== undefined) clean.show_orbes = patch.show_orbes;
  if (patch.theme_mode !== undefined) clean.theme_mode = patch.theme_mode;
  if (patch.interests !== undefined) clean.interests = patch.interests;
  const { data, error } = await supabase.from("profiles").update(clean as never).eq("id", user.id).select().single();
  if (error) throw error;
  return (await hydrateProfileMedia(data as Profile))!;
}

export async function uploadBanner(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Resize banner to 1024×300 max for quality + speed
  const optimized = await resizeImage(file, 1024);
  const optimizedFile = new File([optimized], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  const path = await uploadMedia(optimizedFile, user.id);
  return path;
}

/** Resize an image file to target size (max dimension) for faster upload & crisp display */
async function resizeImage(file: File, maxDim: number = 384): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  // Only resize if image is larger than maxDim
  if (img.naturalWidth <= maxDim && img.naturalHeight <= maxDim) {
    URL.revokeObjectURL(img.src);
    return file;
  }
  const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight);
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ?? file), "image/webp", 0.92));
}

export async function uploadAvatar(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Resize to 384×384 max for crisp display + fast upload
  const optimized = await resizeImage(file, 384);
  const optimizedFile = new File([optimized], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  const path = await uploadMedia(optimizedFile, user.id);
  return path;
}

async function hydrateProfileMedia(profile: Profile | null): Promise<Profile | null> {
  if (!profile) return null;
  const [avatarUrl, bannerUrl] = await Promise.all([
    resolveMediaUrl(profile.avatar_url),
    resolveMediaUrl(profile.banner_url),
  ]);
  return { ...profile, avatar_url: avatarUrl, banner_url: bannerUrl };
}

export async function fetchProfileById(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return hydrateProfileMedia((data as Profile) ?? null);
}

export async function fetchUserPosts(userId: string, opts: { games?: boolean; artwork?: boolean } = {}): Promise<PostWithMeta[]> {
  let q = supabase.from("posts").select("*").eq("author_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (opts.artwork) q = q.eq("category", "artwork").is("asset_preset", null);
  else if (opts.games === true) q = q.eq("category", "game");
  else if (opts.games === false) q = q.or("category.is.null,category.neq.game,category.neq.artwork");
  const { data: posts, error } = await q;
  if (error) throw error;
  if (!posts?.length) return [];
  const { data: { user } } = await supabase.auth.getUser();
  return enrichPosts(posts as PostRow[], user?.id ?? null);
}

/** Juegos del perfil: los publicados como post (category=game) MÁS los juegos
 *  adjuntados (pinned_game) a las publicaciones del usuario, deduplicados. */
export async function fetchUserGames(userId: string): Promise<PostWithMeta[]> {
  const published = await fetchUserPosts(userId, { games: true });
  const { data: attached } = await supabase
    .from("posts")
    .select("pinned_game_id")
    .eq("author_id", userId)
    .not("pinned_game_id", "is", null)
    .is("deleted_at", null);
  const pinnedIds = Array.from(new Set((attached ?? []).map(p => p.pinned_game_id).filter(Boolean))) as string[];
  let extra: PostWithMeta[] = [];
  if (pinnedIds.length) {
    const { data: rows } = await supabase
      .from("posts")
      .select("*")
      .in("id", pinnedIds)
      .is("deleted_at", null);
    if (rows?.length) {
      const { data: { user } } = await supabase.auth.getUser();
      extra = await enrichPosts(rows as PostRow[], user?.id ?? null);
    }
  }
  const byId = new Map<string, PostWithMeta>();
  for (const g of [...extra, ...published]) byId.set(g.id, g);
  return Array.from(byId.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ---------- Banned emails ----------
export type BannedEmail = { id: string; email: string; reason: string | null; created_at: string; banned_by: string | null };

export async function listBannedEmails(): Promise<BannedEmail[]> {
  const { data, error } = await supabase.from("banned_emails").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BannedEmail[];
}
export async function banEmail(email: string, reason?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const clean = email.trim().toLowerCase();
  if (!clean) throw new Error("Email requerido");
  const { error } = await supabase.from("banned_emails").insert({ email: clean, reason: reason || null, banned_by: user.id });
  if (error) throw error;
}
export async function unbanEmail(id: string): Promise<void> {
  const { error } = await supabase.from("banned_emails").delete().eq("id", id);
  if (error) throw error;
}

// ============ TRUST POINTS ============

/** Default trust points for new users */
export const DEFAULT_TRUST_POINTS = 10;

/** Get trust points for a user (returns default if column doesn't exist) */
export async function getTrustPoints(userId: string): Promise<number> {
  try {
    const { data } = await supabase.from("profiles").select("trust_points").eq("id", userId).maybeSingle();
    if (data && typeof (data as Record<string, unknown>).trust_points === "number") {
      return (data as Record<string, unknown>).trust_points as number;
    }
    return DEFAULT_TRUST_POINTS;
  } catch {
    return DEFAULT_TRUST_POINTS;
  }
}

/** Moderator: deduct trust points from a user. Auto-bans when reaching 0. */
export async function deductTrustPoints(
  targetUserId: string,
  amount: number,
  reason: string,
): Promise<{ newPoints: number; banned: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get current points
  const current = await getTrustPoints(targetUserId);
  const newPoints = Math.max(0, current - amount);

  // Log history BEFORE updating
  await supabase.from("trust_points_history" as never).insert({
    user_id: targetUserId,
    modifier_id: user.id,
    action: "deduct",
    amount,
    reason: reason || "Sin razón especificada",
    points_before: current,
    points_after: newPoints,
  } as never);

  // Update points
  const { error } = await supabase
    .from("profiles")
    .update({ trust_points: newPoints } as never)
    .eq("id", targetUserId);
  if (error) throw error;

  // Auto-ban if reaching 0
  let banned = false;
  if (newPoints <= 0) {
    try {
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", targetUserId)
        .maybeSingle();
      const targetUsername = (targetProfile as Record<string, unknown>)?.username as string | null;
      if (targetUsername) {
        await banEmail(
          `${targetUsername}@trust-ban.local`,
          `Auto-ban: trust points reached 0 (${reason})`,
        );
      }
      banned = true;
    } catch { /* noop */ }
  }

  return { newPoints, banned };
}

/** Moderator: restore trust points to a user */
export async function restoreTrustPoints(
  targetUserId: string,
  amount: number,
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  const current = await getTrustPoints(targetUserId);
  const newPoints = Math.min(DEFAULT_TRUST_POINTS, current + amount);

  // Log history BEFORE updating
  if (user) {
    await supabase.from("trust_points_history" as never).insert({
      user_id: targetUserId,
      modifier_id: user.id,
      action: "restore",
      amount,
      reason: "Puntos restaurados por moderador",
      points_before: current,
      points_after: newPoints,
    } as never);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ trust_points: newPoints } as never)
    .eq("id", targetUserId);
  if (error) throw error;
  return newPoints;
}

export type TrustHistoryEntry = {
  id: string;
  user_id: string;
  modifier_id: string | null;
  action: "deduct" | "restore";
  amount: number;
  reason: string;
  points_before: number;
  points_after: number;
  created_at: string;
};

/** Fetch trust points history for a user (most recent first). */
export async function fetchTrustHistory(userId: string): Promise<TrustHistoryEntry[]> {
  const { data, error } = await supabase
    .from("trust_points_history" as never)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50) as { data: TrustHistoryEntry[] | null; error: unknown };
  if (error || !data) return [];
  return data;
}

// ============ POLLS ============
export async function votePoll(pollId: string, optionIndex: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await supabase.from("post_poll_votes").delete().eq("poll_id", pollId).eq("user_id", user.id);
  const { error } = await supabase.from("post_poll_votes").insert({
    poll_id: pollId, user_id: user.id, option_index: optionIndex,
  });
  if (error) throw error;
}

// ============ PLUS FEATURES ============
export async function claimPlusOrbes(): Promise<{ ok: boolean; amount?: number; reason?: string; next_at?: string }> {
  const { data, error } = await supabase.rpc("claim_plus_orbes" as never);
  if (error) throw error;
  return (data as { ok: boolean; amount?: number; reason?: string; next_at?: string }) ?? { ok: false };
}

export async function updatePlusSettings(patch: {
  show_plus_badge?: boolean;
  avatar_frame?: string | null;
  social_links?: SocialLinks;
  name_effect?: string | null;
  profile_background?: string | null;
  post_effect?: string | null;
  creator_card_style?: CreatorCardStyle;
  qr_style?: QRStyle | null;
}): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const clean: Record<string, unknown> = {};
  if (patch.show_plus_badge !== undefined) clean.show_plus_badge = patch.show_plus_badge;
  if (patch.avatar_frame !== undefined) clean.avatar_frame = patch.avatar_frame;
  if (patch.social_links !== undefined) clean.social_links = patch.social_links;
  if (patch.name_effect !== undefined) clean.name_effect = patch.name_effect;
  if (patch.profile_background !== undefined) clean.profile_background = patch.profile_background;
  if (patch.post_effect !== undefined) clean.post_effect = patch.post_effect;
  if (patch.creator_card_style !== undefined) clean.creator_card_style = patch.creator_card_style;
  if (patch.qr_style !== undefined) clean.qr_style = patch.qr_style;
  const { data, error } = await supabase.from("profiles").update(clean as never).eq("id", user.id).select().single();
  if (error) throw error;
  return data as Profile;
}

// Activate Plus for N months (extends expiry). Server function verifies auth.
export async function activatePlus(months: number = 1): Promise<{ ok: boolean; expires_at?: string }> {
  const { data, error } = await supabase.rpc("activate_plus" as never, { _months: months } as never);
  if (error) throw error;
  return (data as { ok: boolean; expires_at?: string }) ?? { ok: false };
}

// Dev-only helper to force-disable Plus (simulate expiration).
export async function togglePlusStatus(on: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const patch = on
    ? { is_plus: true }
    : { is_plus: false, plus_expires_at: new Date(Date.now() - 1000).toISOString() };
  await supabase.from("profiles").update(patch as never).eq("id", user.id);
}

// ============ MY GAMES for pinning ============
export async function fetchMyGamesLite(): Promise<{ id: string; title: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("posts")
    .select("id,content")
    .eq("author_id", user.id).eq("category", "game").is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map(p => ({
    id: p.id,
    title: (p.content.split("\n")[0] || "Juego").replace(/^🎮\s*/, "").trim() || "Juego",
  }));
}

// ============ ARTWORK GALLERY ============
export async function fetchArtworks(opts: { search?: string } = {}): Promise<PostWithMeta[]> {
  return fetchFeed({ ...opts, category: "artwork", artistGallery: true });
}

export async function publishArtwork(input: {
  title: string;
  description?: string;
  imageDataUrl: string;
  priceOrbes: number;
  assetPreset?: Record<string, unknown> | null;
  tags?: string[];
}): Promise<PostRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Convert data URL to File and upload
  const blob = dataUrlToBlob(input.imageDataUrl);
  const file = new File([blob], `${input.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "artwork"}.png`, {
    type: "image/png",
  });
  const path = await uploadMedia(file, user.id);

  // Build rich content: title + description + hashtags
  const lines = [`🎨 ${input.title}`];
  if (input.description?.trim()) lines.push(input.description.trim());
  if (input.tags?.length) lines.push(input.tags.map(t => `#${t}`).join(" "));
  const content = lines.join("\n\n");

  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content,
    media_urls: [path],
    media_type: "image",
    category: "artwork",
    price_orbes: Math.max(0, Math.floor(input.priceOrbes)),
    cover_url: null,
    asset_preset: input.assetPreset ?? null,
  } as never).select().single();
  if (error) throw error;

  // Save hashtags to post_tags
  if (input.tags?.length && post) {
    await upsertTagsFor(post.id, input.tags);
  }

  return post as PostRow;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
  const raw = atob(parts[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function purchaseArtwork(postId: string): Promise<{ ok: boolean; paid?: number; balance?: number; free?: boolean; already_owned?: boolean }> {
  const { data, error } = await supabase.rpc("purchase_artwork" as never, { _post_id: postId } as never);
  if (error) throw error;
  return (data as { ok: boolean; paid?: number; balance?: number; free?: boolean; already_owned?: boolean }) ?? { ok: false };
}

/**
 * Pone una obra de la galería en reventa (solo el dueño actual).
 * price = 0 retira la obra de la venta.
 */
export async function resellArtwork(postId: string, price: number): Promise<{ ok: boolean; on_sale?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("resell_artwork" as never, {
    _post_id: postId,
    _price: Math.max(0, Math.floor(price)),
  } as never);
  if (error) throw error;
  return (data as { ok: boolean; on_sale?: boolean; error?: string }) ?? { ok: false };
}

/**
 * Obras de la galería que el usuario posee: las suyas (creador o dueño actual)
 * y las compradas históricamente (incluye compras anteriores a la reventa).
 */
export async function fetchMyArtworks(): Promise<PostWithMeta[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;
  if (!me) return [];

  const { data: purchases } = await supabase.from("game_purchases").select("post_id").eq("user_id", me);
  const legacyIds = (purchases ?? []).map(x => (x as { post_id: string }).post_id);

  const rows: PostRow[] = [];
  const q1 = await supabase.from("posts").select("*").is("deleted_at", null).eq("category", "artwork").is("asset_preset", null)
    .or(`current_owner_id.eq.${me},author_id.eq.${me}`)
    .order("created_at", { ascending: false }).limit(100);
  if (!q1.error) rows.push(...((q1.data ?? []) as PostRow[]));

  if (legacyIds.length) {
    const q2 = await supabase.from("posts").select("*").is("deleted_at", null).eq("category", "artwork").is("asset_preset", null)
      .in("id", legacyIds.slice(0, 200)).order("created_at", { ascending: false });
    if (!q2.error) rows.push(...((q2.data ?? []) as PostRow[]));
  }

  const uniq = Array.from(new Map(rows.map(r => [r.id, r])).values());
  return enrichPosts(uniq, me);
}

// ============ DOCUMENT upload helper ============
export async function uploadDocument(file: File): Promise<{ path: string; name: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const path = await uploadMedia(file, user.id);
  return { path, name: file.name };
}

// ============ EVENTS ============
export type EventItem = {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  starts_at: string;
  ends_at: string;
  prize_pool: number | null;
  prize_description: string | null;
  rules: string | null;
  status: "upcoming" | "active" | "completed";
  created_by: string;
  created_at: string;
  submission_count?: number;
  participant_count?: number;
  my_registered?: boolean;
  my_submission?: { id: string; post_id: string; status: string } | null;
};

export async function fetchEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from("events" as never)
    .select("*")
    .order("starts_at", { ascending: false });
  if (error) throw error;
  const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;
  const events = (data ?? []) as EventItem[];
  // Enrich with submission counts and my submissions
  const enriched: EventItem[] = [];
  for (const ev of events) {
    const { count: subs } = await supabase
      .from("event_submissions" as never)
      .select("*", { count: "exact", head: true })
      .eq("event_id", ev.id);
    const { data: parts } = await supabase
      .rpc("count_event_participants" as never, { _event_id: ev.id } as never);
    let mySub = null;
    let myRegistered = false;
    if (me) {
      const { data: subData } = await supabase
        .from("event_submissions" as never)
        .select("id,post_id,status")
        .eq("event_id", ev.id)
        .eq("author_id", me)
        .maybeSingle();
      mySub = subData as { id: string; post_id: string; status: string } | null;
      const { data: regRow } = await supabase
        .from("event_participants" as never)
        .select("id")
        .eq("event_id", ev.id)
        .eq("user_id", me)
        .maybeSingle();
      myRegistered = !!regRow;
    }
    enriched.push({
      ...ev,
      submission_count: subs ?? 0,
      participant_count: Number(parts ?? 0),
      my_registered: myRegistered,
      my_submission: mySub,
    });
  }
  return enriched;
}

export async function createEvent(input: {
  title: string;
  description: string;
  banner_url?: string | null;
  starts_at: string;
  ends_at: string;
  prize_pool?: number | null;
  prize_description?: string | null;
  rules?: string | null;
}): Promise<EventItem> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("events" as never)
    .insert({
      title: input.title,
      description: input.description,
      banner_url: input.banner_url ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      prize_pool: input.prize_pool ?? null,
      prize_description: input.prize_description ?? null,
      rules: input.rules ?? null,
      created_by: user.id,
      status: new Date(input.starts_at) > new Date() ? "upcoming" : "active",
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as EventItem;
}

export async function submitToEvent(eventId: string, postId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("event_submissions" as never)
    .insert({
      event_id: eventId,
      post_id: postId,
      author_id: user.id,
      status: "submitted",
    } as never);
  if (error) throw error;
}

export async function updateEventStatus(eventId: string, status: "upcoming" | "active" | "completed"): Promise<void> {
  const { error } = await supabase
    .from("events" as never)
    .update({ status } as never)
    .eq("id", eventId);
  if (error) throw error;
}

export async function deleteEvent(eventId: string): Promise<void> {
  // RLS: solo el staff (admin) puede borrar eventos (política events_delete).
  const { error } = await supabase
    .from("events" as never)
    .delete()
    .eq("id", eventId);
  if (error) throw error;
}

export type EventParticipant = {
  user_id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  joined_at: string;
};

// Inscribirse a un evento (idempotente; el RPC rechaza eventos finalizados).
export async function joinEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc("join_event" as never, { _event_id: eventId } as never);
  if (error) throw error;
}

// Desinscribirse de un evento.
export async function leaveEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_event" as never, { _event_id: eventId } as never);
  if (error) throw error;
}

// Lista de inscritos (avatar, nombre, fecha): SOLO staff — el RPC lanza
// not_authorized para el resto.
export async function listEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase.rpc("list_event_participants" as never, { _event_id: eventId } as never);
  if (error) throw error;
  return (data ?? []) as EventParticipant[];
}

// ============ FOLLOWS ============
export type FollowStats = { followers: number; following: number; i_follow: boolean };

export async function getFollowStats(userId: string): Promise<FollowStats> {
  const { data: { user } } = await supabase.auth.getUser();
  const [{ count: followers }, { count: following }, mine] = await Promise.all([
    supabase.from("follows" as never).select("*", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows" as never).select("*", { count: "exact", head: true }).eq("follower_id", userId),
    user && user.id !== userId
      ? supabase.from("follows" as never).select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { followers: followers ?? 0, following: following ?? 0, i_follow: !!(mine as { data: unknown }).data };
}

export async function followUser(userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.id === userId) return;
  const { error } = await supabase.from("follows" as never).insert({ follower_id: user.id, following_id: userId } as never);
  if (error && !String(error.message).includes("duplicate")) throw error;
  // Avisa al seguido (solo una vez hasta que lo lea).
  void pushNotification({ userId, type: "follow" }).catch(() => {});
}

export async function unfollowUser(userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("follows" as never).delete().eq("follower_id", user.id).eq("following_id", userId);
}

// Lista de perfiles que SIGUEN a userId (sus seguidores).
export async function fetchFollowers(userId: string): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from("follows" as never)
      .select("follower_id")
      .eq("following_id", userId)
      .order("created_at", { ascending: false }) as { data: { follower_id: string }[] | null; error: unknown };
    if (error) return [];
    const ids = Array.from(new Set((data ?? []).map(r => r.follower_id)));
    if (!ids.length) return [];
    let profilesData: Record<string, unknown>[] | null = null;
    try {
      const res = await supabase.from("profiles").select("*").in("id", ids);
      profilesData = res.data as Record<string, unknown>[] | null;
    } catch { /* batch failed */ }
    if (!profilesData || profilesData.length === 0) {
      const single: Profile[] = [];
      for (const id of ids) {
        try { const p = await fetchProfileById(id); if (p) single.push(p); } catch { /* ignore */ }
      }
      return single;
    }
    const byId = new Map(profilesData.map(p => [p.id, p as Profile]));
    return ids.map(id => byId.get(id)).filter((p): p is Profile => !!p);
  } catch { return []; }
}

// Lista de perfiles a los que SIGUE userId (su "siguiendo").
export async function fetchFollowing(userId: string): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from("follows" as never)
      .select("following_id")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false }) as { data: { following_id: string }[] | null; error: unknown };
    if (error) return [];
    const ids = Array.from(new Set((data ?? []).map(r => r.following_id)));
    if (!ids.length) return [];
    let profilesData: Record<string, unknown>[] | null = null;
    try {
      const res = await supabase.from("profiles").select("*").in("id", ids);
      profilesData = res.data as Record<string, unknown>[] | null;
    } catch { /* batch failed */ }
    if (!profilesData || profilesData.length === 0) {
      const single: Profile[] = [];
      for (const id of ids) {
        try { const p = await fetchProfileById(id); if (p) single.push(p); } catch { /* ignore */ }
      }
      return single;
    }
    const byId = new Map(profilesData.map(p => [p.id, p as Profile]));
    return ids.map(id => byId.get(id)).filter((p): p is Profile => !!p);
  } catch { return []; }
}
