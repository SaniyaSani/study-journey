import type { CSSProperties, ReactNode } from "react";

/**
 * STATION SYSTEM — reusable primitives that wrap the site in Japanese railway-station
 * design language. Generic, operator-neutral: no railway logos, marks or official names.
 *
 *   PlatformSign      white guidance panel, black type, green line accent, arrow
 *   StationNameBoard  station name board (駅名標): big name, romaji, prev ← → next band
 *   DepartureBoard    charcoal board frame with LED header and column heads
 *   RouteMap          route diagram: coloured line, station dots, current station
 *   TicketCard        cream paper ticket with perforated stub
 *   StationChip       station-numbering square (e.g. SK 03)
 *   LineBadge         line / service type badge
 *   TrackNumber       platform number disc (番線)
 *   ServiceNotice     service notice strip (お知らせ)
 */

type Arrow = "left" | "right" | "up" | "down" | "up-left" | "up-right";

const ARROW_PATH: Record<Arrow, string> = {
  right: "M3 12h15M12 5l7 7-7 7",
  left: "M21 12H6M12 5l-7 7 7 7",
  up: "M12 21V6M5 12l7-7 7 7",
  down: "M12 3v15M5 12l7 7 7-7",
  "up-right": "M5 19L18 6M8 6h10v10",
  "up-left": "M19 19L6 6M16 6H6v10",
};

export function SignArrow({ dir = "right", size = 22 }: { dir?: Arrow; size?: number }) {
  return (
    <svg className="sign-arrow" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ARROW_PATH[dir]} fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function PlatformSign({
  en,
  ja,
  tone = "white",
  arrow,
  arrowSide = "right",
  icon,
  code,
  className = "",
  children,
}: {
  en: ReactNode;
  ja?: ReactNode;
  tone?: "white" | "green" | "dark" | "yellow";
  arrow?: Arrow;
  arrowSide?: "left" | "right";
  icon?: ReactNode;
  code?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`psign psign--${tone} ${className}`}>
      {arrow && arrowSide === "left" && <SignArrow dir={arrow} />}
      {icon && <span className="psign-icon">{icon}</span>}
      <span className="psign-text">
        {ja && (
          <span className="psign-ja" lang="ja">
            {ja}
          </span>
        )}
        <span className="psign-en">{en}</span>
      </span>
      {code && <span className="psign-code">{code}</span>}
      {children}
      {arrow && arrowSide === "right" && <SignArrow dir={arrow} />}
    </div>
  );
}

export interface BoardStation {
  ja: string;
  en: string;
  code?: string;
}

