import type { AppConfig } from "../config";
import { loadFeedFromUrl, type GtfsFeed } from "../gtfs/feed";
import { DemoProvider } from "./demoProvider";
import { GtfsProvider } from "./gtfsProvider";
import { GtfsRealtimeSource } from "./gtfsRealtime";
import { OdptProvider } from "./odptProvider";
import { EkispertAdapter, NavitimeAdapter } from "./commercialAdapters";
import { ProviderError, providerOf, type RailwayProvider } from "./types";

export interface ProviderStatus {
  id: string;
  label: string;
  enabled: boolean;
  reason?: string;
  active: boolean;
}

/** Routes namespaced ids to the provider that issued them. */
export class ProviderRegistry {
  constructor(
    public providers: RailwayProvider[],
    public activeId: string,
  ) {}

  enabled(): RailwayProvider[] {
    return this.providers.filter((p) => p.isEnabled());
  }

  forId(id: string): RailwayProvider {
    const pid = providerOf(id);
    const p = this.providers.find((x) => x.id === pid);
    if (!p) throw new ProviderError("NOT_FOUND", `No railway provider for id "${id}"`);
    if (!p.isEnabled())
      throw new ProviderError("NOT_CONFIGURED", p.disabledReason() ?? `${p.label} is disabled`);
    return p;
  }

  status(): ProviderStatus[] {
    return this.providers.map((p) => ({
      id: p.id,
      label: p.label,
      enabled: p.isEnabled(),
      reason: p.isEnabled() ? undefined : p.disabledReason(),
      active: p.id === this.activeId,
    }));
  }
}

export interface PlatformLoaders {
  /** Node supplies a filesystem/disk-cached loader; Workers use the URL loader. */
  loadGtfsFeed?: () => Promise<GtfsFeed> | GtfsFeed;
  clock?: () => number;
}

export function createRegistry(cfg: AppConfig, platform: PlatformLoaders = {}): ProviderRegistry {
  const providers: RailwayProvider[] = [];

  const odpt = new OdptProvider({
    apiKey: cfg.odptApiKey,
    baseUrl: cfg.odptBaseUrl,
    enabled: cfg.enableOdpt,
    operators: cfg.odptOperators,
  });
  providers.push(odpt);

  const gtfsLoader =
    platform.loadGtfsFeed ??
    (cfg.gtfsFeedUrl ? () => loadFeedFromUrl(cfg.gtfsFeedUrl!) : undefined);
  if (cfg.enableGtfs && gtfsLoader && (cfg.gtfsLocalPath || cfg.gtfsFeedUrl)) {
    const rt = new GtfsRealtimeSource({ ...cfg.gtfsRt, odptApiKey: cfg.odptApiKey });
    providers.push(
      new GtfsProvider("gtfs", cfg.gtfsLabel, gtfsLoader, { dataMode: "timetable", realtime: rt }),
    );
  }

  if (cfg.enableDemo) providers.push(new DemoProvider(platform.clock));

  providers.push(new NavitimeAdapter(cfg.navitimeApiKey), new EkispertAdapter(cfg.ekispertApiKey));

  // Active = requested provider if usable, else the first usable in priority order odpt → gtfs → demo
  const usable = (id: string) => providers.find((p) => p.id === id && p.isEnabled());
  const active =
    usable(cfg.railwayProvider)?.id ??
    usable("odpt")?.id ??
    usable("gtfs")?.id ??
    usable("demo")?.id ??
    "demo";
  return new ProviderRegistry(providers, active);
}
