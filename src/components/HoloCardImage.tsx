"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  holoLayerStyle,
  maskedByStyle,
  type HoloTuning,
  holoShader,
  NEUTRAL_VARNISH_COLOR,
  varnishShader as varnishShaderFor,
  type HoloShader,
} from "@/core/render/holoShaders";
import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { useMaskBlob } from "@/lib/client/hooks/useMaskBlob";
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
   * Push the look along the publisher's own axes. Absent means the transcribed
   * recipe exactly — see `HoloTuning`. Only the playroom passes this.
   */
  tuning?: HoloTuning;
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
  tuning,
  tilt = true,
  trackPointer = tilt,
  className,
  children,
}: HoloCardImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  /**
   * The artwork's own proportions, learned when it loads.
   *
   * The caller's frame is an *approximation* of the card shape (5:7, say),
   * while the scan is the card's true ratio — Lorcana's run 1468x2048. With
   * `object-contain` the art paints a few pixels short of the frame, but the
   * effect layers used to stretch to the frame itself: on a 313px-tall hero the
   * foil hung 6px past the artwork and the mask was stretched 2% against it.
   * The layers must cover the *painted art*, so everything below sits in a
   * surface box of exactly this ratio, centred in the frame.
   */
  const [artRatio, setArtRatio] = useState<string | null>(null);
  // Reset during render when the artwork changes, never in an effect —
  // the React Compiler's "adjust state when props change" pattern.
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (prevImageUrl !== imageUrl) {
    setPrevImageUrl(imageUrl);
    setArtRatio(null);
  }

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

  /*
   * The masks, as resources already in memory.
   *
   * iOS does not apply a mask whose image has not loaded when the style is
   * resolved, and never invalidates afterwards — so naming a URL here is not
   * enough. Until a mask is in memory its layer must not be drawn at all: an
   * unresolved mask is not a faint layer, it is an unmasked one over the whole
   * card. See `maskBlobStore`.
   */
  const foilMask = useMaskBlob(maskUrl);
  const varnishMask = useMaskBlob(varnishMaskUrl);
  const secondVarnishMask = useMaskBlob(secondVarnishMaskUrl);
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
  // Plain until the foil mask is in memory, then foil. Drawing the layers
  // against a mask that has not loaded is what covered the whole card on iOS.
  if (!maskUrl || !foilMask) {
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
        {/*
          The surface box: the painted artwork, exactly. Width-driven with the
          height capped — the spec transfers the cap back through the ratio, so
          this is `object-contain` as a box the layers can share. Until the
          ratio is known (or when the art covers), it simply fills the frame.
        */}
        <div className="relative flex h-full w-full items-center justify-center">
          <div
            className="relative"
            style={
              fit === "contain" && artRatio
                ? { aspectRatio: artRatio, width: "100%", maxHeight: "100%" }
                : { width: "100%", height: "100%" }
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={alt}
              /**
               * Dragging the artwork hands the pointer to the browser's own
               * drag, which stops `pointermove` — the card freezes mid-lean
               * with its light stuck wherever the drag began.
               */
              draggable={false}
              onLoad={(event) => {
                const art = event.currentTarget;
                if (art.naturalWidth && art.naturalHeight) {
                  setArtRatio(`${art.naturalWidth} / ${art.naturalHeight}`);
                }
              }}
              className={cn("h-full w-full", objectFitClass(fit))}
            />

            <div
              aria-hidden
              style={{
                ...holoLayerStyle(shader, tuning),
                ...maskedByStyle(foilMask),
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
                  ...holoLayerStyle(holoShader(shader.overlay), tuning),
                  ...maskedByStyle(foilMask),
                }}
                className="pointer-events-none absolute inset-0"
              />
            )}

            {varnishMask && (
              <div
                aria-hidden
                style={{
                  ...holoLayerStyle(varnishShader, tuning),
                  ...maskedByStyle(varnishMask),
                }}
                className="pointer-events-none absolute inset-0"
              />
            )}

            {secondVarnishMask && (
              <div
                aria-hidden
                style={{
                  ...holoLayerStyle(varnishShader, tuning),
                  // The second coat sweeps its own hue, which is why the recipes
                  // keep `--topcolor2` apart from `--topcolor`.
                  backgroundImage: holoLayerStyle(
                    varnishShader,
                  ).backgroundImage?.replaceAll(
                    "var(--topcolor)",
                    "var(--topcolor2)",
                  ),
                  ...maskedByStyle(secondVarnishMask),
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
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
