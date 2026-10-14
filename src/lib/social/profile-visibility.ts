export function shouldShowPublicOrbes(showOrbes: boolean | null | undefined, orbes: number | null | undefined) {
  return showOrbes !== false && typeof orbes === "number" && Number.isFinite(orbes);
}

export function formatPublicOrbes(orbes: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(orbes);
}
