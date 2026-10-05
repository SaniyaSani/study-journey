import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { RoutePlayer } from "./types";

export interface IllustratedStation {
  nameJa: string;
  nameEn: string;
  arrivalFrame: number;
  departureFrame: number;
}

interface Props {
  stations: IllustratedStation[];
  durationSeconds: number;
  lineColor?: string;
  reducedMotion: boolean;
  dayPeriod?: "day" | "evening" | "night";
  initialTime?: number;
  label: string;
}

/**
 * An application-drawn "cab view" used for the demo and whenever no route video exists or a
 * video fails. It behaves like a video (it has a timeline, can play/pause/seek/change rate)
 * so the same synchronisation engine drives it. It never pretends to be footage.
 */
export const IllustratedRouteView = forwardRef<RoutePlayer, Props>(function IllustratedRouteView(
  {
    stations,
    durationSeconds,
    lineColor = "#2e7d5b",
    reducedMotion,
    dayPeriod = "evening",
    initialTime = 0,
    label,
  },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const t = useRef(initialTime);
  const playing = useRef(false);
  const rate = useRef(1);
  const scroll = useRef(0);
  const props = useRef({ stations, durationSeconds, lineColor, reducedMotion, dayPeriod });
  props.current = { stations, durationSeconds, lineColor, reducedMotion, dayPeriod };

  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => ({
        currentTime: t.current,
        playing: playing.current,
        rate: rate.current,
        supportsFineRate: true,
        duration: props.current.durationSeconds,
      }),
      seek: (s) => {
        t.current = Math.max(0, Math.min(s, props.current.durationSeconds));
      },
      setRate: (r) => {
        rate.current = r;
      },
      play: () => {
        playing.current = true;
      },
      pause: () => {
        playing.current = false;
      },
    }),
    [],
  );

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(c);

    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const p = props.current;
      if (playing.current) {
        t.current = Math.min(p.durationSeconds, t.current + dt * rate.current);
        const v = speedAt(p.stations, t.current);
        scroll.current += v * dt * rate.current * 9;
      }
      if (!p.reducedMotion || now - lastDraw > 1000) {
        const r = c.getBoundingClientRect();
        draw(ctx, r.width, r.height, t.current, p.reducedMotion ? 0 : scroll.current, p);
        lastDraw = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className="illustrated-view" role="img" aria-label={label} />;
});

