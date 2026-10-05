import { describe, expect, it } from "vitest";
import {
  activeFootageAt,
  getJourneyTimeForVideoTime,
  getVideoTimeForJourneyTime,
  planSegments,
  resolveVideoFrames,
  candidateFor,
  type ScheduledStop,
} from "../shared/journeySync";
import {
  findBestVideoForJourney,
  periodForTime,
  type JourneyContext,
} from "../shared/videoMatcher";
import {
  journeyNow,
  pauseClock,
  realClock,
  resumeClock,
  setSpeed,
  simulationClock,
} from "../shared/journeyClock";
import { SyncController, REAL_FOOTAGE_SYNC_CONFIG } from "../shared/sync";
import type { TrainVideo } from "../shared/video";

const jst = (hhmm: string, sec = 0) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.parse(
    `2026-10-05T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}+09:00`,
  );
};

const stop = (name: string, arr: string, dep = arr): ScheduledStop => ({
  stationId: `x:${name}`,
  stationName: name,
  arrival: jst(arr),
  departure: jst(dep),
});

// Tokyo 17:24 → Shinagawa 17:32 → Yokohama 17:50 → Kamakura 18:21
const stops = [
  stop("Tokyo", "17:24"),
  stop("Shinagawa", "17:32"),
  stop("Yokohama", "17:50"),
  stop("Kamakura", "18:21"),
];

const video = (over: Partial<TrainVideo> = {}): TrainVideo => ({
  id: "v1",
  provider: "youtube",
  videoId: "abc",
  title: "test",
  creator: "test",
  sourceUrl: "https://example.com",
  licenseStatus: "platform-embed",
  embedStatus: "verified",
  railwayOperator: "JR East",
  lineIds: [],
  lineNames: ["Yokosuka"],
  direction: "outbound",
  coverage: { from: "Tokyo", to: "Kamakura" },
  serviceTypes: ["Local"],
  videoStartSeconds: 34,
  calibration: "calibrated",
  stationMarkers: [
    { stationName: "Tokyo", videoTime: 34 },
    { stationName: "Shinagawa", videoTime: 512 },
    { stationName: "Yokohama", videoTime: 1600 },
    { stationName: "Kamakura", videoTime: 3540 },
  ],
  ...over,
});

const frames = resolveVideoFrames(stops, video().stationMarkers)!.frames;

describe("getVideoTimeForJourneyTime", () => {
  it("beginning: departure from Tokyo maps to the first marker (intro skipped)", () => {
    const p = getVideoTimeForJourneyTime(jst("17:24"), stops, frames);
    expect(p.videoTime).toBe(34);
    expect(p.phase).toBe("moving");
  });

  it("before departure the picture waits at the origin", () => {
    const p = getVideoTimeForJourneyTime(jst("17:20"), stops, frames);
    expect(p.videoTime).toBe(34);
    expect(p.hold).toBe(true);
    expect(p.phase).toBe("before");
  });

  it("exact station: Shinagawa 17:32 → 512 s", () => {
    expect(getVideoTimeForJourneyTime(jst("17:32"), stops, frames).videoTime).toBe(512);
  });

  it("halfway between stations: 17:28 → 273 s", () => {
    const p = getVideoTimeForJourneyTime(jst("17:28"), stops, frames);
    expect(p.videoTime).toBeCloseTo(273, 5);
    expect(p.fromStop).toBe(0);
    expect(p.toStop).toBe(1);
  });

  it("different segment durations are interpolated per segment, not by percentage", () => {
    // halfway Shinagawa→Yokohama (18 min, 1088 s of video)
    const p = getVideoTimeForJourneyTime(jst("17:41"), stops, frames);
    expect(p.videoTime).toBeCloseTo(512 + 544, 5);
    // a naive percentage mapping would be far off
    const pct = (jst("17:41") - jst("17:24")) / (jst("18:21") - jst("17:24"));
    expect(Math.abs(34 + pct * (3540 - 34) - p.videoTime)).toBeGreaterThan(15);
  });

  it("final station holds the last frame", () => {
    const p = getVideoTimeForJourneyTime(jst("18:21"), stops, frames);
    expect(p.videoTime).toBe(3540);
    expect(p.hold).toBe(true);
    expect(p.phase).toBe("after");
    expect(getVideoTimeForJourneyTime(jst("18:40"), stops, frames).videoTime).toBe(3540);
  });

  it("joining late gives the current position without restarting", () => {
    const p = getVideoTimeForJourneyTime(jst("17:56", 12), stops, frames);
    expect(p.phase).toBe("moving");
    expect(p.fromStop).toBe(2);
    expect(p.videoTime).toBeGreaterThan(1600);
    expect(p.videoTime).toBeLessThan(3540);
  });

  it("dwell is aligned so the footage leaves the platform at departure", () => {
    const dwellStops = [
      stop("Tokyo", "17:24"),
      stop("Shinagawa", "17:32", "17:33"),
      stop("Yokohama", "17:50"),
    ];
    const f = resolveVideoFrames(dwellStops, [
      { stationName: "Tokyo", videoTime: 34 },
      { stationName: "Shinagawa", videoTime: 512, arrivalTime: 500, departureTime: 530 },
      { stationName: "Yokohama", videoTime: 1600 },
    ])!.frames;
    // arrival 17:32:00 — waits at arrival frame (dwell in video is 30 s, timetable 60 s)
    const atArr = getVideoTimeForJourneyTime(jst("17:32"), dwellStops, f);
    expect(atArr.videoTime).toBe(500);
    expect(atArr.hold).toBe(true);
    // 10 s before departure → 520
    const p = getVideoTimeForJourneyTime(jst("17:32", 50), dwellStops, f);
    expect(p.videoTime).toBe(520);
    expect(p.hold).toBe(false);
    expect(getVideoTimeForJourneyTime(jst("17:33"), dwellStops, f).videoTime).toBe(530);
  });

  it("delays: effective (delayed) times shift the mapping", () => {
    const delayed = stops.map((s, i) =>
      i === 0 ? s : { ...s, arrival: s.arrival + 240_000, departure: s.departure + 240_000 },
    );
    expect(getVideoTimeForJourneyTime(jst("17:36"), delayed, frames).videoTime).toBeCloseTo(512, 5);
  });
});

