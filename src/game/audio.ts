/**
 * Крошечный синтезатор на WebAudio.
 * Никаких внешних файлов — только тёплые «деревянно-латунные» тембры.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.3, this.ctx.currentTime, 0.02);
    }
  }

  private get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(opts: {
    freq: number;
    dur: number;
    type?: OscillatorType;
    vol?: number;
    delay?: number;
    glide?: number;
    cutoff?: number;
  }) {
    if (!this.ctx || !this.master || this.muted) return;
    const { freq, dur, type = "triangle", vol = 0.5, delay = 0, glide, cutoff = 2600 } = opts;
    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(cutoff, t0);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, glide), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(opts: { dur: number; vol?: number; delay?: number; cutoff?: number; sweepTo?: number }) {
    if (!this.ctx || !this.master || this.muted) return;
    const { dur, vol = 0.25, delay = 0, cutoff = 1400, sweepTo } = opts;
    const t0 = this.t + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(cutoff, t0);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(80, sweepTo), t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  /** Подбор шестерни. step — длина цепочки, поднимает тон по пентатонике. */
  pickup(step: number) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const n = scale[Math.min(scale.length - 1, step)];
    const f = 329.6 * Math.pow(2, n / 12);
    this.tone({ freq: f, dur: 0.16, vol: 0.34, type: "triangle" });
    this.tone({ freq: f * 2, dur: 0.1, vol: 0.1, type: "sine", delay: 0.015 });
    this.noise({ dur: 0.05, vol: 0.08, cutoff: 3000 });
  }

  /** Рождение эха — глухой щелчок механизма. */
  echoBorn() {
    this.tone({ freq: 148, dur: 0.2, vol: 0.22, type: "sine", glide: 96 });
    this.noise({ dur: 0.09, vol: 0.12, cutoff: 900 });
  }

  dash() {
    this.noise({ dur: 0.22, vol: 0.16, cutoff: 2200, sweepTo: 300 });
    this.tone({ freq: 520, dur: 0.14, vol: 0.12, type: "sine", glide: 900 });
  }

  tick() {
    this.tone({ freq: 1050, dur: 0.04, vol: 0.07, type: "square", cutoff: 1800 });
  }

  crumble() {
    this.noise({ dur: 0.3, vol: 0.14, cutoff: 1200, sweepTo: 200 });
  }

  key() {
    [0, 4, 7, 12].forEach((n, i) =>
      this.tone({ freq: 392 * Math.pow(2, n / 12), dur: 0.5, vol: 0.2, type: "triangle", delay: i * 0.07 }),
    );
    this.noise({ dur: 0.5, vol: 0.1, cutoff: 4000, sweepTo: 600 });
  }

  death() {
    this.tone({ freq: 190, dur: 0.9, vol: 0.35, type: "sawtooth", glide: 46, cutoff: 700 });
    this.tone({ freq: 96, dur: 1.1, vol: 0.3, type: "sine", glide: 40 });
    this.noise({ dur: 0.8, vol: 0.2, cutoff: 1200, sweepTo: 120 });
  }

  start() {
    [0, 7, 12].forEach((n, i) =>
      this.tone({ freq: 262 * Math.pow(2, n / 12), dur: 0.4, vol: 0.18, type: "triangle", delay: i * 0.06 }),
    );
  }
}
