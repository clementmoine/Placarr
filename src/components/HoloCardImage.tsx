"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  holoLayerStyle,
  holoShader,
  varnishShader as varnishShaderFor,
  type HoloShader,
} from "@/core/render/holoShaders";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { cn } from "@/lib/shared/utils";

type HoloCardImageProps = {
  /** Artwork to show. Already the foil printing when the provider has one. */
  imageUrl: string;
  alt: string;
  /**
   * Where the holographic effect applies. Used as a **luminance** mask: the
   * publisher ships it as a JPEG with no alpha channel, so a CSS `mask-image`
   * would see an opaque rectangle and mask nothing. Routed through an SVG
   * `<mask>`, which reads luminance by default, it works exactly as published.
   *
   * Without one the effect is skipped entirely rather than smeared over the
   * whole card — a uniform shimmer looks like a bug, not like foil.
   */
  maskUrl?: string | null;
  /** Second, independent coat: the stamped varnish. */
  varnishMaskUrl?: string | null;
  /**
   * How the artwork fills its box. `contain` by default: a card is meant to be
   * seen whole, and covering cut the printed border off.
   */
  fit?: "cover" | "contain";
  /** Which look to draw. Comes from the print's own finish. */
  shader?: HoloShader;
  /** How to draw the varnish coat. Its own axis, with its own names. */
  varnishShader?: HoloShader;
  /**
   * The hue a stamped varnish throws. Feeds `--topcolor`, which the varnish
   * recipes sweep across the card.
   */
  varnishColor?: string;
  /**
   * Label for the control that asks iOS for the motion sensor. Passed in rather
   * than translated here so this component stays free of the locale plumbing.
   */
  tiltPromptLabel?: string;
  className?: string;
  children?: React.ReactNode;
};

function objectFitClass(fit: "cover" | "contain"): string {
  return fit === "contain" ? "object-contain" : "object-cover";
}

/** Rest position: light centred, card flat, glare off. */
const NEUTRAL = { x: 50, y: 50 } as const;

/**
 * How far the card leans at the edges, in degrees. Generous enough to read as
 * holding a card rather than as a hover state.
 */
const MAX_TILT = 18;

