import type { Trip } from "@shared/types";
import { serviceTimeToIso } from "@shared/time";

/** A small synthetic trip: A → B → C → D on 2026-10-05. Times in seconds since midnight. */
export function makeTrip(
  opts: { id?: string; start?: number; dataMode?: Trip["dataMode"] } = {},
): Trip {
  const start = opts.start ?? 18 * 3600 + 12 * 60; // 18:12
  const legs = [
    { id: "x:A", arr: 0, dep: 0 },
    { id: "x:B", arr: 300, dep: 330 },
    { id: "x:C", arr: 630, dep: 660 },
    { id: "x:D", arr: 1020, dep: 1020 },
  ];
  return {
    id: opts.id ?? "x:T1@2026-10-05",
    routeId: "x:R",
    operatorId: "x:O",
    serviceDate: "2026-10-05",
    headsignJa: "D",
    headsignEn: "D",
    dataMode: opts.dataMode ?? "timetable",
    stops: legs.map((l, i) => ({
      stationId: l.id,
      sequence: i + 1,
      scheduledArrival: serviceTimeToIso("2026-10-05", start + l.arr),
      scheduledDeparture: serviceTimeToIso("2026-10-05", start + l.dep),
    })),
  };
}

export const at = (hhmmss: string, date = "2026-10-05") => Date.parse(`${date}T${hhmmss}+09:00`);
