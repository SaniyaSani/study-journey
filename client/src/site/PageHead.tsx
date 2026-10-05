import type { ReactNode } from "react";
import { StationNameBoard, type BoardStation } from "../design/station";

/**
 * Inner-page header: a breadcrumb drawn as a short route line, and the page title set as a
 * station name board with the neighbouring pages on its band.
 */
export function PageHead({
  ja,
  en,
  kana,
  prev,
  next,
  color = "var(--st-green)",
  children,
}: {
  ja: string;
  en: string;
  kana?: string;
  prev?: BoardStation;
  next?: BoardStation;
  color?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <nav className="crumbs" aria-label="Breadcrumb" style={{ ["--line" as string]: color }}>
        <ol>
          <li>
            <a href="#/">
              <span lang="ja">コンコース</span> Concourse
            </a>
          </li>
          <li aria-current="page">
            <span lang="ja">{ja}</span> {en}
          </li>
        </ol>
      </nav>
      <StationNameBoard
        heading="h1"
        className="page-head-board"
        ja={<span className="page-head-ja">{ja}</span>}
        kana={kana}
        en={<span className="page-head-en">{en}</span>}
        color={color}
        prev={prev}
        next={next}
      />
      {children}
    </header>
  );
}