/**
 * A card that catches the light as you move over it, or as you tilt the phone.
 *
 * The looks themselves live in `core/render/holoShaders`, transcribed from the
 * publisher's own viewer. This file only places the light: it writes the custom
 * properties those recipes are expressed against, and confines every layer to
 * where the print is actually foil.
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
  varnishShader = varnishShaderFor(null),
  varnishColor = "#5ff0ff",
  tiltPromptLabel = "Incliner",
  className,
  children,
}: HoloCardImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const foilMaskId = `holoFoil${instanceId}`;
  const varnishMaskId = `holoVarnish${instanceId}`;

  /**
   * On a touch screen there is no pointer to follow, so the card sat perfectly
   * still — an effect that exists to be played with could not be. Tilting the
   * phone is the gesture people already make holding a real card.
   */
  const deviceTilt = useDeviceTilt(MAX_TILT, Boolean(maskUrl));
  const deviceLean = deviceTilt.lean;
  /** Pointer on the card, or phone in the hand: either way the light is placed. */
  const isDriven = isActive || Boolean(deviceLean);

  /** The whole contract the recipes are written against. */
  const place = useCallback(
    (x: number, y: number, tiltX: number, tiltY: number, glare: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      frame.style.setProperty("--colorX", `${x}%`);
      frame.style.setProperty("--colorY", `${y}%`);
      // The recipes lean on the sum as a single travelling coordinate.
      frame.style.setProperty("--combined", `${x + y}%`);
      frame.style.setProperty("--rotateX", `${tiltY}deg`);
      frame.style.setProperty("--rotateY", `${tiltX}deg`);
      frame.style.setProperty("--opacity", `${glare}`);
    },
    [],
  );

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const clamp = (value: number) => Math.min(100, Math.max(0, value));
      const x = clamp(((clientX - rect.left) / rect.width) * 100);
      const y = clamp(((clientY - rect.top) / rect.height) * 100);
      // Lean away from the pointer, the way a card tips under a finger.
      place(
        x,
        y,
        ((x - 50) / 50) * MAX_TILT,
        ((y - 50) / 50) * -MAX_TILT,
        0.66,
      );
    },
    [place],
  );

  const reset = useCallback(() => {
    setIsActive(false);
    place(NEUTRAL.x, NEUTRAL.y, 0, 0, 0);
  }, [place]);

  // The sensor drives the same properties the pointer does, so the two never
  // disagree — and the pointer wins while it is actually on the card, because a
  // mouse user tilting their laptop is not making a gesture.
  useEffect(() => {
    if (!deviceLean || isActive) return;
    place(
      deviceLean.lightX,
      deviceLean.lightY,
      deviceLean.tiltY,
      deviceLean.tiltX,
      0.4,
    );
  }, [deviceLean, isActive, place]);

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
      style={
        {
          "--colorX": "50%",
          "--colorY": "50%",
          "--combined": "100%",
          "--rotateX": "0deg",
          "--rotateY": "0deg",
          "--opacity": "0",
          "--topcolor": varnishColor,
        } as React.CSSProperties
      }
      className={cn(
        // `rounded-[inherit]` only chains if every level passes the radius down.
        "relative h-full w-full rounded-[inherit] [perspective:900px]",
        className,
      )}
    >
      {/*
        An SVG `<mask>` reads luminance, which is what makes the published JPEG
        usable at all — as a CSS `mask-image` it would be an opaque rectangle.
      */}
      <svg aria-hidden className="absolute size-0" focusable="false">
        <mask
          id={foilMaskId}
          maskUnits="objectBoundingBox"
          maskContentUnits="objectBoundingBox"
        >
          <image
            href={maskUrl}
            width="1"
            height="1"
            preserveAspectRatio="none"
          />
        </mask>
        {varnishMaskUrl && (
          <mask
            id={varnishMaskId}
            maskUnits="objectBoundingBox"
            maskContentUnits="objectBoundingBox"
          >
            {/*
              The varnish mask is a normal map, not a coverage mask: red and
              green are pinned near 127/128 and only blue says where anything is
              stamped. The filter pulls blue into all three channels so the
              luminance mask means what it should.
            */}
            <image
              href={varnishMaskUrl}
              width="1"
              height="1"
              preserveAspectRatio="none"
              filter="url(#holo-varnish-coverage)"
            />
          </mask>
        )}
      </svg>

      <div
        /**
         * Rotation set inline rather than through an arbitrary Tailwind class:
         * `transform-gpu` also writes `transform`, and it won — the card never
         * leaned at all, it only looked like it might.
         */
        style={{
          transform: "rotateX(var(--rotateY)) rotateY(var(--rotateX))",
          willChange: "transform",
        }}
        className={cn(
          // Clipping belongs to the element that rotates, with the container's
          // own radius: left on an ancestor, a leaning card gets its corners
          // sliced off flat instead of turning.
          "relative isolate h-full w-full overflow-hidden rounded-[inherit]",
          isDriven
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

        <div
          aria-hidden
          style={{
            ...holoLayerStyle(shader),
            mask: `url(#${foilMaskId})`,
            WebkitMask: `url(#${foilMaskId})`,
          }}
          className={cn(
            "pointer-events-none absolute inset-0",
            !isDriven && "holo-idle-sheen",
          )}
        />

        {varnishMaskUrl && (
          <div
            aria-hidden
            style={{
              ...holoLayerStyle(varnishShader),
              mask: `url(#${varnishMaskId})`,
              WebkitMask: `url(#${varnishMaskId})`,
            }}
            className="pointer-events-none absolute inset-0"
          />
        )}

        {/* Glare rides on top of everything, unmasked: light falls on the whole card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-overlay transition-opacity duration-300"
          style={{
            backgroundImage:
              "radial-gradient(farthest-corner circle at var(--colorX) var(--colorY), rgba(255,255,255,0.8) 10%, rgba(255,255,255,0.65) 20%, rgba(0,0,0,0.5) 90%)",
            backgroundSize: "100%",
            opacity: "var(--opacity)",
          }}
        />

        {children}
      </div>

      {/*
        iOS hands the sensor over only after a tap, and only from a real user
        gesture, so the tilt cannot start on its own there. One unobtrusive
        control, shown solely on the platform that asks for it.
      */}
      {deviceTilt.needsPermission && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deviceTilt.requestPermission();
          }}
          className="absolute bottom-2 right-2 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm"
        >
          {tiltPromptLabel}
        </button>
      )}
    </div>
  );
}
