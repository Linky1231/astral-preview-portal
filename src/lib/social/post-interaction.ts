export type PostInteractionSnapshot = {
  likes: number;
  favorites: number;
  reposts: number;
  liked: boolean;
  favorited: boolean;
  reposted: boolean;
};

export type PersonalInteractionOverrides = {
  liked: boolean;
  favorited: boolean;
  reposted: boolean;
};

/**
 * Los contadores pertenecen al post completo, mientras que las banderas
 * rellenas pertenecen exclusivamente a la persona que está viendo el feed.
 * Si esa persona acaba de interactuar, conservamos su elección ante una
 * actualización externa de conteos hasta que se monte una tarjeta nueva.
 */
export function mergePostInteractionSnapshot(
  local: PostInteractionSnapshot,
  incoming: PostInteractionSnapshot,
  overrides: PersonalInteractionOverrides,
): PostInteractionSnapshot {
  return {
    likes: incoming.likes,
    favorites: incoming.favorites,
    reposts: incoming.reposts,
    liked: overrides.liked ? local.liked : incoming.liked,
    favorited: overrides.favorited ? local.favorited : incoming.favorited,
    reposted: overrides.reposted ? local.reposted : incoming.reposted,
  };
}

export function toggleReactionSnapshot(
  snapshot: PostInteractionSnapshot,
  type: "like" | "favorite",
): PostInteractionSnapshot {
  const activeKey = type === "like" ? "liked" : "favorited";
  const countKey = type === "like" ? "likes" : "favorites";
  const nextActive = !snapshot[activeKey];

  return {
    ...snapshot,
    [activeKey]: nextActive,
    [countKey]: Math.max(0, snapshot[countKey] + (nextActive ? 1 : -1)),
  };
}

export function toggleRepostSnapshot(snapshot: PostInteractionSnapshot): PostInteractionSnapshot {
  const reposted = !snapshot.reposted;
  return {
    ...snapshot,
    reposted,
    reposts: Math.max(0, snapshot.reposts + (reposted ? 1 : -1)),
  };
}