describe("markers", () => {
  it("missing marker in the middle is interpolated by schedule", () => {
    const r = resolveVideoFrames(stops, [
      { stationName: "Tokyo", videoTime: 34 },
      { stationName: "Kamakura", videoTime: 3540 },
    ])!;
    expect(r.fromStopIndex).toBe(0);
    expect(r.toStopIndex).toBe(3);
    expect(r.frames[1].interpolated).toBe(true);
    expect(r.frames[1].arrival).toBeGreaterThan(34);
    expect(r.frames[1].arrival).toBeLessThan(r.frames[2].arrival);
  });

  it("matches names regardless of diacritics and case", () => {
    const s = [stop("Minato-Chūō", "10:00"), stop("Ōfuna", "10:10")];
    const r = resolveVideoFrames(s, [
      { stationName: "minato chuo", videoTime: 10 },
      { stationName: "OFUNA station", videoTime: 600 },
    ]);
    expect(r).not.toBeNull();
  });

  it("rejects footage running the opposite way and footage with < 2 markers", () => {
    expect(
      resolveVideoFrames(stops, [
        { stationName: "Tokyo", videoTime: 900 },
        { stationName: "Shinagawa", videoTime: 100 },
      ]),
    ).toBeNull();
    expect(resolveVideoFrames(stops, [{ stationName: "Tokyo", videoTime: 1 }])).toBeNull();
  });

  it("uncalibrated footage is never used for synchronised rides", () => {
    expect(candidateFor(video({ calibration: "needs-calibration" }), stops)).toBeNull();
  });
});

describe("getJourneyTimeForVideoTime (inverse)", () => {
  it("round-trips while moving", () => {
    for (const t of [jst("17:26"), jst("17:28"), jst("17:45", 30), jst("18:10")]) {
      const v = getVideoTimeForJourneyTime(t, stops, frames).videoTime;
      expect(getJourneyTimeForVideoTime(v, stops, frames)).toBeCloseTo(t, -1);
    }
  });
  it("273 s → 17:28", () => {
    expect(getJourneyTimeForVideoTime(273, stops, frames)).toBeCloseTo(jst("17:28"), -1);
  });
});

