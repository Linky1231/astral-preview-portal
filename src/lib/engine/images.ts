// Shared image cache. Key = data URL (or any src string).
const cache = new Map<string, HTMLImageElement>();

export type RenderableImage = HTMLImageElement | ImageBitmap;

export function getImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = cache.get(src);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  img.src = src;
  cache.set(src, img);
  return null;
}

// Always return HTMLImageElement: createImageBitmap on iOS/Safari can
// premultiply alpha incorrectly and turn transparent PNGs into black squares.
export function getRenderableImage(src: string): RenderableImage | null {
  return getImage(src);
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = cache.get(src);
    if (existing && existing.complete && existing.naturalWidth > 0) return resolve(existing);
    const img = existing ?? new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    if (!existing) cache.set(src, img);
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (!img.src) img.src = src;
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });
}

/** Medidas naturales de una imagen que ya está disponible (`undefined` si falla). */
export async function imageSize(src: string): Promise<{ w: number; h: number } | undefined> {
  try {
    const img = await preloadImage(src);
    return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  } catch {
    return undefined;
  }
}

export async function fileToDataURL(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return raw;
  try {
    const img = await preloadImage(raw);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return raw;
  }
}

export function drawTransparencyGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell = 12) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#9ca3af";
  for (let yy = y; yy < y + h; yy += cell) {
    for (let xx = x + (((yy - y) / cell) % 2 === 0 ? 0 : cell); xx < x + w; xx += cell * 2) {
      ctx.fillRect(xx, yy, cell, cell);
    }
  }
  ctx.restore();
}
