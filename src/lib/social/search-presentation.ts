export const searchResultRowClass =
  "search-result-row rounded-xl border transition-all duration-200 group";

export function searchResultTextClass(kind: "title" | "meta" | "excerpt") {
  if (kind === "title") return "text-foreground";
  if (kind === "excerpt") return "text-foreground/70";
  return "text-muted-foreground/70";
}
