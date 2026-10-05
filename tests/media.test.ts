import { describe, expect, it } from "vitest";
import { MediaLibrary } from "../server/media";

const base = {
  routeId: "odpt:R",
  operatorId: "odpt:O",
  direction: "0",
  originStationId: "odpt:A",
  destinationStationId: "odpt:C",
  stationMarkers: [
    { stationId: "odpt:A", videoTimeSeconds: 5 },
    { stationId: "odpt:B", videoTimeSeconds: 200 },
    { stationId: "odpt:C", videoTimeSeconds: 400 },
  ],
};
const yt = {
  provider: "youtube",
  videoId: "abcDEF12345",
  title: "Cab view",
  creator: "Owner",
  sourceUrl: "https://youtube.com/watch?v=abcDEF12345",
  licenseStatus: "platform-embed",
  attributionRequired: true,
};

describe("route media manifests", () => {
  it("accepts a valid YouTube manifest and matches it by travel order", () => {
    const lib = new MediaLibrary({ manifests: [{ ...base, video: yt }] });
    expect(lib.warnings).toEqual([]);
    expect(lib.match("odpt:R", "odpt:A", "odpt:C")?.video?.videoId).toBe("abcDEF12345");
    expect(lib.match("odpt:R", "odpt:B", "odpt:C")).not.toBeNull();
    expect(lib.match("odpt:R", "odpt:C", "odpt:A")).toBeNull(); // opposite direction
  });

  it("rejects invalid entries instead of crashing", () => {
    const lib = new MediaLibrary({
      manifests: [
        { ...base, video: { ...yt, videoId: undefined } },
        {
          ...base,
          video: {
            ...yt,
            provider: "self-hosted",
            url: "/media/x.mp4",
            licenseStatus: "platform-embed",
          },
        },
        { ...base, stationMarkers: [base.stationMarkers[1], base.stationMarkers[0]] },
      ],
    });
    expect(lib.forRoute("odpt:R")).toHaveLength(0);
    expect(lib.warnings).toHaveLength(3);
  });

  it("loads the bundled demo manifests", () => {
    const lib = MediaLibrary.bundled();
    expect(lib.warnings).toEqual([]);
    expect(lib.match("demo:SAKURA", "demo:SK08", "demo:SK01")?.direction).toBe("1");
  });
});
