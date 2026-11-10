import { FlaskConical, Code, Palette, Rocket, Stethoscope, Wrench } from "lucide-react";
import type { CSSProperties } from "react";

const FACES = [Code, Palette, Stethoscope, Wrench, Rocket, FlaskConical];

type Orbit = { gap: string; speed: string; lean: string; planets: { size: string; c1: string; c2: string; delay: string }[] };

const ORBITS: Orbit[] = [
  {
    gap: "2%",
    speed: "14s",
    lean: "-14deg",
    planets: [
      { size: "20px", c1: "#f0564a", c2: "#f0564a", delay: "0s" },
      { size: "14px", c1: "#ffc93c", c2: "#ffc93c", delay: "-7s" },
    ],
  },
  {
    gap: "14%",
    speed: "9s",
    lean: "18deg",
    planets: [
      { size: "16px", c1: "#14a37f", c2: "#14a37f", delay: "-2s" },
      { size: "12px", c1: "#38a3f5", c2: "#38a3f5", delay: "-6.5s" },
    ],
  },
];

/** Decorative: a turning cube of career icons with planets orbiting it. */
export function CareerScene3D({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`scene-3d ${className}`}>
      <div className="scene-shadow" />
      {ORBITS.map((orbit) => (
        <div key={orbit.gap} className="orbit-3d" style={{ "--lean": orbit.lean } as CSSProperties}>
          <div className="ring" style={{ "--gap": orbit.gap } as CSSProperties} />
          {orbit.planets.map((planet) => (
            <div
              key={planet.c1}
              className="spin"
              style={{ "--gap": orbit.gap, "--speed": orbit.speed, animationDelay: planet.delay } as CSSProperties}
            >
              <span
                className="planet"
                style={
                  {
                    "--size": planet.size,
                    "--c1": planet.c1,
                    "--c2": planet.c2,
                    "--speed": orbit.speed,
                    animationDelay: planet.delay,
                  } as CSSProperties
                }
              />
            </div>
          ))}
        </div>
      ))}
      <div className="float">
        <div className="cube-3d">
          {FACES.map((Icon, index) => (
            <div key={index} className="cube-face">
              <Icon strokeWidth={1.75} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
