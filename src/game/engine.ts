import { Sfx } from "./audio";
import { t } from "../i18n";

export type Phase = "menu" | "playing" | "paused" | "over";

export interface HudData {
  points: number;
  gears: number;
  mult: number;
  wind: number; // 0..1
  dash: number; // 0..1 готовность
  echoes: number;
  time: number;
  phase: Phase;
}

export interface GameOverInfo {
  points: number;
  gears: number;
  time: number;
  best: number;
  newBest: boolean;
  reason: string;
  hint: string;
}

interface Vec {
  x: number;
  y: number;
}

interface Echo {
  id: number;
  path: Vec[];
  idx: number;
  dir: 1 | -1;
  speed: number;
  age: number;
  life: number;
  r: number;
  rot: number;
  pos: Vec;
  tint: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
  square: boolean;
}

interface Pickup {
  x: number;
  y: number;
  r: number;
  age: number;
  ttl: number;
  rot: number;
}

const TAU = Math.PI * 2;
const REC_STEP = 1 / 50;
const MAX_REC = 430;
const MAX_ECHOES = 16;
const MAT_TIME = 1.15;

const PLAYER_R = 0.038;

// ——— НАСТРОЙКИ УПРАВЛЕНИЯ (крутить и сравнивать на ощупь) ———
// MOUSE_SENSITIVITY — множитель смещения курсора мыши от центра арены.
// 1.0 = как сейчас (позиция курсора = целевая точка 1:1). Больше 1 — до края
// арены долетаешь при меньшем реальном перемещении мыши («острее»).
const MOUSE_SENSITIVITY = 1.0;
// PLAYER_SPEED — максимальная скорость игрока, в единицах арены/сек (1.0 = радиус арены в секунду).
const PLAYER_SPEED = 0.92;
const MAX_SPEED = PLAYER_SPEED; // старое имя используется ниже по коду
const STEER = 9.5;
const DASH_SPEED = 2.45;
const DASH_TIME = 0.16;
const DASH_INVULN = 0.34;
const DASH_CD = 5.5; // было 3.3 — по просьбе увеличено время перезарядки

const WIND_MAX = 100;
export const BEST_KEY = "echo.best.v1"; // экспорт — используется в Leaderboard.tsx как офлайн-фоллбек

const C = {
  paper: "#f4e9d2",
  ink: "46,35,24",
  brass: "192,138,62",
  brassL: "227,186,108",
  copper: "169,84,47",
  rust: "140,59,35",
  moss: "92,107,69",
};

function gearPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, teeth: number, rot: number) {
  const inner = r * 0.74;
  const step = TAU / teeth;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    ctx.arc(cx, cy, r, a, a + step * 0.44);
    ctx.arc(cx, cy, inner, a + step * 0.56, a + step * 1.0);
  }
  ctx.closePath();
}

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export interface Callbacks {
  onHud: (h: HudData) => void;
  onOver: (info: GameOverInfo) => void;
  onPhase: (p: Phase) => void;
}

