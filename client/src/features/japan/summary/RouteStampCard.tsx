import type { RouteStamp } from "../../../store/studyStore";

/** Collectible route stamp (an original design, inspired by station stamp culture). */
export function RouteStampCard({
  stamp,
  size = 180,
}: {
  stamp: Omit<RouteStamp, "id" | "earnedAt"> & { earnedAt?: string };
  size?: number;
}) {
  const color = stamp.color ?? "#2e7d5b";
  return (
    <figure className="route-stamp" style={{ width: size }}>
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`Route stamp: ${stamp.originEn} to ${stamp.destinationEn}, ${stamp.routeNameEn}`}
      >
        <defs>
          <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
          </filter>
        </defs>
        <g filter="url(#ink)" fill="none" stroke={color} strokeWidth="3">
          <circle cx="100" cy="100" r="92" />
          <circle cx="100" cy="100" r="82" strokeWidth="1.5" />
          <path d="M40 132 H160" strokeWidth="2" />
          <path d="M52 140 l8 -8 M148 140 l-8 -8" strokeWidth="2" />
          <rect x="66" y="56" width="68" height="40" rx="10" />
          <rect x="74" y="63" width="52" height="14" rx="3" strokeWidth="2" />
          <circle cx="82" cy="88" r="3" fill={color} />
          <circle cx="118" cy="88" r="3" fill={color} />
        </g>
        <g fill={color} fontFamily='"Hiragino Sans","Noto Sans JP",sans-serif' textAnchor="middle">
          <text x="100" y="40" fontSize="13" fontWeight="700">
            {stamp.routeNameJa.slice(0, 10)}
          </text>
          <text x="100" y="118" fontSize="14" fontWeight="700">
            {stamp.originJa}→{stamp.destinationJa}
          </text>
          <text x="100" y="152" fontSize="9.5" fontFamily="Inter, sans-serif">
            {stamp.date} · {stamp.focusMinutes} min
          </text>
          <text x="100" y="164" fontSize="7" fontFamily="Inter, sans-serif" letterSpacing="1">
            STUDY JOURNEY{stamp.dataMode === "demo" ? " · DEMO" : ""}
          </text>
        </g>
      </svg>
      <figcaption>
        {stamp.originEn} → {stamp.destinationEn}
        <small>{stamp.routeNameEn}</small>
      </figcaption>
    </figure>
  );
}
