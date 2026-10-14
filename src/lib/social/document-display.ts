export type DocumentDisplayMeta = {
  format: string;
  label: string;
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: "Documento PDF",
  doc: "Documento Word",
  docx: "Documento Word",
  xls: "Hoja de cálculo",
  xlsx: "Hoja de cálculo",
  ppt: "Presentación",
  pptx: "Presentación",
  txt: "Archivo de texto",
  csv: "Datos CSV",
  zip: "Archivo comprimido",
  rar: "Archivo comprimido",
};

/** Devuelve una descripción breve y fiable para diferenciar un archivo de una acción. */
export function documentDisplayMeta(name: unknown): DocumentDisplayMeta {
  const safeName = typeof name === "string" ? name.trim().split(/[?#]/, 1)[0] : "";
  const extension = safeName.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? "";
  return {
    format: extension ? extension.toUpperCase() : "ARCHIVO",
    label: FORMAT_LABELS[extension] ?? "Archivo adjunto",
  };
}