export class EchoGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: Callbacks;
  sfx = new Sfx();

  private w = 0;
  private h = 0;
  private dpr = 1;
  private R = 300;
  private cx = 0;
  private cy = 0;

  phase: Phase = "menu";
  private raf = 0;
  private last = 0;

  // состояние партии
  private player: Vec = { x: 0, y: 0 };
  private vel: Vec = { x: 0, y: 0 };
  private trail: { x: number; y: number; a: number }[] = [];
  private rec: Vec[] = [];
  private recAcc = 0;
  private echoes: Echo[] = [];
  private particles: Particle[] = [];
  private floaters: { x: number; y: number; life: number; max: number; text: string; color: string; size: number }[] =
    [];
  private gear: Pickup | null = null;
  private key: Pickup | null = null;
  private echoId = 1;

  private points = 0;
  private gears = 0;
  private chain = 0;
  private chainTimer = 0;
  private wind = WIND_MAX;
  private time = 0;
  private best = 0;

  private dashT = 0;
  private dashCd = 0;
  private invuln = 0;
  private dashDir: Vec = { x: 1, y: 0 };

  private shake = 0;
  private flash = 0;
  private flashColor = "255,240,200";
  private deathT = 0;
  private lastKeyTime = -99;
  private warnTick = 0;
  private nearest = 9;

  // ввод
  private keys = new Set<string>();
  private pointerSteer = false;
  private pointerTarget: Vec = { x: 0, y: 0 };
  private touchAnchor: Vec | null = null;
  private touchOrigin: Vec = { x: 0, y: 0 };
  private lastTapAt = 0;
  private hudAcc = 0;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.cb = cb;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      this.best = 0;
    }
    this.bind();
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ——— публичное API ———

  getBest() {
    return this.best;
  }

  // Применяет рекорд, пришедший из облака (после сравнения с локальным
  // максимумом на вызывающей стороне — см. yandex.ts:loadBestScore).
  applyExternalBest(n: number) {
    if (n > this.best) {
      this.best = n;
      try {
        localStorage.setItem(BEST_KEY, String(n));
      } catch {
        /* ignore */
      }
      this.emitHud();
    }
  }

  start() {
    this.sfx.ensure();
    this.player = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.trail = [];
    this.rec = [];
    this.recAcc = 0;
    this.echoes = [];
    this.particles = [];
    this.floaters = [];
    this.key = null;
    this.points = 0;
    this.gears = 0;
    this.chain = 0;
    this.chainTimer = 0;
    this.wind = WIND_MAX;
    this.time = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.lastKeyTime = -99;
    this.pointerSteer = false;
    this.pointerTarget = { x: 0, y: 0 };
    this.touchAnchor = null;
    this.keys.clear();
    this.gear = this.makePickup(0.055, 0.45);
    this.setPhase("playing");
    this.sfx.start();
    this.emitHud();
  }

  togglePause() {
    if (this.phase === "playing") this.setPhase("paused");
    else if (this.phase === "paused") this.setPhase("playing");
  }

  pause() {
    if (this.phase === "playing") this.setPhase("paused");
  }

  goMenu() {
    this.echoes = [];
    this.particles = [];
    this.floaters = [];
    this.key = null;
    this.gear = null;
    this.trail = [];
    this.rec = [];
    this.player = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.wind = WIND_MAX;
    this.time = 0;
    this.points = 0;
    this.gears = 0;
    this.chain = 0;
    this.shake = 0;
    this.flash = 0;
    this.setPhase("menu");
  }

  dash() {
    if (this.phase !== "playing" || this.dashCd > 0) return;
    const len = Math.hypot(this.vel.x, this.vel.y);
    if (len > 0.02) this.dashDir = { x: this.vel.x / len, y: this.vel.y / len };
    else {
      const d = Math.hypot(this.player.x, this.player.y) || 1;
      this.dashDir = { x: -this.player.x / d, y: -this.player.y / d };
    }
    this.dashT = DASH_TIME;
    this.invuln = DASH_INVULN;
    this.dashCd = DASH_CD;
    this.sfx.dash();
    for (let i = 0; i < 12; i++) {
      const a = Math.atan2(-this.dashDir.y, -this.dashDir.x) + rnd(-0.7, 0.7);
      this.burst(this.player.x, this.player.y, 1, C.brassL, a, rnd(0.1, 0.45));
    }
  }

  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);

    // небольшой резерв сверху/снизу под HUD (плашки очков/завода/проскока
    // сверху, кнопка проскока снизу) — раньше арена шла впритык на весь
    // экран и HUD-плашки перекрывали игровое поле у верхнего края
    const topPad = Math.min(this.h * 0.2, Math.max(88, this.h * 0.13));
    const botPad = Math.min(this.h * 0.15, Math.max(64, this.h * 0.1));
    const sidePad = Math.max(14, this.w * 0.015);

    this.cx = this.w / 2;
    this.cy = topPad + (this.h - topPad - botPad) / 2;
    this.R = Math.min((this.w - sidePad * 2) / 2, (this.h - topPad - botPad) / 2) * 0.98;
  }

  // ——— ввод ———

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  private onBlur = () => this.pause();

  private onKeyDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight") this.dash();
    if (e.code === "Escape" || e.code === "KeyP") this.togglePause();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private toUnit(e: PointerEvent): Vec {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left - this.cx) / this.R, y: (e.clientY - rect.top - this.cy) / this.R };
  }

  private onPointerMove = (e: PointerEvent) => {
    const p = this.toUnit(e);
    if (e.pointerType === "touch") {
      if (!this.touchAnchor) return;
      const dx = (p.x - this.touchAnchor.x) * 1.45;
      const dy = (p.y - this.touchAnchor.y) * 1.45;
      this.pointerTarget = { x: this.touchOrigin.x + dx, y: this.touchOrigin.y + dy };
    } else {
      this.pointerTarget = { x: p.x * MOUSE_SENSITIVITY, y: p.y * MOUSE_SENSITIVITY };
    }
    this.pointerSteer = true;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.sfx.ensure();
    const p = this.toUnit(e);
    if (e.pointerType === "touch") {
      const now = performance.now();
      if (now - this.lastTapAt < 280) this.dash();
      this.lastTapAt = now;
      this.touchAnchor = p;
      this.touchOrigin = { ...this.player };
      this.pointerTarget = { ...this.player };
      this.pointerSteer = true;
      this.canvas.setPointerCapture?.(e.pointerId);
    } else {
      this.pointerTarget = { x: p.x * MOUSE_SENSITIVITY, y: p.y * MOUSE_SENSITIVITY };
      this.pointerSteer = true;
      if (e.button === 2) this.dash();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      this.touchAnchor = null;
      this.pointerSteer = false;
    }
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== "touch") this.pointerSteer = false;
  };

  private has(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  private desired(): Vec {
    let kx = 0;
    let ky = 0;
    if (this.has("KeyA", "ArrowLeft")) kx -= 1;
    if (this.has("KeyD", "ArrowRight")) kx += 1;
    if (this.has("KeyW", "ArrowUp")) ky -= 1;
    if (this.has("KeyS", "ArrowDown")) ky += 1;
    if (kx || ky) {
      this.pointerSteer = false;
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l };
    }
    if (this.pointerSteer) {
      const dx = this.pointerTarget.x - this.player.x;
      const dy = this.pointerTarget.y - this.player.y;
      const l = Math.hypot(dx, dy);
      if (l < 0.004) return { x: 0, y: 0 };
      const s = Math.min(1, l / 0.07);
      return { x: (dx / l) * s, y: (dy / l) * s };
    }
    return { x: 0, y: 0 };
  }

  // ——— вспомогательное ———

  private setPhase(p: Phase) {
    this.phase = p;
    this.cb.onPhase(p);
    this.emitHud();
  }

  private emitHud() {
    this.cb.onHud({
      points: Math.round(this.points),
      gears: this.gears,
      mult: this.multiplier(),
      wind: Math.max(0, this.wind / WIND_MAX),
      dash: Math.min(1, 1 - this.dashCd / DASH_CD),
      echoes: this.echoes.length,
      time: this.time,
      phase: this.phase,
    });
  }

  private multiplier() {
    return Math.max(1, Math.min(5, 1 + Math.floor(this.chain / 4)));
  }

  private makePickup(r: number, minPlayerDist: number): Pickup {
    let best: Vec = { x: 0, y: 0 };
    let bestScore = -Infinity;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * 0.84;
      const p = { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
      const dp = Math.hypot(p.x - this.player.x, p.y - this.player.y);
      let minEcho = 2;
      for (const e of this.echoes) minEcho = Math.min(minEcho, Math.hypot(p.x - e.pos.x, p.y - e.pos.y));
      const s = minEcho * 1.9 + Math.min(dp, 1.0) * 0.65 - (dp < minPlayerDist ? 1.8 : 0);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    return { x: best.x, y: best.y, r, age: 0, ttl: 0, rot: Math.random() * TAU };
  }

  private burst(x: number, y: number, n: number, color: string, angle?: number, speed?: number) {
    for (let i = 0; i < n; i++) {
      const a = angle ?? Math.random() * TAU;
      const sp = speed ?? rnd(0.15, 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rnd(0.35, 0.95),
        max: 1,
        size: rnd(0.004, 0.013),
        color,
        rot: Math.random() * TAU,
        spin: rnd(-8, 8),
        square: Math.random() < 0.5,
      });
      const p = this.particles[this.particles.length - 1];
      p.max = p.life;
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
  }

  private floater(x: number, y: number, text: string, color: string, size = 26) {
    this.floaters.push({ x, y, life: 1.05, max: 1.05, text, color, size });
    if (this.floaters.length > 14) this.floaters.shift();
  }

  private updateFloaters(dt: number) {
    if (!this.floaters.length) return;
    for (const f of this.floaters) {
      f.y -= dt * 0.16;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    if (!this.floaters.length) return;
    const { cx, cy } = this;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      const a = Math.min(1, f.life / f.max);
      const pop = 1 + (1 - a) * 0.25;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = `700 ${f.size * pop}px "Cormorant Garamond", Georgia, serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(244,233,210,0.85)";
      ctx.strokeText(f.text, cx + this.px(f.x), cy + this.px(f.y));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, cx + this.px(f.x), cy + this.px(f.y));
    }
    ctx.restore();
  }

  private spawnEcho() {
    let path = this.rec.slice();
    if (path.length < 14) {
      // «камперов» наказываем маленькой орбитой вокруг точки подбора
      const c = { ...this.player };
      const rr = 0.075;
      path = [];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * TAU;
        path.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr });
      }
    }
    const e: Echo = {
      id: this.echoId++,
      path,
      idx: 0,
      dir: 1,
      speed: Math.min(1.65, 1 + this.gears * 0.012) * rnd(0.94, 1.1),
      age: 0,
      life: rnd(19, 24) + Math.min(6, this.gears * 0.08),
      r: 0.029 + Math.min(0.011, this.gears * 0.00035),
      rot: Math.random() * TAU,
      pos: { ...path[0] },
      tint: Math.random(),
    };
    this.echoes.push(e);
    this.sfx.echoBorn();
    if (this.gears === 1) this.floater(e.pos.x, e.pos.y - 0.08, t("game.echoAwoke"), "#4a3a28", 22);
    if (this.echoes.length > MAX_ECHOES) {
      const old = this.echoes.shift();
      if (old) this.crumble(old);
    }
  }

  private crumble(e: Echo, silent = false) {
    for (let i = 0; i < 10; i++) this.burst(e.pos.x, e.pos.y, 1, C.ink, undefined, rnd(0.1, 0.4));
    if (!silent) this.sfx.crumble();
  }

  private gameOver(reason: string, hint: string) {
    if (this.phase !== "playing") return;
    this.setPhase("over");
    this.deathT = 0;
    this.shake = 1;
    this.flash = 0.85;
    this.flashColor = "160,70,40";
    this.sfx.death();
    for (let i = 0; i < 46; i++) this.burst(this.player.x, this.player.y, 1, i % 3 === 0 ? C.brass : C.copper);
    const pts = Math.round(this.points);
    const newBest = pts > this.best;
    if (newBest) {
      this.best = pts;
      try {
        localStorage.setItem(BEST_KEY, String(pts));
      } catch {
        /* ignore */
      }
    }
    this.cb.onOver({
      points: pts,
      gears: this.gears,
      time: this.time,
      best: this.best,
      newBest,
      reason,
      hint,
    });
  }

  // ——— цикл ———

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;

    if (this.phase === "playing") this.update(dt);
    else this.updateIdle(dt);

    this.render(dt);

    this.hudAcc += dt;
    if (this.hudAcc > 0.07) {
      this.hudAcc = 0;
      this.emitHud();
    }
  };

  private updateIdle(dt: number) {
    this.deathT += dt;
    this.shake *= Math.exp(-6 * dt);
    this.flash *= Math.exp(-3.2 * dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2.2 * dt);
      p.vy *= Math.exp(-2.2 * dt);
      p.rot += p.spin * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.updateFloaters(dt);
    for (const e of this.echoes) e.rot += dt * 0.4;
  }

  private update(dt: number) {
    this.time += dt;
    this.shake *= Math.exp(-6 * dt);
    this.flash *= Math.exp(-3.2 * dt);
    if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) this.chain = 0;
    }

    // — движение —
    const dir = this.desired();
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.player.x += this.dashDir.x * DASH_SPEED * dt;
      this.player.y += this.dashDir.y * DASH_SPEED * dt;
      this.vel.x = this.dashDir.x * MAX_SPEED;
      this.vel.y = this.dashDir.y * MAX_SPEED;
    } else {
      const k = 1 - Math.exp(-STEER * dt);
      this.vel.x += (dir.x * MAX_SPEED - this.vel.x) * k;
      this.vel.y += (dir.y * MAX_SPEED - this.vel.y) * k;
      this.player.x += this.vel.x * dt;
      this.player.y += this.vel.y * dt;
    }

    // — стенка арены —
    const lim = 1 - PLAYER_R;
    const d = Math.hypot(this.player.x, this.player.y);
    if (d > lim) {
      const nx = this.player.x / d;
      const ny = this.player.y / d;
      this.player.x = nx * lim;
      this.player.y = ny * lim;
      const vn = this.vel.x * nx + this.vel.y * ny;
      if (vn > 0) {
        this.vel.x -= 1.5 * vn * nx;
        this.vel.y -= 1.5 * vn * ny;
      }
      if (this.dashT > 0) this.dashT = 0;
    }

    // — след и запись пути —
    this.trail.push({ x: this.player.x, y: this.player.y, a: 1 });
    if (this.trail.length > 30) this.trail.shift();
    this.recAcc += dt;
    while (this.recAcc >= REC_STEP) {
      this.recAcc -= REC_STEP;
      this.rec.push({ x: this.player.x, y: this.player.y });
      if (this.rec.length > MAX_REC) this.rec.shift();
    }

    // — завод —
    const drain = Math.min(19, 7.4 + this.gears * 0.2);
    this.wind -= drain * dt;
    if (this.wind < 26) {
      this.warnTick += dt;
      const period = this.wind < 12 ? 0.36 : 0.6;
      if (this.warnTick > period) {
        this.warnTick = 0;
        this.sfx.tick();
      }
    }
    if (this.wind <= 0) {
      this.wind = 0;
      this.gameOver(t("over.reason.spring"), t("over.hint.spring"));
      return;
    }

    // — эхо —
    this.nearest = 9;
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.age += dt;
      e.rot += dt * 1.6 * e.dir;
      const n = e.path.length;
      if (n >= 2) {
        const perSec = e.speed / REC_STEP;
        e.idx += e.dir * perSec * dt;
        if (e.idx >= n - 1) {
          e.idx = n - 1 - (e.idx - (n - 1));
          e.dir = -1;
        }
        if (e.idx <= 0) {
          e.idx = -e.idx;
          e.dir = 1;
        }
        e.idx = Math.max(0, Math.min(n - 1, e.idx));
        const i0 = Math.floor(e.idx);
        const i1 = Math.min(n - 1, i0 + 1);
        const f = e.idx - i0;
        e.pos.x = e.path[i0].x + (e.path[i1].x - e.path[i0].x) * f;
        e.pos.y = e.path[i0].y + (e.path[i1].y - e.path[i0].y) * f;
      }
      if (e.age >= e.life) {
        this.crumble(e);
        this.echoes.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(e.pos.x - this.player.x, e.pos.y - this.player.y);
      const solid = e.age >= MAT_TIME;
      if (solid) this.nearest = Math.min(this.nearest, dist - e.r - PLAYER_R);
      if (solid && this.invuln <= 0 && dist < PLAYER_R + e.r) {
        this.gameOver(t("over.reason.echo"), t("over.hint.echo"));
        return;
      }
    }

    // — шестерня —
    if (this.gear) {
      this.gear.age += dt;
      this.gear.rot += dt * 0.8;
      const dg = Math.hypot(this.gear.x - this.player.x, this.gear.y - this.player.y);
      if (dg < PLAYER_R + this.gear.r * 0.92) this.collectGear();
    }

    // — ключ —
    if (this.key) {
      this.key.age += dt;
      this.key.rot += dt * 1.2;
      const dk = Math.hypot(this.key.x - this.player.x, this.key.y - this.player.y);
      if (dk < PLAYER_R + this.key.r) this.collectKey();
      else if (this.key.age > this.key.ttl) {
        this.burst(this.key.x, this.key.y, 8, C.brass);
        this.key = null;
      }
    }

    // — частицы —
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2.2 * dt);
      p.vy *= Math.exp(-2.2 * dt);
      p.rot += p.spin * dt;
      p.life -= dt;
    }
    if (this.particles.length) this.particles = this.particles.filter((p) => p.life > 0);
    this.updateFloaters(dt);
  }

  private collectGear() {
    if (!this.gear) return;
    const g = this.gear;
    this.gears += 1;
    this.chain += 1;
    this.chainTimer = 4.2;
    const mult = this.multiplier();
    this.points += 10 * mult;
    this.wind = Math.min(WIND_MAX, this.wind + 30);
    this.sfx.pickup(Math.min(10, this.chain - 1));
    this.floater(g.x, g.y, mult > 1 ? `+${10 * mult} ×${mult}` : `+${10 * mult}`, "#8a5a1e", mult > 1 ? 30 : 24);
    for (let i = 0; i < 16; i++) this.burst(g.x, g.y, 1, i % 2 ? C.brassL : C.brass);
    this.shake = Math.min(1, this.shake + 0.22);
    this.flash = 0.22;
    this.flashColor = "255,236,190";
    this.spawnEcho();
    this.rec = [];
    this.recAcc = 0;
    this.gear = this.makePickup(0.055, 0.42);
    if (!this.key && this.echoes.length >= 6 && this.time - this.lastKeyTime > 22 && Math.random() < 0.55) {
      this.key = this.makePickup(0.05, 0.5);
      this.key.ttl = 8;
      this.lastKeyTime = this.time;
    }
    this.emitHud();
  }

  private collectKey() {
    if (!this.key) return;
    const k = this.key;
    this.points += 120;
    this.wind = WIND_MAX;
    this.sfx.key();
    this.shake = 1;
    this.flash = 0.7;
    this.flashColor = "255,228,168";
    this.floater(k.x, k.y, `+120 · ${t("game.echoShattered")}`, "#8c3b23", 26);
    for (let i = 0; i < 28; i++) this.burst(k.x, k.y, 1, i % 2 ? C.brassL : C.brass);
    for (const e of this.echoes) this.crumble(e, true);
    if (this.echoes.length) this.sfx.crumble();
    this.echoes = [];
    this.key = null;
    this.lastKeyTime = this.time;
    this.emitHud();
  }

  // ——— отрисовка ———

  private px(u: number) {
    return u * this.R;
  }

  private render(dt: number) {
    const ctx = this.ctx;
    const { w, h, R, cx, cy } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // фон
    const bg = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, Math.max(w, h) * 0.8);
    bg.addColorStop(0, "#f1e5cb");
    bg.addColorStop(0.55, "#e3d3ae");
    bg.addColorStop(1, "#c9b489");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // фоновые шестерни мастерской
    const t = performance.now() / 1000;
    ctx.save();
    ctx.strokeStyle = `rgba(${C.ink},0.11)`;
    ctx.lineWidth = Math.max(1.2, R * 0.006);
    const bgGears: [number, number, number, number, number][] = [
      [0.02, 0.06, R * 0.72, 14, t * 0.09],
      [0.99, 0.22, R * 0.5, 11, -t * 0.13],
      [0.12, 0.95, R * 0.58, 12, -t * 0.07],
      [0.9, 0.94, R * 0.38, 9, t * 0.16],
    ];
    for (const [fx, fy, gr, teeth, rot] of bgGears) {
      const gx = fx * w;
      const gy = fy * h;
      gearPath(ctx, gx, gy, gr, teeth, rot);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, gr * 0.62, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, gr * 0.22, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = rot * 1.0 + (k * TAU) / 6;
        ctx.moveTo(gx + Math.cos(a) * gr * 0.22, gy + Math.sin(a) * gr * 0.22);
        ctx.lineTo(gx + Math.cos(a) * gr * 0.62, gy + Math.sin(a) * gr * 0.62);
      }
      ctx.stroke();
    }
    ctx.restore();

    // тряска
    const sh = this.shake * 11;
    ctx.save();
    if (sh > 0.2) ctx.translate(rnd(-sh, sh), rnd(-sh, sh));

    // диск арены
    const disc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.36, R * 0.05, cx, cy, R * 1.08);
    disc.addColorStop(0, "#f8efdb");
    disc.addColorStop(0.7, "#eee0c1");
    disc.addColorStop(1, "#dbc8a1");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = disc;
    ctx.fill();

    // кольца и риски циферблата
    ctx.strokeStyle = `rgba(${C.ink},0.06)`;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * i) / 4.6, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const big = i % 5 === 0;
      const l = big ? R * 0.045 : R * 0.022;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${C.ink},${big ? 0.26 : 0.13})`;
      ctx.lineWidth = big ? 2 : 1;
      ctx.moveTo(cx + Math.cos(a) * (R - l - R * 0.03), cy + Math.sin(a) * (R - l - R * 0.03));
      ctx.lineTo(cx + Math.cos(a) * (R - R * 0.03), cy + Math.sin(a) * (R - R * 0.03));
      ctx.stroke();
    }

    // мир — внутри арены
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();

    this.drawEchoPaths(ctx);
    this.drawPickups(ctx, t);
    this.drawEchoes(ctx);
    if (this.phase !== "over") this.drawPlayer(ctx, t);
    this.drawParticles(ctx);
    this.drawFloaters(ctx);

    ctx.restore();

    // обод + шкала завода
    const rimW = Math.max(5, R * 0.032);
    ctx.lineWidth = rimW;
    ctx.strokeStyle = `rgba(${C.ink},0.15)`;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    const frac = Math.max(0, this.wind / WIND_MAX);
    if (this.phase !== "menu") {
      const low = frac < 0.26;
      const pulse = low ? 0.72 + 0.28 * Math.sin(t * 11) : 1;
      const col = frac > 0.5 ? C.brass : frac > 0.26 ? C.copper : C.rust;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = rimW;
      ctx.strokeStyle = `rgba(${col},${0.95 * pulse})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${C.ink},0.5)`;
    ctx.beginPath();
    ctx.arc(cx, cy, R + rimW * 0.6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R - rimW * 0.6, 0, TAU);
    ctx.stroke();

    // место гибели
    if (this.phase === "over") {
      const a = Math.max(0, 1 - this.deathT * 0.8);
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = `rgb(${C.rust})`;
        ctx.lineWidth = 3;
        const rr = this.px(0.05) + this.deathT * 120;
        ctx.beginPath();
        ctx.arc(cx + this.px(this.player.x), cy + this.px(this.player.y), rr, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore(); // тряска

    // виньетка
    const vig = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, Math.max(w, h) * 0.78);
    vig.addColorStop(0, "rgba(46,35,24,0)");
    vig.addColorStop(1, `rgba(46,35,24,${0.3 + (1 - frac) * 0.16})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(${this.flashColor},${Math.min(0.6, this.flash)})`;
      ctx.fillRect(0, 0, w, h);
    }

    void dt;
  }

  private drawEchoPaths(ctx: CanvasRenderingContext2D) {
    const { cx, cy } = this;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const e of this.echoes) {
      const mat = Math.min(1, e.age / MAT_TIME);
      const fade = e.age > e.life - 2.5 ? Math.max(0, (e.life - e.age) / 2.5) : 1;
      ctx.strokeStyle = `rgba(${C.ink},${0.1 * mat * fade + 0.03})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = e.path.length > 140 ? 2 : 1;
      for (let i = 0; i < e.path.length; i += step) {
        const p = e.path[i];
        const x = cx + this.px(p.x);
        const y = cy + this.px(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // текущий записываемый путь игрока
    if (this.phase === "playing" && this.rec.length > 3) {
      ctx.strokeStyle = `rgba(${C.brass},0.22)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      for (let i = 0; i < this.rec.length; i += 2) {
        const p = this.rec[i];
        const x = cx + this.px(p.x);
        const y = cy + this.px(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawEchoes(ctx: CanvasRenderingContext2D) {
    const { cx, cy } = this;
    for (const e of this.echoes) {
      const x = cx + this.px(e.pos.x);
      const y = cy + this.px(e.pos.y);
      const r = this.px(e.r);
      const mat = Math.min(1, e.age / MAT_TIME);
      const dying = e.age > e.life - 2.5;
      const fade = dying ? Math.max(0.15, (e.life - e.age) / 2.5) : 1;
      const blink = dying ? 0.55 + 0.45 * Math.sin(e.age * 18) : 1;

      if (mat < 1) {
        ctx.save();
        ctx.globalAlpha = 0.5 * (1 - mat);
        ctx.strokeStyle = `rgb(${C.copper})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + (1 - mat) * r * 4, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = Math.min(1, mat) * fade * blink;
      // тень
      ctx.fillStyle = "rgba(46,35,24,0.18)";
      ctx.beginPath();
      ctx.arc(x + r * 0.28, y + r * 0.34, r * 0.95, 0, TAU);
      ctx.fill();

      const body = e.tint > 0.5 ? "74,58,40" : "62,48,34";
      gearPath(ctx, x, y, r, 7, e.rot);
      ctx.fillStyle = dying ? `rgb(${C.rust})` : `rgb(${body})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${C.ink},0.85)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.34, 0, TAU);
      ctx.fillStyle = `rgba(${C.copper},0.95)`;
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D, t: number) {
    const { cx, cy } = this;
    if (this.gear) {
      const g = this.gear;
      const x = cx + this.px(g.x);
      const y = cy + this.px(g.y);
      const pop = Math.min(1, g.age * 4);
      const pulse = 1 + Math.sin(t * 3.4) * 0.05;
      const r = this.px(g.r) * pop * pulse;

      ctx.save();
      // ореол
      const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 3.1);
      halo.addColorStop(0, "rgba(227,186,108,0.34)");
      halo.addColorStop(1, "rgba(227,186,108,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.1, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = `rgba(${C.brass},${0.25 + 0.15 * Math.sin(t * 3.4)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // r ==0 сразу после спавна (pop=0) — без ограничения снизу колебание
      // синуса уходит в отрицательный радиус и валит весь кадр отрисовки
      ctx.arc(x, y, Math.max(0, r * 1.9 + Math.sin(t * 3.4) * 3), 0, TAU);
      ctx.stroke();

      ctx.fillStyle = "rgba(46,35,24,0.2)";
      gearPath(ctx, x + r * 0.16, y + r * 0.22, r, 10, g.rot);
      ctx.fill();

      const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      grad.addColorStop(0, "#f0cd8c");
      grad.addColorStop(0.5, "#c9913f");
      grad.addColorStop(1, "#9a6b2a");
      gearPath(ctx, x, y, r, 10, g.rot);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(${C.ink},0.8)`;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.3, 0, TAU);
      ctx.fillStyle = "#f7ecd3";
      ctx.fill();
      ctx.strokeStyle = `rgba(${C.ink},0.6)`;
      ctx.stroke();
      ctx.restore();
    }

    if (this.key) {
      const k = this.key;
      const x = cx + this.px(k.x);
      const y = cy + this.px(k.y);
      const r = this.px(k.r);
      const left = k.ttl - k.age;
      const blink = left < 2.5 ? 0.45 + 0.55 * Math.abs(Math.sin(k.age * 9)) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.translate(x, y);
      ctx.rotate(Math.sin(k.age * 2) * 0.35);

      const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 3.4);
      halo.addColorStop(0, "rgba(255,214,130,0.4)");
      halo.addColorStop(1, "rgba(255,214,130,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 3.4, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "#7c521c";
      ctx.lineWidth = r * 0.34;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, -r * 0.45, r * 0.52, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, r * 0.05);
      ctx.lineTo(0, r * 1.15);
      ctx.moveTo(0, r * 1.12);
      ctx.lineTo(r * 0.55, r * 1.12);
      ctx.moveTo(0, r * 0.78);
      ctx.lineTo(r * 0.42, r * 0.78);
      ctx.stroke();

      ctx.strokeStyle = "#eec97e";
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.arc(0, -r * 0.45, r * 0.52, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, r * 0.05);
      ctx.lineTo(0, r * 1.15);
      ctx.moveTo(0, r * 1.12);
      ctx.lineTo(r * 0.55, r * 1.12);
      ctx.moveTo(0, r * 0.78);
      ctx.lineTo(r * 0.42, r * 0.78);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, t: number) {
    const { cx, cy } = this;
    const x = cx + this.px(this.player.x);
    const y = cy + this.px(this.player.y);
    const r = this.px(PLAYER_R);

    // след
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const f = i / this.trail.length;
      ctx.globalAlpha = f * 0.28;
      ctx.fillStyle = `rgb(${C.brassL})`;
      ctx.beginPath();
      ctx.arc(cx + this.px(p.x), cy + this.px(p.y), r * 0.72 * f, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // тревожное кольцо, когда эхо близко
    if (this.nearest < 0.07 && this.phase === "playing") {
      const a = 1 - this.nearest / 0.07;
      ctx.save();
      ctx.globalAlpha = 0.35 * a;
      ctx.strokeStyle = `rgb(${C.rust})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.3 + Math.sin(t * 16) * 2, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // тёплое свечение
    const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.6);
    glow.addColorStop(0, `rgba(255,215,145,${this.invuln > 0 ? 0.5 : 0.3})`);
    glow.addColorStop(1, "rgba(255,215,145,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.6, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(46,35,24,0.22)";
    gearPath(ctx, x + r * 0.18, y + r * 0.24, r, 8, -t * 2.4);
    ctx.fill();

    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, "#fff3d6");
    g.addColorStop(0.55, "#edc074");
    g.addColorStop(1, "#b9812f");
    gearPath(ctx, x, y, r, 8, -t * 2.4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = this.invuln > 0 ? "#f7f0dd" : `rgba(${C.ink},0.9)`;
    ctx.lineWidth = this.invuln > 0 ? 2.4 : 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, TAU);
    ctx.fillStyle = `rgba(${C.ink},0.85)`;
    ctx.fill();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    const { cx, cy } = this;
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      const x = cx + this.px(p.x);
      const y = cy + this.px(p.y);
      const s = this.px(p.size) * (0.5 + a * 0.8);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.color})`;
      if (p.square) {
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s, -s, s * 2, s * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