describe("multi-video journeys", () => {
  const a = video({
    id: "a",
    coverage: { from: "Tokyo", to: "Yokohama" },
    stationMarkers: [
      { stationName: "Tokyo", videoTime: 20 },
      { stationName: "Shinagawa", videoTime: 500 },
      { stationName: "Yokohama", videoTime: 1500 },
    ],
  });
  const b = video({
    id: "b",
    coverage: { from: "Yokohama", to: "Kamakura" },
    stationMarkers: [
      { stationName: "Yokohama", videoTime: 60 },
      { stationName: "Kamakura", videoTime: 1900 },
    ],
  });
  const segs = planSegments(stops, [candidateFor(a, stops)!, candidateFor(b, stops)!]);

  it("joins recordings at a station", () => {
    expect(segs.map((s) => s.video.id)).toEqual(["a", "b"]);
    expect(segs[0].toStopIndex).toBe(2);
    expect(segs[1].fromStopIndex).toBe(2);
  });

  it("picks the right segment and local video time", () => {
    const first = activeFootageAt(jst("17:28"), stops, segs)!;
    expect(first.segmentIndex).toBe(0);
    expect(first.position.videoTime).toBeCloseTo(260, 5);
    const second = activeFootageAt(jst("18:00"), stops, segs)!;
    expect(second.segmentIndex).toBe(1);
    expect(second.position.videoTime).toBeGreaterThan(60);
  });

  it("the next segment takes over at the boundary station", () => {
    const at = activeFootageAt(jst("17:50"), stops, segs)!;
    expect(at.segmentIndex).toBe(1);
    expect(at.position.videoTime).toBe(60);
  });

  it("partial coverage returns null outside the footage", () => {
    const partial = planSegments(stops, [candidateFor(a, stops)!]);
    expect(activeFootageAt(jst("18:00"), stops, partial)).toBeNull();
  });
});

describe("findBestVideoForJourney", () => {
  const ctx: JourneyContext = {
    routeId: "odpt:Yokosuka",
    lineName: "JR Yokosuka Line",
    routeStationNames: ["Tokyo", "Shinagawa", "Yokohama", "Kamakura", "Kurihama"],
    stops,
    departureMs: jst("17:24"),
    serviceType: "Local",
  };

  it("prefers full coverage and the right time of day", () => {
    const night = video({ id: "night", recordingPeriod: "night" });
    const sunset = video({ id: "sunset", recordingPeriod: "sunset" });
    const plan = findBestVideoForJourney(ctx, [night, sunset]);
    expect(plan.coversWholeJourney).toBe(true);
    expect(plan.segments[0].video.id).toBe("sunset");
  });

  it("never uses footage from another line", () => {
    const plan = findBestVideoForJourney(ctx, [video({ lineNames: ["Chuo"] })]);
    expect(plan.segments).toHaveLength(0);
    expect(plan.note).toMatch(/No recorded footage/);
  });

  it("reports partial coverage honestly", () => {
    const partial = video({
      stationMarkers: [
        { stationName: "Tokyo", videoTime: 34 },
        { stationName: "Yokohama", videoTime: 1600 },
      ],
    });
    const plan = findBestVideoForJourney(ctx, [partial]);
    expect(plan.coversWholeJourney).toBe(false);
    expect(plan.note).toBe("Video coverage: Tokyo → Yokohama only.");
  });

  it("lists uncalibrated footage separately", () => {
    const plan = findBestVideoForJourney(ctx, [
      video({ calibration: "needs-calibration", stationMarkers: [] }),
    ]);
    expect(plan.segments).toHaveLength(0);
    expect(plan.uncalibrated).toHaveLength(1);
  });

  it("time-of-day buckets use Japan time regardless of the runtime timezone", () => {
    expect(periodForTime(jst("07:00"))).toBe("morning");
    expect(periodForTime(jst("12:00"))).toBe("day");
    expect(periodForTime(jst("17:30"))).toBe("sunset");
    expect(periodForTime(jst("23:00"))).toBe("night");
    expect(periodForTime(Date.parse("2026-10-05T08:30:00Z"))).toBe("sunset"); // 17:30 JST
  });
});

describe("journey clock", () => {
  it("real mode is derived from absolute time (tab sleep safe)", () => {
    const c = realClock();
    const before = journeyNow(c, jst("17:28"));
    // tab sleeps for 9 minutes — nothing accumulated, just recompute
    const after = journeyNow(c, jst("17:37"));
    expect(after - before).toBe(9 * 60_000);
    const v = getVideoTimeForJourneyTime(after, stops, frames).videoTime;
    expect(v).toBeGreaterThan(512);
  });

  it("real mode ignores pause", () => {
    const c = realClock();
    expect(pauseClock(c, 0)).toBe(c);
  });

  it("simulation runs at speed, pauses and resumes", () => {
    let c = simulationClock(jst("17:24"), 4, 1000);
    expect(journeyNow(c, 1000 + 60_000)).toBe(jst("17:28"));
    c = pauseClock(c, 61_000);
    expect(journeyNow(c, 500_000)).toBe(jst("17:28"));
    c = resumeClock(c, 500_000);
    expect(journeyNow(c, 515_000)).toBe(jst("17:29"));
    c = setSpeed(c, 2, 515_000);
    expect(journeyNow(c, 545_000)).toBe(jst("17:30"));
  });
});

