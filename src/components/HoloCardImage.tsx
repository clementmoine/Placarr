"use client";

import { useCallback, useRef, useState } from "react";

import { holoShader, type HoloShader } from "@/core/render/holoShaders";
import { cn } from "@/lib/shared/utils";

type HoloCardImageProps = {
  /** Artwork to show. Already the foil printing when the provider has one. */
  imageUrl: string;
  alt: string;
  /**
   * Alpha map of where the holographic effect applies, white where it does.
   * Without it the effect is skipped entirely rather than smeared over the whole
   * card — a uniform shimmer looks like a bug, not like foil.
   */
  maskUrl?: string | null;
  /** Second, independent layer (varnish). Composited the same way. */
  varnishMaskUrl?: string | null;
  /**
   * How the artwork fills its box. `contain` by default: a card is meant to be
   * seen whole, and covering cut the printed border off on both the hero and the
   * fullscreen view.
   *
   * Whatever it is, the masks use the same value — they only line up with the
   * artwork if they are letterboxed exactly like it.
   */
  fit?: "cover" | "contain";
  /**
   * Which look to draw. Comes from the print's own finish, so an Enchanted card
   * does not shimmer like a common one. Defaults to the everyday foil.
   */
  shader?: HoloShader;
  className?: string;
  children?: React.ReactNode;
};

function objectFitClass(fit: "cover" | "contain"): string {
  return fit === "contain" ? "object-contain" : "object-cover";
}

/**
 * The varnish coat. Independent of the foil look: a card can be Enchanted *and*
 * high-gloss, and the gloss looks the same either way.
 */
const VARNISH_SWEEP =
  "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.75) 45%, rgba(255,236,180,0.9) 50%, rgba(255,255,255,0.75) 55%, transparent 80%)";
const VARNISH_SCALE = "200% 200%";
const VARNISH_FILTER = "brightness(0.7) contrast(1.6)";
const VARNISH_OPACITY = { idle: 0.25, active: 0.4 } as const;

/** What a masked layer paints: the rainbow sweep, the varnish, or the facets. */
type HoloLayerKind = "foil" | "varnish" | "grain";

/** Rest position: gradients centred, card flat. */
const NEUTRAL = { x: 50, y: 50, tiltX: 0, tiltY: 0 } as const;

/**
 * The sparkle in the foil itself.
 *
 * Generated as inline SVG turbulence rather than shipped as an image: it costs
 * no request, and it stays sharp at any card size, where a bitmap would either
 * blur on the fullscreen view or be wastefully large for a thumbnail.
 *
 * A smooth rainbow reads as printed plastic. Real foil is a field of tiny
 * facets, and it is the facets catching the light — not the sweep — that says
 * "this one is special" at a glance.
 */
const GRAIN_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='1' intercept='-0.233'/%3E%3CfeFuncG type='linear' slope='1' intercept='-0.233'/%3E%3CfeFuncB type='linear' slope='1' intercept='-0.233'/%3E%3CfeFuncA type='linear' slope='0' intercept='1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E\")";

/**
 * How far the sparkle slides against the print as the card leans, as a share of
 * the pointer's travel.
 *
 * This is the realism cue. Glitter fixed to the artwork reads as a printed
 * pattern; shifting it a little turns it into facets sitting *above* the ink,
 * catching the light from a new angle. Small on purpose — past a few percent it
 * stops looking like depth and starts looking like a texture sliding around.
 */
const GRAIN_PARALLAX = 0.14;

/**
 * How far the card leans at the edges, in degrees. Generous enough to read as
 * holding a card rather than as a hover state.
 */
const MAX_TILT = 18;

/**
 * A card that catches the light as you move over it.
 *
 * Reproduces the layering of [poke-holo](https://poke-holo.simey.me/): a
 * rainbow sweep and a glare, both following the pointer, confined to where the
 * print is actually foil.
 *
 * The confinement is the whole trick, and it is why this needs a mask rather
 * than a filter. Ravensburger publishes one per card — 3078 of 3154 French
 * prints — as a **JPEG**, which has no alpha channel, so `mask-image` would see
 * an opaque rectangle and mask nothing. Instead the rainbow is multiplied by the
 * mask (black leaves it untouched, white lets it through) and the result is
 * color-dodged onto the artwork. Both blend modes are far better supported than
 * luminance masking.
 *
 * Pointer position rides CSS custom properties so moving the mouse never
 * re-renders React.
 */
