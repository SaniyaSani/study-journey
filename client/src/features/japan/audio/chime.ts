import { getAudioContext } from "./audioContext";

/**
 * A short, original two-tone chime synthesised in the browser (not an operator jingle).
 */
export function playChime(volume: number): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running" || volume <= 0) return Promise.resolve();
  const notes = [659.25, 523.25]; // E5 → C5
  const t0 = ctx.currentTime + 0.02;
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const start = t0 + i * 0.42;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18 * volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 1);
  });
  return new Promise((r) => setTimeout(r, 1100));
}
