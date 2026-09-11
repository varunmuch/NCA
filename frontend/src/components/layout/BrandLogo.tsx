"use client";

import { useState } from "react";

type BrandLogoVariant =
  | "horizontal"
  | "shield";

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  size?: "sm" | "md" | "lg" | "xl";
  light?: boolean;
  showText?: boolean;
};

export function BrandLogo({
  variant = "horizontal",
  size = "md",
  light = false,
  showText = true,
}: BrandLogoProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const logoSrc =
    variant === "shield"
      ? "/brand/neocity-knight-mark.png"
      : "/brand/neocity-academy-logo.png";

  const imageClass =
    variant === "shield"
      ? getShieldSize(size)
      : getHorizontalSize(size);

  if (logoFailed) {
    return (
      <div className="flex items-center gap-3">
        <div
          className={[
            "flex items-center justify-center rounded-xl font-bold tracking-tight",
            size === "xl"
              ? "text-3xl"
              : size === "lg"
                ? "text-2xl"
                : size === "sm"
                  ? "text-base"
                  : "text-xl",
            light ? "text-white" : "text-teal-700",
          ].join(" ")}
        >
          NCA
        </div>

        {showText && (
          <BrandText
            light={light}
            compact={size === "sm"}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <img
        src={logoSrc}
        alt={
          variant === "shield"
            ? "NeoCity Academy knight shield logo"
            : "NeoCity Academy logo"
        }
        className={[
          "shrink-0 object-contain",
          imageClass,
        ].join(" ")}
        onError={() => setLogoFailed(true)}
      />

      {showText && (
        <BrandText
          light={light}
          compact={size === "sm"}
        />
      )}
    </div>
  );
}

function BrandText({
  light,
  compact,
}: {
  light: boolean;
  compact: boolean;
}) {
  return (
    <div>
      <p
        className={[
          "font-semibold uppercase tracking-[0.18em]",
          compact ? "text-[10px]" : "text-xs",
          light ? "text-teal-50" : "text-teal-700",
        ].join(" ")}
      >
        NeoCity Academy
      </p>

      <p
        className={[
          "font-bold leading-5",
          compact ? "text-xs" : "text-sm",
          light ? "text-white" : "text-slate-950",
        ].join(" ")}
      >
        Career Intelligence Engine
      </p>
    </div>
  );
}

function getHorizontalSize(size: "sm" | "md" | "lg" | "xl") {
  if (size === "xl") {
    return "h-16 w-auto max-w-[220px]";
  }

  if (size === "lg") {
    return "h-14 w-auto max-w-[190px]";
  }

  if (size === "sm") {
    return "h-10 w-auto max-w-[140px]";
  }

  return "h-12 w-auto max-w-[170px]";
}

function getShieldSize(size: "sm" | "md" | "lg" | "xl") {
  if (size === "xl") {
    return "h-24 w-24";
  }

  if (size === "lg") {
    return "h-20 w-20";
  }

  if (size === "sm") {
    return "h-12 w-12";
  }

  return "h-16 w-16";
}
