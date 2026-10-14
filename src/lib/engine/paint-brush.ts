export const PAINT_BRUSHES = [
  { id: "round", name: "Redondo", description: "Trazo suave y uniforme" },
  { id: "fine", name: "Fino", description: "Líneas delicadas y precisas" },
  { id: "grain", name: "Granulado", description: "Textura de lápiz sobre papel" },
  { id: "pixel", name: "Pixel art", description: "Cuadritos alineados, sin bordes suaves" },
  { id: "marker", name: "Marcador", description: "Trazo ancho y translúcido" },
] as const;
export type PaintBrush = typeof PAINT_BRUSHES[number]["id"];

export function drawBrush(ctx: CanvasRenderingContext2D, brush: PaintBrush, color: string, width: number, x0: number, y0: number, x1: number, y1: number) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const w = Math.max(1, width);
  if (brush === "pixel" || brush === "grain") {
    const cell = Math.max(1, Math.round(w));
    const spacing = brush === "pixel" ? Math.max(0.5, cell / 3) : Math.max(1, w / 4);
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / spacing));
    const visited = new Set<string>();
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps;
      const y = y0 + (y1 - y0) * i / steps;
      if (brush === "pixel") {
        const gx = Math.floor(x / cell) * cell, gy = Math.floor(y / cell) * cell;
        const key = `${gx},${gy}`;
        if (!visited.has(key)) ctx.fillRect(gx, gy, cell, cell);
        visited.add(key);
      } else {
        // Grano reproducible en coordenadas del dibujo, no dependiente del zoom.
        for (let g = 0; g < 8; g++) {
          const seed = Math.sin(Math.round(x) * 12.9898 + Math.round(y) * 78.233 + g * 37.719) * 43758.5453;
          const fraction = seed - Math.floor(seed);
          const angle = g * Math.PI / 4;
          const radius = Math.sqrt(fraction) * w / 2;
          ctx.globalAlpha = 0.2 + fraction * 0.5;
          ctx.fillRect(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius), 1, 1);
        }
      }
    }
  } else {
    const effectiveWidth = brush === "fine" ? Math.max(0.5, w * 0.3) : w;
    ctx.lineWidth = effectiveWidth;
    ctx.lineCap = brush === "marker" ? "square" : "round";
    ctx.lineJoin = "round";
    if (brush === "marker") ctx.globalAlpha = 0.35;
    if (x0 === x1 && y0 === y1) {
      if (brush === "marker") ctx.fillRect(x0 - w / 2, y0 - w / 2, w, w);
      else { ctx.beginPath(); ctx.arc(x0, y0, effectiveWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  ctx.restore();
}
