import { Icon, RedDot } from "../design/ui";

export type SiteRoute = "home" | "ride" | "journal" | "about";

interface Props {
  current: SiteRoute;
  hasActiveJourney: boolean;
  onNavigate: (to: SiteRoute, anchor?: string) => void;
}

/** Each destination is a numbered guidance sign with its own line colour. */
const ITEMS: Array<{
  ja: string;
  en: string;
  to: SiteRoute;
  anchor?: string;
  no: string;
  color: string;
}> = [
  { ja: "路線", en: "Routes", to: "home", anchor: "routes", no: "1", color: "var(--line-green)" },
  {
    ja: "時刻表",
    en: "Timetable",
    to: "home",
    anchor: "timetable",
    no: "2",
    color: "var(--line-orange)",
  },
  { ja: "ライブ", en: "Live", to: "ride", no: "3", color: "var(--line-red)" },
  { ja: "旅の記録", en: "Journal", to: "journal", no: "4", color: "var(--line-blue)" },
  { ja: "について", en: "About", to: "about", no: "5", color: "var(--st-steel)" },
];

/**
 * Header = platform guidance signage: a white sign bar mounted over the concourse, the site
 * name set like a station name, destinations as numbered signs with arrows, and a green line
 * band underneath.
 */
export function SiteNav({ current, hasActiveJourney, onNavigate }: Props) {
  return (
    <header className="site-nav">
      <div className="site-nav-bar">
        <a
          className="site-brand"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("home");
          }}
        >
          {/* the name is a departure time, set on a small LED plate */}
          <span className="site-brand-plate" aria-label="The 17:24">
            <span className="site-brand-the" aria-hidden="true">
              THE
            </span>
            <span className="site-brand-time led led--amber" aria-hidden="true">
              17:24
            </span>
          </span>
          <span className="site-brand-text">
            <span className="site-brand-romaji">Virtual Train Ride Japan</span>
            <span className="site-brand-en" lang="ja" aria-hidden="true">
              17時24分発 · 電車で旅
            </span>
          </span>
        </a>
        <nav aria-label="Main" className="site-nav-items">
          {ITEMS.map((it) => {
            const active =
              it.to === current && (it.to !== "home" || !it.anchor || it.anchor === "routes");
            return (
              <a
                key={it.en}
                href={`#/${it.to === "home" ? "" : it.to}`}
                aria-current={active && it.to !== "home" ? "page" : undefined}
                className={`site-nav-item${active ? " is-here" : ""}`}
                style={{ ["--item" as string]: it.color }}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(it.to, it.anchor);
                }}
              >
                <span className="site-nav-no" aria-hidden="true">
                  {it.no}
                </span>
                <span className="site-nav-label">
                  <span className="ja" lang="ja">
                    {it.ja}
                  </span>
                  <span className="en">
                    {it.en}
                    {it.to === "ride" && hasActiveJourney && (
                      <RedDot pulse label="journey in progress" />
                    )}
                  </span>
                </span>
                <svg className="site-nav-arrow" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 12h14M12 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
              </a>
            );
          })}
        </nav>
        <div className="site-nav-icons">
          <button
            className="ink-icon"
            aria-label="Search stations"
            onClick={() => onNavigate("home", "search")}
          >
            <Icon name="search" size={22} />
          </button>
          <button
            className="ink-icon site-nav-train"
            aria-label={hasActiveJourney ? "Return to your train" : "Choose a train"}
            onClick={() =>
              onNavigate(
                hasActiveJourney ? "ride" : "home",
                hasActiveJourney ? undefined : "search",
              )
            }
          >
            <Icon name="train" size={24} />
          </button>
        </div>
      </div>
      <div className="site-nav-band" aria-hidden="true">
        <span lang="ja">構内のご案内</span>
        <span>STATION GUIDE</span>
        <span className="site-nav-band-dots" />
        <span>{current === "home" ? "CONCOURSE" : current.toUpperCase()}</span>
      </div>
    </header>
  );
}
