"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

import {
  holoLayerStyle,
  maskedByStyle,
  type HoloTuning,
  holoShader,
  NEUTRAL_VARNISH_COLOR,
  type HoloShader,
  FOIL_POINTER_GLARE_STYLE,
  FOIL_PLATE_GLARE_STYLE,
  FOIL_POINTER_LIGHT_MASK,
} from "@/core/render/holoShaders";
import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import { applyFoilPointerCss } from "@/core/render/foil/pointerCss";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { useFoilIdleLean } from "@/lib/client/hooks/useFoilIdleLean";
import { useFoilPointerSpring } from "@/lib/client/hooks/useFoilPointerSpring";
import { useMaskBlob } from "@/lib/client/hooks/useMaskBlob";
import { useInvertedPaintBlob } from "@/lib/client/hooks/useInvertedPaintBlob";
import { cn } from "@/lib/shared/utils";
import { foilFaceReady, holoCssIdleEnabled } from "@/components/foilFaceReady";

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
   * The foil *plate*, intersected with {@link maskUrl} on the finish layer.
   *
   * Coverage says where a card is foiled; the plate says what the foil draws.
   * On the Live gold prints the visible texture is a near-flat slab and the
   * illustration exists only on the plate — masked by coverage alone the
   * shimmer floods the card and the picture never appears.
   */
  foilPlateUrl?: string | null;
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
  /** Which look to draw. Null when the pack has no CSS recipe for this finish. */
  shader?: HoloShader | null;
  /** How to draw the varnish coat. Null when the pack has no CSS varnish recipe. */
  varnishShader?: HoloShader | null;
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
  /**
   * Simey `--card-glow` (Radiant spotlight colour). Written once on the frame
   * so pointerCss does not overwrite with the generic cyan default.
   */
  cardGlow?: string | null;
  /** Fired when the artwork finishes loading (for letterbox edge bleed, etc.). */
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  className?: string;
  children?: React.ReactNode;
};

