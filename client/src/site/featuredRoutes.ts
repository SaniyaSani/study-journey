import type { SceneVariant } from "../design/scenes/EditorialScene";

/**
 * Editorial route picks for the collage. These are descriptions only — no timetable values
 * are invented here. Times always come from the configured data source when the line exists
 * there (ODPT / GTFS); otherwise the card says the line needs a data source.
 */
export interface FeaturedRoute {
  id: string;
  fromJa: string;
  fromEn: string;
  toJa: string;
  toEn: string;
  lineJa: string;
  lineEn: string;
  themeJa: string;
  themeEn: string;
  scene: SceneVariant;
  coord: string;
  /** names used to find the line/stations in the available data */
  match: { from: string; to: string };
  size: "xl" | "l" | "m" | "s";
}

export const FEATURED_ROUTES: FeaturedRoute[] = [
  {
    id: "kamakura",
    fromJa: "東京",
    fromEn: "Tokyo",
    toJa: "鎌倉",
    toEn: "Kamakura",
    lineJa: "横須賀線",
    lineEn: "JR Yokosuka Line",
    themeJa: "海へ",
    themeEn: "To the sea",
    scene: "sea",
    coord: "35.3192° N",
    match: { from: "Tokyo", to: "Kamakura" },
    size: "xl",
  },
  {
    id: "takao",
    fromJa: "新宿",
    fromEn: "Shinjuku",
    toJa: "高尾",
    toEn: "Takao",
    lineJa: "中央線快速",
    lineEn: "JR Chūō Line (Rapid)",
    themeJa: "山へ",
    themeEn: "To the mountains",
    scene: "mountain",
    coord: "35.6421° N",
    match: { from: "Shinjuku", to: "Takao" },
    size: "l",
  },
  {
    id: "arashiyama",
    fromJa: "京都",
    fromEn: "Kyoto",
    toJa: "嵐山",
    toEn: "Arashiyama",
    lineJa: "嵯峨野線",
    lineEn: "JR Sagano Line",
    themeJa: "竹の道",
    themeEn: "Bamboo groves",
    scene: "bamboo",
    coord: "35.0094° N",
    match: { from: "Kyoto", to: "Saga-Arashiyama" },
    size: "m",
  },
  {
    id: "izu",
    fromJa: "熱海",
    fromEn: "Atami",
    toJa: "伊豆",
    toEn: "Izu",
    lineJa: "伊東線",
    lineEn: "JR Itō Line",
    themeJa: "夕暮れ",
    themeEn: "Sunset coast",
    scene: "coast",
    coord: "35.0964° N",
    match: { from: "Atami", to: "Ito" },
    size: "m",
  },
  {
    id: "takayama",
    fromJa: "富山",
    fromEn: "Toyama",
    toJa: "高山",
    toEn: "Takayama",
    lineJa: "高山本線",
    lineEn: "JR Takayama Line",
    themeJa: "雪の峠",
    themeEn: "Mountain pass",
    scene: "alps",
    coord: "36.1461° N",
    match: { from: "Toyama", to: "Takayama" },
    size: "l",
  },
  {
    id: "rain",
    fromJa: "港中央",
    fromEn: "Minato-Chūō",
    toJa: "高嶺口",
    toEn: "Takaneguchi",
    lineJa: "桜ヶ浦海岸線",
    lineEn: "Sakuraura Coast Line (demo)",
    themeJa: "雨の日",
    themeEn: "Rainy day",
    scene: "rain",
    coord: "DEMO",
    match: { from: "Minato", to: "Takaneguchi" },
    size: "s",
  },
];
