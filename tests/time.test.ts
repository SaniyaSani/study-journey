import { describe, expect, it } from "vitest";
import {
  addDays,
  formatTokyoClock,
  monotonicTripSeconds,
  normalizeServiceDate,
  parseRailwayTime,
  serviceDateFor,
  serviceTimeToIso,
  toMs,
  tokyoParts,
} from "@shared/time";
import { dayTypeFor, odptCalendarCandidates } from "@shared/calendar";

describe("Japanese railway time", () => {
  it("parses timetable clock values including ≥ 24:00", () => {
    expect(parseRailwayTime("05:10")).toBe(5 * 3600 + 600);
    expect(parseRailwayTime("25:16:00")).toBe(25 * 3600 + 16 * 60);
    expect(parseRailwayTime("7:05:30")).toBe(7 * 3600 + 5 * 60 + 30);
    expect(parseRailwayTime("")).toBeNull();
    expect(parseRailwayTime("12:75")).toBeNull();
  });

  it("converts service date + 25:16 to 01:16 on the next calendar day in Tokyo", () => {
    const iso = serviceTimeToIso("2026-10-05", 25 * 3600 + 16 * 60);
    expect(iso).toBe("2026-10-06T01:16:00+09:00");
    expect(new Date(iso).toISOString()).toBe("2026-10-05T16:16:00.000Z");
  });

  it("assigns early-morning instants to the previous service date", () => {
    // 01:30 JST on Oct 6 still belongs to the Oct 5 timetable
    expect(serviceDateFor("2026-10-05T16:30:00Z")).toBe("2026-10-05");
    // 04:30 JST belongs to Oct 6
    expect(serviceDateFor("2026-10-05T19:30:00Z")).toBe("2026-10-06");
  });

  it("is independent of the user's timezone (absolute instants)", () => {
    const ms = toMs("2026-10-05T09:12:00Z");
    expect(formatTokyoClock(ms)).toBe("18:12");
    expect(tokyoParts(ms).hour).toBe(18);
  });

  it("normalises ODPT-style post-midnight times (00:15 after 23:50)", () => {
    const v = monotonicTripSeconds([
      parseRailwayTime("23:50"),
      parseRailwayTime("23:58"),
      parseRailwayTime("00:07"),
      parseRailwayTime("00:15"),
    ]);
    expect(v).toEqual([85800, 86280, 86400 + 420, 86400 + 900]);
  });

  it("treats a trip starting at 00:20 as end of the service day", () => {
    expect(monotonicTripSeconds([parseRailwayTime("00:20"), parseRailwayTime("00:31")])).toEqual([
      87600, 88260,
    ]);
  });

  it("normalises GTFS compact dates and adds days across month ends", () => {
    expect(normalizeServiceDate("20261231")).toBe("2026-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => normalizeServiceDate("2026-02-30")).toThrow();
  });

  it("classifies weekdays, weekends and national holidays", () => {
    expect(dayTypeFor("2026-10-05")).toBe("weekday"); // Monday
    expect(dayTypeFor("2026-10-10")).toBe("saturday");
    expect(dayTypeFor("2026-10-11")).toBe("sunday");
    expect(dayTypeFor("2026-10-12")).toBe("holiday"); // Sports Day
    expect(odptCalendarCandidates("2026-10-12")[0]).toBe("odpt.Calendar:Holiday");
    expect(odptCalendarCandidates("2026-10-05")).toEqual(["odpt.Calendar:Weekday"]);
  });
});
