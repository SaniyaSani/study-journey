import { useEffect, useState } from "react";

/**
 * The railway clock. It is never paused — pausing study does not stop the train.
 * `offsetMs` exists only for the developer "time travel" query param (?jt=+600) used to
 * preview a journey; it is shown in the UI when active.
 */
export function useNow(intervalMs = 1000, offsetMs = 0): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, offsetMs]);
  return now;
}

export function readTimeOffsetMs(): number {
  try {
    const v = new URLSearchParams(window.location.search).get("jt");
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n * 1000 : 0;
  } catch {
    return 0;
  }
}
