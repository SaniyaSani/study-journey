import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { JourneySummaryData } from "./features/japan/ride/useJourney";
import {
  clearJourneyStorage,
  loadActiveJourney,
  saveActiveJourney,
  type JourneySession,
} from "./features/japan/session";
import { AboutPage } from "./site/AboutPage";
import { HomePage } from "./site/HomePage";
import { JournalPage } from "./site/JournalPage";
import { SiteNav, type SiteRoute } from "./site/SiteNav";
import { TunnelTransition } from "./site/TunnelTransition";
import { DEV_TOOLS } from "./features/japan/devtools";

const JourneyScreen = lazy(() =>
  import("./features/japan/ride/JourneyScreen").then((m) => ({ default: m.JourneyScreen })),
);
const JourneySummary = lazy(() =>
  import("./features/japan/summary/JourneySummary").then((m) => ({ default: m.JourneySummary })),
);

// development-only tool; not reachable (and not bundled as a route) in public builds
const VideoCalibrationPage = DEV_TOOLS
  ? lazy(() =>
      import("./features/japan/admin/VideoCalibrationPage").then((m) => ({
        default: m.VideoCalibrationPage,
      })),
    )
  : null;
const isCalibrationHash = () =>
  window.location.hash.replace(/^#\/?/, "").split("?")[0] === "admin/video-calibration";

function routeFromHash(): SiteRoute {
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (h === "ride" || h === "japan") return loadActiveJourney() ? "ride" : "home";
  if (h === "journal" || h === "stamps" || h === "desk") return "journal";
  if (h === "about") return "about";
  return "home";
}

export function App() {
  const [route, setRoute] = useState<SiteRoute>(routeFromHash);
  const [anchor, setAnchor] = useState<string | undefined>();
  const [session, setSession] = useState<JourneySession | null>(loadActiveJourney);
  const [summary, setSummary] = useState<JourneySummaryData | null>(null);
  const [tunnel, setTunnel] = useState(false);

  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const navigate = useCallback((to: SiteRoute, a?: string) => {
    const hash = to === "home" ? "#/" : `#/${to}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRoute(to);
    setAnchor(a ? `${a}:${Date.now()}` : undefined);
    if (!a) window.scrollTo({ top: 0 });
  }, []);

  const board = useCallback(
    (s: JourneySession) => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      saveActiveJourney(s);
      setSummary(null);
      if (reduce) {
        setSession(s);
        navigate("ride");
        return;
      }
      setTunnel(true);
      setTimeout(() => {
        setSession(s);
        navigate("ride");
      }, 650);
      setTimeout(() => setTunnel(false), 1400);
    },
    [navigate],
  );

  const finish = useCallback((data: JourneySummaryData) => {
    clearJourneyStorage(data.session.id);
    setSession(null);
    setSummary(data);
  }, []);

  const [calibration, setCalibration] = useState(isCalibrationHash);
  useEffect(() => {
    const on = () => setCalibration(isCalibrationHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  if (calibration && VideoCalibrationPage) {
    return (
      <Suspense fallback={<p className="loading-ink">Loading…</p>}>
        <VideoCalibrationPage />
      </Suspense>
    );
  }

  const riding = route === "ride";
  return (
    <div className={`site site--${route}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!riding && (
        <SiteNav current={route} hasActiveJourney={Boolean(session)} onNavigate={navigate} />
      )}
      <main id="main">
        {route === "home" && <HomePage onBoard={board} scrollTo={anchor?.split(":")[0]} />}
        {route === "journal" && <JournalPage />}
        {route === "about" && <AboutPage />}
        {riding && (
          <Suspense fallback={<p className="loading-ink">Boarding…</p>}>
            {session ? (
              <JourneyScreen key={session.id} session={session} onFinish={finish} />
            ) : summary ? (
              <JourneySummary
                data={summary}
                onDone={() => {
                  setSummary(null);
                  navigate("home", "search");
                }}
              />
            ) : (
              <div className="page-ink">
                <p className="ink-empty">You are not on a train right now.</p>
                <button className="ink-btn" onClick={() => navigate("home", "search")}>
                  Choose a train
                </button>
              </div>
            )}
          </Suspense>
        )}
      </main>
      <TunnelTransition active={tunnel} />
    </div>
  );
}
