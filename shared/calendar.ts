import { weekdayOf } from "./time";

/**
 * Japanese national holidays used ONLY when a dataset does not provide its own holiday /
 * calendar exceptions (GTFS calendar_dates.txt always takes precedence). Extend the list
 * yearly — see docs/RAILWAY_DATA.md. Source: Cabinet Office, "国民の祝日について".
 */
export const JAPANESE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01",
  "2026-01-12",
  "2026-02-11",
  "2026-02-23",
  "2026-03-20",
  "2026-04-29",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-07-20",
  "2026-08-11",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-10-12",
  "2026-11-03",
  "2026-11-23",
  // 2027
  "2027-01-01",
  "2027-01-11",
  "2027-02-11",
  "2027-02-23",
  "2027-03-21",
  "2027-03-22",
  "2027-04-29",
  "2027-05-03",
  "2027-05-04",
  "2027-05-05",
  "2027-07-19",
  "2027-08-11",
  "2027-09-20",
  "2027-09-23",
  "2027-10-11",
  "2027-11-03",
  "2027-11-23",
]);

export type DayType = "weekday" | "saturday" | "sunday" | "holiday";

export function isJapaneseHoliday(serviceDate: string, extra?: ReadonlySet<string>): boolean {
  return JAPANESE_HOLIDAYS.has(serviceDate) || Boolean(extra?.has(serviceDate));
}

export function dayTypeFor(serviceDate: string, extraHolidays?: ReadonlySet<string>): DayType {
  if (isJapaneseHoliday(serviceDate, extraHolidays)) return "holiday";
  const wd = weekdayOf(serviceDate);
  if (wd === 0) return "sunday";
  if (wd === 6) return "saturday";
  return "weekday";
}

/**
 * ODPT calendar identifiers that apply to a service date, most specific first.
 * ODPT uses e.g. `odpt.Calendar:Weekday`, `odpt.Calendar:SaturdayHoliday`,
 * `odpt.Calendar:Saturday`, `odpt.Calendar:Holiday`, `odpt.Calendar:Sunday`.
 */
export function odptCalendarCandidates(serviceDate: string): string[] {
  const t = dayTypeFor(serviceDate);
  switch (t) {
    case "weekday":
      return ["odpt.Calendar:Weekday"];
    case "saturday":
      return ["odpt.Calendar:Saturday", "odpt.Calendar:SaturdayHoliday"];
    case "sunday":
      return ["odpt.Calendar:Sunday", "odpt.Calendar:Holiday", "odpt.Calendar:SaturdayHoliday"];
    case "holiday":
      return ["odpt.Calendar:Holiday", "odpt.Calendar:SaturdayHoliday", "odpt.Calendar:Sunday"];
  }
}
