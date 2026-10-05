/**
 * Shared AudioContext. It is only created/resumed from a user gesture (`unlockAudio`),
 * so the app never starts audible media on its own.
 */
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  return ctx;
}

export async function unlockAudio(): Promise<AudioContext | null> {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
