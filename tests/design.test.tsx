// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { periodForHour } from "../client/src/design/scenes/DuskStreet";
import { boardMode } from "../client/src/site/LiveTimetable";
import { FEATURED_ROUTES } from "../client/src/site/featuredRoutes";
import { EditorialScene } from "../client/src/design/scenes/EditorialScene";
import { migrate } from "../client/src/store/studyStore";
import type { Departure } from "@shared/types";

describe("design system behaviour", () => {
  it("chooses the hero sky from the departure hour in Japan", () => {
    expect(periodForHour(9)).toBe("day");
    expect(periodForHour(17)).toBe("dusk");
    expect(periodForHour(23)).toBe("night");
    expect(periodForHour(2)).toBe("night");
  });

  it("labels the departure board honestly", () => {
    const d = (dataMode: Departure["dataMode"]) => ({ dataMode }) as Departure;
    expect(boardMode([d("live"), d("timetable")])).toEqual({ label: "LIVE", live: true });
    expect(boardMode([d("demo")])).toEqual({ label: "DEMO DATA", live: false });
    expect(boardMode([d("timetable")]).live).toBe(false);
    expect(boardMode([d("live")], true).label).toBe("CACHED");
  });

  it("editorial picks never contain invented timetable values", () => {
    for (const r of FEATURED_ROUTES) {
      expect(JSON.stringify(r)).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    }
  });

  it("renders every editorial scene", () => {
    for (const v of ["sea", "mountain", "bamboo", "coast", "alps", "rain"] as const) {
      const { container } = render(<EditorialScene variant={v} />);
      expect(container.querySelector("svg")).not.toBeNull();
    }
  });

  it("adds new sound settings without losing old ones", () => {
    const m = migrate({
      schemaVersion: 2,
      settings: { announcementMode: "en", ambientVolume: 0.1 },
    });
    expect(m.settings.announcementMode).toBe("en");
    expect(m.settings.ambientVolume).toBe(0.1);
    expect(m.settings.soundPreset).toBe("train-ann");
    expect(m.settings.announcementLanguage).toBe("en");
  });
});

import {
  serviceColor,
  stationNumbering,
  StationNameBoard,
  TicketCard,
} from "../client/src/design/station";

describe("station system primitives", () => {
  it("only shows station numbering that the data provides (or the demo line)", () => {
    expect(stationNumbering({ id: "odpt:x", code: "JY01" })).toEqual({ line: "JY", num: "01" });
    expect(stationNumbering({ id: "demo:SK03" })).toEqual({ line: "SK", num: "03" });
    expect(stationNumbering({ id: "odpt:odpt.Station:JR-East.Yokosuka.Tokyo" })).toBeNull();
  });
  it("colours service types like a departure board", () => {
    expect(serviceColor("Local")).toBe("var(--line-green)");
    expect(serviceColor("Rapid")).toBe("var(--line-orange)");
    expect(serviceColor("Limited Express")).toBe("var(--line-red)");
  });
  it("renders a station name board and a ticket", () => {
    const { container, getByText } = render(
      <>
        <StationNameBoard
          ja="松風"
          en="Matsukaze"
          prev={{ ja: "汐見坂", en: "Shiomizaka" }}
          heading="h2"
        />
        <TicketCard kicker="Boarding ticket" stub={<span>08:21</span>}>
          <span>港中央 → 高嶺口</span>
        </TicketCard>
      </>,
    );
    expect(container.querySelector("h2.snb-names")).not.toBeNull();
    expect(getByText("Shiomizaka")).toBeTruthy();
    expect(container.querySelector(".ticket--stub .ticket-stub")).not.toBeNull();
  });
});
