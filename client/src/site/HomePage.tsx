import { useEffect, useState } from "react";
import { toMs, tokyoParts } from "@shared/time";
import { periodForHour } from "../design/scenes/DuskStreet";
import { usePlanner } from "../features/japan/planner/usePlanner";
import type { JourneySession } from "../features/japan/session";
import { EditorialSection } from "./EditorialSection";
import { Hero } from "./Hero";
import { LiveTimetable } from "./LiveTimetable";
import { RouteSelector } from "./RouteSelector";
import { SiteFooter } from "./SiteFooter";

/** Optional licensed hero photograph — see docs/DESIGN.md. Leave undefined for the illustration. */
const HERO_PHOTO = (import.meta.env.VITE_HERO_PHOTO as string | undefined)
  ? {
      src: import.meta.env.VITE_HERO_PHOTO as string,
      alt: (import.meta.env.VITE_HERO_PHOTO_ALT as string | undefined) ?? "Street at dusk in Japan",
      credit: import.meta.env.VITE_HERO_PHOTO_CREDIT as string | undefined,
    }
  : undefined;

export function HomePage({
  onBoard,
  scrollTo,
}: {
  onBoard: (s: JourneySession) => void;
  scrollTo?: string;
}) {
  const planner = usePlanner();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(scrollTo);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (scrollTo === "search")
      (document.getElementById("rs-origin") as HTMLSelectElement | null)?.focus();
  }, [scrollTo]);

  // the sky follows the chosen departure's hour in Japan
  const refTime = planner.chosen
    ? toMs(planner.chosen.estimatedDeparture ?? planner.chosen.scheduledDeparture)
    : now;
  const period = periodForHour(tokyoParts(refTime).hour);

  return (
    <div className="home">
      <Hero
        period={period}
        now={now}
        photo={HERO_PHOTO}
        board={<LiveTimetable planner={planner} compact />}
      >
        <RouteSelector
          planner={planner}
          onBoard={async () => {
            const s = await planner.start();
            if (s) onBoard(s);
          }}
        />
      </Hero>
      <EditorialSection
        planner={planner}
        onPicked={() =>
          document.getElementById("search")?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      />
      <SiteFooter />
    </div>
  );
}
