import {
  announcementTexts,
  type AnnouncementEvent,
  type AnnouncementLanguageMode,
} from "@shared/announcements";
import { playChime } from "./chime";

/**
 * Speaks Study Journey announcements with the Web Speech API (default) or plays clips from
 * an explicitly licensed local announcement pack. It never throws: if speech synthesis or a
 * Japanese voice is unavailable, the subtitles are still shown by the caller.
 */

export interface AnnouncementPack {
  id: string;
  license: string;
  attribution?: string;
  /** keys: `${kind}:${stationId}:${lang}` or `${kind}:*:${lang}` → relative URL */
  clips: Record<string, string>;
}

export function speechAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function findVoice(lang: string): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  return (
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

export function hasJapaneseVoice(): boolean {
  return Boolean(findVoice("ja-JP"));
}

export async function loadAnnouncementPack(
  packId: string | undefined,
): Promise<AnnouncementPack | null> {
  if (!packId || packId === "tts-default") return null;
  if (!/^[a-z0-9-]+$/i.test(packId)) return null;
  try {
    const res = await fetch(`/media/announcements/${packId}/pack.json`);
    if (!res.ok) return null;
    const pack = (await res.json()) as AnnouncementPack;
    if (!pack.license || !pack.clips) return null;
    return pack;
  } catch {
    return null;
  }
}

export interface SpeakOptions {
  mode: AnnouncementLanguageMode;
  volume: number;
  useFallbackVoice: boolean;
  pack: AnnouncementPack | null;
}

export interface SpeakResult {
  /** languages that were not voiced (e.g. no ja-JP voice) */
  silentLanguages: string[];
}

export async function announce(e: AnnouncementEvent, opts: SpeakOptions): Promise<SpeakResult> {
  const parts = announcementTexts(e, opts.mode);
  const silent: string[] = [];
  if (parts.length === 0) return { silentLanguages: [] };
  try {
    await playChime(opts.volume * 0.6);
  } catch {
    /* audio context unavailable */
  }
  for (const part of parts) {
    const clip =
      opts.pack?.clips[`${e.kind}:${e.stationId}:${part.lang.slice(0, 2)}`] ??
      opts.pack?.clips[`${e.kind}:*:${part.lang.slice(0, 2)}`];
    if (clip) {
      const ok = await playClip(`/media/announcements/${opts.pack!.id}/${clip}`, opts.volume);
      if (ok) continue;
    }
    if (!speechAvailable()) {
      silent.push(part.lang);
      continue;
    }
    const voice = findVoice(part.lang);
    if (!voice && part.lang === "ja-JP" && !opts.useFallbackVoice) {
      silent.push(part.lang);
      continue;
    }
    await speak(part.text, part.lang, voice, opts.volume);
  }
  return { silentLanguages: silent };
}

function speak(
  text: string,
  lang: string,
  voice: SpeechSynthesisVoice | null,
  volume: number,
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if (voice) u.voice = voice;
      u.volume = Math.max(0, Math.min(1, volume));
      u.rate = lang === "ja-JP" ? 0.95 : 0.98;
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
      // safety net: some browsers never fire onend
      setTimeout(done, Math.max(6000, text.length * 160));
    } catch {
      resolve();
    }
  });
}

function playClip(url: string, volume: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, volume));
      a.onended = () => resolve(true);
      a.onerror = () => resolve(false);
      a.play().catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function cancelSpeech(): void {
  try {
    if (speechAvailable()) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
