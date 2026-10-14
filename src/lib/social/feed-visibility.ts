type FeedItem = {
  category?: string | null;
  content?: string | null;
  signed_media?: string[];
  signed_cover?: string | null;
  signed_documents?: { url: string }[];
  html_content?: string | null;
  link_url?: string | null;
  locked_content?: string | null;
  poll?: unknown;
  pinned_game?: unknown;
};

export function isCommunityPublication(post: FeedItem): boolean {
  return !["game", "artwork", "system"].includes(post.category ?? "");
}

export function hasPublicationContent(post: FeedItem): boolean {
  return Boolean(
    post.content?.trim() || post.signed_media?.some(url => url.trim()) ||
    post.signed_cover?.trim() || post.signed_documents?.some(doc => doc.url.trim()) ||
    post.html_content?.trim() || post.link_url?.trim() || post.locked_content?.trim() ||
    post.poll || post.pinned_game
  );
}