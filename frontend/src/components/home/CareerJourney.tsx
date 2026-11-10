"use client";

import Link from "next/link";
import { useId, useRef, useSyncExternalStore, type MouseEvent } from "react";

import type { HomeJourney } from "@/types/cie";

const GRADES = ["9th grade", "10th grade", "11th grade", "12th grade"];

type Station = { key: string; title: string; subtitle: string; tone: string };

// Station positions on a 1000 x 340 scene: the road winds across the meadow.
const X = [70, 225, 380, 535, 700, 870];
const Y = [262, 200, 254, 194, 250, 190];

function curve(points: [number, number][]) {
  if (points.length === 0) {
    return "";
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const dx = (x1 - x0) / 2;
    d += ` C ${x0 + dx} ${y0}, ${x1 - dx} ${y1}, ${x1} ${y1}`;
  }

  return d;
}

// ---------------------------------------------------------------- motion & time

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
}

type Period = "dawn" | "day" | "dusk" | "night";

function periodNow(): Period {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 8 ? "dawn" : hour >= 8 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "dusk" : "night";
}

const noop = () => () => undefined;

/** The sky follows the student's own clock (the server renders daytime). */
function usePeriod(): Period {
  return useSyncExternalStore(noop, periodNow, () => "day");
}

type Palette = {
  skyTop: string;
  skyBottom: string;
  orb: string;
  glow: string;
  orbY: number;
  mountain: string;
  snow: string;
  hillBack: string;
  hillMid: string;
  meadow: string;
  meadowShade: string;
  cloud: number;
  window: string;
  leaf: string;
  leafShade: string;
};

// Colors for each time of day: sky, sun or moon, far mountains, hills, meadow.
const PALETTES: Record<Period, Palette> = {
  dawn: { skyTop: "#9cc7f0", skyBottom: "#ffd9b0", orb: "#ffd36e", glow: "#ffe7a8", orbY: 92, mountain: "#a9b8d6", snow: "#f4f1fb", hillBack: "#a5cf8f", hillMid: "#86c178", meadow: "#6db567", meadowShade: "#5ea65a", cloud: 0.9, window: "#fff3c4", leaf: "#4caf6a", leafShade: "#3b9658" },
  day: { skyTop: "#7cc4f5", skyBottom: "#e3f4ff", orb: "#ffd54a", glow: "#fff1b8", orbY: 54, mountain: "#9dbbd9", snow: "#ffffff", hillBack: "#a6d98f", hillMid: "#7fc770", meadow: "#62b45f", meadowShade: "#55a453", cloud: 0.95, window: "#dff1ff", leaf: "#43a862", leafShade: "#348f51" },
  dusk: { skyTop: "#5d7cc0", skyBottom: "#ffbf7f", orb: "#ff9f43", glow: "#ffd29a", orbY: 104, mountain: "#8a91b8", snow: "#fde8d6", hillBack: "#8eb87f", hillMid: "#6fa86a", meadow: "#579a57", meadowShade: "#4b8a4c", cloud: 0.75, window: "#ffd866", leaf: "#3d9259", leafShade: "#2f7a49" },
  night: { skyTop: "#0c1636", skyBottom: "#2a4580", orb: "#f5f1cf", glow: "#c9d6ff", orbY: 56, mountain: "#33466e", snow: "#a9b6d6", hillBack: "#2f5b52", hillMid: "#27503f", meadow: "#20473a", meadowShade: "#1b3e33", cloud: 0.25, window: "#ffd866", leaf: "#2a6a4c", leafShade: "#1f5a3f" },
};

// ------------------------------------------------------------------ scenery

function RoundTree({ x, y, size = 1, leaf, shade }: { x: number; y: number; size?: number; leaf: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <ellipse cx="0" cy="12" rx="14" ry="4" fill="#000" opacity="0.12" />
      <g className="journey-tree" style={{ animationDelay: `${(x % 7) * -0.4}s` }}>
        <rect x="-3" y="-4" width="6" height="16" rx="2" fill="#8a5a33" />
        <circle cx="0" cy="-16" r="15" fill={leaf} />
        <path d="M 0 -31 A 15 15 0 0 1 0 -1 A 11 15 0 0 0 0 -31 Z" fill={shade} />
        <circle cx="-6" cy="-21" r="4.5" fill="#ffffff" opacity="0.18" />
      </g>
    </g>
  );
}

