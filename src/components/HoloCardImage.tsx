"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  holoLayerStyle,
  maskedByStyle,
  holoShader,
  NEUTRAL_VARNISH_COLOR,
  varnishShader as varnishShaderFor,
  type HoloShader,
} from "@/core/render/holoShaders";
import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { cn } from "@/lib/shared/utils";

type HoloCardImageProps = {
  /** Artwork to show. Already the foil printing when the provider has one. */
  imageUrl: string;
  alt: string;
  /**
   * Where the holographic effect applies, as a **luminance** mask: the publisher
   * ships a JPEG with no alpha channel, so `mask-mode: luminance` is what makes
   * it mean anything — read by alpha it is an opaque rectangle.
   *
   * Without one the effect is skipped entirely rather than smeared over the
   * whole card — a uniform shimmer looks like a bug, not like foil.
   */
  maskUrl?: string | null;
  /**
   * Second, independent coat: the stamped varnish. Already reduced to coverage
   * by the time it arrives — the published file is a normal map where only blue
   * carries the stamp, and that channel is pulled out at download.
   */
  varnishMaskUrl?: string | null;
  /**
   * A second stamped coat, on the prints that carry two. Rare — two in the
   * whole game — but on those it is a layer of the card that is simply absent
   * without it.
   */
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
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
   * The print's own stamped hue, when the provider knows it. Nothing derives
   * it, so the look's own value is only a stand-in for prints the catalogue has
   * nothing to say about.
   */
  varnishColor?: string | null;
  /**
   * Whether the card leans under the pointer.
   *
   * Off in a grid: a wall of tiles each tipping as the cursor crosses them
   * reads as the page squirming, not as cards. The light still drifts on its
   * own — that is what marks the copy as foil — but nothing moves in 3D.
   */
  tilt?: boolean;
  /**
   * Whether the light follows the pointer, independently of whether the card
   * leans. Split apart because a flipped card is leaned by its wrapper — both
   * faces have to turn together — while the light stays this component's job.
   * Defaults to whatever `tilt` says, which is the standalone case.
   */
  trackPointer?: boolean;
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
  secondVarnishMaskUrl,
  secondVarnishColor,
  fit = "contain",
  shader = holoShader(null),
  varnishShader = varnishShaderFor(null),
  varnishColor,
  tilt = true,
  trackPointer = tilt,
  className,
  children,
}: HoloCardImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  /*
   * The masks are worn as plain CSS image masks, stretched to the frame — no
   * SVG, no per-instance ids. The `<mask>` element this used to go through was
   * solving nothing CSS could not: `mask-mode: luminance` is the keyword for
   * reading a JPEG's brightness, and the varnish normal maps have their blue
   * channel pulled out at download instead of by a filter on every frame.
   *
   * It also does not work on iPhone. Safari does not apply an SVG `<mask>`
   * referenced from CSS to an HTML element, so every layer covered the whole
   * card — artwork, text box, borders — while Chrome looked finished.
   *
   * Stretched rather than fitted: the frame is given the card's own shape by its
   * caller, so mask and artwork already agree. If a frame ever has to be a
   * different shape, the fix is to letterbox the *frame*, never the mask.
   */

  /**
   * On a touch screen there is no pointer to follow, so the light on the card
   * sat perfectly still — an effect that exists to be played with could not be.
   *
   * Only the *light* is taken from the sensor here. Leaning the card is
   * `FlippableCard`'s job, because a card is one object and its back has to turn
   * with it; that component also owns the iOS prompt, and the sensor itself is
   * shared, so a tap there starts the readings this reads.
   */
  const deviceLean = useDeviceTilt(
    MAX_TILT,
    trackPointer && Boolean(maskUrl),
  ).lean;
  /** Pointer on the card, or phone in the hand: either way the light is placed. */
  const isDriven = isActive || Boolean(deviceLean);

  /**
   * The whole contract the recipes are written against.
   *
   * `--rotateX` is the amount *driven by* X, and it feeds `rotateY()` — the
   * pairing is crossed, because moving sideways turns a card about its vertical
   * axis. Writing them the other way round is silent: the card still moves, it
   * just leans into the pointer on one axis and away on the other.
   */
  const place = useCallback((lean: Lean, glare: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--colorX", `${lean.lightX}%`);
    frame.style.setProperty("--colorY", `${lean.lightY}%`);
    // The recipes lean on the sum as a single travelling coordinate.
    frame.style.setProperty("--combined", `${lean.lightX + lean.lightY}%`);
    frame.style.setProperty("--rotateX", `${lean.tiltY}deg`);
    frame.style.setProperty("--rotateY", `${lean.tiltX}deg`);
    frame.style.setProperty("--opacity", `${glare}`);
  }, []);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      place(
        leanFromPointer(
          ((clientX - rect.left) / rect.width) * 100,
          ((clientY - rect.top) / rect.height) * 100,
          MAX_TILT,
        ),
        0.66,
      );
    },
    [place],
  );

  const reset = useCallback(() => {
    setIsActive(false);
    place(leanFromPointer(NEUTRAL.x, NEUTRAL.y, MAX_TILT), 0);
  }, [place]);

  // The sensor drives the same properties the pointer does, so the two never
  // disagree — and the pointer wins while it is actually on the card, because a
  // mouse user tilting their laptop is not making a gesture.
  useEffect(() => {
    if (!deviceLean || isActive) return;
    // The same shape the pointer produces, so the two inputs cannot disagree
    // about which way the card turns.
    place(deviceLean, 0.4);
  }, [deviceLean, isActive, place]);

  /** No mask, no effect — better a plain card than a uniformly shiny one. */
  if (!maskUrl) {
    return (
      <div
        /**
         * Carries the frame's radius and clips to it, exactly as the foil branch
         * does. Without this a plain card came out square-cornered wherever its
         * frame relied on the card to clip — which is every card that is not
         * foil, now that they all get the card treatment.
         */
        className={cn(
          "relative h-full w-full select-none overflow-hidden rounded-[inherit]",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          draggable={false}
          className={cn("h-full w-full rounded-[inherit]", objectFitClass(fit))}
        />
        {children}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      onPointerMove={
        trackPointer
          ? (event) => {
              setIsActive(true);
              applyPointer(event.clientX, event.clientY);
            }
          : undefined
      }
      onPointerLeave={trackPointer ? reset : undefined}
      onPointerCancel={trackPointer ? reset : undefined}
      style={
        {
          "--colorX": "50%",
          "--colorY": "50%",
          "--combined": "100%",
          "--rotateX": "0deg",
          "--rotateY": "0deg",
          "--opacity": "0",
          /**
           * The print's own stamped hue. Absent for all but 83 prints, and the
           * publisher falls back to this same neutral grey rather than to a
           * colour — checked on a HighGloss card, which resolves `#aaa`.
           */
          "--topcolor": varnishColor ?? NEUTRAL_VARNISH_COLOR,
          "--topcolor2": secondVarnishColor ?? NEUTRAL_VARNISH_COLOR,
        } as React.CSSProperties
      }
      className={cn(
        // `rounded-[inherit]` only chains if every level passes the radius down.
        // `select-none` because a card is handled, not read: a drag across it
        // paints a selection over the artwork, and that flat blue wash is
        // exactly the sheen this component exists to show.
        "relative h-full w-full select-none rounded-[inherit]",
        // No perspective when nothing leans: it would only cost a layer.
        tilt && "[perspective:900px]",
        // The drift animates this element's own custom properties, which every
        // layer is positioned against, so it belongs here rather than on any
        // one of them.
        !isDriven && "holo-idle-sheen",
        className,
      )}
    >
      {/*
        An SVG `<mask>` reads luminance, which is what makes the published JPEG
        usable at all — as a CSS `mask-image` it would be an opaque rectangle.

        `mask-type` is not decoration. Left off, the CSS side falls back to
        `mask-mode: match-source`, and WebKit resolves that to **alpha** for a
        mask referenced from CSS. These masks are JPEGs, so their alpha is
        opaque everywhere: on iPhone the foil covered the whole card, text box
        and borders included, while Chrome — which resolves `match-source` to
        luminance here — looked correct. The publisher states it explicitly on
        both the element and the CSS property; so do we.

        `<defs>` and the explicit `x`/`y` match the publisher's markup too.
      */}
      <div
        /**
         * Rotation set inline rather than through an arbitrary Tailwind class:
         * `transform-gpu` also writes `transform`, and it won — the card never
         * leaned at all, it only looked like it might.
         */
        style={
          tilt
            ? {
                transform: "rotateX(var(--rotateY)) rotateY(var(--rotateX))",
                willChange: "transform",
              }
            : undefined
        }
        className={cn(
          // Clipping belongs to the element that rotates, with the container's
          // own radius: left on an ancestor, a leaning card gets its corners
          // sliced off flat instead of turning.
          "relative isolate h-full w-full overflow-hidden rounded-[inherit]",
          tilt &&
            (isDriven
              ? "transition-transform duration-200 ease-out"
              : // Breathing on its own, so a foil copy reads as special before
                // anyone touches it. The pointer takes over on hover.
                "holo-idle-tilt"),
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          /**
           * Dragging the artwork hands the pointer to the browser's own drag,
           * which stops `pointermove` — the card freezes mid-lean with its
           * light stuck wherever the drag began.
           */
          draggable={false}
          className={cn("h-full w-full", objectFitClass(fit))}
        />

        <div
          aria-hidden
          style={{
            ...holoLayerStyle(shader),
            ...maskedByStyle(maskUrl),
          }}
          className="pointer-events-none absolute inset-0"
        />

        {/*
          The extra coat some finishes ship with, drawn above the finish and
          through the same mask. A Lore card has five layers, not three, and
          this is where most of its colour comes from — without it the finish
          alone is nearly monochrome.
        */}
        {shader.overlay && (
          <div
            aria-hidden
            style={{
              ...holoLayerStyle(holoShader(shader.overlay)),
              ...maskedByStyle(maskUrl),
            }}
            className="pointer-events-none absolute inset-0"
          />
        )}

        {varnishMaskUrl && (
          <div
            aria-hidden
            style={{
              ...holoLayerStyle(varnishShader),
              ...maskedByStyle(varnishMaskUrl),
            }}
            className="pointer-events-none absolute inset-0"
          />
        )}

        {secondVarnishMaskUrl && (
          <div
            aria-hidden
            style={{
              ...holoLayerStyle(varnishShader),
              // The second coat sweeps its own hue, which is why the recipes
              // keep `--topcolor2` apart from `--topcolor`.
              backgroundImage: holoLayerStyle(
                varnishShader,
              ).backgroundImage?.replaceAll(
                "var(--topcolor)",
                "var(--topcolor2)",
              ),
              ...maskedByStyle(secondVarnishMaskUrl),
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
    </div>
  );
}
