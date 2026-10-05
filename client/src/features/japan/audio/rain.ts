import { getAudioContext } from "./audioContext";

/** Generated rain on the carriage window: band-passed noise plus sparse droplet ticks. */
export class RainEngine {
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  running = false;

  start(volume: number): boolean {
    const ctx = getAudioContext();
    if (!ctx || this.running) return false;
    this.running = true;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    this.src = ctx.createBufferSource();
    this.src.buffer = buf;
    this.src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 0.5;
    this.gain = ctx.createGain();
    this.gain.gain.value = volume * 0.18;
    this.src.connect(bp).connect(this.gain).connect(ctx.destination);
    this.src.start();
    this.drop();
    return true;
  }

  private drop() {
    const ctx = getAudioContext();
    if (!ctx || !this.running || !this.gain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + 0.01;
    o.frequency.setValueAtTime(1800 + Math.random() * 1600, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + 0.08);
    this.dropTimer = setTimeout(() => this.drop(), 80 + Math.random() * 420);
  }

  setVolume(v: number) {
    const ctx = getAudioContext();
    if (ctx && this.gain) this.gain.gain.setTargetAtTime(v * 0.18, ctx.currentTime, 0.3);
  }

  stop() {
    this.running = false;
    if (this.dropTimer) clearTimeout(this.dropTimer);
    try {
      this.src?.stop();
    } catch {
      /* already stopped */
    }
    this.gain?.disconnect();
    this.src = null;
    this.gain = null;
  }
}