function PineTree({ x, y, size = 1, leaf, shade }: { x: number; y: number; size?: number; leaf: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <ellipse cx="0" cy="10" rx="11" ry="3.5" fill="#000" opacity="0.12" />
      <g className="journey-tree" style={{ animationDelay: `${(x % 5) * -0.5}s` }}>
        <rect x="-2.5" y="0" width="5" height="10" fill="#7a4e2c" />
        <path d="M 0 -40 L 14 -14 L -14 -14 Z" fill={leaf} />
        <path d="M 0 -28 L 17 2 L -17 2 Z" fill={leaf} />
        <path d="M 0 -40 L 14 -14 L 0 -14 Z M 0 -28 L 17 2 L 0 2 Z" fill={shade} />
      </g>
    </g>
  );
}

function Cloud({ x, y, scale = 1, opacity, slow = false }: { x: number; y: number; scale?: number; opacity: number; slow?: boolean }) {
  return (
    <g className={`journey-cloud ${slow ? "journey-cloud-slow" : ""}`} opacity={opacity}>
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <ellipse cx="0" cy="6" rx="46" ry="12" fill="#ffffff" />
        <circle cx="-18" cy="0" r="16" fill="#ffffff" />
        <circle cx="6" cy="-8" r="22" fill="#ffffff" />
        <circle cx="28" cy="2" r="14" fill="#ffffff" />
        <ellipse cx="0" cy="12" rx="40" ry="5" fill="#dbe7f5" opacity="0.8" />
      </g>
    </g>
  );
}

/** A brick school with a waving flag, near the start of the road. */
function School({ x, y, window }: { x: number; y: number; window: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="16" rx="58" ry="6" fill="#000" opacity="0.12" />
      <line x1="30" y1="-70" x2="30" y2="-34" stroke="#5b5b66" strokeWidth="2.5" />
      <path className="journey-flag" d="M 30 -70 L 50 -64 L 30 -58 Z" fill="#ffc93c" />
      <path d="M -52 -30 L 0 -56 L 52 -30 Z" fill="#b8473a" />
      <path d="M 0 -56 L 52 -30 L 0 -30 Z" fill="#9e3b30" />
      <rect x="-46" y="-30" width="92" height="46" fill="#e98a5f" />
      <rect x="0" y="-30" width="46" height="46" fill="#d77a52" />
      <rect x="-9" y="-4" width="18" height="20" rx="2" fill="#5b3b2c" />
      {[-36, -24, 14, 26].map((wx) => (
        <rect key={wx} className="journey-window" x={wx} y="-22" width="9" height="10" rx="1.5" fill={window} />
      ))}
    </g>
  );
}

/** A university hall with columns and a blue dome. */
function University({ x, y, window }: { x: number; y: number; window: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="16" rx="66" ry="6" fill="#000" opacity="0.12" />
      <path d="M -22 -58 a 22 22 0 0 1 44 0 Z" fill="#3b82c4" />
      <path d="M 0 -80 a 22 22 0 0 1 22 22 L 0 -58 Z" fill="#2f6ea8" />
      <rect x="-3" y="-90" width="6" height="12" fill="#ffc93c" />
      <path d="M -62 -38 L 0 -60 L 62 -38 Z" fill="#1d3685" />
      <rect x="-56" y="-38" width="112" height="10" fill="#e9edf7" />
      <rect x="-56" y="-28" width="112" height="44" fill="#f6f8fc" />
      <rect x="10" y="-28" width="46" height="44" fill="#e5e9f3" />
      {[-46, -27, -8, 11, 30].map((cx) => (
        <rect key={cx} x={cx} y="-26" width="10" height="40" fill="#d7dded" />
      ))}
      <rect x="-7" y="-2" width="14" height="18" fill={window} className="journey-window" />
    </g>
  );
}

