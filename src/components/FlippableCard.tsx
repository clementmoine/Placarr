"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  cardFaceClipPath,
  cardFaceRadius,
  OrientedMediaRotator,
} from "@/components/OrientedMediaFrame";
import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { useFoilIdleLean } from "@/lib/client/hooks/useFoilIdleLean";
import { cn } from "@/lib/shared/utils";

type FlippableCardProps = {
  /** The card itself — usually a `HoloCardImage`, effects and all. */
  children: React.ReactNode;
  /** Where the back lives, if one was resolved (print / set / pack). */
  backUrl?: string | null;
  backAlt: string;
  /** Announced on the control, so this component stays free of locale plumbing. */
  flipLabel: string;
  /** Label for the control that asks iOS for the motion sensor. Same reason. */
  tiltPromptLabel: string;
  /**
   * Quarter-turns the *face* is displayed at (Location / BREAK). The back turns
   * with it — see the back face below.
   */
  faceQuarterTurns?: number | null;
  /** Oriented aspect of the frame (after the swap), e.g. `7 / 5`. */
  orientedAspect?: string;
  /** Optional Face tab label — shown with {@link backTabLabel} when a back exists. */
  faceTabLabel?: string;
  /** Optional Dos tab label — shown with {@link faceTabLabel} when a back exists. */
  backTabLabel?: string;
  className?: string;
};

/**
 * How far the card leans at the edges, in degrees. The same figure the front
 * uses on its own, so wrapping a card does not change how it handles.
 */
const MAX_TILT = 18;

/**
 * Where the card ends up after being pushed from one side.
 *
 * The turn accumulates rather than toggling. Toggling sends the card back the
 * way it came on a second click, which reads as it refusing the push; adding
 * keeps it spinning the way it was shoved, the way a real card would.
 *
 * A positive `rotateY` carries the right edge away from the viewer, so pushing
 * the right half is the positive direction.
 */
export function turnAfterPush(turn: number, fromRightHalf: boolean): number {
  return turn + (fromRightHalf ? 180 : -180);
}

/** Whether that many degrees leaves the back looking at us. */
export function showsBack(turn: number): boolean {
  return Math.abs(turn / 180) % 2 === 1;
}

/** Snap the accumulated turn onto the face (even half-turns). */
export function turnTowardFace(turn: number): number {
  return showsBack(turn) ? turn + 180 : turn;
}

/** Snap the accumulated turn onto the back (odd half-turns). */
export function turnTowardBack(turn: number): number {
  return showsBack(turn) ? turn : turn + 180;
}

/** One of the Face / Dos pills above the card. */
function SideTab({
  label,
  active,
  onSelect,
}: {
  label?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide",
        active
          ? "bg-white text-zinc-900"
          : "bg-white/15 text-white hover:bg-white/25",
      )}
    >
      {label}
    </button>
  );
}

/**
 * A card you can turn over, and tip.
 *
 * Lean wraps a rounded clip, which wraps the 3d flip. Clipping *outside*
 * `preserve-3d` is required: faces (and Location/BREAK 90° rotators) escape
 * overflow/clip-path when they sit inside a 3d scene, so corners go square.
 *
 * Both faces stay mounted through the turn — the front carries the foil
 * layers, and remounting them mid-rotation would restart their animation.
 * `backface-visibility` hides whichever looks away.
 *
 * The lean lives here rather than on the front face, because a card is one
 * object: tipping it has to move the back too, and the back is a sibling of the
 * front rather than inside it. The front keeps its own pointer tracking for the
 * light on its surface — that is the one thing that belongs to the *face*
 * rather than to the card.
 *
 * Both angles ride CSS custom properties, so following the pointer never
 * re-renders React on every move; only the turn itself and the idle↔driven
 * handoff are state.
 *
 * Idle is a fake hover on the shared foil clock (`cos(t)`, same driver as
 * WebGL Time mode) — not a separate breathe keyframe — so the card's lean
 * and the foil sheen agree. Leaving the card eases back into that sweep
 * instead of snapping.
 *
 * On a phone there is no pointer, so the lean comes from the handset's own
 * orientation instead — tilting it is the gesture people already make holding a
 * real card. The pointer wins whenever it is actually on the card: a laptop user
 * tipping their screen is not making a gesture.
 *
 * Without a back it still tips — a card is a physical object whether or not its
 * reverse is known — but it does not turn: a flip onto a placeholder would say
 * less than no flip at all. So the lean is unconditional and only the turn, the
 * cursor and the button role depend on there being a back.
 *
 * **Its parent needs a definite size.** Both faces are laid out absolutely, so
 * nothing is left in flow for a box to derive its width from — an
 * `aspect-ratio` container with no height collapses to nothing.
 */
