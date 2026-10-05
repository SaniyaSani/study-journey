import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RailwayRoute, Station } from "@shared/types";
import type { RecordingPeriod, VideoStationMarker } from "@shared/video";
import {
  getJourneyTimeForVideoTime,
  getVideoTimeForJourneyTime,
  resolveVideoFrames,
  type ScheduledStop,
} from "@shared/journeySync";
import { REAL_FOOTAGE_SYNC_CONFIG, SyncController } from "@shared/sync";
import { formatTokyoClock } from "@shared/time";
import { japanApi } from "../api";
import "./calibration.css";
import { devToolsEnabled } from "../devtools";
import { VideoFileRoutePlayer } from "../players/VideoFileRoutePlayer";
import { YouTubeRoutePlayer } from "../players/YouTubeRoutePlayer";
import type { RoutePlayer } from "../players/types";
import { loadCalibrationDrafts, saveCalibrationDrafts } from "../video/catalog";
import {
  formatTimecode,
  parseTimecode,
  parseYouTubeId,
  sortMarkers,
  toCatalogEntry,
  validateMarkers,
  type CalibrationDraft,
} from "./calibration";

/**
 * #/admin/video-calibration — DEVELOPMENT ONLY.
 * Watch a recording, press MARK at each station, check the result against a timetable and
 * export the catalog entry for server/data/videos/catalog.json.
 */

const EMPTY: CalibrationDraft = {
  id: "",
  provider: "youtube",
  title: "",
  creator: "",
  sourceUrl: "",
  railwayOperator: "",
  lineIds: [],
  lineNames: [],
  direction: "outbound",
  serviceTypes: ["Local"],
  videoStartSeconds: 0,
  embedStatus: "unverified",
  markers: [],
};

const PERIODS: RecordingPeriod[] = ["morning", "day", "sunset", "night"];

function parseClock(s: string, dayMs: number): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return dayMs + ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3] ?? 0)) * 1000;
}

export function VideoCalibrationPage() {
  if (!devToolsEnabled()) {
    return (
      <div className="page-ink">
        <p className="ink-empty">This tool is only available in development builds.</p>
      </div>
    );
  }
  return <Calibration />;
}

