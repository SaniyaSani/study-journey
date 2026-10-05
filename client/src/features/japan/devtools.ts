/**
 * Developer tools (debug overlay, simulation clock, video calibration) are compiled into
 * development builds only — or into a production build explicitly made with
 * VITE_ENABLE_DEV_TOOLS=true (e.g. a private staging deploy). They are never public by default.
 */
declare const __DEV_TOOLS__: boolean;

/** compile-time constant — false in public production builds, so dev-only code is removed */
export const DEV_TOOLS: boolean = typeof __DEV_TOOLS__ !== "undefined" && __DEV_TOOLS__;

export function devToolsEnabled(): boolean {
  return DEV_TOOLS;
}

export function queryParam(name: string): string | null {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get(name);
    if (fromSearch != null) return fromSearch;
    const q = window.location.hash.split("?")[1];
    return q ? new URLSearchParams(q).get(name) : null;
  } catch {
    return null;
  }
}
