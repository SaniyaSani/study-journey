import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServiceAlert, Station } from "@shared/types";
import {
  applyRealtime,
  buildTimeline,
  computeProgress,
  isRealtimeFresh,
  resolveJourneyStatus,
  stationsPassed,
} from "@shared/journey";
import {
  desiredVideoPosition,
  markersFromTimeline,
  resolveMarkers,
  DEFAULT_SYNC_CONFIG,
  REAL_FOOTAGE_SYNC_CONFIG,
  type DesiredPosition,
} from "@shared/sync";
import { activeFootageAt, rideState, stopsFromTimeline } from "@shared/journeySync";
import { findBestVideoForJourney } from "@shared/videoMatcher";
import { toTokyoIso } from "@shared/time";
import { actions, getState, useStudy, type SoundPreset } from "../../../store/studyStore";
import { japanApi } from "../api";
import { AmbientEngine } from "../audio/ambient";
import { getAudioContext, unlockAudio } from "../audio/audioContext";
import {
  cancelSpeech,
  hasJapaneseVoice,
  loadAnnouncementPack,
  speechAvailable,
  type AnnouncementPack,
} from "../audio/announcer";
import { playChime } from "../audio/chime";
import { RainEngine } from "../audio/rain";
import type { BadgeStatus } from "../components";
import { useAnnouncements } from "../hooks/useAnnouncements";
import { useJourneyClock } from "../hooks/useJourneyClock";
import { useRealtime } from "../hooks/useRealtime";
import { useVideoSync } from "../hooks/useVideoSync";
import type { RoutePlayer } from "../players/types";
import { useVideoCatalog } from "../video/catalog";
import {
  loadStudyProgress,
  saveStudyProgress,
  type JourneySession,
  type StudyModeKind,
  type StudyProgressState,
} from "../session";
import type { ViewKind } from "./RouteView";

export interface JourneySummaryData {
  session: JourneySession;
  completed: boolean;
  focusedSeconds: number;
  stationsPassed: number;
  totalStations: number;
  tasksCompleted: number;
  notesCreated: number;
  maxDelaySeconds: number;
  status: BadgeStatus;
  finishedAt: string;
}

