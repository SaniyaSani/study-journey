import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteShape, Station } from "@shared/types";
import type { JourneyProgress } from "@shared/journey";
import {
  approximateLineFromStations,
  hasCoordinates,
  trainMapPosition,
  type LonLat,
  type TrainMapPosition,
} from "@shared/geo";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type * as GeoJSON from "geojson";

interface Props {
  shape: RouteShape | null;
  routeStations: Station[];
  journeyStations: Station[];
  progress: JourneyProgress;
  lineColor?: string;
}

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: { "raster-saturation": -0.65, "raster-brightness-max": 0.72, "raster-contrast": -0.1 },
    },
  ],
};

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features,
});
const line = (coords: LonLat[]): GeoJSON.Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: coords },
});

export function JourneyMap({
  shape,
  routeStations,
  journeyStations,
  progress,
  lineColor = "#2e7d5b",
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const routeLine = useMemo<LonLat[]>(
    () =>
      shape?.coordinates?.length ? shape.coordinates : approximateLineFromStations(routeStations),
    [shape, routeStations],
  );
  const approximateRoute = !shape || shape.approximate;
  const pos = useMemo(
    () => trainMapPosition(routeLine, journeyStations, progress),
    [routeLine, journeyStations, progress],
  );
  const missingCoords = journeyStations.some((s) => !hasCoordinates(s));

  useEffect(() => {
    if (!container.current || routeLine.length < 2) return;
    let disposed = false;
    import("maplibre-gl")
      .then(async (ml) => {
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (disposed || !container.current) return;
        const styleUrl = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;
        const m = new ml.Map({
          container: container.current,
          style: styleUrl || OSM_STYLE,
          attributionControl: { compact: true },
          interactive: true,
          cooperativeGestures: true,
        });
        map.current = m;
        m.on("error", () => undefined);
        m.on("load", () => {
          const bounds = routeLine.reduce(
            (b, c) => b.extend(c as [number, number]),
            new ml.LngLatBounds(routeLine[0] as [number, number], routeLine[0] as [number, number]),
          );
          m.fitBounds(bounds, { padding: 28, duration: 0 });
          m.addSource("route", { type: "geojson", data: line(routeLine) });
          m.addSource("completed", { type: "geojson", data: fc([]) });
          m.addSource("upcoming", { type: "geojson", data: fc([]) });
          m.addSource("segment", { type: "geojson", data: fc([]) });
          m.addSource("train", { type: "geojson", data: fc([]) });
          m.addSource("stations", { type: "geojson", data: fc([]) });
          m.addLayer({
            id: "route",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#8a93a6",
              "line-width": 3,
              "line-opacity": 0.5,
              ...(approximateRoute ? { "line-dasharray": [2, 2] } : {}),
            },
          });
          m.addLayer({
            id: "upcoming",
            type: "line",
            source: "upcoming",
            paint: { "line-color": lineColor, "line-width": 4, "line-opacity": 0.55 },
          });
          m.addLayer({
            id: "completed",
            type: "line",
            source: "completed",
            paint: { "line-color": "#f4ead7", "line-width": 4 },
          });
          m.addLayer({
            id: "segment",
            type: "line",
            source: "segment",
            paint: {
              "line-color": "#e2a654",
              "line-width": 9,
              "line-opacity": 0.55,
              "line-blur": 2,
            },
          });
          m.addLayer({
            id: "stations",
            type: "circle",
            source: "stations",
            paint: {
              "circle-radius": ["case", ["get", "endpoint"], 6, 4],
              "circle-color": "#fbf8f1",
              "circle-stroke-color": lineColor,
              "circle-stroke-width": 2,
            },
          });
          m.addLayer({
            id: "train",
            type: "circle",
            source: "train",
            paint: {
              "circle-radius": 8,
              "circle-color": "#c8553d",
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 2,
            },
          });
          setLoaded(true);
        });
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      setLoaded(false);
    };
    // geometry/color changes recreate the map
  }, [routeLine, approximateRoute, lineColor]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    const set = (id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature) =>
      (m.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    set("completed", pos ? line(pos.completed) : fc([]));
    set("upcoming", pos ? line(pos.upcoming) : fc([]));
    set("segment", pos?.segment ? line(pos.segment) : fc([]));
    set(
      "train",
      pos?.point
        ? fc([
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: pos.point },
            },
          ])
        : fc([]),
    );
    set(
      "stations",
      fc(
        journeyStations.filter(hasCoordinates).map((s, i, arr) => ({
          type: "Feature",
          properties: { name: s.nameEn, endpoint: i === 0 || i === arr.length - 1 },
          geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
        })),
      ),
    );
  }, [pos, loaded, journeyStations]);

  const caption = [
    approximateRoute
      ? "Approximate route (through station coordinates)"
      : "Route geometry from the timetable feed",
    pos?.segment ? "Train position known only between stations" : "Train position estimated",
    missingCoords ? "Some stations have no coordinates" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (routeLine.length < 2) {
    return (
      <div className="journey-map journey-map-empty" role="note">
        No coordinates are available for this route, so the map cannot be drawn. Station progress
        continues above.
      </div>
    );
  }

  return (
    <figure className="journey-map-wrap">
      {failed ? (
        <SchematicMap line={routeLine} pos={pos} stations={journeyStations} lineColor={lineColor} />
      ) : (
        <div ref={container} className="journey-map" aria-label="Route map" role="region" />
      )}
      <figcaption className="map-caption">{caption}</figcaption>
    </figure>
  );
}

/** SVG fallback when WebGL / map tiles are unavailable. */
function SchematicMap({
  line: l,
  pos,
  stations,
  lineColor,
}: {
  line: LonLat[];
  pos: TrainMapPosition | null;
  stations: Station[];
  lineColor: string;
}) {
  const xs = l.map((p) => p[0]);
  const ys = l.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const W = 320;
  const H = 180;
  const sc = Math.min(
    (W - 30) / Math.max(1e-6, maxX - minX),
    (H - 30) / Math.max(1e-6, maxY - minY),
  );
  const pr = (p: LonLat) => [15 + (p[0] - minX) * sc, H - 15 - (p[1] - minY) * sc] as const;
  const path = (c: LonLat[]) => c.map((p, i) => `${i ? "L" : "M"}${pr(p).join(",")}`).join(" ");
  return (
    <svg
      className="journey-map schematic"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Schematic route map"
    >
      <path
        d={path(l)}
        stroke="#8a93a6"
        strokeWidth="3"
        fill="none"
        strokeDasharray="4 4"
        opacity="0.6"
      />
      {pos && <path d={path(pos.completed)} stroke="#f4ead7" strokeWidth="4" fill="none" />}
      {pos?.segment && (
        <path d={path(pos.segment)} stroke="#e2a654" strokeWidth="8" opacity="0.5" fill="none" />
      )}
      {stations.filter(hasCoordinates).map((s) => {
        const [x, y] = pr([s.longitude, s.latitude]);
        return (
          <circle
            key={s.id}
            cx={x}
            cy={y}
            r="4"
            fill="#fbf8f1"
            stroke={lineColor}
            strokeWidth="2"
          />
        );
      })}
      {pos?.point && (
        <circle
          cx={pr(pos.point)[0]}
          cy={pr(pos.point)[1]}
          r="6"
          fill="#c8553d"
          stroke="#fff"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