export function FlippableCard({
  children,
  backUrl,
  backAlt,
  flipLabel,
  tiltPromptLabel,
  faceQuarterTurns = 0,
  orientedAspect,
  faceTabLabel,
  backTabLabel,
  className,
}: FlippableCardProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  /** Total degrees turned, not a boolean — see {@link turnAfterPush}. */
  const [turn, setTurn] = useState(0);
  const flipped = showsBack(turn);
  /**
   * Pointer on the card (state, not a ref): idle clock lean must stop once
   * someone is driving, so React has to know.
   */
  const [pointerActive, setPointerActive] = useState(false);

  /** Push from whichever side was clicked; the keyboard has no side. */
  const push = useCallback((fromRightHalf: boolean) => {
    setTurn((previous) => turnAfterPush(previous, fromRightHalf));
  }, []);

  const deviceTilt = useDeviceTilt(MAX_TILT);
  const deviceLean = deviceTilt.lean;
  /**
   * Whether the pointer currently owns the lean. Kept as a ref too so the
   * device-tilt effect can skip without waiting for a re-render mid-gesture.
   */
  const pointerOwnsLean = useRef(false);
  /** Phone in hand or cursor on the card — either way, idle must not fight. */
  const isDriven = pointerActive || Boolean(deviceLean);

  const applyLean = useCallback((lean: Lean) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--flip-lean-x", `${lean.tiltX}deg`);
    frame.style.setProperty("--flip-lean-y", `${lean.tiltY}deg`);
  }, []);

  const { noteLean } = useFoilIdleLean(isDriven, MAX_TILT, applyLean);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      pointerOwnsLean.current = true;
      setPointerActive(true);
      const lean = leanFromPointer(
        ((clientX - rect.left) / rect.width) * 100,
        ((clientY - rect.top) / rect.height) * 100,
        MAX_TILT,
      );
      noteLean(lean);
      applyLean(lean);
    },
    [applyLean, noteLean],
  );

  const rest = useCallback(() => {
    pointerOwnsLean.current = false;
    setPointerActive(false);
    // Device pose, if any, is applied by the effect below; otherwise the idle
    // hook eases from the last noted lean into the shared sweep.
    if (deviceLean) {
      noteLean(deviceLean);
      applyLean(deviceLean);
    }
  }, [applyLean, deviceLean, noteLean]);

  useEffect(() => {
    if (!deviceLean || pointerOwnsLean.current) return;
    noteLean(deviceLean, 0.4);
    applyLean(deviceLean);
  }, [deviceLean, applyLean, noteLean]);

  const canFlip = Boolean(backUrl);
  const showTabs = Boolean(canFlip && faceTabLabel && backTabLabel);

  return (
    // Tabs sit above the card; this shell must still pass the frame radius
    // down — without `rounded-[inherit]` every face goes square (inherit → 0).
    <div className="relative h-full w-full rounded-[inherit]">
      {showTabs && (
        /*
          Stacked *outside* the card (bottom edge on the card's top edge), never
          as padding on it. Padding here reserved the strip out of the frame's
          own box, so the card no longer had the aspect its parent advertised: a
          90° Location rotator sizes its pre-rotate box from that ratio, came
          out 36px too tall once turned, and the overflow clip shaved its
          corners off — a square-cornered, slightly stretched card. Keeping the
          box untouched leaves the frame exactly the rectangle it was sized to
          be.

          Sibling of the frame rather than a child of it: the frame turns the
          card on click and leans it on pointer move, and neither belongs to a
          tab.
        */
        <div
          className="absolute inset-x-0 z-10 flex justify-center gap-1"
          style={{ bottom: "100%", marginBottom: "0.5rem" }}
          onClick={(event) => event.stopPropagation()}
        >
          <SideTab
            label={faceTabLabel}
            active={!flipped}
            onSelect={() => setTurn(turnTowardFace)}
          />
          <SideTab
            label={backTabLabel}
            active={flipped}
            onSelect={() => setTurn(turnTowardBack)}
          />
        </div>
      )}
      <div
        ref={frameRef}
        role={canFlip ? "button" : undefined}
        tabIndex={canFlip ? 0 : undefined}
        aria-label={canFlip ? flipLabel : undefined}
        aria-pressed={canFlip ? flipped : undefined}
        onClick={
          canFlip
            ? (event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                push(event.clientX >= rect.left + rect.width / 2);
              }
            : undefined
        }
        onKeyDown={
          canFlip
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                push(true);
              }
            : undefined
        }
        onPointerMove={(event) => applyPointer(event.clientX, event.clientY)}
        onPointerLeave={rest}
        onPointerCancel={rest}
        style={
          {
            "--flip-lean-x": "0deg",
            "--flip-lean-y": "0deg",
          } as React.CSSProperties
        }
        className={cn(
          // `rounded-[inherit]` only chains if every level passes the radius down,
          // and this component sits between the card and whatever framed it.
          // `select-none` covers both faces: a click that lands slightly askew
          // reads as a drag, and a drag over the card selects it instead of
          // turning it — the selection wash then hides the very effect.
          "relative h-full w-full select-none rounded-[inherit] outline-none [perspective:1400px]",
          canFlip && "cursor-pointer",
          className,
        )}
      >
        {/*
        Lean → clip → turn. The rounded clip must wrap the 3d flip, not sit
        inside it: under `preserve-3d`, overflow/clip-path on a face stops
        clipping (Location 90° rotator + WebGL canvas go square). Clipping
        *outside* the 3d scene flattens it as a group, so the card keeps its
        radius while leaning and flipping.
      */}
        <div
          className="relative h-full w-full rounded-[inherit]"
          style={{
            transform:
              "rotateX(var(--flip-lean-x)) rotateY(var(--flip-lean-y))",
            willChange: "transform",
          }}
        >
          {/*
            This frame is the *turned* box for a Location, so its radius is
            quoted against it; the face inside is rounded again in its own
            upright space by the rotator.
          */}
          <div
            className="relative h-full w-full overflow-hidden"
            style={{
              borderRadius: cardFaceRadius(faceQuarterTurns),
              clipPath: cardFaceClipPath(faceQuarterTurns),
            }}
          >
            {/*
            The turntable and both faces keep passing the radius down. The clip
            above already cuts the silhouette, but a WebGL face escapes an
            ancestor clip once it is inside this `preserve-3d` scene — it needs
            a rounded box of its own, and `inherit` only reaches it if no level
            in between drops the chain.
          */}
            <div
              className="relative h-full w-full rounded-[inherit] transition-transform duration-500 ease-out [transform-style:preserve-3d]"
              style={{
                transform: `rotateY(${turn}deg)`,
              }}
            >
              <div className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden]">
                {children}
              </div>

              {backUrl && (
                <div
                  className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden] [transform:rotateY(180deg)]"
                  aria-hidden={!flipped}
                >
                  {/*
                  The back turns with the card. A Location is a normal portrait
                  card held sideways, so its back is sideways too — left
                  upright in a landscape frame it read as a portrait back
                  pasted onto a landscape card.

                  Same quarter-turns as the face, and no sign to flip: this
                  sits inside `rotateY(180deg)`, which mirrors x and so renders
                  a CSS `rotate(θ)` on screen as `rotate(-θ)` — exactly what
                  turning a card over its long axis does to its back.
                */}
                  <OrientedMediaRotator
                    faceQuarterTurns={faceQuarterTurns}
                    orientedAspect={orientedAspect}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backUrl}
                      alt={backAlt}
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                  </OrientedMediaRotator>
                </div>
              )}
            </div>
          </div>
        </div>

        {/*
        iOS hands the sensor over only after a tap, and only from a real user
        gesture, so the tilt cannot start on its own there. It lives on the card
        rather than on its face because a plain card tilts too — and because one
        tap has to serve every card on screen, which is what the shared store is
        for.
      */}
        {deviceTilt.needsPermission && (
          <button
            type="button"
            onClick={(event) => {
              // The card's own click turns it over; asking for the sensor is not
              // a request to flip.
              event.stopPropagation();
              deviceTilt.requestPermission();
            }}
            className="absolute bottom-2 right-2 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm"
          >
            {tiltPromptLabel}
          </button>
        )}
      </div>
    </div>
  );
}