/** A city skyline with lit windows: where the career happens. */
function City({ x, y, window }: { x: number; y: number; window: string }) {
  const towers = [
    { dx: -64, w: 30, h: 74, face: "#f08a3c", side: "#d9762e" },
    { dx: -32, w: 36, h: 120, face: "#2563eb", side: "#1d4fc4" },
    { dx: 6, w: 28, h: 92, face: "#14a37f", side: "#0f8c6c" },
    { dx: 36, w: 30, h: 62, face: "#e5484d", side: "#c93b40" },
  ];

  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="12" rx="76" ry="6" fill="#000" opacity="0.12" />
      {towers.map((tower) => (
        <g key={tower.dx}>
          <rect x={tower.dx} y={-tower.h} width={tower.w} height={tower.h + 10} fill={tower.face} />
          <rect x={tower.dx + tower.w * 0.62} y={-tower.h} width={tower.w * 0.38} height={tower.h + 10} fill={tower.side} />
          {Array.from({ length: Math.floor(tower.h / 16) }).map((_, row) => (
            <g key={row}>
              <rect className="journey-window" style={{ animationDelay: `${((tower.dx + row * 7) % 5) * 0.7}s` }} x={tower.dx + 5} y={-tower.h + 7 + row * 16} width="6" height="7" rx="1" fill={window} />
              <rect className="journey-window" style={{ animationDelay: `${((tower.dx + row * 3) % 4) * 0.9 + 0.4}s` }} x={tower.dx + tower.w * 0.38} y={-tower.h + 7 + row * 16} width="6" height="7" rx="1" fill={window} />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function Birds({ still, color }: { still: boolean; color: string }) {
  if (still) {
    return null;
  }

  return (
    <>
      {[
        { path: "M -40 80 C 200 40, 500 100, 1040 50", dur: "16s", begin: "0s" },
        { path: "M -40 104 C 300 70, 650 120, 1040 80", dur: "21s", begin: "-7s" },
      ].map((bird, index) => (
        <g key={index}>
          <g className="journey-bird">
            <path d="M -8 0 Q -4 -5 0 0 Q 4 -5 8 0" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          </g>
          <animateMotion path={bird.path} dur={bird.dur} begin={bird.begin} repeatCount="indefinite" />
        </g>
      ))}
    </>
  );
}

const STARS = [
  [120, 30], [210, 70], [300, 22], [380, 60], [470, 34], [540, 82], [630, 26], [720, 64], [790, 20], [880, 44], [960, 76], [40, 96], [255, 110], [600, 112],
];

/**
 * The scene behind the road: a sky that follows the time of day, distant
 * mountains, layered hills with the school, university and city, trees and
 * a flowery meadow. Back layers shift a little with the mouse (parallax).
 */
function Landscape({ still, period }: { still: boolean; period: Period }) {
  const id = useId().replace(/:/g, "");
  const colors = PALETTES[period];
  const night = period === "night";

  return (
    <g>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.skyTop} />
          <stop offset="70%" stopColor={colors.skyBottom} />
        </linearGradient>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0%" stopColor={colors.glow} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`mist-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.skyBottom} stopOpacity="0" />
          <stop offset="100%" stopColor={colors.skyBottom} stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1000" height="340" fill={`url(#sky-${id})`} />

      {night &&
        STARS.map(([sx, sy], index) => (
          <circle key={index} className="journey-star" style={{ animationDelay: `${(index % 5) * 0.6}s` }} cx={sx} cy={sy} r={index % 3 ? 1.6 : 2.4} fill="#ffffff" />
        ))}

      {/* Sun or moon, with a soft glow. */}
      <g className="journey-layer" style={{ ["--depth" as string]: "2px" }}>
        <circle cx="120" cy={colors.orbY} r="70" fill={`url(#glow-${id})`} />
        <circle className="journey-sun" cx="120" cy={colors.orbY} r={night ? 20 : 26} fill={colors.orb} />
        {night && <circle cx="129" cy={colors.orbY - 6} r="18" fill={colors.skyTop} opacity="0.9" />}
      </g>

      <g className="journey-layer" style={{ ["--depth" as string]: "6px" }}>
        <Cloud x={300} y={62} opacity={colors.cloud} />
        <Cloud x={600} y={42} scale={0.8} opacity={colors.cloud} slow />
        <Cloud x={840} y={74} scale={0.9} opacity={colors.cloud} />
      </g>
      <Birds still={still} color={night ? "#c9d6ff" : "#3a4a66"} />

      {/* Distant mountains with snowy peaks, softened by mist. */}
      <g className="journey-layer" style={{ ["--depth" as string]: "5px" }}>
        <path d="M -20 170 L 90 96 L 170 150 L 270 84 L 380 160 L 470 110 L 560 166 L 660 92 L 760 158 L 860 104 L 1020 170 L 1020 220 L -20 220 Z" fill={colors.mountain} />
        <path d="M 90 96 L 108 108 L 96 114 L 80 104 Z M 270 84 L 292 100 L 276 106 L 258 94 Z M 660 92 L 680 106 L 664 112 L 648 102 Z M 860 104 L 878 116 L 864 120 L 850 112 Z" fill={colors.snow} />
        <rect x="-20" y="96" width="1040" height="124" fill={`url(#mist-${id})`} />
      </g>

      {/* Back hills with the school, university and city on them. */}
      <g className="journey-layer" style={{ ["--depth" as string]: "10px" }}>
        <path d="M -20 176 Q 160 128 330 166 T 660 158 T 1020 150 L 1020 340 L -20 340 Z" fill={colors.hillBack} />
        <School x={175} y={164} window={colors.window} />
        <University x={700} y={156} window={colors.window} />
        <City x={905} y={160} window={colors.window} />
        <PineTree x={300} y={168} size={0.8} leaf={colors.leaf} shade={colors.leafShade} />
        <RoundTree x={460} y={164} size={0.85} leaf={colors.leaf} shade={colors.leafShade} />
        <PineTree x={790} y={160} size={0.75} leaf={colors.leaf} shade={colors.leafShade} />
        <PineTree x={812} y={166} size={0.6} leaf={colors.leaf} shade={colors.leafShade} />
      </g>

      {/* The meadow the road runs across, with flowers. */}
      <path d="M -20 206 Q 250 178 500 200 T 1020 192 L 1020 340 L -20 340 Z" fill={colors.hillMid} />
      <path d="M -20 250 Q 260 226 520 248 T 1020 238 L 1020 340 L -20 340 Z" fill={colors.meadow} />
      <path d="M -20 300 Q 300 284 600 300 T 1020 296 L 1020 340 L -20 340 Z" fill={colors.meadowShade} />
      {(
        [
          [130, 300, "#ffd54a"], [190, 322, "#ffffff"], [330, 316, "#ff8fa3"], [420, 296, "#ffd54a"], [560, 322, "#ffffff"],
          [640, 304, "#ff8fa3"], [760, 318, "#ffd54a"], [820, 300, "#ffffff"], [920, 322, "#ff8fa3"], [60, 320, "#ffffff"],
        ] as [number, number, string][]
      ).map(([fx, fy, tone], index) => (
        <g key={index} opacity={night ? 0.5 : 1}>
          <circle cx={fx} cy={fy} r="3.2" fill={tone} />
          <circle cx={fx} cy={fy} r="1.2" fill="#f4a51c" />
        </g>
      ))}
      <RoundTree x={600} y={300} leaf={colors.leaf} shade={colors.leafShade} />
      <PineTree x={150} y={316} size={0.9} leaf={colors.leaf} shade={colors.leafShade} />
      <RoundTree x={960} y={302} leaf={colors.leaf} shade={colors.leafShade} />
      <RoundTree x={470} y={322} size={0.8} leaf={colors.leaf} shade={colors.leafShade} />
    </g>
  );
}

/** A little school bus, facing right; it rides along the road. */
function Bus() {
  return (
    <g className="journey-bus">
      {/* Parked just behind the point it's driving to, on the road. */}
      <g transform="translate(-66 -20)">
        <ellipse cx="24" cy="31" rx="26" ry="4" fill="#000" opacity="0.2" />
        <rect x="0" y="4" width="48" height="22" rx="6" fill="#ffc93c" />
        <rect x="0" y="16" width="48" height="10" rx="3" fill="#f2b11e" />
        <rect x="38" y="8" width="8" height="8" rx="1.5" fill="#cfe9ff" />
        {[5, 16, 27].map((wx) => (
          <rect key={wx} x={wx} y="8" width="8" height="7" rx="1.5" fill="#cfe9ff" />
        ))}
        <rect x="0" y="18" width="48" height="2.5" fill="#3a3a44" />
        <circle cx="11" cy="27" r="5" fill="#2a2a32" />
        <circle cx="37" cy="27" r="5" fill="#2a2a32" />
        <circle cx="11" cy="27" r="1.8" fill="#bfc3cc" />
        <circle cx="37" cy="27" r="1.8" fill="#bfc3cc" />
      </g>
    </g>
  );
}

/** Their career path as a road through a little world: grades, a college, the goal, and "You are here". */
export function CareerJourney({ journey }: { journey: HomeJourney }) {
  const still = useReducedMotion();
  const period = usePeriod();
  const frame = useRef<HTMLDivElement>(null);
  const gradeIndex = GRADES.indexOf(journey.grade);
  const here = gradeIndex === -1 ? 0 : gradeIndex;
  const college = journey.college;

  const stations: Station[] = [
    ...GRADES.map((grade, index) => ({
      key: grade,
      title: grade.replace(" grade", ""),
      subtitle: index < here ? "Done" : index === here ? "Now" : index === here + 1 ? "Next" : "",
      tone: "#2563eb",
    })),
    {
      key: "college",
      // Only a college the student chose; otherwise it stays general.
      title: college ? college.name.replace("University of ", "U. of ").replace(" University", "") : "University",
      subtitle: [journey.major, college?.chance != null ? `${college.chance}% est. chance` : ""].filter(Boolean).join(" · ") || "Your major goes here",
      tone: "#e5484d",
    },
    {
      key: "goal",
      title: journey.goal || "Your career",
      subtitle: journey.goal ? "Your goal" : "Set a goal",
      tone: "#f5a623",
    },
  ];

  const points = X.map((x, index) => [x, Y[index]] as [number, number]);
  const done = curve(points.slice(0, here + 1));
  const ahead = curve(points.slice(here));
  const road = curve(points);
  const [pinX, pinY] = points[here];
  const night = period === "night";

  // Parallax: the back layers drift a little toward the mouse.
  function onMove(event: MouseEvent<HTMLDivElement>) {
    if (still || !frame.current) {
      return;
    }

    const box = frame.current.getBoundingClientRect();
    frame.current.style.setProperty("--mx", String(((event.clientX - box.left) / box.width - 0.5) * 2));
  }

  return (
    <section aria-labelledby="journey-title" className="relative overflow-hidden rounded-[var(--radius-hero)] bg-white p-5 shadow-[var(--shadow-raised)] sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">Your career path</p>
          <h2 id="journey-title" className="font-display text-2xl font-semibold text-ink">
            {journey.goal ? `On the road to ${journey.goal}` : "Your road ahead"}
          </h2>
        </div>
        <Link href="/plan" className="text-sm font-semibold text-primary hover:underline">
          See the whole path
        </Link>
      </div>

      {/* Phones: the scene as a banner, then the road top to bottom. */}
      <svg viewBox="0 30 1000 290" className="journey mt-4 w-full overflow-hidden rounded-2xl sm:hidden" aria-hidden>
        <Landscape still={still} period={period} />
      </svg>
      <ol className="journey mt-4 space-y-0 rounded-2xl bg-[#eef8ea] p-4 sm:hidden">
        {stations.map((station, index) => {
          const passed = index < here;
          const current = index === here;

          return (
            <li key={station.key} className="journey-station relative flex gap-3 pb-5 last:pb-0" style={{ animationDelay: `${0.12 * index}s` }}>
              {index < stations.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-[10px] top-7 h-full w-2.5 rounded-full ${index < here ? "bg-[#4a4d57]" : "bg-[repeating-linear-gradient(to_bottom,#4a4d57_0_8px,#8d909a_8px_14px)]"}`}
                />
              )}
              <span
                aria-hidden
                className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-xs ${
                  passed || current ? "text-white" : "bg-white"
                } ${current ? "ring-4 ring-primary/25" : ""}`}
                style={{ background: passed || current ? station.tone : undefined, boxShadow: `0 0 0 2px ${station.tone}` }}
              >
                {passed ? "✓" : index === 4 ? "🎓" : index === 5 ? "⭐" : ""}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {station.title}
                  {current && <span className="journey-pin rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">You are here</span>}
                </p>
                {station.subtitle && <p className="text-xs text-ink-muted">{station.subtitle}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <div ref={frame} onMouseMove={onMove} className="mt-4 hidden overflow-hidden rounded-2xl sm:block">
        {/* Remounted when motion is known, so the bus's drive starts from the beginning. */}
        <svg
          key={still ? "still" : "moving"}
          viewBox="0 0 1000 340"
          className="journey block w-full"
          role="img"
          aria-label={`Career path: you are in ${journey.grade || "high school"}; next ${stations[here + 1]?.title ?? "college"}, then ${stations[5].title}.`}
        >
          <Landscape still={still} period={period} />

          {/* The road: a soft shadow, white edge lines, asphalt, then the markings. */}
          <path d={road} transform="translate(0 6)" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="34" strokeLinecap="round" />
          <path d={road} fill="none" stroke="#f4f4f6" strokeWidth="34" strokeLinecap="round" />
          <path d={road} fill="none" stroke="#4a4d57" strokeWidth="28" strokeLinecap="round" />
          <path d={ahead} className="journey-ahead" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="3" strokeLinecap="round" />
          {here > 0 && <path d={done} pathLength={1} className="journey-done" fill="none" stroke="#ffc93c" strokeWidth="5" strokeLinecap="round" />}

          {stations.map((station, index) => {
            const [x, y] = points[index];
            const passed = index < here;
            const current = index === here;

            return (
              <g key={station.key} className="journey-station" style={{ animationDelay: `${0.15 * index}s` }}>
                {current && <circle cx={x} cy={y} r="26" className="journey-pulse" fill={station.tone} opacity="0.3" />}
                <circle cx={x} cy={y + 3} r={index >= 4 ? 19 : 15} fill="#000" opacity="0.2" />
                <circle cx={x} cy={y} r={index >= 4 ? 18 : 14} fill={passed || current ? station.tone : "#ffffff"} stroke="#ffffff" strokeWidth="4" />
                {!(passed || current) && <circle cx={x} cy={y} r={index >= 4 ? 13 : 9} fill="none" stroke={station.tone} strokeWidth="3" />}
                {index === 4 && <text x={x} y={y + 5} textAnchor="middle" fontSize="14">🎓</text>}
                {index === 5 && <text x={x} y={y + 5} textAnchor="middle" fontSize="14">⭐</text>}
                {passed && index < 4 && <path d={`M ${x - 5} ${y} l 4 4 l 7 -8`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
                <text
                  x={x}
                  y={y + 44}
                  textAnchor="middle"
                  className="journey-label"
                  fontSize={index >= 4 ? 19 : 20}
                  fontWeight="700"
                  fill={night ? "#ffffff" : "#17171c"}
                  stroke={night ? "#17171c" : "#ffffff"}
                  strokeWidth="5"
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {station.title.length > 20 ? `${station.title.slice(0, 19)}…` : station.title}
                </text>
                {station.subtitle && (
                  <text
                    x={x}
                    y={y + 64}
                    textAnchor="middle"
                    fontSize="15"
                    fontWeight="600"
                    fill={night ? "#e6ebf7" : "#17171c"}
                    stroke={night ? "#17171c" : "#ffffff"}
                    strokeWidth="4"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {station.subtitle.length > 30 ? `${station.subtitle.slice(0, 29)}…` : station.subtitle}
                  </text>
                )}
              </g>
            );
          })}

          {/* The goal sparkles. */}
          <g className="journey-sparkle" style={{ transformOrigin: `${points[5][0]}px ${points[5][1]}px` }}>
            <circle cx={points[5][0]} cy={points[5][1]} r="30" fill="none" stroke="#ffc93c" strokeWidth="4" strokeDasharray="6 10" strokeLinecap="round" />
          </g>

          {/* The bus drives from 9th grade to where they are now, then waits. */}
          {still || here === 0 ? (
            <g transform={`translate(${pinX} ${pinY})`}>
              <Bus />
            </g>
          ) : (
            <g>
              <Bus />
              <animateMotion path={done} dur="2.6s" begin="0.4s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />
            </g>
          )}

          {/* "You are here" pin. */}
          <g className="journey-pin" style={{ transformOrigin: `${pinX}px ${pinY}px` }}>
            <g transform={`translate(${pinX} ${pinY - 20})`}>
              <ellipse cx="0" cy="18" rx="8" ry="3" fill="#000" opacity="0.2" />
              <path d="M 0 0 C -16 -18, -16 -38, 0 -42 C 16 -38, 16 -18, 0 0 Z" fill="#e5484d" />
              <path d="M 0 0 C 16 -18, 16 -38, 0 -42 Z" fill="#c93b40" />
              <circle cx="0" cy="-28" r="6" fill="#fff" />
              <g transform="translate(0 -62)">
                <rect x="-62" y="-20" width="124" height="30" rx="15" fill="#17171c" />
                <text x="0" y="1" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
                  You are here
                </text>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
}
