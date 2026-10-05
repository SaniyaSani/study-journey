import { useEffect, useState } from "react";
import type { TrainVideo } from "@shared/video";
import { japanApi } from "../api";
import { devToolsEnabled } from "../devtools";

/**
 * The curated footage catalog, fetched once per page load (never a live YouTube search).
 * In development, calibrations saved in the calibration tool are merged in as drafts so a
 * freshly measured video can be previewed on a real ride before it is committed.
 */

const DRAFTS_KEY = "study-journey:video-calibration:drafts";

export function loadCalibrationDrafts(): TrainVideo[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const list = raw ? (JSON.parse(raw) as TrainVideo[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveCalibrationDrafts(list: TrainVideo[]): void {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

let cache: Promise<TrainVideo[]> | null = null;

export function fetchVideoCatalog(): Promise<TrainVideo[]> {
  if (!cache) {
    cache = japanApi
      .videos()
      .then((r) => r.data)
      .catch(() => {
        cache = null;
        return [] as TrainVideo[];
      });
  }
  return cache;
}

function merge(server: TrainVideo[]): TrainVideo[] {
  if (!devToolsEnabled()) return server;
  const drafts = loadCalibrationDrafts().map((d) => ({
    ...d,
    notes: `[local draft] ${d.notes ?? ""}`.trim(),
  }));
  const ids = new Set(drafts.map((d) => d.id));
  return [...drafts, ...server.filter((v) => !ids.has(v.id))];
}

export function useVideoCatalog(): TrainVideo[] {
  const [list, setList] = useState<TrainVideo[]>([]);
  useEffect(() => {
    let alive = true;
    fetchVideoCatalog().then((v) => alive && setList(merge(v)));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}
