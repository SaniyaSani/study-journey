/**
 * Railway time utilities. Railway calculations always use Asia/Tokyo, independently of the
 * user's local timezone.
 *
 * Japan has not observed daylight saving time since 1951, so Asia/Tokyo is a fixed UTC+09:00.
 * We still use the IANA name for all formatting so the behaviour is explicit.
 *
 * GTFS/GTFS-JP and Japanese timetables express times relative to the *service date*
 * ("noon minus 12h", which in Tokyo is midnight), and allow values ≥ 24:00 for trains that
 * run past midnight (e.g. "25:10:00" = 01:10 on the following calendar day).
 */

export const TOKYO_TZ = "Asia/Tokyo";
export const TOKYO_OFFSET_MINUTES = 9 * 60;
const DAY_MS = 86_400_000;

/** Hour (Tokyo) before which an instant still belongs to the previous railway service day. */
export const DEFAULT_SERVICE_DAY_CUTOFF_HOUR = 4;

const SERVICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPACT_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;

export function isServiceDate(value: string): boolean {
  if (!SERVICE_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Accepts "YYYYMMDD" (GTFS) or "YYYY-MM-DD" and returns "YYYY-MM-DD". */
export function normalizeServiceDate(value: string): string {
  const m = COMPACT_DATE_RE.exec(value.trim());
  const v = m ? `${m[1]}-${m[2]}-${m[3]}` : value.trim();
  if (!isServiceDate(v)) throw new Error(`Invalid service date: ${value}`);
  return v;
}

/**
 * Parses a railway clock value ("HH:MM", "HH:MM:SS", hours may be ≥ 24) into seconds since
 * the start of the service date. Returns null for empty / malformed values.
 */
export function parseRailwayTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (min > 59 || s > 59 || h > 47) return null;
  return h * 3600 + min * 60 + s;
}

/** Formats seconds-since-service-midnight back to "HH:MM:SS" (hours may exceed 24). */
export function formatRailwaySeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Absolute instant for a service date + seconds since its (Tokyo) midnight. */
export function serviceTimeToDate(serviceDate: string, secondsSinceMidnight: number): Date {
  const base = Date.parse(`${normalizeServiceDate(serviceDate)}T00:00:00+09:00`);
  return new Date(base + secondsSinceMidnight * 1000);
}

export function serviceTimeToIso(serviceDate: string, secondsSinceMidnight: number): string {
  return toTokyoIso(serviceTimeToDate(serviceDate, secondsSinceMidnight));
}

/** ISO-8601 string with a +09:00 offset. */
export function toTokyoIso(date: Date | number | string): string {
  const ms = toMs(date);
  const p = tokyoParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+09:00`;
}

export interface TokyoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
}

export function tokyoParts(date: Date | number | string): TokyoParts {
  const shifted = new Date(toMs(date) + TOKYO_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

/** Calendar date in Tokyo for an instant, YYYY-MM-DD. */
export function tokyoCalendarDate(date: Date | number | string): string {
  const p = tokyoParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * Railway service date for an instant: before the cut-off hour (default 04:00 JST) an
 * instant still belongs to the previous day's timetable.
 */
export function serviceDateFor(
  date: Date | number | string,
  cutoffHour = DEFAULT_SERVICE_DAY_CUTOFF_HOUR,
): string {
  const p = tokyoParts(date);
  const cal = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour < cutoffHour ? addDays(cal, -1) : cal;
}

export function addDays(serviceDate: string, days: number): string {
  const d = new Date(`${normalizeServiceDate(serviceDate)}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for the service date itself. */
export function weekdayOf(serviceDate: string): number {
  return new Date(`${normalizeServiceDate(serviceDate)}T00:00:00Z`).getUTCDay();
}

/** Seconds since the service date's Tokyo midnight for an instant (may be ≥ 86400). */
export function secondsSinceServiceMidnight(serviceDate: string, date: Date | number | string) {
  return (toMs(date) - serviceTimeToDate(serviceDate, 0).getTime()) / 1000;
}

/**
 * Normalises a sequence of clock values along one trip so that they never go backwards.
 * ODPT timetables write post-midnight times as "00:15" rather than "24:15"; when a value is
 * earlier than the previous one we add 24h. A first value before the cut-off hour (e.g. a
 * train that starts at 00:20) is also treated as belonging to the end of the service day.
 */
export function monotonicTripSeconds(
  values: Array<number | null>,
  cutoffHour = DEFAULT_SERVICE_DAY_CUTOFF_HOUR,
): Array<number | null> {
  let offset = 0;
  let prev: number | null = null;
  const out: Array<number | null> = [];
  for (const v of values) {
    if (v == null) {
      out.push(null);
      continue;
    }
    let cur = v + offset;
    if (prev == null && v < cutoffHour * 3600) {
      offset = 86_400;
      cur = v + offset;
    } else if (prev != null && cur < prev - 60) {
      // more than a minute backwards ⇒ crossed midnight
      offset += 86_400;
      cur = v + offset;
    }
    out.push(cur);
    prev = cur;
  }
  return out;
}

export function toMs(date: Date | number | string): number {
  if (typeof date === "number") return date;
  if (typeof date === "string") return Date.parse(date);
  return date.getTime();
}

export function diffSeconds(a: Date | number | string, b: Date | number | string): number {
  return (toMs(a) - toMs(b)) / 1000;
}

export function addSecondsIso(iso: string, seconds: number): string {
  return toTokyoIso(toMs(iso) + seconds * 1000);
}

/** "18:12" in Tokyo time. */
export function formatTokyoClock(date: Date | number | string, withSeconds = false): string {
  const p = tokyoParts(date);
  return withSeconds
    ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
    : `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Clock in the user's (or given) timezone, e.g. "11:12". */
export function formatLocalClock(date: Date | number | string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(toMs(date)));
}

export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** True when the user's timezone currently has the same offset as Tokyo. */
export function userIsOnTokyoTime(at: Date | number = Date.now(), timeZone = userTimeZone()) {
  return formatLocalClock(at, timeZone) === formatTokyoClock(at);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s % 60} s`;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
