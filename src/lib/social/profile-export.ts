export type QrExportInput = {
  qrDataUri: string;
  size: number;
  padding: number;
  frameSize: number;
  background: string;
};

export type PortfolioExportInput = {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  headline: string;
  bio: string;
  accentColor: string;
  skills: string[];
  links: Array<{ label: string; url: string }>;
  achievements: Array<{ title: string; description: string; date: string }>;
};

export function qrHex(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.slice(1) : fallback;
}

export function safeExportFilename(value: string, fallback: string) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || fallback;
}

export function createQrExportSvg({ qrDataUri, size, padding, frameSize, background }: QrExportInput) {
  const canvas = 720;
  const outerInset = 42;
  const frame = canvas - outerInset * 2;
  const safeRatio = Math.max(0, Math.min(0.25, padding / Math.max(frameSize, 1)));
  const imageInset = Math.round(frame * safeRatio);
  const imageSize = frame - imageInset * 2;
  const x = outerInset + imageInset;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <rect width="${canvas}" height="${canvas}" fill="#f6f9ff"/>
  <rect x="${outerInset}" y="${outerInset}" width="${frame}" height="${frame}" rx="58" fill="${background}" stroke="#d9e2ee" stroke-width="3"/>
  <image x="${x}" y="${x}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet" href="${qrDataUri}"/>
</svg>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}

function safeHref(value: string) {
  const normalized = value.trim();
  const candidate = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch { return "#"; }
}

export function createPortfolioExportHtml(input: PortfolioExportInput) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(input.accentColor) ? input.accentColor : "#3b82f6";
  const achievements = input.achievements.length
    ? input.achievements.map(achievement => `<article class="achievement"><h3>${escapeHtml(achievement.title)}</h3>${achievement.description ? `<p>${escapeHtml(achievement.description)}</p>` : ""}${achievement.date ? `<time>${escapeHtml(achievement.date)}</time>` : ""}</article>`).join("")
    : "<p class=\"empty\">Aún no se han añadido logros.</p>";
  const skills = input.skills.length
    ? `<div class="skills">${input.skills.map(skill => `<span>${escapeHtml(skill)}</span>`).join("")}</div>`
    : "<p class=\"empty\">Sin habilidades añadidas.</p>";
  const links = input.links.length
    ? `<ul class="links">${input.links.map(link => `<li><a href="${escapeHtml(safeHref(link.url))}">${escapeHtml(link.label)}</a></li>`).join("")}</ul>`
    : "<p class=\"empty\">Sin enlaces añadidos.</p>";
  const avatar = input.avatarUrl ? `<img src="${escapeHtml(input.avatarUrl)}" alt="" />` : `<span>${escapeHtml(input.displayName.slice(0, 1).toUpperCase() || "A")}</span>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Portafolio de ${escapeHtml(input.displayName)}</title><style>
    :root{--accent:${accent};--ink:#152033;--muted:#65738a;--line:#dce5f1;--canvas:#f6f9ff}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font-family:Inter,Arial,sans-serif;line-height:1.5}.sheet{max-width:900px;margin:0 auto;padding:48px}.hero{padding:34px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(135deg,#fff,${accent}12);display:flex;gap:20px;align-items:center}.avatar{height:80px;width:80px;border-radius:24px;overflow:hidden;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:30px;font-weight:700;flex:none}.avatar img{width:100%;height:100%;object-fit:cover}.eyebrow{font-size:11px;letter-spacing:.15em;font-weight:700;color:var(--accent);text-transform:uppercase;margin:0 0 6px}.hero h1{font-size:30px;line-height:1.15;margin:0}.handle{margin:6px 0 0;color:var(--muted);font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px}.bio{margin:24px 0 0;max-width:680px;color:#435168}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}.panel{background:#fff;border:1px solid var(--line);border-radius:22px;padding:24px}.panel.wide{grid-column:1 / -1}h2{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}.skills{display:flex;gap:8px;flex-wrap:wrap}.skills span{color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 32%,white);background:color-mix(in srgb,var(--accent) 8%,white);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:600}.links{margin:0;padding-left:18px}.links li+li{margin-top:8px}.links a{color:var(--accent);text-decoration:none;font-weight:600}.achievement+.achievement{margin-top:16px;padding-top:16px;border-top:1px solid var(--line)}.achievement h3{margin:0;font-size:15px}.achievement p{margin:5px 0;color:#435168;font-size:13px}.achievement time{font-size:11px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,monospace}.empty{margin:0;color:var(--muted);font-size:13px}.foot{margin:22px 0 0;text-align:center;color:var(--muted);font-size:11px}@media(max-width:620px){.sheet{padding:22px}.hero{padding:24px;align-items:flex-start}.grid{grid-template-columns:1fr}.panel.wide{grid-column:auto}}@media print{body{background:#fff}.sheet{padding:0}.hero,.panel{break-inside:avoid}}
  </style></head><body><main class="sheet"><header class="hero"><div class="avatar">${avatar}</div><div><p class="eyebrow">Portafolio de creador</p><h1>${escapeHtml(input.headline)}</h1><p class="handle">${escapeHtml(input.displayName)} · @${escapeHtml(input.username)}</p></div></header>${input.bio ? `<p class="bio">${escapeHtml(input.bio)}</p>` : ""}<section class="grid"><section class="panel"><h2>Habilidades</h2>${skills}</section><section class="panel"><h2>Enlaces</h2>${links}</section><section class="panel wide"><h2>Logros</h2>${achievements}</section></section><p class="foot">Creado con Asternal Engine</p></main></body></html>`;
}
