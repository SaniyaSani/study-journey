import { useEffect, useMemo, useRef, useState } from "react";
import type { Station } from "@shared/types";
import type { JourneyTimeline } from "@shared/journey";
import {
  buildAnnouncementEvents,
  dueAnnouncements,
  missedAnnouncements,
  statusChangeEvent,
  type AnnouncementEvent,
} from "@shared/announcements";
import { announce, type AnnouncementPack } from "../audio/announcer";
import { loadAnnounced, saveAnnounced } from "../session";
import type { Settings } from "../../../store/studyStore";

export interface Subtitle {
  event: AnnouncementEvent;
  silentLanguages: string[];
}

/**
 * Schedules announcements from the journey timeline. Already-played event ids are
 * persisted per journey, so re-renders, delay updates and page reloads never repeat one.
 */
export function useAnnouncements(input: {
  sessionId: string;
  timeline: JourneyTimeline;
  stations: Map<string, Station>;
  now: number;
  settings: Settings;
  audioUnlocked: boolean;
  pack: AnnouncementPack | null;
}): { subtitle: Subtitle | null; history: AnnouncementEvent[] } {
  const { sessionId, timeline, stations, now, settings, audioUnlocked, pack } = input;
  const events = useMemo(() => buildAnnouncementEvents(timeline, stations), [timeline, stations]);
  const played = useRef<Set<string>>(loadAnnounced(sessionId));
  const queue = useRef<AnnouncementEvent[]>([]);
  const busy = useRef(false);
  const [subtitle, setSubtitle] = useState<Subtitle | null>(null);
  const [history, setHistory] = useState<AnnouncementEvent[]>([]);
  const opts = useRef({ settings, audioUnlocked, pack });
  opts.current = { settings, audioUnlocked, pack };

  useEffect(() => {
    played.current = loadAnnounced(sessionId);
  }, [sessionId]);

  useEffect(() => {
    const set = played.current;
    let changed = false;
    for (const id of missedAnnouncements(events, now, set)) {
      set.add(id);
      changed = true;
    }
    const due = dueAnnouncements(events, now, set);
    const status = statusChangeEvent(timeline, now);
    if (status && !set.has(status.id)) due.push(status);
    for (const e of due) {
      set.add(e.id);
      queue.current.push(e);
      changed = true;
    }
    if (changed) saveAnnounced(sessionId, set);
    if (!busy.current && queue.current.length) void drain();

    async function drain() {
      busy.current = true;
      while (queue.current.length) {
        const e = queue.current.shift()!;
        const o = opts.current;
        setHistory((h) => [...h.slice(-19), e]);
        let silentLanguages: string[] = [];
        setSubtitle({ event: e, silentLanguages });
        if (o.audioUnlocked && o.settings.announcementMode !== "off") {
          const r = await announce(e, {
            mode: o.settings.announcementMode,
            volume: o.settings.announcementVolume,
            useFallbackVoice: o.settings.useFallbackVoice,
            pack: o.pack,
          });
          silentLanguages = r.silentLanguages;
          setSubtitle({ event: e, silentLanguages });
        }
        await new Promise((r) => setTimeout(r, 7000));
      }
      busy.current = false;
      setTimeout(() => setSubtitle((s) => (busy.current ? s : null)), 2000);
    }
  }, [events, now, sessionId, timeline]);

  return { subtitle, history };
}