export function StationNameBoard({
  ja,
  kana,
  en,
  code,
  color = "var(--st-green)",
  prev,
  next,
  note,
  as: Tag = "div",
  heading,
  className = "",
}: {
  ja: ReactNode;
  kana?: ReactNode;
  en: ReactNode;
  code?: { line: string; num: string | number };
  color?: string;
  prev?: BoardStation | null;
  next?: BoardStation | null;
  note?: ReactNode;
  as?: "div" | "header" | "section";
  /** render the station name as a heading element */
  heading?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const Names = heading ?? "div";
  return (
    <Tag className={`snb ${className}`} style={{ ["--line" as string]: color } as CSSProperties}>
      <div className="snb-face">
        {code && <StationChip line={code.line} num={code.num} color={color} size="l" />}
        <Names className="snb-names">
          {kana && (
            <span className="snb-kana" lang="ja">
              {kana}
            </span>
          )}
          <span className="snb-ja" lang="ja">
            {ja}
          </span>
          <span className="snb-en">{en}</span>
        </Names>
        {note && <div className="snb-note">{note}</div>}
      </div>
      <div className="snb-band">
        <span className="snb-prev">
          {prev && (
            <>
              <span aria-hidden="true">◀</span>
              <span className="snb-adj">
                <span lang="ja">{prev.ja}</span>
                <small>{prev.en}</small>
              </span>
            </>
          )}
        </span>
        <span className="snb-next">
          {next && (
            <>
              <span className="snb-adj">
                <span lang="ja">{next.ja}</span>
                <small>{next.en}</small>
              </span>
              <span aria-hidden="true">▶</span>
            </>
          )}
        </span>
      </div>
    </Tag>
  );
}

export function DepartureBoard({
  titleEn,
  titleJa,
  status,
  columns,
  footer,
  compact = false,
  className = "",
  id,
  children,
}: {
  titleEn: ReactNode;
  titleJa?: ReactNode;
  status?: ReactNode;
  columns?: Array<{ en: string; ja?: string; className?: string }>;
  footer?: ReactNode;
  compact?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section
      className={`dboard${compact ? " dboard--compact" : ""} ${className}`}
      id={id}
      aria-labelledby={titleId}
    >
      <header className="dboard-head">
        <h2 className="dboard-title" id={titleId}>
          {titleJa && (
            <span className="dboard-title-ja" lang="ja">
              {titleJa}
            </span>
          )}
          <span className="dboard-title-en">{titleEn}</span>
        </h2>
        {status && <span className="dboard-status">{status}</span>}
      </header>
      {columns && (
        <div className="dboard-cols" aria-hidden="true">
          {columns.map((c) => (
            <span key={c.en} className={c.className}>
              {c.ja && <span lang="ja">{c.ja}</span>}
              <small>{c.en}</small>
            </span>
          ))}
        </div>
      )}
      <div className="dboard-body">{children}</div>
      {footer && <footer className="dboard-foot">{footer}</footer>}
    </section>
  );
}

export interface RouteMapStop {
  id: string;
  ja?: string;
  en: string;
  code?: string;
  /** small caption under the name (theme, line…) */
  note?: string;
  color?: string;
}

/**
 * A route diagram. Stops are evenly spaced (it is a diagram, not geography); the current stop
 * gets the "you are here" ring. With onSelect, every stop is a button.
 */
export function RouteMap({
  stops,
  color = "var(--line-green)",
  current,
  passedUntil,
  onSelect,
  label,
  className = "",
  vertical = false,
}: {
  stops: RouteMapStop[];
  color?: string;
  current?: number;
  /** stops with index <= this are drawn as passed */
  passedUntil?: number;
  onSelect?: (index: number) => void;
  label: string;
  className?: string;
  vertical?: boolean;
}) {
  return (
    <nav
      className={`rmap${vertical ? " rmap--v" : ""} ${className}`}
      aria-label={label}
      style={{ ["--line" as string]: color } as CSSProperties}
    >
      <ol className="rmap-stops">
        {stops.map((s, i) => {
          const state =
            i === current ? "current" : passedUntil != null && i <= passedUntil ? "passed" : "";
          const inner = (
            <>
              <span
                className="rmap-dot"
                style={s.color ? ({ ["--dot" as string]: s.color } as CSSProperties) : undefined}
              >
                {s.code && <span className="rmap-code">{s.code}</span>}
              </span>
              <span className="rmap-name">
                {s.ja && (
                  <span className="rmap-ja" lang="ja">
                    {s.ja}
                  </span>
                )}
                <span className="rmap-en">{s.en}</span>
                {s.note && <small className="rmap-note">{s.note}</small>}
              </span>
              {i === current && <span className="rmap-here">現在地 · YOU ARE HERE</span>}
            </>
          );
          return (
            <li
              key={s.id}
              className={`rmap-stop ${state}`}
              aria-current={i === current ? "location" : undefined}
            >
              {onSelect ? (
                <button type="button" className="rmap-hit" onClick={() => onSelect(i)}>
                  {inner}
                </button>
              ) : (
                <span className="rmap-hit">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TicketCard({
  kicker,
  kickerJa,
  serial,
  stub,
  tone = "paper",
  className = "",
  children,
  as: Tag = "div",
  ...rest
}: {
  kicker?: ReactNode;
  kickerJa?: ReactNode;
  serial?: ReactNode;
  stub?: ReactNode;
  tone?: "paper" | "green" | "white";
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "aside";
} & { id?: string; "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <Tag className={`ticket ticket--${tone}${stub ? " ticket--stub" : ""} ${className}`} {...rest}>
      <div className="ticket-main">
        {(kicker || serial) && (
          <div className="ticket-kicker">
            <span>
              {kickerJa && (
                <span lang="ja" className="ticket-kicker-ja">
                  {kickerJa}
                </span>
              )}
              {kicker}
            </span>
            {serial && <span className="ticket-serial">{serial}</span>}
          </div>
        )}
        {children}
      </div>
      {stub && <div className="ticket-stub">{stub}</div>}
    </Tag>
  );
}

export function StationChip({
  line,
  num,
  color = "var(--st-green)",
  size = "m",
}: {
  line: string;
  num: string | number;
  color?: string;
  size?: "s" | "m" | "l";
}) {
  return (
    <span
      className={`schip schip--${size}`}
      style={{ ["--chip" as string]: color } as CSSProperties}
      aria-label={`Station ${line} ${num}`}
      role="img"
    >
      <span className="schip-line">{line}</span>
      <span className="schip-num">{String(num).padStart(2, "0")}</span>
    </span>
  );
}

export function LineBadge({
  en,
  ja,
  color = "var(--st-green)",
  kind = "line",
  className = "",
}: {
  en: ReactNode;
  ja?: ReactNode;
  color?: string;
  kind?: "line" | "service";
  className?: string;
}) {
  return (
    <span
      className={`lbadge lbadge--${kind} ${className}`}
      style={{ ["--badge" as string]: color } as CSSProperties}
    >
      <span className="lbadge-swatch" aria-hidden="true" />
      {ja && (
        <span className="lbadge-ja" lang="ja">
          {ja}
        </span>
      )}
      <span className="lbadge-en">{en}</span>
    </span>
  );
}

export function TrackNumber({ n, label = true }: { n: ReactNode; label?: boolean }) {
  return (
    <span className="track" aria-label={`Platform ${n}`}>
      <span className="track-n">{n}</span>
      {label && (
        <span className="track-l" aria-hidden="true">
          <span lang="ja">番線</span>
          <small>TRACK</small>
        </span>
      )}
    </span>
  );
}

export function ServiceNotice({
  level = "info",
  en = "Notice",
  ja = "お知らせ",
  children,
  className = "",
  role,
}: {
  level?: "info" | "warn" | "severe";
  en?: string;
  ja?: string;
  children: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div className={`notice notice--${level} ${className}`} role={role}>
      <span className="notice-tag">
        <span lang="ja">{ja}</span>
        <small>{en}</small>
      </span>
      <span className="notice-body">{children}</span>
    </div>
  );
}

/** Service-type colour used by boards and badges (generic, not operator-specific). */
export function serviceColor(type: string | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (/limited|ltd|特急|shinkansen|新幹線/.test(t)) return "var(--line-red)";
  if (/express|急行/.test(t)) return "var(--line-red)";
  if (/special rapid|特別快速|特快/.test(t)) return "var(--line-orange)";
  if (/rapid|快速/.test(t)) return "var(--line-orange)";
  if (/semi|準/.test(t)) return "var(--line-blue)";
  return "var(--line-green)";
}

/** Two-letter station-numbering prefix from a line name ("Sakuraura Coast Line" → "SC"). */
export function lineCode(name: string | undefined): string {
  const words = (name ?? "")
    .replace(/\(.*?\)/g, "")
    .replace(/\b(line|jr|the)\b/gi, "")
    .trim()
    .split(/[\s·-]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "LN").slice(0, 2).toUpperCase();
}

/**
 * Station numbering for a station, only when the data provides one (ODPT stationCode, GTFS
 * stop_code) or for the fictional demo line (ids like demo:SK03). Never invented for real lines.
 */
export function stationNumbering(st: { id: string; code?: string } | undefined | null) {
  if (!st) return null;
  const m = (st.code ?? "").match(/^([A-Za-z]{1,3})[-\s]?(\d{1,3})$/);
  if (m) return { line: m[1].toUpperCase(), num: m[2] };
  const d = st.id.match(/^demo:([A-Z]{2})(\d{2})$/);
  return d ? { line: d[1], num: d[2] } : null;
}
