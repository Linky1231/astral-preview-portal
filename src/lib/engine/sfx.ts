// Tiny WebAudio synth — preset sound effects + simple background music.
let ctx: AudioContext | null = null;
let volume = 0.8;
let muted = false;

export function setVolume(v: number) { volume = Math.max(0, Math.min(1, v)); if (musicEl) musicEl.volume = volume; }
export function setMuted(v: boolean) { muted = v; if (v) stopMusic(); }

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.2, slide = 0) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(gain * volume, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export type SoundName = "jump" | "coin" | "hit" | "win" | "lose" | "power" | "laser" | "blip" | "thud";

export function playSound(name: SoundName) {
  switch (name) {
    case "jump":  beep(420, 0.18, "square",   0.18,  280); break;
    case "coin":  beep(880, 0.06, "square",   0.18,    0);
                  setTimeout(() => beep(1320, 0.10, "square", 0.18, 0), 60); break;
    case "hit":   beep(180, 0.20, "sawtooth", 0.22, -120); break;
    case "win":   beep(523, 0.10, "triangle", 0.20,    0);
                  setTimeout(() => beep(659, 0.10, "triangle", 0.20, 0), 110);
                  setTimeout(() => beep(784, 0.20, "triangle", 0.20, 0), 220); break;
    case "lose":  beep(330, 0.18, "sawtooth", 0.22,    0);
                  setTimeout(() => beep(220, 0.30, "sawtooth", 0.22, -120), 180); break;
    case "power": beep(440, 0.08, "square",   0.18,  220);
                  setTimeout(() => beep(660, 0.08, "square", 0.18, 220), 80);
                  setTimeout(() => beep(880, 0.14, "square", 0.18, 220), 160); break;
    case "laser": beep(1200, 0.12, "sawtooth", 0.18, -800); break;
    case "blip":  beep(700, 0.05, "square",   0.15,    0); break;
    case "thud":  beep(90,  0.16, "sine",     0.30,  -40); break;
  }
}

export const SOUND_NAMES: SoundName[] = ["jump","coin","hit","win","lose","power","laser","blip","thud"];

// --- Sonidos personalizados (archivos del usuario) ---
//
// El editor ya no reproduce sonidos predeterminados: un script o el botón de
// vista previa solo suenan si apuntan a un archivo del usuario. La biblioteca
// es una lista local (igual patrón que la biblioteca de assets) para reutilizar
// el mismo sonido en varias entidades/escenas.
export interface CustomSound {
  id: string;
  name: string;
  /** dataURL o URL del archivo de audio del usuario. */
  url: string;
}

const SOUND_LIBRARY_KEY = "asternal:sounds";

/** Lee la biblioteca de sonidos del usuario (vacia si no hay nada o falla). */
export function loadCustomSounds(): CustomSound[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SOUND_LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is CustomSound =>
      !!s && typeof s === "object" &&
      typeof (s as CustomSound).id === "string" &&
      typeof (s as CustomSound).url === "string"
    );
  } catch {
    return [];
  }
}

/** Guarda la biblioteca de sonidos del usuario. */
export function saveCustomSounds(list: CustomSound[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SOUND_LIBRARY_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

/**
 * Añade un sonido del usuario a la biblioteca (deduplicando por url) y la
 * devuelve ya guardada.
 */
export function addCustomSound(name: string, url: string, id = uid()): CustomSound[] {
  const clean: CustomSound = { id, name: name.trim() || "sonido", url };
  const rest = loadCustomSounds().filter(s => s.url !== url);
  const next = [...rest, clean];
  saveCustomSounds(next);
  return next;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

let playing: HTMLAudioElement[] = [];

/**
 * Reproduce un sonido del usuario. Es el único camino de reproducción de
 * efectos del editor/motor: sin archivo no suena nada (nunca un preset).
 */
export function playSoundUrl(url?: string | null): boolean {
  if (muted || !url) return false;
  try {
    if (typeof Audio === "undefined") return false;
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume));
    const maybe = a.play();
    if (maybe && typeof maybe.catch === "function") maybe.catch(() => { /* autoplay bloqueado */ });
    playing.push(a);
    playing = playing.filter(el => !el.ended && !el.paused).slice(-8);
    return true;
  } catch {
    return false;
  }
}

/** Reproduce un sonido aleatorio de la biblioteca del usuario (o nada). */
export function playRandomCustomSound(): boolean {
  const list = loadCustomSounds();
  if (!list.length) return false;
  return playSoundUrl(list[Math.floor(Math.random() * list.length)].url);
}

/** Detiene los efectos de sonido personalizados en curso. */
export function stopCustomSounds() {
  for (const a of playing) {
    try { a.pause(); } catch { /* ignore */ }
  }
  playing = [];
}

export function vibrate(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { (navigator as Navigator).vibrate(ms); } catch { /* ignore */ }
  }
}

// --- Background music: plays a user-provided audio file (no default) ---
let musicEl: HTMLAudioElement | null = null;
let musicSrc: string | null = null;

export function startMusic(url?: string | null) {
  if (muted) { stopMusic(); return; }
  if (!url) { stopMusic(); return; }
  if (musicEl && musicSrc === url) {
    musicEl.volume = volume;
    if (musicEl.paused) musicEl.play().catch(() => {});
    return;
  }
  stopMusic();
  try {
    const a = new Audio(url);
    a.loop = true;
    a.volume = volume;
    a.play().catch(() => {});
    musicEl = a;
    musicSrc = url;
  } catch { /* ignore */ }
}

export function stopMusic() {
  if (musicEl) {
    try { musicEl.pause(); } catch { /* ignore */ }
    musicEl = null;
    musicSrc = null;
  }
}
