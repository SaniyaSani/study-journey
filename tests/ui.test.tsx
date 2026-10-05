// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { RouteView } from "../client/src/features/japan/ride/RouteView";
import { StatusBadge, routeViewLabel } from "../client/src/features/japan/components";
import type { RoutePlayer } from "../client/src/features/japan/players/types";
import { migrate, SCHEMA_VERSION } from "../client/src/store/studyStore";
import { buildScenicTrip } from "../client/src/features/japan/session";
import { departureStatus } from "../client/src/features/japan/planner/usePlanner";
import type { Departure, RouteMediaManifest } from "@shared/types";

HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

const markers = [
  { stationId: "x:A", arrivalFrame: 0, departureFrame: 10, interpolated: false },
  { stationId: "x:B", arrivalFrame: 200, departureFrame: 230, interpolated: false },
];
const names = new Map([
  ["x:A", { nameJa: "甲", nameEn: "A" }],
  ["x:B", { nameJa: "乙", nameEn: "B" }],
]);

describe("route view fallback", () => {
  it("shows the illustrated view and explains when no route video exists", () => {
    const ref = createRef<RoutePlayer>();
    render(
      <RouteView
        ref={ref}
        kind="illustrated"
        manifest={null}
        markers={markers}
        names={names}
        reducedMotion
        label={routeViewLabel("timetable", "illustrated")}
        fallbackReason="A route video has not been added for this journey yet."
        initialTime={0}
        onVideoFailed={() => undefined}
        onReady={() => undefined}
      />,
    );
    expect(screen.getByText("Route video not available")).toBeInTheDocument();
    expect(screen.getByText(/not been added/)).toBeInTheDocument();
    expect(screen.getByText("Timetable data · Illustrated route view")).toBeInTheDocument();
    // the fallback still behaves like a player for the sync engine
    ref.current!.seek(120);
    ref.current!.setRate(1.05);
    expect(ref.current!.snapshot()).toMatchObject({
      currentTime: 120,
      rate: 1.05,
      supportsFineRate: true,
    });
  });

  it("never labels recorded footage as live camera", () => {
    expect(routeViewLabel("live", "video")).toBe("Live train data · Recorded route view");
    expect(routeViewLabel("demo", "illustrated")).toBe(
      "Demo railway data · Illustrated route view",
    );
  });

  it("shows status badges with accessible explanations", () => {
    render(<StatusBadge status="delayed" delaySeconds={240} />);
    expect(screen.getByText(/Delayed/)).toHaveTextContent("Delayed +4 min");
  });
});

describe("departure status", () => {
  const d = { dataMode: "demo" } as Departure;
  it("maps provider data to badges", () => {
    expect(departureStatus({ ...d, cancelled: true })).toBe("cancelled");
    expect(departureStatus({ ...d, delaySeconds: 120 })).toBe("delayed");
    expect(departureStatus(d)).toBe("demo");
    expect(departureStatus({ ...d, dataMode: "live" })).toBe("live");
    expect(departureStatus({ ...d, dataMode: "timetable" }, true)).toBe("offline");
  });
});

describe("study data migration", () => {
  it("preserves existing user data and unknown fields", () => {
    const v1 = {
      schemaVersion: 1,
      tasks: [{ id: "t", title: "Read", done: false, createdAt: "x" }],
      notes: [],
      sessions: [{ id: "s" }],
      custom: 42,
      settings: { pomodoroMinutes: 50 },
    };
    const m = migrate(v1);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.tasks).toHaveLength(1);
    expect(m.focusSessions).toHaveLength(1);
    expect(m.stamps).toEqual([]);
    expect(m.custom).toBe(42);
    expect(m.settings.pomodoroMinutes).toBe(50);
    expect(m.settings.announcementMode).toBe("en");
  });
});

describe("scenic focus", () => {
  it("builds a schedule from the recording's station markers", () => {
    const manifest = {
      routeId: "x:R",
      operatorId: "x:O",
      direction: "0",
      originStationId: "x:A",
      destinationStationId: "x:C",
      stationMarkers: [
        { stationId: "x:A", videoTimeSeconds: 0, departureFrameSeconds: 15 },
        {
          stationId: "x:B",
          videoTimeSeconds: 315,
          arrivalFrameSeconds: 315,
          departureFrameSeconds: 345,
        },
        { stationId: "x:C", videoTimeSeconds: 645 },
      ],
    } as RouteMediaManifest;
    const start = Date.parse("2026-10-05T18:00:00+09:00");
    const trip = buildScenicTrip({
      route: {
        id: "x:R",
        operatorId: "x:O",
        nameJa: "",
        nameEn: "",
        stationIds: ["x:A", "x:B", "x:C"],
      },
      originStationId: "x:A",
      destinationStationId: "x:C",
      manifest,
      template: null,
      startMs: start,
    });
    expect(trip.dataMode).toBe("offline");
    expect(trip.stops.map((s) => s.scheduledArrival)).toEqual([
      "2026-10-05T18:00:00+09:00",
      "2026-10-05T18:05:00+09:00",
      "2026-10-05T18:10:30+09:00",
    ]);
  });
});
