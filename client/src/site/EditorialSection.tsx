import { useState } from "react";
import { EditorialScene } from "../design/scenes/EditorialScene";
import { LineBadge, PlatformSign, RouteMap } from "../design/station";
import { Icon } from "../design/ui";
import type { Planner } from "../features/japan/planner/usePlanner";
import { japanApi } from "../features/japan/api";
import { FEATURED_ROUTES, type FeaturedRoute } from "./featuredRoutes";

/** Route-map board colours, one per featured route (diagram colours, not operator liveries). */
export const ROUTE_COLORS = [
  "var(--line-blue)",
  "var(--line-orange)",
  "var(--line-green)",
  "var(--line-sky)",
  "var(--line-purple)",
  "var(--line-red)",
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function RouteCard({
  route,
  onPick,
  note,
  color = "var(--line-green)",
  index = 0,
}: {
  route: FeaturedRoute;
  onPick: () => void;
  note?: string;
  color?: string;
  index?: number;
}) {
  return (
    <article
      className={`route-card route-card--${route.size}`}
      style={{ ["--line" as string]: color }}
    >
      <button
        type="button"
        className="route-card-hit"
        onClick={onPick}
        aria-label={`${route.fromEn} to ${route.toEn} — choose this route`}
      >
        <div className="route-card-photo">
          <EditorialScene variant={route.scene} />
          <div className="halftone" />
          <div className="grain grain--soft" />
        </div>
        <span className="route-card-band">
          <span className="route-card-no" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="route-card-theme">
            <span>{route.themeEn}</span>
            <small lang="ja">{route.themeJa}</small>
          </span>
          <span className="route-card-coord">{route.coord}</span>
        </span>
        <div className="route-card-text">
          <h3 className="route-card-title">
            <span>
              {route.fromEn} <span className="arrow">→</span> {route.toEn}
            </span>
            <small lang="ja">
              {route.fromJa} → {route.toJa}
            </small>
          </h3>
          <span className="route-card-mini" aria-hidden="true">
            <span className="route-card-mini-dot" />
            <span className="route-card-mini-line" />
            <span className="route-card-mini-dot" />
          </span>
          <p className="route-card-line">
            <LineBadge en={route.lineEn} ja={route.lineJa} color={color} />
          </p>
          <span className="route-card-go">
            Choose this route <Icon name="arrow" size={16} />
          </span>
        </div>
      </button>
      {note && (
        <p className="route-card-note" role="status">
          {note}
        </p>
      )}
    </article>
  );
}

/**
 * 旅の雑誌 — asymmetric, magazine-like collage of routes. Picking a route fills the
 * selector when the line exists in the configured data; otherwise it says what is needed.
 */
export function EditorialSection({
  planner,
  onPicked,
}: {
  planner: Planner;
  onPicked: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<number | undefined>(undefined);

  async function pick(r: FeaturedRoute) {
    setPicked(FEATURED_ROUTES.indexOf(r));
    const routes = planner.routes.data ?? [];
    for (const line of routes) {
      try {
        const st = (await japanApi.stations(line.id)).data;
        const from = st.find((s) => norm(s.nameEn).includes(norm(r.match.from)));
        const to = st.find((s) => norm(s.nameEn).includes(norm(r.match.to)));
        if (from && to && from.id !== to.id) {
          planner.selectSection(line.id, from.id, to.id);
          onPicked();
          return;
        }
      } catch {
        /* try the next line */
      }
    }
    setNotes((n) => ({
      ...n,
      [r.id]: `${r.lineEn} is not in your current railway data. Add an ODPT key or a GTFS feed that includes it (see About).`,
    }));
  }

  return (
    <section className="editorial" id="routes" aria-labelledby="ed-title">
      <header className="editorial-head">
        <PlatformSign
          className="editorial-sign"
          ja="路線図"
          en="Route map · Featured routes"
          arrow="down"
          tone="green"
        />
        <h2 id="ed-title">
          <span className="editorial-title-ja">
            Somewhere,
            <br />
            by train.
          </span>
          <span className="editorial-title-en">
            Featured routes{" "}
            <span lang="ja" aria-hidden="true">
              · どこかへ、電車で。
            </span>
          </span>
        </h2>
        <p className="editorial-lede">
          New scenery is waiting beyond the window.
          <span lang="ja">窓の向こうに、まだ知らない日本がある。</span>
        </p>
      </header>
      <div className="editorial-map">
        <div className="editorial-map-head" aria-hidden="true">
          <span lang="ja">のりかえ案内</span>
          <span>FROM YOUR WINDOW TO …</span>
        </div>
        <RouteMap
          label="Featured destinations"
          color="var(--st-steel)"
          current={picked}
          onSelect={(i) => void pick(FEATURED_ROUTES[i])}
          stops={FEATURED_ROUTES.map((r, i) => ({
            id: r.id,
            ja: r.toJa,
            en: r.toEn,
            note: r.themeEn,
            color: ROUTE_COLORS[i % ROUTE_COLORS.length],
          }))}
        />
      </div>
      <div className="editorial-grid">
        {FEATURED_ROUTES.map((r, i) => (
          <RouteCard
            key={r.id}
            route={r}
            index={i}
            color={ROUTE_COLORS[i % ROUTE_COLORS.length]}
            onPick={() => pick(r)}
            note={notes[r.id]}
          />
        ))}
        <aside className="editorial-aside" aria-hidden="true">
          <span lang="ja" className="vertical">
            こんどは、どこへ行こう。
          </span>
          <span className="editorial-aside-en">Where shall we go next?</span>
        </aside>
      </div>
    </section>
  );
}
