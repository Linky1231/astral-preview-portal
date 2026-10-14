export type QrCornerStyle = "square" | "rounded" | "dots" | string;

/**
 * Reserva una zona silenciosa alrededor del código antes de redondear su marco.
 * Así los tres marcadores de detección nunca quedan pegados ni recortados.
 */
export function qrPreviewGeometry(size: number, cornerStyle: QrCornerStyle): { padding: number; frameSize: number } {
  const normalizedSize = Math.max(120, size || 180);
  const padding = cornerStyle === "dots" ? 28 : 16;
  return { padding, frameSize: normalizedSize + padding * 2 };
}
