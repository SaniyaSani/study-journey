import { useMemo } from "react";
import type { RailwayRoute, Station } from "@shared/types";
import { formatTokyoClock } from "@shared/time";
import {
  LineBadge,
  serviceColor,
  StationChip,
  stationNumbering,
  TicketCard,
  TrackNumber,
} from "../design/station";
import { Icon, Label } from "../design/ui";
import type { Planner } from "../features/japan/planner/usePlanner";

interface Props {
  planner: Planner;
  onBoard: () => void;
}

function Numbering({ st, color }: { st: Station | undefined; color: string }) {
  const n = stationNumbering(st);
  return n ? <StationChip line={n.line} num={n.num} color={color} size="s" /> : null;
}

/**
 * 行き先を選ぶ — a ticket machine. Line, departure and destination come from the configured
 * railway data source; date/time default to TODAY / NOW. The chosen train is previewed as an
 * issued paper ticket before boarding.
 */
export function RouteSelector({ planner: p, onBoard }: Props) {
  const grouped = useMemo(() => {
    const out = new Map<string, RailwayRoute[]>();
    for (const r of p.routes.data ?? []) {
      const list = out.get(r.operatorId) ?? [];
      list.push(r);
      out.set(r.operatorId, list);
    }
    return [...out.entries()];
  }, [p.routes.data]);
  const opName = (id: string) => {
    const o = p.operators.data?.find((x) => x.id === id);
    return o ? `${o.nameEn} · ${o.nameJa}${o.provider === "demo" ? " (demo)" : ""}` : id;
  };
  const loading = p.routes.state === "loading";
  const disabled = p.starting || !p.route || p.origin === p.destination || (!p.scenic && !p.chosen);
  // the chosen train has already left its origin: board it where it is now
  const enRoute = Boolean(
    p.chosen && Date.parse(p.chosen.estimatedDeparture ?? p.chosen.scheduledDeparture) < Date.now(),
  );
  const cta = p.scenic
    ? { en: "Start scenic ride", ja: "景色の旅へ" }
    : enRoute
      ? { en: "Join this train", ja: "途中から乗る" }
      : p.when === "now"
        ? { en: "Ride this train", ja: "この列車に乗る" }
        : { en: "Plan this train", ja: "この列車を予約" };

  const lineColor = p.route?.color ?? "var(--line-green)";
  const from = p.stationList.find((s) => s.id === p.origin);
  const to = p.stationList.find((s) => s.id === p.destination);
  const chosen = p.chosen;

  return (
    <section className="rs" aria-labelledby="rs-title" id="search">
      <header className="rs-head">
        <span className="rs-head-tag" aria-hidden="true">
          <span lang="ja">きっぷ</span>
          <small>TICKETS</small>
        </span>
        <h2 id="rs-title" className="rs-title">
          Choose a route
        </h2>
        <span className="rs-sub" lang="ja" aria-hidden="true">
          行き先を選ぶ
        </span>
      </header>

      <div className="rs-screen">
        {p.routes.state === "error" && (
          <p className="rs-error" role="alert">
            {p.routes.error} — is the server running?
          </p>
        )}

        <div className="rs-field rs-field--line">
          <label htmlFor="rs-line">
            <span className="rs-step" aria-hidden="true">
              1
            </span>
            <Label ja="路線" en="LINE" />
          </label>
          <div className="rs-line-row">
            <span className="rs-line-swatch" style={{ background: lineColor }} aria-hidden="true" />
            <select
              id="rs-line"
              className="rs-select"
              value={p.routeId}
              disabled={loading}
              onChange={(e) => p.setRouteId(e.target.value)}
            >
              {grouped.map(([opId, routes]) => (
                <optgroup key={opId} label={opName(opId)}>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nameEn} · {r.nameJa}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="rs-stations">
          <div className="rs-field">
            <label htmlFor="rs-origin">
              <span className="rs-step" aria-hidden="true">
                2
              </span>
              <Icon name="pin" size={16} className="rs-ico" />
              <Label ja="出発駅" en="DEPARTURE" />
            </label>
            <div className="rs-station-row">
              <Numbering st={from} color={lineColor} />
              <select
                id="rs-origin"
                className="rs-select rs-select--big"
                value={p.origin}
                onChange={(e) => p.setOrigin(e.target.value)}
                disabled={p.stations.state !== "ok"}
              >
                {p.stationList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameEn} · {s.nameJa}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="rs-swap key"
            onClick={p.swap}
            aria-label="Swap departure and destination"
          >
            <Icon name="swap" />
          </button>
          <div className="rs-field">
            <label htmlFor="rs-dest">
              <span className="rs-step" aria-hidden="true">
                3
              </span>
              <Icon name="flag" size={16} className="rs-ico" />
              <Label ja="到着駅" en="DESTINATION" />
            </label>
            <div className="rs-station-row">
              <Numbering st={to} color={lineColor} />
              <select
                id="rs-dest"
                className="rs-select rs-select--big"
                value={p.destination}
                onChange={(e) => p.setDestination(e.target.value)}
                disabled={p.stations.state !== "ok"}
              >
                {p.stationList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameEn} · {s.nameJa}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rs-when">
          <div className="rs-field rs-field--compact">
            <Label ja="日付" en="DATE" />
            <div className="rs-toggle" role="group" aria-label="Date">
              <button
                type="button"
                className="key"
                aria-pressed={p.when === "now"}
                onClick={() => p.setWhen("now")}
              >
                TODAY
              </button>
              <button
                type="button"
                className="key"
                aria-pressed={p.when === "later"}
                onClick={() => p.setWhen("later")}
              >
                <Icon name="calendar" size={14} /> OTHER
              </button>
            </div>
            {p.when === "later" && (
              <input
                aria-label="Departure date (Japan)"
                type="date"
                className="rs-input"
                value={p.date}
                onChange={(e) => p.setDate(e.target.value)}
              />
            )}
          </div>
          <div className="rs-field rs-field--compact">
            <Label ja="時刻" en="TIME · JST" />
            {p.when === "now" ? (
              <div className="rs-toggle" role="group" aria-label="Time">
                <button type="button" className="key" aria-pressed="true">
                  NOW
                </button>
                <button type="button" className="key" onClick={() => p.setWhen("later")}>
                  <Icon name="clock" size={14} /> LATER
                </button>
              </div>
            ) : (
              <input
                aria-label="Earliest departure time (JST)"
                type="time"
                className="rs-input"
                value={p.fromTime}
                onChange={(e) => p.setFromTime(e.target.value)}
              />
            )}
          </div>
        </div>

        <p className="rs-direction">
          {p.origin === p.destination
            ? "Choose two different stations"
            : p.direction
              ? `Direction — ${p.direction.nameEn}`
              : ""}
        </p>
      </div>

      {/* issued-ticket preview of the current choice */}
      {p.route && from && to && p.origin !== p.destination && (
        <TicketCard
          className="rs-ticket"
          kickerJa="乗車券"
          kicker={p.scenic ? "Scenic pass" : "Boarding ticket"}
          serial={chosen?.trainNumber && !p.scenic ? `No. ${chosen.trainNumber}` : undefined}
          aria-label="Ticket preview"
          stub={
            <>
              <span className="rs-ticket-stub-l">JST</span>
              <span className="rs-ticket-stub-time">
                {chosen && !p.scenic
                  ? formatTokyoClock(chosen.estimatedDeparture ?? chosen.scheduledDeparture)
                  : "—:—"}
              </span>
              {chosen?.platform && !p.scenic ? (
                <TrackNumber n={chosen.platform} />
              ) : (
                <span className="rs-ticket-stub-l">{p.scenic ? "ANY TIME" : "CHOOSE A TRAIN"}</span>
              )}
            </>
          }
        >
          <div className="rs-ticket-route">
            <span className="rs-ticket-st">
              <span lang="ja">{from.nameJa}</span>
              <small>{from.nameEn}</small>
            </span>
            <span className="rs-ticket-arrow" aria-hidden="true">
              →
            </span>
            <span className="rs-ticket-st">
              <span lang="ja">{to.nameJa}</span>
              <small>{to.nameEn}</small>
            </span>
          </div>
          <div className="rs-ticket-meta">
            <LineBadge en={p.route.nameEn} color={lineColor} />
            {chosen && !p.scenic && (
              <LineBadge
                kind="service"
                en={(chosen.trainTypeEn ?? "Train").toUpperCase()}
                color={serviceColor(chosen.trainTypeEn)}
              />
            )}
            <span className="rs-ticket-date">
              {p.when === "now" ? "TODAY" : p.date} · {enRoute ? "EN ROUTE" : "VALID 1 RIDE"}
            </span>
          </div>
        </TicketCard>
      )}

      {p.startError && (
        <p className="rs-error" role="alert">
          {p.startError}
        </p>
      )}

      <button type="button" className="rs-cta" disabled={disabled} onClick={onBoard}>
        <Icon name="train" size={30} />
        <span className="rs-cta-text">
          <span className="rs-cta-main">{p.starting ? "Boarding…" : cta.en}</span>
          <span className="rs-cta-sub" lang="ja" aria-hidden="true">
            {p.starting ? "乗車中…" : cta.ja}
          </span>
        </span>
        <Icon name="arrow" size={26} className="rs-cta-arrow" />
      </button>

      <label className="rs-scenic">
        <input type="checkbox" checked={p.scenic} onChange={(e) => p.setScenic(e.target.checked)} />
        <span>Scenic only — recorded view, no live train tracking</span>
      </label>
    </section>
  );
}
