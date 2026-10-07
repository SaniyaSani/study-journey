import { ServiceNotice } from "../design/station";

/** Footer = station information strip: notices on a white board, line band, small print. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot-notices">
        <ServiceNotice en="Data" ja="運行情報">
          Timetables &amp; live data via the Public Transportation Open Data Center (ODPT) — not
          guaranteed accurate; please don&apos;t contact operators about this site. Toei data ©
          Tokyo Metropolitan Bureau of Transportation (CC BY 4.0).
        </ServiceNotice>
        <ServiceNotice en="Window view" ja="車窓" level="warn">
          Route views are recordings or illustrations — never a live camera.
        </ServiceNotice>
        <ServiceNotice en="Map" ja="地図">
          Map © OpenStreetMap contributors.
        </ServiceNotice>
      </div>
      <div className="site-foot-strip">
        <span className="site-foot-brand" aria-hidden="true">
          <small>THE</small> <span className="led led--amber">17:24</span>
        </span>
        <span className="site-foot-name">THE 17:24 · VIRTUAL TRAIN RIDE JAPAN</span>
        <span className="site-foot-tag">Japan, on the other side of your screen.</span>
        <span className="site-foot-note">
          Inspired by Japanese station signage · not affiliated with any railway operator
        </span>
      </div>
    </footer>
  );
}
