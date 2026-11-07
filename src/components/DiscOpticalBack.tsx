"use client";

import type { CSSProperties } from "react";

import type { OpticalDiscBackRecipe } from "@/core/enrich/media/opticalDisc";
import { cn } from "@/lib/shared/utils";

export type DiscOpticalBackProps = {
  recipe: OpticalDiscBackRecipe;
  className?: string;
};

/**
 * Synthetic optical underside.
 *
 * Mix of:
 * - Bennett Feely `.cd.disc` (CodePen JjGJEmy): hard-stop radial hub/rings +
 *   muted metallic conic (pastel whites/pinks/cyans, not a neon rainbow)
 * - OpenReplay holo notes: OKLCH interpolation + glare-driven custom props
 * - Placarr recipe tint (`--disc-base`) for PS1/PS2/BD dyed polycarbonate
 */
export function DiscOpticalBack({ recipe, className }: DiscOpticalBackProps) {
  const style = {
    "--disc-base": recipe.base,
    "--disc-rainbow": String(recipe.rainbow),
  } as CSSProperties;

  // closest-side: 14% ≈ size-[14%] hub diameter → real see-through hole.
  const hubMask =
    "radial-gradient(circle closest-side, transparent 0 14%, #000 14.5%)";

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden rounded-full",
        className,
      )}
      style={{
        ...style,
        maskImage: hubMask,
        WebkitMaskImage: hubMask,
      }}
      aria-hidden
    >
      {/*
        Bennett Feely stack: radial (hub + stacking rings + rim) over a soft
        metallic conic. Transparent mid-band lets the conic read as data pits.
        `from` tracks glare so pointer lean replaces the original spin.
      */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          backgroundColor: "var(--disc-base)",
          backgroundImage: `
            radial-gradient(
              circle closest-side,
              transparent 0 14%,
              color-mix(in oklch, var(--disc-base) 35%, black) 0 15.5%,
              color-mix(in oklch, white 55%, var(--disc-base)) 0 22%,
              color-mix(in oklch, var(--disc-base) 70%, black) 0 23%,
              color-mix(in oklch, white 50%, var(--disc-base)) 0 27%,
              color-mix(in oklch, var(--disc-base) 65%, black) 0 28%,
              color-mix(in oklch, white 45%, var(--disc-base)) 0 34%,
              color-mix(in oklch, var(--disc-base) 40%, black) 0 38%,
              transparent 0 100%
            ),
            conic-gradient(
              from calc(var(--disc-glare-nx, 50) * 3.6deg) in oklch,
              oklch(0.97 0.01 100),
              oklch(0.93 0.04 330),
              oklch(0.94 0.05 85),
              oklch(0.95 0.06 105),
              oklch(0.82 0.01 100),
              oklch(0.62 0.01 100),
              oklch(0.48 0.03 350),
              oklch(0.42 0.08 330),
              oklch(0.45 0.14 265),
              oklch(0.72 0.12 210),
              oklch(0.78 0.1 155),
              oklch(0.86 0.01 100),
              oklch(0.97 0.005 100),
              oklch(0.98 0.01 100),
              oklch(0.94 0.04 145),
              oklch(0.88 0.08 180),
              oklch(0.78 0.08 250),
              oklch(0.68 0.03 300),
              oklch(0.58 0.01 100),
              oklch(0.52 0.01 100),
              oklch(0.88 0.14 105),
              oklch(0.82 0.08 20),
              oklch(0.88 0.01 100),
              oklch(0.97 0.01 100)
            )`,
        }}
      />

      {/* Recipe dye wash — keeps PS2 blue / PS1 black / BD dark readable */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `
            radial-gradient(
              circle closest-side,
              transparent 38%,
              color-mix(in oklch, var(--disc-base) 40%, transparent) 72%,
              color-mix(in oklch, var(--disc-base) 50%, transparent) 100%
            )`,
          mixBlendMode: "multiply",
          opacity: 0.4,
          maskImage:
            "radial-gradient(circle closest-side, transparent 38%, black 42%)",
          WebkitMaskImage:
            "radial-gradient(circle closest-side, transparent 38%, black 42%)",
        }}
      />

      {/* OpenReplay-style linear shimmer locked to glare */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `
            linear-gradient(
              calc(var(--disc-glare-nx, 50) * 1.8deg + 40deg) in oklch,
              transparent 18%,
              oklch(0.85 0.08 200 / 0.35) 42%,
              oklch(0.88 0.1 320 / 0.3) 55%,
              transparent 78%
            )`,
          mixBlendMode: "soft-light",
          opacity: `calc(var(--disc-rainbow) * 0.85)`,
          maskImage:
            "radial-gradient(circle closest-side, transparent 38%, black 42%)",
          WebkitMaskImage:
            "radial-gradient(circle closest-side, transparent 38%, black 42%)",
        }}
      />

      {/* Fine pit grain over the data band — out to the rim */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `
            repeating-radial-gradient(
              circle at 50% 50%,
              color-mix(in oklch, white 10%, transparent) 0 0.35px,
              transparent 0.35px 1.55px
            )`,
          opacity: 0.4,
          mixBlendMode: "overlay",
          maskImage:
            "radial-gradient(circle closest-side, transparent 38%, black 42%)",
          WebkitMaskImage:
            "radial-gradient(circle closest-side, transparent 38%, black 42%)",
        }}
      />

      {/* Specular hot-spot */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `
            radial-gradient(
              ellipse 34% 22% at var(--disc-glare-x, 38%) var(--disc-glare-y, 32%),
              oklch(1 0.01 100 / 0.55) 0%,
              oklch(0.94 0.03 95 / 0.18) 30%,
              transparent 62%
            )`,
          mixBlendMode: "screen",
        }}
      />

      {/* Thin lip just outside the punched hub */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-[15%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25"
      />

      {/* Rim — white hairline only (no inset dark ring) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow:
            "inset 0 0 0 1px color-mix(in oklch, white 35%, transparent)",
        }}
      />
    </div>
  );
}
