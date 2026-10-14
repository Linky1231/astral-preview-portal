/**
 * Personaje por defecto del motor.
 *
 * Es una píldora (misma forma que el resto de entidades redondeadas) con look
 * chibi: cabeza amplia, ojitos grandes con brillo y rubor. **Sin boca**, por
 * decisión de diseño. El cuerpo lleva un degradado vertical derivado del color
 * de la entidad para dar volumen sin romper la paleta del proyecto.
 *
 * Lo usan por igual el editor de escenas y el runtime / editor de UI, así que
 * el personaje se ve idéntico en el editor y en PLAY.
 */

/** Aclara (amount > 0) u oscurece (amount < 0) un color hex. Devuelve `rgb(...)`. */
export function shadeColor(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex; // nombre CSS o rgba: se deja tal cual
  let body = match[1];
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  const n = parseInt(body, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (v: number) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Traza una píldora (rectángulo redondeado) en el contexto actual. */
function pillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Dibuja el personaje chibi en coordenadas absolutas del canvas.
 *
 * @param facing 1 mira a la derecha, -1 a la izquierda. Si el contexto ya está
 *   espejado (como en el editor de escenas), pasa 1.
 */
export function drawChibiCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  facing: 1 | -1 = 1,
): void {
  const radius = Math.min(6, w / 2, h / 2);

  // 1 · Cuerpo: degradado vertical (claro → color → oscuro) mantiene la píldora.
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, shadeColor(color, 0.4));
  body.addColorStop(0.5, color);
  body.addColorStop(1, shadeColor(color, -0.28));
  ctx.fillStyle = body;
  pillPath(ctx, x, y, w, h, radius);
  ctx.fill();

  // 2 · Volumen: brillo arriba-izquierda y sombra abajo-derecha.
  const gloss = ctx.createLinearGradient(x, y, x + w, y + h);
  gloss.addColorStop(0, "rgba(255,255,255,0.45)");
  gloss.addColorStop(0.42, "rgba(255,255,255,0.05)");
  gloss.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = gloss;
  pillPath(ctx, x, y, w, h, radius);
  ctx.fill();

  // 3 · Cabeza chibi: la mitad superior un poco más clara (proporción de bebé).
  const headY = y + h * 0.08;
  const headH = h * 0.5;
  const head = ctx.createLinearGradient(x, headY, x, headY + headH);
  head.addColorStop(0, "rgba(255,255,255,0.24)");
  head.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = head;
  pillPath(ctx, x + w * 0.08, headY, w * 0.84, headH, headH / 2);
  ctx.fill();

  // 4 · Ojitos: grandes, con iris y brillo; parpadean cada 4 s.
  const blinking = (performance.now() / 1000) % 4 > 3.82;
  const eyeW = Math.max(6, w * 0.2);
  const eyeH = Math.max(6, h * 0.15);
  const eyeY = headY + headH * 0.42;
  const eyeGap = w * 0.16;
  const leftEye = x + w / 2 - eyeGap - eyeW / 2;
  const rightEye = x + w / 2 + eyeGap - eyeW / 2;
  const look = facing * Math.min(1.2, w * 0.03);

  const eye = (ex: number) => {
    if (blinking) {
      ctx.strokeStyle = "rgba(15,23,42,0.6)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex, eyeY + eyeH / 2);
      ctx.lineTo(ex + eyeW, eyeY + eyeH / 2);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = "#f8fafc";
    pillPath(ctx, ex, eyeY, eyeW, eyeH, eyeW / 2);
    ctx.fill();
    const iris = eyeH * 0.4;
    const cx = ex + eyeW / 2 + look;
    const cy = eyeY + eyeH / 2;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(cx, cy, iris, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(cx - iris * 0.38, cy - iris * 0.42, iris * 0.36, 0, Math.PI * 2);
    ctx.fill();
  };
  eye(leftEye);
  eye(rightEye);

  // 5 · Mejillas: refuerzan el look chibi.
  ctx.fillStyle = "rgba(244,114,182,0.3)";
  for (const cx of [x + w * 0.2, x + w * 0.8]) {
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + eyeH * 0.95, w * 0.11, h * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6 · Piececitos sutiles.
  const footH = Math.min(6, h * 0.09);
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  pillPath(ctx, x + w * 0.12, y + h - footH, w * 0.2, footH, 2.5);
  ctx.fill();
  pillPath(ctx, x + w * 0.68, y + h - footH, w * 0.2, footH, 2.5);
  ctx.fill();
}
