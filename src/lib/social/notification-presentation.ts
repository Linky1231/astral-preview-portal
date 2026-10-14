export type NotificationCategory = "todas" | "interacciones" | "seguidores" | "juegos";

export type NotificationRecord = {
  type: string;
  read: boolean;
  created_at: string;
};

const CATEGORY_BY_TYPE: Record<string, Exclude<NotificationCategory, "todas">> = {
  comment: "interacciones",
  reply: "interacciones",
  reaction: "interacciones",
  like: "interacciones",
  favorite: "interacciones",
  repost: "interacciones",
  mention: "interacciones",
  follow: "seguidores",
  game: "juegos",
};

export const notificationFilterControlClass = "notification-filter-control w-full text-left rounded-lg border px-3 py-2.5 transition-colors duration-150";
export const notificationSummarySurfaceClass = "notification-summary-surface rounded-2xl border p-4";
export const notificationEventRowClass = "notification-event-row flex items-start gap-3 px-3 py-3 transition-colors";

export function notificationCategoryOf(type: string): Exclude<NotificationCategory, "todas"> {
  return CATEGORY_BY_TYPE[type] ?? "interacciones";
}

export function notificationTotals(items: NotificationRecord[]) {
  const categories: Record<Exclude<NotificationCategory, "todas">, { total: number; unread: number }> = {
    interacciones: { total: 0, unread: 0 },
    seguidores: { total: 0, unread: 0 },
    juegos: { total: 0, unread: 0 },
  };

  let unread = 0;
  for (const item of items) {
    const category = notificationCategoryOf(item.type);
    categories[category].total += 1;
    if (!item.read) {
      unread += 1;
      categories[category].unread += 1;
    }
  }

  return { total: items.length, unread, categories };
}
