// Animation system for Asternal Engine
import type { Entity } from "./core";
import { getImage, getRenderableImage } from "./images";

export type AnimState = "idle" | "walk" | "run" | "jump" | "fall" | "attack" | string;

export interface AnimationClip {
  id: string;
  name: AnimState;
  fps: number;        // frames per second
  loop: boolean;      // loop or play once
  frames: string[];   // data URLs in sequence
}

export const DEFAULT_ANIM_NAMES: AnimState[] = ["idle", "walk", "run", "jump", "fall", "attack"];

/** Pick which animation should play for an entity right now. */
export function pickAnimState(e: Entity): AnimState {
  // Players & enemies infer state from velocity
  if (e.controllable || e.kind === "enemy") {
    if (e.vy < -60) return "jump";
    if (e.vy > 80) return "fall";
    if (Math.abs(e.vx) > 10) return "walk";
    return "idle";
  }
  return "idle";
}

/** Find best matching clip with fallback chain. */
export function findClip(e: Entity, state: AnimState): AnimationClip | null {
  const list = e.animations ?? [];
  if (!list.length) return null;
  return (
    list.find(c => c.name === state) ??
    list.find(c => c.name === "idle") ??
    list[0]
  );
}

/** Current frame src for an entity at a given time (seconds). */
export function currentFrameSrc(e: Entity, time: number, state?: AnimState): string | null {
  const st = state ?? pickAnimState(e);
  const clip = findClip(e, st);
  if (!clip || !clip.frames.length) return e.texture ?? null;
  const total = clip.frames.length;
  const fps = Math.max(1, clip.fps || 8);
  const idx = Math.floor(time * fps);
  const i = clip.loop ? ((idx % total) + total) % total : Math.min(idx, total - 1);
  return clip.frames[i];
}

/** Convenience: get the HTMLImageElement to draw, or null. */
export function currentFrameImage(e: Entity, time: number, state?: AnimState): HTMLImageElement | null {
  const src = currentFrameSrc(e, time, state);
  if (!src) return null;
  return getImage(src);
}

export function currentFrameRenderable(e: Entity, time: number, state?: AnimState): HTMLImageElement | ImageBitmap | null {
  const src = currentFrameSrc(e, time, state);
  if (!src) return null;
  return getRenderableImage(src);
}
