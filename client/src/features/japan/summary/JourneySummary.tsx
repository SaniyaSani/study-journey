import { useEffect, useMemo } from "react";
import { formatDuration } from "@shared/time";
import { actions } from "../../../store/studyStore";
import type { JourneySummaryData } from "../ride/useJourney";
import { TicketCard } from "../../../design/station";
import { RouteStampCard } from "./RouteStampCard";

export function summaryHeadline(
  d: JourneySummaryData,
  origin: string,
  destination: string,
): string {
  const mins = Math.round(d.focusedSeconds / 60);
  return d.completed
    ? `You studied from ${origin} to ${destination} — ${mins} focused minute${mins === 1 ? "" : "s"}.`
    : `You studied on the way from ${origin} towards ${destination} — ${mins} focused minute${mins === 1 ? "" : "s"}.`;
}

export function JourneySummary({ data, onDone }: { data: JourneySummaryData; onDone: () => void }) {
  const s = data.session;
  const st = (id: string) => s.stations.find((x) => x.id === id);
  const origin = st(s.originStationId);
  const dest = st(s.destinationStationId);
  const stamp = useMemo(
    () => ({
      journeyId: s.id,
      routeNameJa: s.route.nameJa,
      routeNameEn: s.route.nameEn,
      originJa: origin?.nameJa ?? "",
      originEn: origin?.nameEn ?? "",
      destinationJa: dest?.nameJa ?? "",
      destinationEn: dest?.nameEn ?? "",
      color: s.route.color,
      date: s.trip.serviceDate,
      focusMinutes: Math.round(data.focusedSeconds / 60),
      stationsPassed: data.stationsPassed,
      delayMinutes: Math.round(data.maxDelaySeconds / 60),
      dataMode: s.trip.dataMode,
    }),
    [s, origin, dest, data],
  );

  useEffect(() => {
    actions.addFocusSession({
      kind: "journey",
      startedAt: s.createdAt,
      endedAt: new Date().toISOString(),
      focusSeconds: data.focusedSeconds,
      journeyId: s.id,
      label: `${stamp.originEn} → ${stamp.destinationEn}`,
    });
    if (data.completed) actions.addStamp(stamp);
    // record once per summary
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="summary">
      <TicketCard
        as="section"
        className="summary-card"
        kickerJa={data.completed ? "乗車記録" : "途中下車"}
        kicker={data.completed ? "Route completed" : "Journey ended early"}
        serial={s.trip.serviceDate}
        aria-label="Journey summary"
        stub={
          <>
            <span className="ticket-stamp" aria-hidden="true">
              {data.completed ? (
                <>
                  使用済
                  <br />
                  USED
                </>
              ) : (
                <>
                  途中
                  <br />
                  EXIT
                </>
              )}
            </span>
            <span className="summary-stub-l">{s.route.nameEn}</span>
            <span className="summary-stub-l">
              {s.trip.trainNumber ? `No. ${s.trip.trainNumber}` : ""}
            </span>
          </>
        }
      >
        <h1>{summaryHeadline(data, origin?.nameEn ?? "", dest?.nameEn ?? "")}</h1>
        <div className="summary-body">
          {data.completed && <RouteStampCard stamp={stamp} />}
          <dl className="summary-stats">
            <div>
              <dt>Line</dt>
              <dd>
                {s.route.nameEn} · <span lang="ja">{s.route.nameJa}</span>
              </dd>
            </div>
            <div>
              <dt>Stations passed</dt>
              <dd>
                {data.stationsPassed} of {data.totalStations}
              </dd>
            </div>
            <div>
              <dt>Total focus time</dt>
              <dd>{formatDuration(data.focusedSeconds)}</dd>
            </div>
            <div>
              <dt>Tasks completed</dt>
              <dd>{data.tasksCompleted}</dd>
            </div>
            <div>
              <dt>Notes created</dt>
              <dd>{data.notesCreated}</dd>
            </div>
            <div>
              <dt>Delay experienced</dt>
              <dd>
                {data.maxDelaySeconds >= 60
                  ? `about ${Math.round(data.maxDelaySeconds / 60)} min`
                  : "On time"}
              </dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>
                {s.kind === "scenic"
                  ? "Scenic focus (no train tracking)"
                  : s.trip.dataMode === "demo"
                    ? "Demo railway data"
                    : data.status === "live" || data.status === "delayed"
                      ? "Live train data"
                      : "Timetable data"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <button className="btn btn-primary" onClick={onDone}>
            Choose another journey
          </button>
        </div>
      </TicketCard>
    </div>
  );
}
