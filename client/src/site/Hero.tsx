import { useRef, type ReactNode } from "react";
import { formatTokyoClock, tokyoParts } from "@shared/time";
import { DuskStreetBack, DuskStreetFront, type Period } from "../design/scenes/DuskStreet";
import { useScrollDrift } from "./useScrollDrift";

interface Props {
  period: Period;
  now: number;
  /** optional licensed photograph (replaces the illustrated street scene) */
  photo?: { src: string; alt: string; credit?: string };
  place?: { ja: string; en: string; lat: string };
  /** the ticket machine (route selector) */
  children: ReactNode;
  /** the departure board, mounted full-width under the poster and machine */
  board?: ReactNode;
}

const STATS: Array<{ no: string; en: string; ja: string; note: string }> = [
  { no: "01", en: "Real trains", ja: "本物の列車", note: "ODPT · GTFS" },
  { no: "02", en: "Real timetables", ja: "時刻表どおり", note: "Japan time" },
  { no: "03", en: "From your window", ja: "車窓から", note: "Anywhere" },
];

/**
 * The hero is a station information board: LED clock strip on top, a mounted travel poster
 * (illustrated street + oversized 電車で旅 between its layers), the ticket machine beside it,
 * a three-row departure-style strip with the site's promises, and the departure board below.
 */
export function Hero({
  period,
  now,
  photo,
  place = { ja: "東京", en: "TOKYO", lat: "35.6762° N" },
  children,
  board,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  useScrollDrift(ref);
  const p = tokyoParts(now);
  const date = `${p.year}.${String(p.month).padStart(2, "0")}.${String(p.day).padStart(2, "0")}`;
  return (
    <section ref={ref} className={`hero hero--${period}`} aria-labelledby="hero-title">
      <div className="hero-strip" aria-hidden="true">
        <span className="hero-strip-place">
          <span lang="ja">{place.ja}</span> {place.en}
        </span>
        <span className="led led--white">{place.lat}</span>
        <span className="led led--white">{date}</span>
        <span className="hero-strip-clock led led--amber">{formatTokyoClock(now)}</span>
        <span className="hero-strip-zone">JST</span>
        <span className="hero-strip-msg led led--green" lang="ja">
          次の列車は、まもなく。 NEXT TRAIN SOON
        </span>
      </div>

      <div className="hero-grid">
        <div className="hero-poster">
          <div className="hero-photo" aria-hidden={!photo}>
            {photo ? (
              <img className="photo-grade misregister" src={photo.src} alt={photo.alt} />
            ) : (
              <DuskStreetBack period={period} />
            )}
            <div className="halftone" />
          </div>

          <h1 id="hero-title" className="hero-kanji">
            <span className="sr-only">The 17:24 — Virtual Train Ride Japan</span>
            <span aria-hidden="true" className="hero-kanji-line">
              電車
            </span>
            <span aria-hidden="true" className="hero-kanji-line hero-kanji-line--2">
              で旅
            </span>
          </h1>

          {!photo && (
            <div className="hero-front">
              <DuskStreetFront period={period} />
            </div>
          )}
          <div className="grain" />
          <div className="vignette" />

          <div className="hero-copy">
            <p className="hero-copy-lead">
              Ride a real Japanese train,
              <br />
              anytime, from anywhere.
            </p>
            <p className="hero-copy-ja" lang="ja">
              本物の日本の列車に乗って、いつでも、どこからでも。
            </p>
          </div>
          <span className="hero-poster-tag" aria-hidden="true">
            TRAVEL POSTER · 旅のポスター
          </span>
          {photo?.credit && <p className="hero-credit">Photo: {photo.credit}</p>}
        </div>

        <div className="hero-panel">{children}</div>
      </div>

      <ul className="hero-stats" aria-label="What this is">
        {STATS.map((s) => (
          <li key={s.no}>
            <span className="hero-stats-no led led--amber" aria-hidden="true">
              {s.no}
            </span>
            <span className="hero-stats-en">{s.en.toUpperCase()}.</span>
            <span className="hero-stats-ja" lang="ja">
              {s.ja}
            </span>
            <span className="hero-stats-note led led--green">{s.note}</span>
          </li>
        ))}
        <li className="hero-stats-line" aria-hidden="true">
          TRAVEL JAPAN FROM YOUR WINDOW
        </li>
      </ul>

      {board && <div className="hero-board">{board}</div>}
    </section>
  );
}