function Calibration() {
  const [draft, setDraft] = useState<CalibrationDraft>(EMPTY);
  const [source, setSource] = useState("");
  const [routes, setRoutes] = useState<RailwayRoute[]>([]);
  const [routeId, setRouteId] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [reverse, setReverse] = useState(false);
  const [pointer, setPointer] = useState(0);
  const [time, setTime] = useState(0);
  const [drafts, setDrafts] = useState(loadCalibrationDrafts);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timetable, setTimetable] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    startReal: number;
    startJourney: number;
    speed: number;
  } | null>(null);
  const player = useRef<RoutePlayer | null>(null);
  const patch = (p: Partial<CalibrationDraft>) => setDraft((d) => ({ ...d, ...p }));

  useEffect(() => {
    japanApi
      .routes()
      .then((r) => setRoutes(r.data))
      .catch(() => setRoutes([]));
  }, []);
  useEffect(() => {
    if (!routeId) return setStations([]);
    japanApi
      .stations(routeId)
      .then((r) => setStations(r.data))
      .catch(() => setStations([]));
  }, [routeId]);
  const ordered = useMemo(
    () => (reverse ? [...stations].reverse() : stations),
    [stations, reverse],
  );

  // current time readout
  useEffect(() => {
    const t = setInterval(() => {
      const s = player.current?.snapshot();
      if (s) setTime(s.currentTime);
    }, 200);
    return () => clearInterval(t);
  }, []);

  const loadSource = () => {
    setLoadError(null);
    const id = parseYouTubeId(source);
    if (id) {
      patch({
        provider: "youtube",
        videoId: id,
        url: undefined,
        sourceUrl: draft.sourceUrl || `https://www.youtube.com/watch?v=${id}`,
        id: draft.id || `yt-${id}`,
      });
      return;
    }
    if (/^(https?:)?\/\/|^\//.test(source.trim())) {
      patch({
        provider: "self-hosted",
        url: source.trim(),
        videoId: undefined,
        sourceUrl: draft.sourceUrl || source.trim(),
      });
      return;
    }
    setLoadError("Not a YouTube id/URL or a video file URL.");
  };

  const chooseRoute = (id: string) => {
    setRouteId(id);
    const r = routes.find((x) => x.id === id);
    if (r)
      patch({
        lineIds: [id],
        lineNames: [r.nameEn],
        railwayOperator: draft.railwayOperator || r.operatorId,
      });
    setPointer(0);
  };

  const setMarkers = (fn: (m: VideoStationMarker[]) => VideoStationMarker[]) =>
    setDraft((d) => ({ ...d, markers: sortMarkers(fn(d.markers)) }));

  const mark = (kind: "arrival" | "departure" | "pass") => {
    const st = ordered[pointer];
    if (!st) return;
    const t = Math.round(time * 10) / 10;
    setMarkers((ms) => {
      const existing = ms.find((m) => m.stationId === st.id);
      const base: VideoStationMarker = existing ?? {
        stationId: st.id,
        stationName: st.nameEn,
        videoTime: t,
      };
      const next: VideoStationMarker =
        kind === "arrival"
          ? { ...base, videoTime: t, arrivalTime: t }
          : kind === "departure"
            ? { ...base, departureTime: t, videoTime: base.arrivalTime ?? base.videoTime ?? t }
            : { stationId: st.id, stationName: st.nameEn, videoTime: t };
      return [...ms.filter((m) => m !== existing), next];
    });
    if (kind !== "arrival") setPointer((p) => Math.min(p + 1, ordered.length - 1));
  };

  const editMarker = (
    i: number,
    field: "videoTime" | "arrivalTime" | "departureTime",
    value: string,
  ) => {
    const v = value.trim() === "" ? undefined : parseTimecode(value);
    if (v === null) return;
    setMarkers((ms) =>
      ms.map((m, k) =>
        k === i ? { ...m, [field]: field === "videoTime" ? (v ?? m.videoTime) : v } : m,
      ),
    );
  };

  const problems = validateMarkers(draft.markers);
  const entry = toCatalogEntry(draft);
  const json = JSON.stringify(entry, null, 2);

  /* ---------- preview sync against a timetable ---------- */
  const dayMs = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    return Date.parse(`${today}T00:00:00+09:00`);
  }, []);
  const schedule: ScheduledStop[] | null = useMemo(() => {
    const out: ScheduledStop[] = [];
    for (let i = 0; i < draft.markers.length; i++) {
      const m = draft.markers[i];
      const t = parseClock(timetable[m.stationName] ?? "", dayMs);
      if (t == null) continue;
      out.push({
        stationId: m.stationId ?? m.stationName,
        stationName: m.stationName,
        arrival: t,
        departure: t,
      });
    }
    return out.length >= 2 ? out : null;
  }, [timetable, draft.markers, dayMs]);
  const frames = useMemo(
    () => (schedule ? resolveVideoFrames(schedule, draft.markers) : null),
    [schedule, draft.markers],
  );
  const controller = useRef(new SyncController(REAL_FOOTAGE_SYNC_CONFIG));
  const [previewInfo, setPreviewInfo] = useState<{
    journey: number;
    expected: number;
    drift: number;
  } | null>(null);
  useEffect(() => {
    if (!preview || !schedule || !frames) return;
    controller.current.reset();
    const tick = () => {
      const journey = preview.startJourney + (Date.now() - preview.startReal) * preview.speed;
      const stops = schedule.slice(frames.fromStopIndex, frames.toStopIndex + 1);
      const pos = getVideoTimeForJourneyTime(journey, stops, frames.frames);
      const p = player.current;
      const snap = p?.snapshot();
      if (p && snap) {
        const cmd = controller.current.step(
          { time: pos.videoTime, hold: pos.hold, rate: preview.speed },
          snap,
          Date.now(),
        );
        if (cmd.seekTo != null) p.seek(cmd.seekTo);
        if (cmd.setRate != null) p.setRate(cmd.setRate);
        if (cmd.pause) p.pause();
        if (cmd.play) p.play();
        setPreviewInfo({ journey, expected: pos.videoTime, drift: cmd.drift });
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [preview, schedule, frames]);
  const inverse =
    schedule && frames
      ? getJourneyTimeForVideoTime(
          time,
          schedule.slice(frames.fromStopIndex, frames.toStopIndex + 1),
          frames.frames,
        )
      : null;

  const saveDraft = useCallback(() => {
    if (!entry.id) return;
    const list = [entry, ...drafts.filter((d) => d.id !== entry.id)];
    saveCalibrationDrafts(list);
    setDrafts(list);
  }, [entry, drafts]);

  const download = () => {
    const blob = new Blob([json + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.id || "video"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const step = (d: number) => player.current?.seek(Math.max(0, time + d));

  return (
    <div className="cal">
      <header className="cal-head">
        <h1>Video calibration</h1>
        <span className="cal-dev">DEVELOPMENT ONLY · not part of the public site</span>
      </header>

      <section className="cal-source">
        <label>
          YouTube URL / id, or video file URL
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </label>
        <button className="ink-btn" onClick={loadSource}>
          Load video
        </button>
        {loadError && <p className="cal-error">{loadError}</p>}
      </section>

      <div className="cal-grid">
        <section className="cal-player">
          <div className="cal-frame">
            {draft.provider === "youtube" && draft.videoId ? (
              <YouTubeRoutePlayer
                key={draft.videoId}
                ref={player}
                videoId={draft.videoId}
                title="Calibration"
                startSeconds={0}
                autoplay={false}
                onReady={() => undefined}
                onFailed={(r) => setLoadError(r)}
              />
            ) : draft.provider === "self-hosted" && draft.url ? (
              <VideoFileRoutePlayer
                key={draft.url}
                ref={player}
                url={draft.url}
                title="Calibration"
                onReady={() => undefined}
                onFailed={(r) => setLoadError(r)}
              />
            ) : (
              <p className="cal-empty">Load a video to begin.</p>
            )}
          </div>
          <div className="cal-transport">
            <span className="cal-time">{formatTimecode(time) || "0:00.0"}</span>
            {[-10, -1, -0.2].map((d) => (
              <button key={d} onClick={() => step(d)}>
                {d}s
              </button>
            ))}
            <button onClick={() => player.current?.play()}>Play</button>
            <button onClick={() => player.current?.pause()}>Pause</button>
            {[0.2, 1, 10].map((d) => (
              <button key={d} onClick={() => step(d)}>
                +{d}s
              </button>
            ))}
            {[0.25, 0.5, 1, 2].map((r) => (
              <button key={r} onClick={() => player.current?.setRate(r)}>
                {r}×
              </button>
            ))}
          </div>

          <div className="cal-mark">
            <label>
              Line
              <select value={routeId} onChange={(e) => chooseRoute(e.target.value)}>
                <option value="">— choose —</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameEn} ({r.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="cal-check">
              <input
                type="checkbox"
                checked={reverse}
                onChange={(e) => setReverse(e.target.checked)}
              />
              Reverse station order (inbound)
            </label>
            <label>
              Station
              <select value={pointer} onChange={(e) => setPointer(Number(e.target.value))}>
                {ordered.map((s, i) => (
                  <option key={s.id} value={i}>
                    {s.nameEn} · {s.nameJa}
                  </option>
                ))}
              </select>
            </label>
            <div className="cal-mark-btns">
              <button
                className="ink-btn"
                disabled={!ordered.length}
                onClick={() => mark("arrival")}
              >
                MARK STATION · ARRIVAL
              </button>
              <button
                className="ink-btn"
                disabled={!ordered.length}
                onClick={() => mark("departure")}
              >
                MARK DEPARTURE
              </button>
              <button
                className="ink-btn ink-btn--ghost"
                disabled={!ordered.length}
                onClick={() => mark("pass")}
              >
                MARK PASSING
              </button>
            </div>
          </div>
        </section>

        <section className="cal-side">
          <h2>Station markers</h2>
          <table className="cal-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Video</th>
                <th>Arrive</th>
                <th>Depart</th>
                <th>Timetable (JST)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.markers.map((m, i) => (
                <tr key={`${m.stationName}-${i}`}>
                  <td>{m.stationName}</td>
                  {(["videoTime", "arrivalTime", "departureTime"] as const).map((f) => (
                    <td key={f}>
                      <input
                        defaultValue={formatTimecode(m[f])}
                        key={`${f}-${m[f]}`}
                        onBlur={(e) => editMarker(i, f, e.target.value)}
                        aria-label={`${m.stationName} ${f}`}
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      value={timetable[m.stationName] ?? ""}
                      placeholder="17:24"
                      onChange={(e) =>
                        setTimetable((t) => ({ ...t, [m.stationName]: e.target.value }))
                      }
                      aria-label={`${m.stationName} timetable time`}
                    />
                  </td>
                  <td>
                    <button onClick={() => player.current?.seek(m.arrivalTime ?? m.videoTime)}>
                      Go
                    </button>
                    <button
                      onClick={() => setMarkers((ms) => ms.filter((_, k) => k !== i))}
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() =>
              setMarkers((ms) => [
                ...ms,
                { stationName: "Station", videoTime: Math.round(time * 10) / 10 },
              ])
            }
          >
            + Add marker at current time
          </button>
          {problems.length > 0 && (
            <ul className="cal-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <h2>Preview sync</h2>
          <p className="cal-help">
            Enter timetable times for at least two markers, then play the timetable: the video is
            driven by the same synchroniser the ride uses.
          </p>
          <div className="cal-row">
            {[1, 2].map((sp) => (
              <button
                key={sp}
                disabled={!schedule || !frames}
                onClick={() =>
                  setPreview({
                    startReal: Date.now(),
                    startJourney: schedule![0].departure - 10_000,
                    speed: sp,
                  })
                }
              >
                Preview {sp}×
              </button>
            ))}
            <button disabled={!preview} onClick={() => setPreview(null)}>
              Stop preview
            </button>
          </div>
          {preview && previewInfo && (
            <p className="cal-mono">
              JOURNEY {formatTokyoClock(previewInfo.journey, true)} · EXPECTED{" "}
              {formatTimecode(previewInfo.expected)} · DRIFT {previewInfo.drift.toFixed(2)} s
            </p>
          )}
          {inverse != null && (
            <p className="cal-mono">
              Current frame ↔ timetable {formatTokyoClock(inverse, true)} JST
            </p>
          )}

          <h2>Details</h2>
          <div className="cal-form">
            <label>
              Catalog id
              <input value={draft.id} onChange={(e) => patch({ id: e.target.value })} />
            </label>
            <label>
              Title (as published)
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label>
              Creator / channel
              <input value={draft.creator} onChange={(e) => patch({ creator: e.target.value })} />
            </label>
            <label>
              Source URL
              <input
                value={draft.sourceUrl}
                onChange={(e) => patch({ sourceUrl: e.target.value })}
              />
            </label>
            <label>
              Operator
              <input
                value={draft.railwayOperator}
                onChange={(e) => patch({ railwayOperator: e.target.value })}
              />
            </label>
            <label>
              Line names (comma separated)
              <input
                value={draft.lineNames.join(", ")}
                onChange={(e) =>
                  patch({
                    lineNames: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              Direction
              <input
                value={draft.direction}
                onChange={(e) => patch({ direction: e.target.value })}
              />
            </label>
            <label>
              Service types
              <input
                value={draft.serviceTypes.join(", ")}
                onChange={(e) =>
                  patch({
                    serviceTypes: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              Usable from (intro ends)
              <input
                defaultValue={formatTimecode(draft.videoStartSeconds)}
                onBlur={(e) => patch({ videoStartSeconds: parseTimecode(e.target.value) ?? 0 })}
              />
            </label>
            <label>
              Recording period
              <select
                value={draft.recordingPeriod ?? ""}
                onChange={(e) =>
                  patch({
                    recordingPeriod: (e.target.value || undefined) as RecordingPeriod | undefined,
                  })
                }
              >
                <option value="">unknown</option>
                {PERIODS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="cal-check">
              <input
                type="checkbox"
                checked={draft.embedStatus === "verified"}
                onChange={(e) =>
                  patch({ embedStatus: e.target.checked ? "verified" : "unverified" })
                }
              />
              Embedding checked (the video plays inside this page)
            </label>
          </div>

          <h2>Export</h2>
          <p className="cal-help">
            Status: <b>{entry.calibration}</b>. Paste into{" "}
            <code>server/data/videos/catalog.json</code>, or save a local draft to try it on a ride
            in development.
          </p>
          <div className="cal-row">
            <button onClick={() => void navigator.clipboard?.writeText(json)}>Copy JSON</button>
            <button onClick={download}>Download JSON</button>
            <button disabled={!entry.id} onClick={saveDraft}>
              Save local draft
            </button>
          </div>
          <textarea className="cal-json" readOnly value={json} rows={12} />

          {drafts.length > 0 && (
            <>
              <h2>Local drafts</h2>
              <ul className="cal-drafts">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <span>
                      {d.id} · {d.calibration}
                    </span>
                    <button
                      onClick={() => {
                        setDraft({
                          ...EMPTY,
                          ...d,
                          provider: d.provider === "self-hosted" ? "self-hosted" : "youtube",
                          embedStatus: d.embedStatus === "verified" ? "verified" : "unverified",
                          markers: d.stationMarkers,
                        });
                        setSource(d.videoId ?? d.url ?? "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        const list = drafts.filter((x) => x.id !== d.id);
                        saveCalibrationDrafts(list);
                        setDrafts(list);
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
