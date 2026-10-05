import type { Station } from "./types";
import type { JourneyProgress } from "./journey";

export type LonLat = [number, number];

export function hasCoordinates(s: Station): s is Station & { latitude: number; longitude: number } {
  return typeof s.latitude === "number" && typeof s.longitude === "number";
}

/** Rough planar distance in metres (adequate for positions along a railway line). */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = toRad(b[0] - a[0]) * Math.cos(toRad((a[1] + b[1]) / 2));
  const y = toRad(b[1] - a[1]);
  return Math.sqrt(x * x + y * y) * R;
}

/** Cumulative distance along a polyline for each vertex. */
export function cumulative(line: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distanceMeters(line[i - 1], line[i]));
  return out;
}

/** Distance along the polyline of the vertex nearest to `p` (projection onto segments). */
export function projectOnLine(line: LonLat[], p: LonLat, cum = cumulative(line)): number {
  let best = Infinity;
  let bestAlong = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const q: LonLat = [a[0] + t * dx, a[1] + t * dy];
    const d = distanceMeters(p, q);
    if (d < best) {
      best = d;
      bestAlong = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return bestAlong;
}

export function pointAlong(line: LonLat[], along: number, cum = cumulative(line)): LonLat {
  if (line.length === 1) return line[0];
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, along));
  for (let i = 0; i < line.length - 1; i++) {
    if (d <= cum[i + 1]) {
      const seg = cum[i + 1] - cum[i];
      const t = seg === 0 ? 0 : (d - cum[i]) / seg;
      return [
        line[i][0] + t * (line[i + 1][0] - line[i][0]),
        line[i][1] + t * (line[i + 1][1] - line[i][1]),
      ];
    }
  }
  return line[line.length - 1];
}

export function sliceLine(
  line: LonLat[],
  from: number,
  to: number,
  cum = cumulative(line),
): LonLat[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const out: LonLat[] = [pointAlong(line, a, cum)];
  for (let i = 0; i < line.length; i++) if (cum[i] > a && cum[i] < b) out.push(line[i]);
  out.push(pointAlong(line, b, cum));
  return out;
}

/** Polyline through station coordinates — used when no authoritative geometry exists. */
export function approximateLineFromStations(stations: Station[]): LonLat[] {
  return stations.filter(hasCoordinates).map((s) => [s.longitude, s.latitude] as LonLat);
}

export interface TrainMapPosition {
  /** point estimate; omitted when only "between A and B" is known */
  point?: LonLat;
  /** highlighted segment when the position is approximate */
  segment?: LonLat[];
  completed: LonLat[];
  upcoming: LonLat[];
}

/**
 * Train position on the route geometry for the map. When the source only knows that the
 * train is between two stations we return the segment, not a fabricated point.
 */
export function trainMapPosition(
  line: LonLat[],
  journeyStations: Station[],
  progress: JourneyProgress,
): TrainMapPosition | null {
  if (line.length < 2) return null;
  const cum = cumulative(line);
  const along = journeyStations.map((s) =>
    hasCoordinates(s) ? projectOnLine(line, [s.longitude, s.latitude], cum) : null,
  );
  const start = along[0];
  const end = along[along.length - 1];
  if (start == null || end == null) return null;
  const a = along[progress.currentIndex];
  const b = along[progress.nextIndex];
  if (a == null || b == null) return null;
  const pos =
    progress.phase === "running"
      ? a + (b - a) * progress.segmentFraction
      : progress.phase === "arrived"
        ? end
        : a;
  const result: TrainMapPosition = {
    completed: sliceLine(line, start, pos, cum),
    upcoming: sliceLine(line, pos, end, cum),
  };
  if (progress.phase === "running" && progress.positionApproximate) {
    result.segment = sliceLine(line, a, b, cum);
  } else {
    result.point = pointAlong(line, pos, cum);
  }
  return result;
}
