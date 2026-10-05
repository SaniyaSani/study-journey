/** Fictional demo railway. Names and coordinates are invented for demonstration only. */
export const DEMO_STATIONS = [
  { id: "SK01", nameJa: "港中央", nameEn: "Minato-Chūō", lat: 35.33, lon: 139.49 },
  { id: "SK02", nameJa: "汐見坂", nameEn: "Shiomizaka", lat: 35.3238, lon: 139.4702 },
  { id: "SK03", nameJa: "松風", nameEn: "Matsukaze", lat: 35.3169, lon: 139.4479 },
  { id: "SK04", nameJa: "灯台下", nameEn: "Tōdaishita", lat: 35.3118, lon: 139.4262 },
  { id: "SK05", nameJa: "桜ヶ浦", nameEn: "Sakuraura", lat: 35.3152, lon: 139.4011 },
  { id: "SK06", nameJa: "星見台", nameEn: "Hoshimidai", lat: 35.3231, lon: 139.3779 },
  { id: "SK07", nameJa: "霧ノ沢", nameEn: "Kirinosawa", lat: 35.3352, lon: 139.358 },
  { id: "SK08", nameJa: "高嶺口", nameEn: "Takaneguchi", lat: 35.3481, lon: 139.3402 },
] as const;

/** Running time (s) between consecutive stations in the outbound direction. */
export const DEMO_RUN_SECONDS = [300, 330, 390, 240, 420, 360, 480];
export const DEMO_DWELL_SECONDS = 40;

export const DEMO_DELAY_NOTICE_EN = "Demo: signal inspection near Matsukaze (simulated)";
export const DEMO_DELAY_NOTICE_JA = "デモ：松風駅付近での信号点検（シミュレーション）";