function objectFitClass(fit: "cover" | "contain"): string {
  return fit === "contain" ? "object-contain" : "object-cover";
}

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
  foilPlateUrl,
  varnishMaskUrl,
  secondVarnishMaskUrl,
  secondVarnishColor,
  fit = "contain",
  shader = null,
  varnishShader = null,
  varnishColor,
  tuning,
  tilt = true,
  trackPointer = tilt,
  cardGlow = null,
  onLoad,
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
  const [artReady, setArtReady] = useState(false);
  // Reset during render when the artwork changes, never in an effect —
  // the React Compiler's "adjust state when props change" pattern.
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (prevImageUrl !== imageUrl) {
    setPrevImageUrl(imageUrl);
    setArtRatio(null);
    setArtReady(false);
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
  const isRadiantCss = shader?.id === "radiantHolo";
  const isUltraGoldCss =
    shader?.id === "ultraGoldRainbow" || shader?.id === "ultraScodix";
  const isSwSecretCss = shader?.id === "swSecret";
  /** Catalogue leftover — same full-card / raw-etch rules as SwSecret. */
  const isSecretRareCss = shader?.id === "secretRare";
  const isLiveGoldCss =
    isUltraGoldCss || isSwSecretCss || isSecretRareCss;
  /**
   * Radiant CSS = Live etch invert + lattice unmasked.
   *
   * Ultra Gold / Scodix / SwSecret: **full-card**. Live white-plate greys the
   * figure as a CSS mask. Etch paint = raw Live plate (not Radiant invert).
   */
  const liveWpMaskUrl = isRadiantCss || isLiveGoldCss ? null : maskUrl;

  /**
   * Live `_CardEtch` → light-on-black RGB for Radiant.
   * Ultra Gold / secret paints the raw plate (see polarity note above).
   */
  const foilEtchPaint = useInvertedPaintBlob(
    isRadiantCss ? varnishMaskUrl : null,
  );
  /** Ultra Gold etch fingerprint — same-origin Live etch URL (no invert). */
  const goldEtchPaint =
    isLiveGoldCss && varnishMaskUrl ? varnishMaskUrl : null;
  const etchCssPaint = isLiveGoldCss ? goldEtchPaint : foilEtchPaint;
  /**
   * Inverted etch as Safari foil mask: `useMaskBlob` writes luma→alpha on the
   * already-inverted plate, so etch lines (now bright) become coverage.
   */
  const radiantEtchMask = useMaskBlob(
    isRadiantCss ? foilEtchPaint : null,
    "foil",
  );

  const deviceLean = useDeviceTilt(
    MAX_TILT,
    trackPointer &&
      Boolean(
        liveWpMaskUrl ||
          ((isRadiantCss || isLiveGoldCss) && varnishMaskUrl) ||
          (!isRadiantCss && !isLiveGoldCss && maskUrl),
      ),
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
  const foilMask = useMaskBlob(liveWpMaskUrl, "foil");
  const foilPlate = useMaskBlob(
    isRadiantCss || isLiveGoldCss ? null : foilPlateUrl,
    "foil",
  );
  const varnishMask = useMaskBlob(varnishMaskUrl, "varnish");
  const secondVarnishMask = useMaskBlob(secondVarnishMaskUrl, "varnish");
  /** Radiant: invert(etch). Ultra Gold: none (full-card). Else: white-plate. */
  const shineMask = isRadiantCss ? radiantEtchMask : foilMask;

  /**
   * Parent frames paint the pack/set card back behind us. Until art + every
   * mask we will wear is in memory, keep the face invisible so layers never
   * pop in one by one (plain art → foil → varnish).
   */
  const wantsFoil = Boolean(
    (shader || varnishShader) &&
      (isLiveGoldCss ||
        liveWpMaskUrl ||
        (isRadiantCss && varnishMaskUrl) ||
        (!isRadiantCss && maskUrl)),
  );
  const faceReady = foilFaceReady({
    artReady,
    wantsFoil,
    maskUrl: isRadiantCss ? foilEtchPaint : liveWpMaskUrl,
    foilMask: shineMask,
    // Ultra Gold paints etch via `--foil-etch`, not the house varnish layer.
    varnishMaskUrl: isRadiantCss || isLiveGoldCss ? null : varnishMaskUrl,
    varnishMask,
    secondVarnishMaskUrl,
    secondVarnishMask,
  });
  const faceReadyForPaint = faceReady;

  const noteArtLoaded = useCallback(
    (art: HTMLImageElement, event?: SyntheticEvent<HTMLImageElement>) => {
      if (art.naturalWidth && art.naturalHeight) {
        setArtRatio(`${art.naturalWidth} / ${art.naturalHeight}`);
      }
      setArtReady(true);
      if (event) onLoad?.(event);
    },
    [onLoad],
  );

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
  const place = useCallback(
    (
      lean: Lean,
      glare: number,
      combined?: number,
      mode: "pointer" | "idle" = "pointer",
    ) => {
      const frame = frameRef.current;
      if (!frame) return;
      // Idle may pass a travelling `--combined` (not lightX+lightY). Motif
      // scroll + soft idle glare share the same lean as pointer mode.
      applyFoilPointerCss(frame, lean, glare, combined, mode);
    },
    [],
  );

  const { setTarget: springTo, snap: springSnap } = useFoilPointerSpring(place);

  const placeIdle = useCallback(
    (lean: Lean, glare: number, combined: number) => {
      // Keep spring state aligned with idle so engaging the pointer does not jump.
      springSnap(lean, glare);
      place(lean, glare, combined, "idle");
    },
    [place, springSnap],
  );

  const idleEnabled = holoCssIdleEnabled({
    hasFinish: Boolean(shader || varnishShader),
    isDriven,
    fullCardFinish: isLiveGoldCss,
    shineMask,
  });
  const { noteLean } = useFoilIdleLean(
    isDriven || !idleEnabled,
    MAX_TILT,
    placeIdle,
  );

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const lean = leanFromPointer(
        ((clientX - rect.left) / rect.width) * 100,
        ((clientY - rect.top) / rect.height) * 100,
        MAX_TILT,
      );
      noteLean(lean, 0.66);
      springTo(lean, 0.66);
    },
    [springTo, noteLean],
  );

  const reset = useCallback(() => {
    setIsActive(false);
    // Idle hook eases from the last noted pose — do not snap to neutral.
  }, []);

  // The sensor drives the same properties the pointer does, so the two never
  // disagree — and the pointer wins while it is actually on the card, because a
  // mouse user tilting their laptop is not making a gesture.
  useEffect(() => {
    if (!deviceLean || isActive) return;
    // The same shape the pointer produces, so the two inputs cannot disagree
    // about which way the card turns.
    noteLean(deviceLean, 0.4);
    springTo(deviceLean, 0.4);
  }, [deviceLean, isActive, springTo, noteLean]);

  if (!faceReadyForPaint) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "relative h-full w-full select-none overflow-hidden rounded-[inherit]",
          className,
        )}
      >
        {/* Preload art (and masks via hooks) while the parent card-back shows. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          draggable={false}
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && !artReady) {
              noteArtLoaded(img);
            }
          }}
          onLoad={(event) => noteArtLoaded(event.currentTarget, event)}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    );
  }

  /** No mask / no CSS recipe — better a plain card than a guessed sheen. */
  // Packs without a CSS recipe (null shaders) stay plain even when a mask URL
  // exists — core must not invent a TCG default look.
  if (!wantsFoil) {
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
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && !artReady) {
              noteArtLoaded(img);
            }
          }}
          onLoad={(event) => noteArtLoaded(event.currentTarget, event)}
          className={cn("h-full w-full rounded-[inherit]", objectFitClass(fit))}
        />
        {children}
      </div>
    );
  }

  const overlayLooks: HoloShader[] = [];
  {
    // Radiant (and any multi-pass look) chains `overlay` → `overlay`…
    // (simey shine → :after → :before). Cap depth so a cycle cannot hang.
    const seen = new Set<string>();
    let nextId = shader?.overlay;
    while (nextId && !seen.has(nextId) && overlayLooks.length < 4) {
      seen.add(nextId);
      const look = holoShader(nextId);
      if (!look) break;
      overlayLooks.push(look);
      nextId = look.overlay;
    }
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
          /**
           * Static stamps only. Pointer / idle write `--colorX` etc. on the DOM
           * node directly; putting those in React `style` re-clobber them to
           * rest values on every parent render and freezes the sheen.
           *
           * The print's own stamped hue. Absent for all but 83 prints, and the
           * publisher falls back to this same neutral grey rather than to a
           * colour — checked on a HighGloss card, which resolves `#aaa`.
           */
          "--topcolor": varnishColor ?? NEUTRAL_VARNISH_COLOR,
          "--topcolor2": secondVarnishColor ?? NEUTRAL_VARNISH_COLOR,
          ...(cardGlow ? { "--card-glow": cardGlow } : {}),
          /*
            Per-print Live `_CardEtch` as simey's `--foil` paint (same locale as
            the face — FR/DE/…, never an EN-only Simey scan). Invert polarity
            once so the coat can keep upstream's stack: foil on top of the
            pastel rainbow, `hard-light`, one `color-dodge`.
          */
          ...(etchCssPaint
            ? { "--foil-etch": `url("${etchCssPaint}")` }
            : {}),
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
          "relative h-full w-full rounded-[inherit]",
          tilt && isDriven && "transition-transform duration-200 ease-out",
        )}
      >
        {/*
          Radius + overflow must be *inside* the tilt transform. Same-node
          `transform` + `overflow:hidden` + `border-radius` fails to clip
          (sharp corners). `clip-path` survives 3d / compositor quirks better.
        */}
        <div className="relative isolate h-full w-full overflow-hidden rounded-[inherit]">
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
                onLoad={(event) => noteArtLoaded(event.currentTarget, event)}
                className={cn("h-full w-full", objectFitClass(fit))}
              />

              {/*
                Radiant paint order (Live etch has no lozenge bake):
                  coat → lattice → sparkle
                Simey DOM is shine(lattice) → :after(coat) → :before(sparkle),
                but their mask/foil bake the crosshatch into the coat. Our coat
                is fingerprint-only; stacking lattice under it color-dodges the
                diamonds away. Lattice stays unmasked; coat/sparkle use etch.
              */}
              {isRadiantCss &&
                overlayLooks
                  .filter((look) => look.id === "radiantHoloCoat")
                  .map((overlayLook) => (
                    <div
                      key={overlayLook.id}
                      aria-hidden
                      style={{
                        ...holoLayerStyle(overlayLook, tuning),
                        ...maskedByStyle([
                          shineMask,
                          foilPlate,
                          overlayLook.carve,
                          overlayLook.pointerFalloff === false
                            ? null
                            : FOIL_POINTER_LIGHT_MASK,
                        ]),
                      }}
                      className="pointer-events-none absolute inset-0"
                    />
                  ))}

              {shader && (
                <div
                  aria-hidden
                  style={{
                    ...holoLayerStyle(shader, tuning),
                    // A look's own stencil intersects the print's masks: see
                    // `HoloShader.carve`. Pointer light falloff (simey) last.
                    //
                    // Radiant lattice (±45° lozenges) must NOT wear Live etch as
                    // a mask: Simey's mask bakes the crosshatch; ours is fingerprint
                    // waves only — masking the shine wiped the diamonds.
                    ...maskedByStyle([
                      isRadiantCss ? null : shineMask,
                      foilPlate,
                      shader.carve,
                      shader.pointerFalloff === false
                        ? null
                        : FOIL_POINTER_LIGHT_MASK,
                    ]),
                  }}
                  className="pointer-events-none absolute inset-0"
                />
              )}

              {/*
          Extra coats some finishes ship with, drawn above the finish through
          the same mask. Overlay ids may chain (Radiant: coat → sparkle) so a
          look can use more than one mix-blend-mode — simey’s shine/:after/:before.
          Radiant coat is rendered above (under the lattice); only sparkle here.
          Ultra Gold etch layer is full-card (no white-plate mask).
          Overlay `carve` (e.g. SunPillar CastAndCure Northern Cross) must apply
          here — coats carry the stencil, not the base shine.
        */}
              {overlayLooks
                .filter((look) => !(isRadiantCss && look.id === "radiantHoloCoat"))
                .map((overlayLook) => (
                <div
                  key={overlayLook.id}
                  aria-hidden
                  style={{
                    ...holoLayerStyle(overlayLook, tuning),
                    ...maskedByStyle([
                      shineMask,
                      foilPlate,
                      overlayLook.carve,
                      overlayLook.pointerFalloff === false
                        ? null
                        : FOIL_POINTER_LIGHT_MASK,
                    ]),
                  }}
                  className="pointer-events-none absolute inset-0"
                />
              ))}

              {varnishMask && varnishShader && (
                <div
                  aria-hidden
                  style={{
                    ...holoLayerStyle(varnishShader, tuning),
                    ...maskedByStyle(varnishMask),
                  }}
                  className="pointer-events-none absolute inset-0"
                />
              )}

              {secondVarnishMask && varnishShader && (
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

              {/*
                Glare rides on top of everything, unmasked: light falls on the
                whole card. Finish-specific overrides match poke-holo
                (`radiant-holo.css`, `secret-rare.css`); others keep base overlay.
              */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                style={
                  shader?.id === "radiantHolo"
                    ? {
                        backgroundImage:
                          "radial-gradient(farthest-corner circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), hsla(0, 0%, 100%, 0.33) 0%, hsl(0, 0%, 25%) 110%)",
                        backgroundSize: "cover",
                        backgroundRepeat: "no-repeat",
                        mixBlendMode: "hard-light",
                        filter: "brightness(1) contrast(1.5)",
                        opacity: "var(--opacity)",
                      }
                    : isLiveGoldCss
                      ? {
                          // Cooler / dimmer hard-light — Live gold/secret fields
                          // already warm. Full-card (no white-plate).
                          backgroundImage:
                            "radial-gradient(farthest-corner circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), hsla(48, 4%, 62%, 0.2) 0%, hsl(28, 8%, 11%) 180%)",
                          backgroundSize: "cover",
                          backgroundRepeat: "no-repeat",
                          mixBlendMode: "hard-light",
                          filter: "brightness(1.05) contrast(1.35)",
                          opacity: "var(--opacity)",
                        }
                      : {
                          ...FOIL_POINTER_GLARE_STYLE,
                          mixBlendMode: "overlay",
                          opacity: "var(--opacity)",
                        }
                }
              />

              {/*
                Second glare (simey `.card__glare2`): white wash through the
                foil plate only — softens specular where the plate draws.
              */}
              {foilPlate && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                  style={{
                    ...FOIL_PLATE_GLARE_STYLE,
                    ...maskedByStyle(foilPlate),
                    // Quieter than the full-card glare — simey's glare2 is a
                    // soft foil wash, not a second specular lobe.
                    opacity: "calc(var(--opacity) * 0.55)",
                  }}
                />
              )}
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
