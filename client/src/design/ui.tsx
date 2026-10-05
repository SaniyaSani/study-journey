import type { ReactNode, SVGProps } from "react";

/** Label: English first; an optional small Japanese accent after it. */
export function Label({ ja, en, className = "" }: { ja?: string; en: string; className?: string }) {
  return (
    <span className={`lbl ${className}`}>
      <span className="lbl-en">{en}</span>
      {ja && (
        <span className="lbl-ja" lang="ja" aria-hidden="true">
          {ja}
        </span>
      )}
    </span>
  );
}

/** Small printed marker, e.g. coordinates, dates, line names. */
export function Marker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`marker ${className}`}>{children}</span>;
}

export function RedDot({ pulse = false, label }: { pulse?: boolean; label?: string }) {
  return (
    <span
      className={`red-dot${pulse ? " pulse" : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

type IconName =
  | "train"
  | "pin"
  | "flag"
  | "search"
  | "swap"
  | "clock"
  | "calendar"
  | "arrow"
  | "sound"
  | "map"
  | "book"
  | "close"
  | "full"
  | "study";

/** Railway-pictogram style icons (1.6px strokes, square caps). */
export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      {name === "train" && (
        <g {...p}>
          <rect x="5" y="3" width="14" height="14" rx="3" />
          <path d="M5 10h14M9 21l1.5-3M15 21l-1.5-3" />
          <circle cx="9" cy="14" r="0.6" fill="currentColor" />
          <circle cx="15" cy="14" r="0.6" fill="currentColor" />
        </g>
      )}
      {name === "pin" && (
        <g {...p}>
          <path d="M12 21s-6-6.2-6-11a6 6 0 1 1 12 0c0 4.8-6 11-6 11z" />
          <circle cx="12" cy="10" r="2" />
        </g>
      )}
      {name === "flag" && <path {...p} d="M6 21V4M6 4h11l-2.5 4L17 12H6" />}
      {name === "search" && (
        <g {...p}>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5 5" />
        </g>
      )}
      {name === "swap" && <path {...p} d="M8 4v16M8 4L5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3" />}
      {name === "clock" && (
        <g {...p}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </g>
      )}
      {name === "calendar" && (
        <g {...p}>
          <rect x="4" y="5" width="16" height="15" />
          <path d="M4 10h16M8 3v4M16 3v4" />
        </g>
      )}
      {name === "arrow" && <path {...p} d="M4 12h15M14 7l5 5-5 5" />}
      {name === "sound" && (
        <path {...p} d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      )}
      {name === "map" && <path {...p} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />}
      {name === "book" && (
        <path
          {...p}
          d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"
        />
      )}
      {name === "close" && <path {...p} d="M6 6l12 12M18 6L6 18" />}
      {name === "full" && <path {...p} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      {name === "study" && <path {...p} d="M4 19V6l8-3 8 3v13l-8-3z M12 3v13" />}
    </svg>
  );
}
