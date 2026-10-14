import { useEffect, useRef, useState } from "react";
import type { Entity, RuntimeInput, RuntimeState, Scene, UIElement } from "@/lib/engine/core";
import { stepScene, newRuntimeState, resolveUIRect, sortedForRender, isOnHiddenLayer, layerOpacityFor } from "@/lib/engine/core";
import { getRenderableImage } from "@/lib/engine/images";
import { currentFrameRenderable } from "@/lib/engine/animations";
import { drawChibiCharacter } from "@/lib/engine/character";
import { createScriptRunner, type RuntimeHooks, type UIScriptPhase } from "@/lib/engine/scripts";
import { startMusic, stopMusic, setVolume, setMuted } from "@/lib/engine/sfx";
import { drawUIElement } from "./UIEditor";

interface Props {
  scene: Scene;
  fpsCap: 30 | 60 | 120;
  showHUD: boolean;
  showFPS?: boolean;
  volume?: number;
  muted?: boolean;
  music?: boolean;
  musicUrl?: string | null;
  touchControls?: boolean;
  autoPause?: boolean;
  showHitboxes?: boolean;
  onExit: () => void;
}

export function GameRuntime({
  scene, fpsCap, showHUD,
  showFPS = true, volume = 0.8, muted = false, music = false, musicUrl = null,
  touchControls = true, autoPause = true, showHitboxes = false,
  onExit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<RuntimeInput>({ left: false, right: false, jump: false });
  const stateRef = useRef<RuntimeState | null>(null);
  /** Puente hacia los scripts de los elementos de UI (viven dentro del efecto). */
  const uiScriptsRef = useRef<((el: UIElement, phase: UIScriptPhase) => void) | null>(null);
  /**
   * La escena que se está jugando de verdad. El runtime trabaja sobre su propia
   * copia, así que el toque debe buscar los elementos ahí: si un script cambia un
   * elemento (lo esconde, lo agranda…), el toque siguiente ya ve ese cambio.
   */
  const workRef = useRef<Scene | null>(null);
  const [hud, setHud] = useState({ score: 0, fps: 0, win: false, dead: false });
  const [dialog, setDialog] = useState<RuntimeState["dialog"]>(null);

  useEffect(() => { setVolume(volume); }, [volume]);
  useEffect(() => { setMuted(muted); }, [muted]);
  useEffect(() => {
    if (music && !muted && musicUrl) startMusic(musicUrl);
    else stopMusic();
    return () => stopMusic();
  }, [music, muted, musicUrl]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const initial: Scene = JSON.parse(JSON.stringify(scene));
    let work: Scene = JSON.parse(JSON.stringify(initial));
    workRef.current = work;
    let drawList = sortedForRender(work).filter(e => !isOnHiddenLayer(work, e));
    const state: RuntimeState = newRuntimeState(initial);
    stateRef.current = state;
    let scripts = createScriptRunner();
    uiScriptsRef.current = (el, phase) => scripts.runUI(el, phase);
    const shake = { intensity: 0, time: 0 };
    const hooks: RuntimeHooks = {
      shake: (intensity: number, duration: number) => {
        shake.intensity = Math.max(shake.intensity, intensity);
        shake.time = Math.max(shake.time, duration);
      },
      restart: () => {
        work = JSON.parse(JSON.stringify(initial));
        workRef.current = work;
        drawList = sortedForRender(work).filter(e => !isOnHiddenLayer(work, e));
        Object.assign(state, newRuntimeState(initial));
        scripts = createScriptRunner();
      },
    };

    let paused = false;
    const onVis = () => { if (autoPause) paused = document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    const onRestart = () => hooks.restart();
    window.addEventListener("asternal:restart", onRestart);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const targetDt = 1 / fpsCap;
    let frames = 0;
    let fpsT = last;

    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      cssW = Math.max(1, canvas.clientWidth);
      cssH = Math.max(1, canvas.clientHeight);
      const nextW = Math.round(cssW * dpr);
      const nextH = Math.round(cssH * dpr);
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    };
    resize();
    window.addEventListener("resize", resize);

    type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; gravity: number };
    const particles: Part[] = [];
    const flushParticles = () => {
      const list = state.particles ?? [];
      for (const p of list) {
        const n = p.count ?? 8;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 60 + Math.random() * 140;
          particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.6, max: 0.6, color: p.color, size: 3, gravity: 400 });
        }
      }
      if (list.length) state.particles = [];
    };

    const tickEmitters = (dt: number) => {
      for (const e of work.entities) {
        const em = e.emitter;
        if (!em || !em.enabled) continue;
        em._acc = (em._acc ?? 0) + (em.rate || 0) * dt;
        while ((em._acc ?? 0) >= 1) {
          em._acc = (em._acc ?? 0) - 1;
          const dir = ((em.direction || 0) + (Math.random() - 0.5) * (em.spread || 0)) * Math.PI / 180;
          const sp = em.speed || 80;
          particles.push({
            x: e.x + e.w / 2,
            y: e.y + e.h / 2,
            vx: Math.cos(dir) * sp,
            vy: Math.sin(dir) * sp,
            life: em.lifetime || 1,
            max: em.lifetime || 1,
            color: em.color || "#7dd3fc",
            size: em.size || 3,
            gravity: em.gravity ?? 0,
          });
        }
      }
    };


    const draw = () => {
      const W = cssW || canvas.clientWidth;
      const H = cssH || canvas.clientHeight;
      ctx.fillStyle = work.bg || "#0b1e3f";
      ctx.fillRect(0, 0, W, H);

      // Background image
      if (work.bgImage) {
        const img = getRenderableImage(work.bgImage);
        if (img && img.width) {
          const mode = work.bgImageMode || "cover";
          if (mode === "stretch") {
            ctx.drawImage(img, 0, 0, W, H);
          } else if (mode === "tile") {
            for (let x = 0; x < W; x += img.width) for (let y = 0; y < H; y += img.height) ctx.drawImage(img, x, y);
          } else {
            const sa = img.width / img.height;
            const da = W / H;
            const fit = mode === "cover" ? sa > da : sa < da;
            const dw = fit ? H * sa : W;
            const dh = fit ? H : W / sa;
            ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
          }
        }
      }


      // (parallax bands removed — scene now uses real Z-ordered layers)

      ctx.strokeStyle = "rgba(56,189,248,0.10)";
      ctx.lineWidth = 1;
      const off = -state.cameraX * 0.4;
      ctx.beginPath();
      for (let x = (off % 40); x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();

      // Fixed-size camera: the view does NOT shrink when the map grows.
      const VIEW_H = 700;
      const scale = H / VIEW_H;
      const viewW = W / scale;
      const viewH = VIEW_H;
      const player = work.entities.find((e) => e.controllable);
      let camX = state.cameraX;
      let camY = 0;
      if (player) {
        camX = player.x + player.w / 2 - viewW / 2;
        camY = player.y + player.h / 2 - viewH / 2;
        if (work.width > viewW) camX = Math.max(0, Math.min(work.width - viewW, camX));
        else camX = (work.width - viewW) / 2;
        if (work.height > viewH) camY = Math.max(0, Math.min(work.height - viewH, camY));
        else camY = (work.height - viewH) / 2;
        state.cameraX = camX;
      }
      const sx = shake.time > 0 ? (Math.random() - 0.5) * shake.intensity : 0;
      const sy = shake.time > 0 ? (Math.random() - 0.5) * shake.intensity : 0;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      ctx.translate(-camX, -camY);

      const tSec = performance.now() / 1000;
      const visualEffects = W >= 700;
      for (const e of drawList) {
        if (e.visible === false) continue;
        const la = layerOpacityFor(work, e);
        const a = (e.opacity ?? 1) * la;
        // invuln blink
        if (e.controllable && state.invulnT > 0 && Math.floor(state.invulnT * 16) % 2 === 0) {
          ctx.globalAlpha = 0.4 * la;
        } else if (a !== 1) ctx.globalAlpha = a;
        drawEntity(ctx, e, tSec, visualEffects);
        ctx.globalAlpha = 1;
      }

      // particles
      flushParticles();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;


      if (showHitboxes) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#f43f5e";
        ctx.setLineDash([4, 3]);
        for (const e of work.entities) {
          const hb = e.hitbox;
          if (hb) ctx.strokeRect(e.x + hb.x, e.y + hb.y, hb.w, hb.h);
          else ctx.strokeRect(e.x, e.y, e.w, e.h);
        }
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (showHUD) {
        ctx.fillStyle = "rgba(2,6,23,0.6)";
        ctx.fillRect(12, 12, 260, 36);
        ctx.strokeStyle = "rgba(125,211,252,0.5)";
        ctx.strokeRect(12, 12, 260, 36);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "600 14px Rajdhani, sans-serif";
        ctx.fillText(`SCORE ${state.score}`, 22, 35);
        ctx.fillText(`♥ ${state.lives}`, 130, 35);
        if (work.timeLimit && work.timeLimit > 0) {
          const left = Math.max(0, Math.ceil(work.timeLimit - state.time));
          ctx.fillStyle = left < 10 ? "#f43f5e" : "#7dd3fc";
          ctx.fillText(`⏱ ${left}`, 190, 35);
        }
      }

      // UI overlay (screen-space)
      const W2 = W, H2 = H;
      const tick = performance.now() / 16;
      const uiState = { score: state.score, lives: state.lives, time: state.time, timeLimit: work.timeLimit, startLives: work.startLives };
      for (const el of (work.ui ?? [])) {
        if (el.visible === false) continue;
        if (el.kind === "joystick") {
          // Custom joystick render: single base + real knob (no duplicate preview knob).
          const r = resolveUIRect(el, W2, H2);
          const rad = Math.min(r.w, r.h) / 2;
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          ctx.globalAlpha = el.opacity ?? 1;
          ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.4)";
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
          const k = joyKnobs.current.get(el.id);
          const kx = cx + (k?.dx ?? 0);
          const ky = cy + (k?.dy ?? 0);
          ctx.fillStyle = el.color ?? "#7dd3fc";
          ctx.beginPath(); ctx.arc(kx, ky, rad / 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          continue;
        }
        drawUIElement(ctx, el, W2, H2, tick, uiState);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const elapsed = (now - last) / 1000;
      last = now;
      if (!paused) {
        acc += elapsed;
        let steps = 0;
        while (acc >= targetDt && steps < 5) {
          if (!state.win && !state.dead) {
            stepScene(work, inputRef.current, state, targetDt);
            scripts.step(work, state, inputRef.current, hooks, targetDt);
            if (drawList.length !== work.entities.length) {
              drawList = sortedForRender(work).filter(e => !isOnHiddenLayer(work, e));
            }
          }
          if (shake.time > 0) shake.time = Math.max(0, shake.time - targetDt);
          tickEmitters(targetDt);
          // particle physics
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * targetDt;
            p.y += p.vy * targetDt;
            p.vy += p.gravity * targetDt;
            p.life -= targetDt;
            if (p.life <= 0) particles.splice(i, 1);
          }
          acc -= targetDt;
          steps++;
        }
        // Scripts de interfaz «mientras se mantiene»: un paso por fotograma,
        // solo con el botón aún pulsado.
        for (const d of activePointers.current.values()) {
          if (d.kind === "btn") uiScriptsRef.current?.(d.el, "hold");
        }
      }
      draw();
      frames++;
      // Sync dialog to React (compare by identity to avoid extra renders)
      setDialog(prev => {
        const d = state.dialog ?? null;
        if (!prev && !d) return prev;
        if (prev && d && prev.entityId === d.entityId && prev.lineIndex === d.lineIndex) return prev;
        return d;
      });
      if (now - fpsT > 500) {
        const fps = Math.round((frames * 1000) / (now - fpsT));
        setHud({ score: state.score, fps, win: state.win, dead: state.dead });
        frames = 0; fpsT = now;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      uiScriptsRef.current = null;
      workRef.current = null;
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("asternal:restart", onRestart);
    };
  }, [scene, fpsCap, showHUD, autoPause, showHitboxes]);

  // Input is the OR of multiple sources (buttons, joystick, keyboard) so
  // pressing JUMP while moving the joystick keeps both active.
  const btnSrc = useRef({ left: false, right: false, jump: false });
  const joySrc = useRef({ left: false, right: false, jump: false });
  const recomputeInput = () => {
    inputRef.current.left = btnSrc.current.left || joySrc.current.left;
    inputRef.current.right = btnSrc.current.right || joySrc.current.right;
    inputRef.current.jump = btnSrc.current.jump || joySrc.current.jump;
  };
  const press = (k: keyof RuntimeInput, v: boolean) => {
    btnSrc.current[k] = v;
    recomputeInput();
  };

  // UI element hit handling (buttons + joysticks)
  const uiButtons = (scene.ui ?? []).filter(e => e.kind === "button" && (e.visible ?? true));
  const uiJoysticks = (scene.ui ?? []).filter(e => e.kind === "joystick" && (e.visible ?? true));
  /** La UI viva de la partida (la copia del runtime), no la del editor. */
  const liveUI = (): UIElement[] => workRef.current?.ui ?? scene.ui ?? [];
  const hasCustomInput = (act: "left" | "right" | "jump") =>
    uiButtons.some(b => b.action === act) || (act !== "jump" && uiJoysticks.length > 0);
  const hasAnyCustomInput = uiButtons.some(b => ["left","right","jump"].includes(b.action ?? "")) || uiJoysticks.length > 0;
  const showDefaultTouch = touchControls && !hasAnyCustomInput;

  type JoyDrag = { kind: "btn"; el: UIElement } | { kind: "joy"; el: UIElement; cx: number; cy: number; r: number };
  const activePointers = useRef<Map<number, JoyDrag>>(new Map());
  const joyKnobs = useRef<Map<string, { dx: number; dy: number }>>(new Map());

  const hitUIButton = (sx: number, sy: number): UIElement | null => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    // Además de los botones, cualquier elemento de interfaz con scripts responde
    // al toque: es lo que le da acciones y momento de ejecución.
    const tappable = liveUI().filter(e =>
      (e.visible ?? true) && e.kind !== "joystick" && (e.kind === "button" || (e.scripts?.length ?? 0) > 0));
    for (let i = tappable.length - 1; i >= 0; i--) {
      const b = tappable[i];
      const r = resolveUIRect(b, W, H);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return b;
    }
    return null;
  };
  const hitJoystick = (sx: number, sy: number): { el: UIElement; cx: number; cy: number; r: number } | null => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const joysticks = liveUI().filter(e => e.kind === "joystick" && (e.visible ?? true));
    for (let i = joysticks.length - 1; i >= 0; i--) {
      const j = joysticks[i];
      const r = resolveUIRect(j, W, H);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(r.w, r.h) / 2;
      const dx = sx - cx, dy = sy - cy;
      // Use a slightly larger grab radius so the touch doesn't slip off
      const grab = rad * 1.3;
      if (dx * dx + dy * dy <= grab * grab) return { el: j, cx, cy, r: rad };
    }
    return null;
  };

  const applyJoystick = (id: string, dx: number, dy: number, r: number) => {
    const len = Math.hypot(dx, dy);
    const max = r;
    const nx = len > max ? (dx / len) * max : dx;
    const ny = len > max ? (dy / len) * max : dy;
    joyKnobs.current.set(id, { dx: nx, dy: ny });
    const ax = nx / max;
    void ny;
    joySrc.current.left = ax < -0.25;
    joySrc.current.right = ax > 0.25;
    // Joystick is for movement only — jumping is bound to the JUMP button.
    recomputeInput();
  };
  const releaseJoystick = (id: string) => {
    joyKnobs.current.delete(id);
    joySrc.current.left = false;
    joySrc.current.right = false;
    joySrc.current.jump = false;
    recomputeInput();
  };

  const handleButton = (b: UIElement, down: boolean) => {
    const act = b.kind === "button" ? b.action ?? "none" : "none";
    if (act === "left" || act === "right" || act === "jump") press(act, down);
    else if (down && act === "restart") window.dispatchEvent(new CustomEvent("asternal:restart"));
    else if (down && act === "exit") onExit();
    else if (down && act === "event" && b.eventName) window.dispatchEvent(new CustomEvent("asternal:ui-event", { detail: b.eventName }));
    // Los scripts del elemento se suman a su acción: se disparan al pulsar y
    // al soltar (el «mientras se mantiene» lo lleva el bucle de dibujo).
    if (b.scripts?.length) uiScriptsRef.current?.(b, down ? "tap" : "release");
  };

  const onCanvasDown = (ev: React.PointerEvent) => {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    const b = hitUIButton(sx, sy);
    if (b) {
      (ev.target as Element).setPointerCapture(ev.pointerId);
      activePointers.current.set(ev.pointerId, { kind: "btn", el: b });
      handleButton(b, true);
      ev.preventDefault();
      return;
    }
    const j = hitJoystick(sx, sy);
    if (j) {
      (ev.target as Element).setPointerCapture(ev.pointerId);
      activePointers.current.set(ev.pointerId, { kind: "joy", el: j.el, cx: j.cx, cy: j.cy, r: j.r });
      applyJoystick(j.el.id, sx - j.cx, sy - j.cy, j.r);
      ev.preventDefault();
    }
  };
  const onCanvasMove = (ev: React.PointerEvent) => {
    const d = activePointers.current.get(ev.pointerId);
    if (!d || d.kind !== "joy") return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    applyJoystick(d.el.id, sx - d.cx, sy - d.cy, d.r);
  };
  const onCanvasUp = (ev: React.PointerEvent) => {
    const d = activePointers.current.get(ev.pointerId);
    if (!d) return;
    if (d.kind === "btn") handleButton(d.el, false);
    else releaseJoystick(d.el.id);
    activePointers.current.delete(ev.pointerId);
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full block touch-none"
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
        onPointerCancel={onCanvasUp}
      />

      <div className="pointer-events-none absolute top-3 right-3 flex gap-2">
        {showFPS && (
          <div className="panel rounded-md px-2 py-1 text-[10px] font-mono text-primary-glow">
            {hud.fps} FPS
          </div>
        )}
        <button
          onClick={onExit}
          className="pointer-events-auto panel rounded-md px-3 py-1 text-xs font-display text-foreground glow-border"
        >STOP</button>
      </div>

      {showDefaultTouch && (
        <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between select-none">
          <div className="flex gap-3">
            {!hasCustomInput("left") && <TouchBtn label="◀" onDown={() => press("left", true)} onUp={() => press("left", false)} />}
            {!hasCustomInput("right") && <TouchBtn label="▶" onDown={() => press("right", true)} onUp={() => press("right", false)} />}
          </div>
          {!hasCustomInput("jump") && <TouchBtn label="JUMP" big onDown={() => press("jump", true)} onUp={() => press("jump", false)} />}
        </div>
      )}

      {(hud.win || hud.dead) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="panel rounded-2xl px-8 py-6 text-center glow-border">
            <div className="font-display text-2xl glow-text mb-2">
              {hud.win ? "LEVEL CLEAR" : "GAME OVER"}
            </div>
            <div className="text-sm text-muted-foreground mb-4">Score: {hud.score}</div>
            <button
              onClick={onExit}
              className="font-display text-sm px-5 py-2 rounded-md bg-primary text-primary-foreground glow-border"
            >BACK TO EDITOR</button>
          </div>
        </div>
      )}
      {dialog && (
        <div
          className="absolute inset-x-0 bottom-0 p-3 sm:p-5 pointer-events-auto"
          onPointerDown={(e) => {
            e.stopPropagation();
            const s = stateRef.current;
            if (s) s.dialogAdvance = true;
          }}
        >
          <div className="mx-auto max-w-[720px] rounded-2xl border border-primary/30 bg-background/92 backdrop-blur-md shadow-2xl overflow-hidden">
            {dialog.speaker && (
              <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                {dialog.portrait && (
                  <img src={dialog.portrait} alt="" className="w-9 h-9 rounded-full object-cover border border-primary/40" />
                )}
                <div className="text-[11px] font-display tracking-widest text-primary uppercase">{dialog.speaker}</div>
              </div>
            )}
            <div className="px-4 pb-3 pt-1 text-[15px] leading-snug text-foreground">
              {dialog.text}
            </div>
            <div className="px-4 pb-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>{dialog.lineIndex + 1} / {dialog.totalLines}</span>
              <span className="animate-pulse">▶ tap to continue</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TouchBtn({ label, onDown, onUp, big }: { label: string; onDown: () => void; onUp: () => void; big?: boolean }) {
  return (
    <button
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={(e) => {
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
        onUp();
      }}
      onPointerCancel={() => onUp()}
      onPointerLeave={(e) => { if (e.buttons) onUp(); }}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-none select-none ${big ? "h-20 w-20 text-base" : "h-16 w-16 text-2xl"} rounded-full panel glow-border font-display text-primary-glow active:scale-95 active:bg-primary/30 transition-transform`}
    >
      {label}
    </button>
  );
}

export function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, time: number, visualEffects = true) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const rot = ((e.rotation ?? 0) * Math.PI) / 180;
  if (rot) {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);
  }
  const flip = (e.facing === -1) !== !!e.flipX;
  if (flip) {
    ctx.translate(e.x + e.w, e.y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(e.x, e.y);
  }
  const animImg = currentFrameRenderable(e, time);
  const drawFit = (img: HTMLImageElement | ImageBitmap) => {
    const fit = e.textureFit ?? "stretch";
    if (fit === "stretch") { ctx.drawImage(img, 0, 0, e.w, e.h); return; }
    const sa = img.width / img.height;
    const da = e.w / e.h;
    const cover = fit === "cover" ? sa > da : sa < da;
    const dw = cover ? e.h * sa : e.w;
    const dh = cover ? e.h : e.w / sa;
    ctx.drawImage(img, (e.w - dw) / 2, (e.h - dh) / 2, dw, dh);
  };
  if (animImg) { drawFit(animImg); ctx.restore(); return; }
  if (e.texture) {
    const img = getRenderableImage(e.texture);
    if (img) { drawFit(img); ctx.restore(); return; }
  }
  // fallback shape — reset flip/translate but keep rotation, so redraw at absolute coords
  ctx.restore();
  ctx.save();
  if (rot) {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);
  }
  if (visualEffects) {
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.kind === "coin" ? 10 : e.kind === "goal" ? 12 : 4;
  }
  ctx.fillStyle = e.color;
  if (e.kind === "coin") {
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === "goal") {
    ctx.fillStyle = "rgba(125,211,252,0.3)";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x + e.w / 2 - 2, e.y, 4, e.h);
    ctx.beginPath();
    ctx.moveTo(e.x + e.w / 2 + 2, e.y + 4);
    ctx.lineTo(e.x + e.w / 2 + 22, e.y + 12);
    ctx.lineTo(e.x + e.w / 2 + 2, e.y + 20);
    ctx.closePath();
    ctx.fill();
  } else {
    const r = e.kind === "platform" ? 4 : 6;
    roundRect(ctx, e.x, e.y, e.w, e.h, r);
    ctx.fill();
    if (e.kind === "player") {
      ctx.shadowBlur = 0;
      drawChibiCharacter(ctx, e.x, e.y, e.w, e.h, e.color, e.facing ?? 1);
    }
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
