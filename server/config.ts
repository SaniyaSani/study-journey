const bool = (v: string | undefined, d: boolean) =>
  v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(v);
const list = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

export interface AppConfig {
  port: number;
  railwayProvider: "demo" | "gtfs" | "odpt";
  enableOdpt: boolean;
  enableGtfs: boolean;
  enableDemo: boolean;
  odptApiKey?: string;
  odptBaseUrl: string;
  odptOperators?: string[];
  gtfsFeedUrl?: string;
  gtfsLocalPath?: string;
  gtfsLabel: string;
  gtfsRt: { tripUpdatesUrl?: string; vehiclePositionsUrl?: string; alertsUrl?: string };
  navitimeApiKey?: string;
  ekispertApiKey?: string;
  /** custom manifest file (Node only); the bundled manifests are used otherwise */
  mediaManifestPath?: string;
}

export type EnvLike = Record<string, string | undefined>;

export function readConfig(env: EnvLike): AppConfig {
  const provider = (env.RAILWAY_PROVIDER ?? "demo").toLowerCase();
  return {
    port: Number(env.PORT ?? 8787),
    railwayProvider: provider === "odpt" || provider === "gtfs" ? provider : "demo",
    enableOdpt: bool(env.ENABLE_ODPT, true),
    enableGtfs: bool(env.ENABLE_GTFS, true),
    enableDemo: bool(env.ENABLE_DEMO_RAILWAY, true),
    odptApiKey: env.ODPT_API_KEY || undefined,
    odptBaseUrl: env.ODPT_API_BASE_URL || "https://api.odpt.org/api/v4",
    odptOperators: list(env.ODPT_OPERATORS),
    gtfsFeedUrl: env.GTFS_FEED_URL || undefined,
    gtfsLocalPath: env.GTFS_LOCAL_PATH || undefined,
    gtfsLabel: env.GTFS_FEED_LABEL || "GTFS timetable",
    gtfsRt: {
      tripUpdatesUrl: env.GTFS_RT_TRIP_UPDATES_URL || undefined,
      vehiclePositionsUrl: env.GTFS_RT_VEHICLE_POSITIONS_URL || undefined,
      alertsUrl: env.GTFS_RT_ALERTS_URL || undefined,
    },
    navitimeApiKey: env.NAVITIME_API_KEY || undefined,
    ekispertApiKey: env.EKISPERT_API_KEY || undefined,
    mediaManifestPath: env.ROUTE_MEDIA_MANIFEST || undefined,
  };
}
