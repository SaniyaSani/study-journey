import { useEffect, useRef, useState } from "react";
import type { ApiMeta, RealtimeTripState } from "@shared/types";
import { japanApi } from "../api";

export interface RealtimeState {
  realtime: RealtimeTripState | null;
  meta: ApiMeta | null;
  /** ms of the last successful response */
  lastOkAt: number | null;
  /** true when the server could not be reached at the last poll */
  offline: boolean;
  notice?: string;
}

export const REALTIME_POLL_MS = 25_000;
const HIDDEN_POLL_MS = 60_000;

/**
 * Polls the backend for the train's realtime state every ~25 s (60 s in background tabs).
 * Failures never throw: the journey simply continues in timetable mode.
 */
export function useRealtime(tripId: string | null, enabled: boolean): RealtimeState {
  const [state, setState] = useState<RealtimeState>({
    realtime: null,
    meta: null,
    lastOkAt: null,
    offline: false,
  });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!tripId || !enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await japanApi.realtime(tripId);
        if (!alive.current) return;
        setState((s) => ({
          realtime: res.data ?? null,
          meta: res.meta,
          lastOkAt: Date.now(),
          offline: false,
          notice: res.meta.notice,
          // keep last known realtime only if the server explicitly returns stale data
          ...(res.data == null && s.realtime && res.meta.stale ? { realtime: s.realtime } : {}),
        }));
      } catch {
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          offline: true,
          notice: "Connection lost — following the timetable.",
        }));
      } finally {
        if (alive.current) {
          timer = setTimeout(
            poll,
            document.visibilityState === "hidden" ? HIDDEN_POLL_MS : REALTIME_POLL_MS,
          );
        }
      }
    };
    poll();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [tripId, enabled]);

  return state;
}
