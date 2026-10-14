export type PostSurfaceKind = "game" | "poll" | "html" | "locked";

const POST_SURFACES: Record<PostSurfaceKind, string> = {
  game: "border border-border/60 bg-card/70 shadow-[0_1px_0_rgba(15,23,42,0.03)]",
  poll: "border border-primary/20 bg-primary/[0.035]",
  html: "border border-primary/20 bg-primary/[0.025]",
  locked: "border border-primary/20 bg-primary/[0.035]",
};

/**
 * Las piezas informativas del post preservan una jerarquía propia: los archivos y
 * juegos usan fichas neutras legibles; las capas Azure Drift quedan para contexto.
 * Los controles siguen definiendo su estado para no convertir información en botones.
 */
export function postSurfaceClass(kind: PostSurfaceKind): string {
  return POST_SURFACES[kind];
}