export function usePrefersReducedMotion(): boolean {
  const q =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const [v, setV] = useState(Boolean(q?.matches));
  useEffect(() => {
    if (!q) return;
    const on = () => setV(q.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, [q]);
  return v;
}

/**
 * All journey state — railway clock, realtime polling, timeline/progress, video sync,
 * announcements, sound, study timer, alerts, finishing — independent of presentation.
 * The railway clock never pauses; pausing study only stops the focus counter.
 */
export function useJourney(session: JourneySession, onFinish: (s: JourneySummaryData) => void) {
  const clock = useJourneyClock(1000);
  const now = clock.now;
  const timeOffset = clock.offsetMs;
  const settings = useStudy((s) => s.settings);
  const reducedMotion = usePrefersReducedMotion();
  const scenic = session.kind === "scenic";
  const rt = useRealtime(session.trip.id, !scenic && timeOffset === 0 && clock.mode === "real");

  const stationsMap = useMemo(
    () => new Map(session.stations.map((s) => [s.id, s])),
    [session.stations],
  );
  const baseTimeline = useMemo(
    () => buildTimeline(session.trip, session.originStationId, session.destinationStationId),
    [session.trip, session.originStationId, session.destinationStationId],
  );
  const journeyStations: Station[] = useMemo(
    () =>
      baseTimeline.stops.map(
        (s) =>
          stationsMap.get(s.stationId) ?? {
            id: s.stationId,
            nameJa: s.stationId,
            nameEn: s.stationId,
          },
      ),
    [baseTimeline, stationsMap],
  );
  const fresh = isRealtimeFresh(rt.realtime, now) ? rt.realtime : null;
  const timeline = useMemo(() => applyRealtime(baseTimeline, fresh), [baseTimeline, fresh]);
  const progress = computeProgress(timeline, now, fresh);
  const resolved = resolveJourneyStatus({
    tripDataMode: session.trip.dataMode,
    realtime: rt.realtime,
    now,
    offline: rt.offline,
    delaySeconds: timeline.delaySeconds,
    cancelled: timeline.cancelled,
  });
  const status: BadgeStatus = scenic ? "scenic" : resolved.status;
  const source = scenic ? ("scenic" as const) : resolved.dataMode;

  /* ---------- route footage (curated catalog, station-based sync) ---------- */
  const catalog = useVideoCatalog();
  const [failedVideos, setFailedVideos] = useState<Record<string, string>>({});
  const usableCatalog = useMemo(
    () => catalog.filter((v) => !failedVideos[v.id]),
    [catalog, failedVideos],
  );
  // effective times (delays included) — the timetable stays the source of truth
  const scheduledStops = useMemo(
    () => stopsFromTimeline(timeline, stationsMap),
    [timeline, stationsMap],
  );
  const videoPlan = useMemo(
    () =>
      findBestVideoForJourney(
        {
          routeId: session.route.id,
          lineName: session.route.nameEn,
          routeStationNames: session.stations.map((s) => s.nameEn),
          stops: scheduledStops,
          departureMs: timeline.stops[0].scheduledDeparture,
          serviceType: session.trip.trainTypeEn,
        },
        usableCatalog,
      ),
    // the plan only depends on which stops / footage exist, not on every delay update
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usableCatalog, session, baseTimeline],
  );
  const footage = activeFootageAt(now, scheduledStops, videoPlan.segments);
  const footageSegment = footage ? videoPlan.segments[footage.segmentIndex] : null;
  const realFootage = Boolean(footageSegment && footageSegment.video.provider !== "illustrated");
  const nextSegment = footage ? videoPlan.segments[footage.segmentIndex + 1] : undefined;
  const preloadNext = Boolean(
    nextSegment && (scheduledStops[nextSegment.fromStopIndex].arrival - now) / 1000 < 120,
  );
  const failVideo = useCallback(
    (id: string, reason: string) => setFailedVideos((f) => (f[id] ? f : { ...f, [id]: reason })),
    [],
  );
  const lastFailure = Object.values(failedVideos)[0] ?? null;

  /* ---------- fallback route view (manifest / illustrated) ---------- */
  const [videoFailure, setVideoFailure] = useState<string | null>(null);
  const manifest = session.manifest;
  const manifestMarkers = useMemo(
    () => (manifest ? resolveMarkers(baseTimeline, manifest.stationMarkers) : null),
    [manifest, baseTimeline],
  );
  const wantsVideo =
    manifest?.video &&
    (manifest.video.provider === "youtube" || manifest.video.provider === "self-hosted");
  const viewKind: ViewKind = footage
    ? "footage"
    : wantsVideo && manifestMarkers && !videoFailure
      ? (manifest!.video!.provider as ViewKind)
      : "illustrated";
  const markers = useMemo(
    () =>
      viewKind === "youtube" ||
      viewKind === "self-hosted" ||
      (manifest?.video?.provider === "illustrated" && manifestMarkers)
        ? manifestMarkers!
        : resolveMarkers(baseTimeline, markersFromTimeline(baseTimeline))!,
    [viewKind, manifest, manifestMarkers, baseTimeline],
  );
  const fallbackReason =
    viewKind !== "illustrated" || manifest?.video?.provider === "illustrated"
      ? null
      : (videoFailure ??
        lastFailure ??
        (videoPlan.coverage
          ? `${videoPlan.note} The illustrated view fills the rest of the ride.`
          : wantsVideo && !manifestMarkers
            ? "The route video's station markers do not cover this journey."
            : videoPlan.note));
  const desired: DesiredPosition = footage
    ? { time: footage.position.videoTime, hold: footage.position.hold, rate: clock.speed }
    : { ...desiredVideoPosition(timeline, progress, markers, now), rate: clock.speed };
  if (clock.paused) desired.hold = true;
  const startRef = useRef<{ key: string; time: number } | null>(null);
  const playerRef = useRef<RoutePlayer | null>(null);
  const playerKey = footage
    ? "footage"
    : `${viewKind}:${manifest?.video?.videoId ?? manifest?.video?.url ?? "ill"}`;
  const syncKey = footageSegment
    ? `footage:${footage!.segmentIndex}:${footageSegment.video.id}`
    : playerKey;
  if (startRef.current?.key !== playerKey)
    startRef.current = { key: playerKey, time: desired.time };
  const initialTime = startRef.current.time;
  const syncState = useVideoSync(playerRef, desired, {
    active: true,
    key: syncKey,
    correctionMs: realFootage || viewKind === "youtube" || viewKind === "self-hosted" ? 5000 : 1000,
    config:
      realFootage || viewKind === "youtube" || viewKind === "self-hosted"
        ? REAL_FOOTAGE_SYNC_CONFIG
        : DEFAULT_SYNC_CONFIG,
  });
  const sync = syncState.cmd;
  const ride = rideState(progress, timeline, now);

  /* ---------- sound ---------- */
  const [audioUnlocked, setAudioUnlocked] = useState(() => getAudioContext()?.state === "running");
  const [pack, setPack] = useState<AnnouncementPack | null>(null);
  const [jaVoice, setJaVoice] = useState(hasJapaneseVoice());
  const ambient = useRef(new AmbientEngine());
  const rain = useRef(new RainEngine());
  const [soundOn, setSoundOn] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);

  useEffect(() => {
    loadAnnouncementPack(manifest?.audio?.announcementPackId).then(setPack);
  }, [manifest]);
  useEffect(() => {
    if (!speechAvailable()) return;
    const on = () => setJaVoice(hasJapaneseVoice());
    window.speechSynthesis.addEventListener?.("voiceschanged", on);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", on);
  }, []);
  useEffect(() => {
    const a = ambient.current;
    const r = rain.current;
    return () => {
      a.stop();
      r.stop();
      cancelSpeech();
    };
  }, []);
  const speed =
    progress.phase === "running"
      ? Math.min(1, Math.max(0.15, progress.secondsToNext / 35)) *
        (progress.segmentFraction < 0.05 ? 0.5 : 1)
      : 0;
  useEffect(() => ambient.current.setSpeed(speed), [speed]);
  /**
   * TRAIN SOUND: over real footage it is the footage's own audio track; the synthetic
   * ambience is only used for the illustrated view. They are never layered.
   */
  const preset = settings.soundPreset;
  const wantsTrainSound = soundOn && (preset === "train" || preset === "train-ann");
  useEffect(() => {
    if (realFootage) {
      ambient.current.stop();
      setVideoMuted(!wantsTrainSound);
    } else {
      setVideoMuted(true);
      if (wantsTrainSound && audioUnlocked && !ambient.current.running) {
        ambient.current.start(getState().settings.ambientVolume, manifest?.audio?.ambienceUrl);
      }
    }
  }, [realFootage, wantsTrainSound, audioUnlocked, manifest]);
  useEffect(() => {
    ambient.current.setVolume(settings.ambientVolume);
    rain.current.setVolume(settings.ambientVolume);
  }, [settings.ambientVolume]);

  const realFootageRef = useRef(realFootage);
  realFootageRef.current = realFootage;
  /** Applies a sound preset. Called from a click, so audio may start (never automatically). */
  const applySoundPreset = useCallback(
    async (preset: SoundPreset) => {
      const ctx = await unlockAudio();
      const unlocked = Boolean(ctx && ctx.state === "running");
      setAudioUnlocked(unlocked);
      const st = getState().settings;
      actions.updateSettings({
        soundPreset: preset,
        announcementMode: preset === "train-ann" ? st.announcementLanguage : "off",
      });
      const wantTrain = preset !== "quiet";
      const wantRain = preset === "rain";
      if (wantTrain && !ambient.current.running && unlocked && !realFootageRef.current) {
        ambient.current.start(st.ambientVolume, manifest?.audio?.ambienceUrl);
      }
      if (!wantTrain) ambient.current.stop();
      if (wantRain && !rain.current.running && unlocked) rain.current.start(st.ambientVolume);
      if (!wantRain) rain.current.stop();
      if (preset === "quiet") cancelSpeech();
      // the video's own audio can be unmuted even when Web Audio is unavailable
      setSoundOn(preset !== "quiet" && (unlocked || realFootageRef.current));
      if (realFootageRef.current) {
        setVideoMuted(!wantTrain);
        playerRef.current?.setMuted?.(!wantTrain);
      }
    },
    [manifest],
  );

  const { subtitle } = useAnnouncements({
    sessionId: session.id,
    timeline,
    stations: stationsMap,
    now,
    settings,
    audioUnlocked: audioUnlocked && soundOn,
    pack,
  });

  /* ---------- study (independent of the railway clock) ---------- */
  const [study, setStudy] = useState<StudyProgressState>(() => loadStudyProgress(session.id));
  useEffect(() => {
    setStudy((s) => {
      const studying = (progress.phase === "running" || progress.phase === "dwelling") && !s.paused;
      const delta = s.lastTickAt ? Math.min(5, Math.max(0, (now - s.lastTickAt) / 1000)) : 0;
      const next = {
        ...s,
        focusedSeconds: s.focusedSeconds + (studying && s.mode !== "off" ? delta : 0),
        maxDelaySeconds: Math.max(s.maxDelaySeconds, timeline.delaySeconds),
        lastTickAt: now,
      };
      saveStudyProgress(session.id, next);
      return next;
    });
  }, [now, progress.phase, timeline.delaySeconds, session.id]);
  const updateStudy = useCallback(
    (patch: Partial<StudyProgressState>) =>
      setStudy((s) => {
        const next = { ...s, ...patch };
        saveStudyProgress(session.id, next);
        return next;
      }),
    [session.id],
  );
  const setStudyMode = useCallback(
    (mode: StudyModeKind) =>
      setStudy((s) => {
        const next = {
          ...s,
          mode,
          paused: false,
          modeStartFocus: s.focusedSeconds,
          modeTargetIndex: mode === "next" ? progress.nextIndex : undefined,
        };
        saveStudyProgress(session.id, next);
        return next;
      }),
    [session.id, progress.nextIndex],
  );
  /** seconds left in the current study block (null when open-ended / off) */
  const studyRemaining = (() => {
    switch (study.mode) {
      case "25":
      case "45":
        return Math.max(0, Number(study.mode) * 60 - (study.focusedSeconds - study.modeStartFocus));
      case "next": {
        const idx = study.modeTargetIndex ?? progress.nextIndex;
        const stop = timeline.stops[Math.min(idx, timeline.stops.length - 1)];
        return Math.max(0, (stop.estimatedArrival - now) / 1000);
      }
      case "dest":
        return progress.remainingSeconds;
      default:
        return null;
    }
  })();
  const studyBlockDone = study.mode !== "off" && studyRemaining === 0;
  const chimed = useRef(false);
  useEffect(() => {
    if (
      studyBlockDone &&
      !chimed.current &&
      (study.mode === "25" || study.mode === "45" || study.mode === "next")
    ) {
      chimed.current = true;
      if (soundOn) void playChime(settings.announcementVolume * 0.5);
    }
    if (!studyBlockDone) chimed.current = false;
  }, [studyBlockDone, study.mode, soundOn, settings.announcementVolume]);

  /* ---------- service alerts ---------- */
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  useEffect(() => {
    if (scenic) return;
    let alive = true;
    const load = () =>
      japanApi
        .alerts(session.route.id)
        .then((r) => alive && setAlerts(r.data))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [scenic, session.route.id]);

  /* ---------- finishing ---------- */
  const finished = useRef(false);
  const finish = useCallback(
    (completed: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const s = getState();
      const since = Date.parse(session.createdAt);
      onFinish({
        session,
        completed,
        focusedSeconds: Math.round(study.focusedSeconds),
        stationsPassed: stationsPassed(progress),
        totalStations: timeline.stops.length,
        tasksCompleted: s.tasks.filter((t) => t.completedAt && Date.parse(t.completedAt) >= since)
          .length,
        notesCreated: s.notes.filter((n) => n.journeyId === session.id).length,
        maxDelaySeconds: Math.max(study.maxDelaySeconds, timeline.delaySeconds),
        status,
        finishedAt: toTokyoIso(now),
      });
    },
    [session, study, progress, timeline, status, now, onFinish],
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (progress.phase === "arrived") {
      // a short pause on the platform before the summary appears
      const t = setTimeout(() => finishRef.current(true), 4000);
      return () => clearTimeout(t);
    }
  }, [progress.phase]);

  return {
    now,
    timeOffset,
    settings,
    reducedMotion,
    scenic,
    rt,
    stationsMap,
    journeyStations,
    timeline,
    progress,
    status,
    source,
    // clock
    clock,
    ride,
    // view
    viewKind,
    manifest,
    markers,
    fallbackReason,
    initialTime,
    playerRef,
    playerKey,
    sync,
    syncState,
    desired,
    setVideoFailure,
    // footage
    videoPlan,
    footage,
    footageSegment,
    realFootage,
    preloadNext,
    failVideo,
    videoMuted,
    // sound
    audioUnlocked,
    soundOn,
    jaVoice,
    applySoundPreset,
    subtitle,
    // study
    study,
    updateStudy,
    setStudyMode,
    studyRemaining,
    studyBlockDone,
    // misc
    alerts,
    finish,
  };
}

export type Journey = ReturnType<typeof useJourney>;
