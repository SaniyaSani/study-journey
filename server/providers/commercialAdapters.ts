import type { ProviderId } from "@shared/types";
import { ProviderError, type RailwayProvider } from "./types";

/**
 * Placeholders for future commercial data sources. They are intentionally DISABLED:
 * no endpoints are guessed, no websites are scraped. Implement them only after obtaining a
 * contract and the official API documentation, then register them in providers/registry.ts.
 *
 *  - NAVITIME API  → credentials: NAVITIME_API_KEY (see README, "Commercial adapters")
 *  - Ekispert API  → credentials: EKISPERT_API_KEY
 */
abstract class DisabledCommercialAdapter implements RailwayProvider {
  abstract readonly id: ProviderId;
  abstract readonly label: string;
  readonly baseDataMode = "timetable" as const;

  constructor(protected apiKey?: string) {}

  isEnabled(): boolean {
    return false;
  }
  disabledReason(): string {
    return this.apiKey
      ? `${this.label} adapter is not implemented yet (requires a commercial contract and official API documentation)`
      : `${this.label} is not configured`;
  }
  private fail(): never {
    throw new ProviderError("NOT_CONFIGURED", this.disabledReason());
  }
  getOperators = async () => this.fail();
  getRoutes = async () => this.fail();
  getStations = async () => this.fail();
  getDepartures = async () => this.fail();
  getTrip = async () => this.fail();
  getRealtimeTrip = async () => this.fail();
  getServiceAlerts = async () => this.fail();
}

export class NavitimeAdapter extends DisabledCommercialAdapter {
  readonly id = "navitime" as const;
  readonly label = "NAVITIME API";
}

export class EkispertAdapter extends DisabledCommercialAdapter {
  readonly id = "ekispert" as const;
  readonly label = "Ekispert API";
}
