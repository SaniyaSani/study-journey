import { useSyncExternalStore } from "react";
import type { AnnouncementLanguageMode } from "@shared/announcements";

/**
 * Local-first study data (tasks, notes, focus sessions, route stamps, settings).
 * Stored in localStorage under a versioned key. Migrations are additive and never drop
 * existing user data; unknown fields are preserved.
 */

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  journeyId?: string;
}

export interface FocusSession {
  id: string;
  kind: "pomodoro" | "journey";
  startedAt: string;
  endedAt: string;
  focusSeconds: number;
  journeyId?: string;
  label?: string;
}

export interface RouteStamp {
  id: string;
  journeyId: string;
  routeNameJa: string;
  routeNameEn: string;
  originJa: string;
  originEn: string;
  destinationJa: string;
  destinationEn: string;
  color?: string;
  date: string; // Japan service date
  focusMinutes: number;
  stationsPassed: number;
  delayMinutes: number;
  dataMode: string;
  earnedAt: string;
}

export type SoundPreset = "quiet" | "train" | "train-ann" | "rain";

export interface Settings {
  /** effective mode used by the announcer ("off" unless the preset includes announcements) */
  announcementMode: AnnouncementLanguageMode;
  /** preferred language when announcements are on */
  announcementLanguage: Exclude<AnnouncementLanguageMode, "off">;
  soundPreset: SoundPreset;
  announcementVolume: number;
  ambientVolume: number;
  captions: boolean;
  showLocalTime: boolean;
  useFallbackVoice: boolean;
  pomodoroMinutes: number;
}

export interface StudyState {
  schemaVersion: number;
  tasks: Task[];
  notes: Note[];
  focusSessions: FocusSession[];
  stamps: RouteStamp[];
  settings: Settings;
  [unknownField: string]: unknown;
}

export const STORAGE_KEY = "study-journey:data";
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  announcementMode: "en",
  announcementLanguage: "en",
  soundPreset: "train-ann",
  announcementVolume: 0.8,
  ambientVolume: 0.35,
  captions: true,
  showLocalTime: true,
  useFallbackVoice: false,
  pomodoroMinutes: 25,
};

export function emptyState(): StudyState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    notes: [],
    focusSessions: [],
    stamps: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Backward-compatible migration: v1 (tasks/notes/sessions) → v2 (+stamps, +journey settings). */
export function migrate(raw: unknown): StudyState {
  if (!raw || typeof raw !== "object") return emptyState();
  const r = raw as Record<string, unknown>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...r, // keep unknown fields untouched
    schemaVersion: SCHEMA_VERSION,
    tasks: arr<Task>(r.tasks),
    notes: arr<Note>(r.notes),
    focusSessions: arr<FocusSession>(r.focusSessions ?? r.sessions),
    stamps: arr<RouteStamp>(r.stamps),
    settings: { ...DEFAULT_SETTINGS, ...((r.settings as Partial<Settings>) ?? {}) },
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): StudyState {
  const s = safeStorage();
  try {
    const text = s?.getItem(STORAGE_KEY);
    if (!text) return emptyState();
    const parsed = JSON.parse(text);
    if (parsed?.schemaVersion !== SCHEMA_VERSION) {
      // keep a backup of the pre-migration data, then migrate
      s?.setItem(`${STORAGE_KEY}:backup-v${parsed?.schemaVersion ?? 0}`, text);
    }
    return migrate(parsed);
  } catch {
    return emptyState();
  }
}

let state: StudyState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode: keep in memory */
  }
}

export function getState(): StudyState {
  return state;
}

export function setState(update: (s: StudyState) => StudyState): void {
  state = update(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Test helper */
export function __resetStore(next: StudyState = load()): void {
  state = next;
  listeners.forEach((l) => l());
}

export function useStudy<T>(selector: (s: StudyState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/* ---- actions ---- */
export const actions = {
  addTask(title: string) {
    const t = title.trim();
    if (!t) return;
    setState((s) => ({
      ...s,
      tasks: [
        ...s.tasks,
        { id: uid(), title: t, done: false, createdAt: new Date().toISOString() },
      ],
    }));
  },
  toggleTask(id: string) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString() : undefined }
          : t,
      ),
    }));
  },
  removeTask(id: string) {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  },
  addNote(title: string, body = "", journeyId?: string): string {
    const id = uid();
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      notes: [
        {
          id,
          title: title.trim() || "Untitled note",
          body,
          createdAt: now,
          updatedAt: now,
          journeyId,
        },
        ...s.notes,
      ],
    }));
    return id;
  },
  updateNote(id: string, patch: Partial<Pick<Note, "title" | "body">>) {
    setState((s) => ({
      ...s,
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n,
      ),
    }));
  },
  removeNote(id: string) {
    setState((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
  },
  addFocusSession(session: Omit<FocusSession, "id">) {
    setState((s) =>
      session.journeyId && s.focusSessions.some((f) => f.journeyId === session.journeyId)
        ? s
        : { ...s, focusSessions: [...s.focusSessions, { ...session, id: uid() }] },
    );
  },
  addStamp(stamp: Omit<RouteStamp, "id" | "earnedAt">) {
    setState((s) =>
      s.stamps.some((x) => x.journeyId === stamp.journeyId)
        ? s
        : {
            ...s,
            stamps: [{ ...stamp, id: uid(), earnedAt: new Date().toISOString() }, ...s.stamps],
          },
    );
  },
  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
};
