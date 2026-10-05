import { describe, expect, it } from "vitest";
import { buildTimeline, computeProgress } from "@shared/journey";
import {
  desiredVideoPosition,
  markersFromTimeline,
  resolveMarkers,
  SyncController,
  DEFAULT_SYNC_CONFIG,
} from "@shared/sync";
import { at, makeTrip } from "./helpers";

const tl = buildTimeline(makeTrip(), "x:A", "x:D");
// recording: departs A at 10 s, B 280–310, (no marker for C), arrives D at 960
const markers = [
  { stationId: "x:A", videoTimeSeconds: 0, arrivalFrameSeconds: 0, departureFrameSeconds: 10 },
  { stationId: "x:B", videoTimeSeconds: 280, arrivalFrameSeconds: 280, departureFrameSeconds: 310 },
  { stationId: "x:D", videoTimeSeconds: 960 },
];

describe("video marker resolution", () => {
  it("interpolates missing station markers by scheduled time", () => {
    const r = resolveMarkers(tl, markers)!;
    expect(r).toHaveLength(4);
    expect(r[2].interpolated).toBe(true);
    // C arrives 300 s after B departs out of a 690 s B→D window
    expect(r[2].arrivalFrame).toBeCloseTo(310 + (300 / 690) * 650, 3);
  });

  it("returns null when markers do not cover the journey", () => {
    expect(resolveMarkers(tl, [markers[0]])).toBeNull();
    expect(
      resolveMarkers(tl, [{ ...markers[0] }, { stationId: "x:B", videoTimeSeconds: 0 }]),
    ).toBeNull();
  });
});

describe("desired video position", () => {
  const r = resolveMarkers(tl, markers)!;
  it("interpolates between station markers while running", () => {
    const now = at("18:14:30"); // halfway A→B
    const d = desiredVideoPosition(tl, computeProgress(tl, now), r, now);
    expect(d.hold).toBe(false);
    expect(d.time).toBeCloseTo(10 + 0.5 * 270, 3);
  });
  it("aligns the recorded dwell with the real departure and waits before it", () => {
    const now = at("18:17:25"); // 25 s into a 30 s dwell at B; video dwell is 30 s too
    const d = desiredVideoPosition(tl, computeProgress(tl, now), r, now);
    expect(d.time).toBeCloseTo(305, 3);
    expect(d.hold).toBe(false);
    const before = at("18:11:00");
    const d0 = desiredVideoPosition(tl, computeProgress(tl, before), r, before);
    expect(d0.hold).toBe(true);
    expect(d0.time).toBe(0); // waits at the platform frame until the recorded dwell fits
  });
  it("holds at the final arrival frame", () => {
    const now = at("18:40:00");
    expect(desiredVideoPosition(tl, computeProgress(tl, now), r, now)).toEqual({
      time: 960,
      hold: true,
    });
  });
  it("builds markers from the timetable for the fallback view", () => {
    const m = markersFromTimeline(tl);
    expect(m[1]).toMatchObject({
      stationId: "x:B",
      arrivalFrameSeconds: 300,
      departureFrameSeconds: 330,
    });
  });
});

describe("SyncController", () => {
  const snap = (
    currentTime: number,
    extra: Partial<{ playing: boolean; rate: number; supportsFineRate: boolean }> = {},
  ) => ({
    currentTime,
    playing: true,
    rate: 1,
    supportsFineRate: true,
    ...extra,
  });

  it("does nothing inside the deadband", () => {
    const c = new SyncController();
    const cmd = c.step({ time: 100, hold: false }, snap(98), 0);
    expect(cmd.mode).toBe("in-sync");
    expect(cmd.seekTo).toBeUndefined();
    expect(cmd.setRate).toBeUndefined();
  });

  it("gently adjusts playback rate within 0.92–1.08 for moderate drift", () => {
    const c = new SyncController();
    const ahead = c.step({ time: 100, hold: false }, snap(92), 0); // video 8 s behind
    expect(ahead.mode).toBe("adjusting-rate");
    expect(ahead.setRate).toBeGreaterThan(1);
    expect(ahead.setRate).toBeLessThanOrEqual(DEFAULT_SYNC_CONFIG.maxRate);
    const behind = new SyncController().step({ time: 100, hold: false }, snap(113), 0);
    expect(behind.setRate).toBeLessThan(1);
    expect(behind.setRate).toBeGreaterThanOrEqual(DEFAULT_SYNC_CONFIG.minRate);
  });

  it("keeps correcting until settled (hysteresis), then restores rate 1", () => {
    const c = new SyncController();
    c.step({ time: 100, hold: false }, snap(94), 0);
    const mid = c.step({ time: 101, hold: false }, snap(99, { rate: 1.07 }), 1000); // drift 2 s
    expect(mid.mode).toBe("adjusting-rate");
    const done = c.step({ time: 102, hold: false }, snap(101.6, { rate: 1.01 }), 2000);
    expect(done.mode).toBe("in-sync");
    expect(done.setRate).toBe(1);
  });

  it("seeks for large drift but not repeatedly (cooldown)", () => {
    const c = new SyncController();
    const first = c.step({ time: 500, hold: false }, snap(100), 0);
    expect(first.seekTo).toBe(500);
    const again = c.step({ time: 501, hold: false }, snap(120), 2000);
    expect(again.seekTo).toBeUndefined();
    const later = c.step({ time: 520, hold: false }, snap(130), 20_000);
    expect(later.seekTo).toBe(520);
  });

  it("uses a lower seek threshold for coarse-rate players and never sets odd rates", () => {
    const c = new SyncController();
    const cmd = c.step({ time: 100, hold: false }, snap(94, { supportsFineRate: false }), 0);
    expect(cmd.setRate).toBeUndefined();
    expect(cmd.seekTo).toBeUndefined();
    const big = c.step({ time: 100, hold: false }, snap(90, { supportsFineRate: false }), 0);
    expect(big.seekTo).toBe(100);
  });

  it("pauses at a station hold and resumes afterwards", () => {
    const c = new SyncController();
    expect(c.step({ time: 300, hold: true }, snap(300.2), 0).pause).toBe(true);
    const approaching = c.step({ time: 300, hold: true }, snap(296, { playing: false }), 1000);
    expect(approaching.play).toBe(true);
    const resume = c.step({ time: 301, hold: false }, snap(300, { playing: false }), 2000);
    expect(resume.play).toBe(true);
  });
});