export function HoloCardImage({
  imageUrl,
  alt,
  maskUrl,
  varnishMaskUrl,
  fit = "contain",
  shader = holoShader(null),
  className,
  children,
}: HoloCardImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(false);

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    const clamp = (value: number) => Math.min(100, Math.max(0, value));

    frame.style.setProperty("--holo-x", `${clamp(x)}%`);
    frame.style.setProperty("--holo-y", `${clamp(y)}%`);
    // Lean away from the pointer, the way a card tips under a finger.
    frame.style.setProperty(
      "--holo-tilt-x",
      `${((clamp(y) - 50) / 50) * -MAX_TILT}deg`,
    );
    frame.style.setProperty(
      "--holo-tilt-y",
      `${((clamp(x) - 50) / 50) * MAX_TILT}deg`,
    );
  }, []);

  const reset = useCallback(() => {
    const frame = frameRef.current;
    setIsActive(false);
    if (!frame) return;
    frame.style.setProperty("--holo-x", `${NEUTRAL.x}%`);
    frame.style.setProperty("--holo-y", `${NEUTRAL.y}%`);
    frame.style.setProperty("--holo-tilt-x", `${NEUTRAL.tiltX}deg`);
    frame.style.setProperty("--holo-tilt-y", `${NEUTRAL.tiltY}deg`);
  }, []);

  /** No mask, no effect — better a plain card than a uniformly shiny one. */
  if (!maskUrl) {
    return (
      <div className={cn("relative h-full w-full", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className={cn("h-full w-full", objectFitClass(fit))}
        />
        {children}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      onPointerMove={(event) => {
        setIsActive(true);
        applyPointer(event.clientX, event.clientY);
      }}
      onPointerLeave={reset}
      onPointerCancel={reset}
      className={cn(
        // `rounded-[inherit]` only chains if every level passes the radius down.
        "relative h-full w-full rounded-[inherit] [perspective:1000px]",
        "[--holo-x:50%] [--holo-y:50%] [--holo-tilt-x:0deg] [--holo-tilt-y:0deg]",
        className,
      )}
    >
      <div
        /**
         * Rotation set inline rather than through an arbitrary Tailwind class:
         * `transform-gpu` also writes `transform`, and it won — the card never
         * leaned at all, it only looked like it might. Inline also beats the
         * idle keyframes, so the pointer takes over cleanly and the animation
         * resumes the moment it leaves.
         */
        style={
          isActive
            ? {
                transform:
                  "rotateX(var(--holo-tilt-x)) rotateY(var(--holo-tilt-y))",
                willChange: "transform",
              }
            : undefined
        }
        className={cn(
          // Clipping belongs to the element that rotates, with the container's
          // own radius: left on an ancestor, a leaning card gets its corners
          // sliced off flat instead of turning.
          "relative h-full w-full overflow-hidden rounded-[inherit]",
          isActive
            ? "transition-transform duration-200 ease-out"
            : // Breathing on its own, so a foil copy reads as special before
              // anyone touches it. The pointer takes over on hover.
              "holo-idle-tilt",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className={cn("h-full w-full", objectFitClass(fit))}
        />

        <HoloLayer
          maskUrl={maskUrl}
          isActive={isActive}
          fit={fit}
          shader={shader}
        />
        {/*
          The facets get their own masked layer rather than riding on the sweep.
          Blended onto that deliberately dark gradient they did nothing —
          `overlay` barely moves a dark base — so the grain was invisible at any
          amplitude. Dodged straight onto the artwork, like the sweep itself, it
          reads as light catching the foil.
        */}
        <HoloLayer
          maskUrl={maskUrl}
          isActive={isActive}
          fit={fit}
          shader={shader}
          kind="grain"
        />
        {varnishMaskUrl && (
          <HoloLayer
            maskUrl={varnishMaskUrl}
            isActive={isActive}
            fit={fit}
            shader={shader}
            kind="varnish"
          />
        )}

        {/* Glare rides on top of everything, unmasked: light falls on the whole card. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 mix-blend-overlay transition-opacity duration-300",
            // No idle animation here: the drift moves `background-position`,
            // which does nothing to a radial gradient placed with `at`.
            isActive ? "opacity-35" : "opacity-15",
          )}
          style={{
            background:
              "radial-gradient(farthest-corner circle at var(--holo-x) var(--holo-y), rgba(255,255,255,0.8) 5%, rgba(255,255,255,0.15) 30%, rgba(0,0,0,0.4) 100%)",
          }}
        />

        {children}
      </div>
    </div>
  );
}

/**
 * One masked shimmer. `isolate` keeps the multiply inside this stacking context,
 * so only the masked result reaches the artwork below through `color-dodge`.
 */
function HoloLayer({
  maskUrl,
  isActive,
  fit,
  shader,
  kind = "foil",
}: {
  maskUrl: string;
  isActive: boolean;
  fit: "cover" | "contain";
  shader: HoloShader;
  kind?: HoloLayerKind;
}) {
  const varnish = kind === "varnish";
  const grain = kind === "grain";
  // The varnish is a second, smoother coat over whatever the foil is doing, so
  // it keeps its own restrained strength rather than following the look.
  const strength = varnish
    ? VARNISH_OPACITY
    : grain
      ? shader.grainOpacity
      : shader.sweepOpacity;
  return (
    <div
      aria-hidden
      // Inline, not a utility class: the shader supplies a number, and this
      // component has twice been bitten by a class losing to something else.
      style={{ opacity: isActive ? strength.active : strength.idle }}
      className="pointer-events-none absolute inset-0 isolate mix-blend-color-dodge transition-opacity duration-300"
    >
      <div
        className={cn(
          "absolute inset-0",
          // The facets belong to the print, so they hold still while the sweep
          // drifts across them. Animating both made the whole surface crawl.
          !isActive && !grain && "holo-idle-sheen",
        )}
        style={{
          /**
           * Darkened and contrasted before dodging. Straight from the gradient,
           * `color-dodge` blows any light area of the artwork to flat white and
           * the rainbow disappears — the effect reads as "brightened" instead of
           * "holographic".
           */
          filter: grain
            ? // Darker and harder than the sweep. Dodge turns the bright facets
              // into pinpricks of light and leaves the dark ones alone, which is
              // what separates glitter from a uniform haze.
              "brightness(0.4) contrast(2.8)"
            : varnish
              ? VARNISH_FILTER
              : shader.sweepFilter,
          backgroundImage: grain
            ? GRAIN_TEXTURE
            : varnish
              ? VARNISH_SWEEP
              : shader.sweep,
          backgroundSize: grain
            ? shader.grainScale
            : varnish
              ? VARNISH_SCALE
              : shader.sweepScale,
          /**
           * Only while the pointer drives it. An inline value beats a keyframe,
           * so setting this unconditionally pinned the gradient dead centre and
           * `holo-drift` never moved anything — the idle card looked plain.
           */
          ...(isActive
            ? {
                backgroundPosition: grain
                  ? // Parallax, not a sweep: the facets slide a little against
                    // the ink so they read as sitting above it.
                    `calc(var(--holo-x) * ${GRAIN_PARALLAX}) calc(var(--holo-y) * ${GRAIN_PARALLAX})`
                  : "var(--holo-x) var(--holo-y)",
              }
            : {}),
        }}
      />

      {/* Multiply against the mask: black keeps the artwork, white lets light in. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={maskUrl}
        alt=""
        className={cn(
          "absolute inset-0 h-full w-full mix-blend-multiply",
          // Same fit as the artwork, or the mask lands off the foil areas.
          objectFitClass(fit),
        )}
      />
    </div>
  );
}