describe("real footage sync thresholds", () => {
  const ctl = () => new SyncController(REAL_FOOTAGE_SYNC_CONFIG);
  const player = (t: number, rate = 1) => ({
    currentTime: t,
    playing: true,
    rate,
    supportsFineRate: true,
  });
  it("< 1.5 s drift: no correction", () => {
    const a = ctl().step({ time: 101, hold: false }, player(100), 0);
    expect(a.seekTo).toBeUndefined();
    expect(a.setRate).toBeUndefined();
    expect(a.mode).toBe("in-sync");
  });
  it("1.5–5 s drift: gentle rate 0.95–1.05", () => {
    const a = ctl().step({ time: 103, hold: false }, player(100), 0);
    expect(a.seekTo).toBeUndefined();
    expect(a.setRate).toBeGreaterThan(1);
    expect(a.setRate).toBeLessThanOrEqual(1.05);
    const b = ctl().step({ time: 97, hold: false }, player(100), 0);
    expect(b.setRate).toBeLessThan(1);
    expect(b.setRate).toBeGreaterThanOrEqual(0.95);
  });
  it("> 5 s drift: seek, then cooldown avoids repeated seeking", () => {
    const c = ctl();
    expect(c.step({ time: 120, hold: false }, player(100), 0).seekTo).toBe(120);
    expect(c.step({ time: 130, hold: false }, player(100), 1000).seekTo).toBeUndefined();
    c.forceNextSeek();
    expect(c.step({ time: 130, hold: false }, player(100), 2000).seekTo).toBe(130);
  });
  it("simulation speed is the base rate", () => {
    const a = ctl().step({ time: 100, hold: false, rate: 2 }, player(100), 0);
    expect(a.setRate).toBe(2);
  });
});

import {
  formatTimecode,
  parseTimecode,
  parseYouTubeId,
  toCatalogEntry,
  validateMarkers,
} from "../client/src/features/japan/admin/calibration";

describe("calibration helpers", () => {
  it("parses YouTube ids from urls", () => {
    expect(parseYouTubeId("IchVEzYptyI")).toBe("IchVEzYptyI");
    expect(parseYouTubeId("https://www.youtube.com/watch?v=IchVEzYptyI&t=30")).toBe("IchVEzYptyI");
    expect(parseYouTubeId("https://youtu.be/IchVEzYptyI")).toBe("IchVEzYptyI");
    expect(parseYouTubeId("https://www.youtube.com/embed/IchVEzYptyI")).toBe("IchVEzYptyI");
    expect(parseYouTubeId("https://example.com/watch?v=IchVEzYptyI")).toBeNull();
    expect(parseYouTubeId("not a video")).toBeNull();
  });
  it("parses and formats timecodes", () => {
    expect(parseTimecode("8:32")).toBe(512);
    expect(parseTimecode("1:00:34")).toBe(3634);
    expect(parseTimecode("34.5")).toBe(34.5);
    expect(parseTimecode("2m5s")).toBe(125);
    expect(parseTimecode("abc")).toBeNull();
    expect(formatTimecode(512)).toBe("8:32.0");
  });
  it("exports a calibrated catalog entry only when markers are valid", () => {
    const draft = {
      id: "x",
      provider: "youtube" as const,
      videoId: "IchVEzYptyI",
      title: "t",
      creator: "c",
      sourceUrl: "https://www.youtube.com/watch?v=IchVEzYptyI",
      railwayOperator: "JR East",
      lineIds: [],
      lineNames: ["Yokosuka"],
      direction: "outbound",
      serviceTypes: ["Local"],
      videoStartSeconds: 34,
      embedStatus: "unverified" as const,
      markers: [
        { stationName: "Tokyo", videoTime: 34 },
        { stationName: "Shinagawa", videoTime: 512 },
      ],
    };
    const e = toCatalogEntry(draft);
    expect(e.calibration).toBe("calibrated");
    expect(e.coverage).toEqual({ from: "Tokyo", to: "Shinagawa" });
    expect(toCatalogEntry({ ...draft, markers: draft.markers.slice(0, 1) }).calibration).toBe(
      "needs-calibration",
    );
    expect(validateMarkers([...draft.markers].reverse())).not.toHaveLength(0);
  });
});