/** 0..1 normalised train speed at a timeline position. */
export function speedAt(stations: IllustratedStation[], time: number): number {
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (time >= s.arrivalFrame && time <= s.departureFrame) return 0;
    const n = stations[i + 1];
    if (n && time > s.departureFrame && time < n.arrivalFrame) {
      const seg = n.arrivalFrame - s.departureFrame;
      const acc = Math.min(30, seg * 0.25);
      const dec = Math.min(35, seg * 0.3);
      const since = time - s.departureFrame;
      const until = n.arrivalFrame - time;
      if (since < acc) return ease(since / acc);
      if (until < dec) return Math.max(0.04, ease(until / dec));
      return 1;
    }
  }
  return 0;
}
const ease = (x: number) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 2;

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  scroll: number,
  p: { stations: IllustratedStation[]; lineColor: string; dayPeriod: string },
) {
  const hy = h * 0.5; // horizon
  const vx = w / 2;
  const palette =
    p.dayPeriod === "day"
      ? { top: "#6f9bd1", mid: "#b9d2ea", horizon: "#f2e3c4", ground: "#3b4a3a", sea: "#4a78a3" }
      : p.dayPeriod === "night"
        ? { top: "#070c19", mid: "#101a33", horizon: "#273556", ground: "#0b0f17", sea: "#0d1a30" }
        : { top: "#101b35", mid: "#2b3c66", horizon: "#e2a654", ground: "#141a24", sea: "#1d3050" };

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, palette.top);
  sky.addColorStop(0.65, palette.mid);
  sky.addColorStop(1, palette.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hy + 1);

  // stars
  ctx.fillStyle = "rgba(244,234,215,0.7)";
  for (let i = 0; i < 40; i++) {
    const x = hash(i) * w;
    const y = hash(i + 99) * hy * 0.55;
    const tw = 0.6 + 0.4 * Math.sin(time * 0.7 + i);
    ctx.globalAlpha = p.dayPeriod === "day" ? 0 : 0.35 * tw;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;

  // far mountains (slow parallax)
  ctx.fillStyle = "rgba(24,32,58,0.9)";
  ctx.beginPath();
  ctx.moveTo(0, hy);
  const mOff = scroll * 0.6;
  for (let x = 0; x <= w; x += 8) {
    const k = (x + mOff) / 90;
    const y =
      hy - 30 - 26 * Math.sin(k) - 18 * Math.sin(k * 2.3 + 1) - 10 * hash(Math.floor(k * 3));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, hy);
  ctx.closePath();
  ctx.fill();

  // sea (left) and land (right)
  ctx.fillStyle = palette.sea;
  ctx.fillRect(0, hy, vx, h - hy);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(vx, hy, w - vx, h - hy);
  // sea shimmer
  ctx.strokeStyle = "rgba(226,166,84,0.28)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const y = hy + 4 + i * i * 1.6;
    if (y > h) break;
    const x0 = (hash(i + Math.floor(time * 2)) * vx * 0.8) % vx;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + 12 + i * 3, y);
    ctx.stroke();
  }
  // town lights on the land side (parallax)
  for (let i = 0; i < 60; i++) {
    const base = hash(i + 7) * 2400;
    const x = vx + ((((base - scroll * 3) % 2400) + 2400) % 2400) * 0.3;
    if (x > w) continue;
    const y = hy + 4 + hash(i + 31) * 22;
    ctx.fillStyle = i % 5 === 0 ? "rgba(200,85,61,0.85)" : "rgba(244,224,170,0.8)";
    ctx.fillRect(x, y, 2, 2);
  }

  // ground between rails
  ctx.fillStyle = "#1a1f29";
  ctx.beginPath();
  ctx.moveTo(vx - 4, hy);
  ctx.lineTo(vx + 4, hy);
  ctx.lineTo(vx + w * 0.42, h);
  ctx.lineTo(vx - w * 0.42, h);
  ctx.closePath();
  ctx.fill();

  const depthToY = (d: number) => hy + (h - hy) / d;
  const gauge = w * 0.2;

  // sleepers
  ctx.strokeStyle = "rgba(120,110,95,0.55)";
  for (let k = 0; k < 60; k++) {
    const d = 1 + ((((k * 0.9 - scroll * 0.25) % 54) + 54) % 54);
    const y = depthToY(d);
    const half = gauge / d;
    ctx.lineWidth = Math.max(0.5, 5 / d);
    ctx.beginPath();
    ctx.moveTo(vx - half * 1.3, y);
    ctx.lineTo(vx + half * 1.3, y);
    ctx.stroke();
  }
  // rails
  ctx.strokeStyle = "rgba(210,205,195,0.85)";
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(vx, hy);
    ctx.lineTo(vx + s * gauge, h);
    ctx.stroke();
  }

  // catenary poles (right side)
  ctx.strokeStyle = "rgba(170,175,185,0.7)";
  for (let k = 0; k < 8; k++) {
    const d = 1 + ((((k * 7 - scroll * 0.25) % 56) + 56) % 56);
    const x = vx + (w * 0.5) / d;
    const y = depthToY(d);
    const ph = (h * 0.9) / d;
    ctx.lineWidth = Math.max(1, 6 / d);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - ph);
    ctx.lineTo(x - (w * 0.28) / d, y - ph);
    ctx.stroke();
  }
  // overhead wire
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vx, hy - 6);
  ctx.lineTo(vx, 0);
  ctx.stroke();

  // station platform
  const st = nearestStation(p.stations, time);
  if (st) {
    const { s, dist } = st; // dist: >0 before arrival frame, <0 after departure frame, 0 dwelling
    const near = 1 + Math.max(0, dist) * 0.55 - Math.max(0, -dist) * 0.9;
    const far = near + 14;
    if (far > 1 && near < 40) {
      const n = Math.max(near, 1.001);
      const yNear = depthToY(n);
      const yFar = depthToY(far);
      ctx.fillStyle = "#b9b2a3";
      ctx.beginPath();
      ctx.moveTo(vx - (gauge * 1.6) / n, yNear);
      ctx.lineTo(vx - (gauge * 1.6) / far, yFar);
      ctx.lineTo(vx - (gauge * 4.5) / far, yFar);
      ctx.lineTo(vx - (gauge * 4.5) / n, yNear);
      ctx.closePath();
      ctx.fill();
      // platform edge line
      ctx.strokeStyle = "#e9c46a";
      ctx.lineWidth = Math.max(1, 3 / n);
      ctx.beginPath();
      ctx.moveTo(vx - (gauge * 1.75) / n, yNear);
      ctx.lineTo(vx - (gauge * 1.75) / far, yFar);
      ctx.stroke();
      // roof lights
      for (let i = 0; i < 6; i++) {
        const d = n + i * 2.3;
        ctx.fillStyle = "rgba(255,244,214,0.9)";
        ctx.fillRect(
          vx - (gauge * 3) / d,
          depthToY(d) - (h * 0.5) / d,
          Math.max(2, 22 / d),
          Math.max(1, 3 / d),
        );
      }
      // name board
      const bd = n + 4;
      const bw = (w * 0.9) / bd;
      const bh = bw * 0.36;
      const bx = vx - (gauge * 3.3) / bd - bw / 2;
      const by = depthToY(bd) - (h * 0.42) / bd;
      if (bw > 30) {
        ctx.fillStyle = "#fbf8f1";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = p.lineColor;
        ctx.fillRect(bx, by + bh * 0.7, bw, bh * 0.12);
        ctx.fillStyle = "#1b2436";
        ctx.textAlign = "center";
        ctx.font = `600 ${Math.max(8, bh * 0.38)}px "Hiragino Sans","Noto Sans JP",sans-serif`;
        ctx.fillText(s.nameJa, bx + bw / 2, by + bh * 0.45);
        ctx.font = `${Math.max(6, bh * 0.15)}px Inter, system-ui, sans-serif`;
        ctx.fillText(s.nameEn, bx + bw / 2, by + bh * 0.65);
      }
    }
  }

  // cab frame & window reflection
  const vign = ctx.createRadialGradient(vx, h * 0.55, h * 0.35, vx, h * 0.55, h * 1.05);
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(5,8,16,0.75)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, w, h);
  const refl = ctx.createLinearGradient(0, 0, w, h);
  refl.addColorStop(0.15, "rgba(255,255,255,0)");
  refl.addColorStop(0.32, "rgba(255,255,255,0.05)");
  refl.addColorStop(0.42, "rgba(255,255,255,0)");
  ctx.fillStyle = refl;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0b111e";
  ctx.fillRect(0, h - Math.max(10, h * 0.05), w, h);
}

function nearestStation(stations: IllustratedStation[], time: number) {
  let best: { s: IllustratedStation; dist: number } | null = null;
  for (const s of stations) {
    const dist =
      time < s.arrivalFrame
        ? s.arrivalFrame - time
        : time > s.departureFrame
          ? -(time - s.departureFrame)
          : 0;
    if (dist > 45 || dist < -20) continue;
    if (!best || Math.abs(dist) < Math.abs(best.dist)) best = { s, dist };
  }
  return best;
}
