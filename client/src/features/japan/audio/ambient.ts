import { getAudioContext } from "./audioContext";

/**
 * Generated carriage ambience: low cabin rumble (filtered brown noise) plus the rhythmic
 * "ta-tan" of rail joints whose tempo follows the train's speed. Optionally a licensed
 * ambience file from the route manifest is looped instead.
 */
export class AmbientEngine {
  private master: GainNode | null = null;
  private rumble: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  private speed = 0;
  private fileEl: HTMLAudioElement | null = null;
  running = false;

  start(volume: number, fileUrl?: string): boolean {
    const ctx = getAudioContext();
    if (!ctx || this.running) return false;
    this.running = true;
    if (fileUrl) {
      this.fileEl = new Audio(fileUrl);
      this.fileEl.loop = true;
      this.fileEl.volume = volume;
      this.fileEl.play().catch(() => undefined);
      return true;
    }
    this.master = ctx.createGain();
    this.master.gain.value = volume * 0.5;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0.25;
    this.noise.connect(lp).connect(this.rumble).connect(this.master);
    this.noise.start();
    this.scheduleClicks();
    return true;
  }

  private scheduleClicks() {
    const ctx = getAudioContext();
    if (!ctx || !this.running || !this.master) return;
    if (this.speed > 0.15) {
      const t = ctx.currentTime + 0.02;
      this.click(t, 0.9);
      this.click(t + 0.11 / this.speed, 0.7);
    }
    const interval = this.speed > 0.15 ? 1400 / this.speed : 500;
    this.clickTimer = setTimeout(() => this.scheduleClicks(), interval);
  }

  private click(at: number, strength: number) {
    const ctx = getAudioContext();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(60, at + 0.08);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.35 * strength * this.speed, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.15);
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0, Math.min(1, speed));
    const ctx = getAudioContext();
    if (ctx && this.rumble)
      this.rumble.gain.setTargetAtTime(0.12 + 0.3 * this.speed, ctx.currentTime, 1.2);
  }

  setVolume(v: number) {
    const ctx = getAudioContext();
    if (this.fileEl) this.fileEl.volume = v;
    if (ctx && this.master) this.master.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.2);
  }

  stop() {
    this.running = false;
    if (this.clickTimer) clearTimeout(this.clickTimer);
    try {
      this.noise?.stop();
    } catch {
      /* already stopped */
    }
    this.master?.disconnect();
    this.fileEl?.pause();
    this.fileEl = null;
    this.master = null;
    this.noise = null;
  }
}
