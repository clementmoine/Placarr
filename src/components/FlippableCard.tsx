"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { cn } from "@/lib/shared/utils";

type FlippableCardProps = {
  /** The card itself — usually a `HoloCardImage`, effects and all. */
  children: React.ReactNode;
  /** Where the back lives, if the collection was given one. */
  backUrl?: string | null;
  backAlt: string;
  /** Announced on the control, so this component stays free of locale plumbing. */
  flipLabel: string;
  /** Label for the control that asks iOS for the motion sensor. Same reason. */
  tiltPromptLabel: string;
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

/**
 * A card you can turn over, and tip.
 *
 * Both faces are laid on top of each other and the whole thing is rotated, with
 * `backface-visibility` hiding whichever is looking away. That keeps the front
 * mounted through the turn — it carries the foil layers, and remounting them
 * mid-rotation would restart their animation.
 *
 * The lean lives here rather than on the front face, because a card is one
 * object: tipping it has to move the back too, and the back is a sibling of the
 * front rather than inside it. The front keeps its own pointer tracking for the
 * light on its surface — that is the one thing that belongs to the *face*
 * rather than to the card.
 *
 * Both angles ride CSS custom properties, so following the pointer never
 * re-renders React; only the turn itself is state.
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
  className,
}: FlippableCardProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  /** Total degrees turned, not a boolean — see {@link turnAfterPush}. */
  const [turn, setTurn] = useState(0);
  const flipped = showsBack(turn);

  /** Push from whichever side was clicked; the keyboard has no side. */
  const push = useCallback((fromRightHalf: boolean) => {
    setTurn((previous) => turnAfterPush(previous, fromRightHalf));
  }, []);

  const deviceTilt = useDeviceTilt(MAX_TILT);
  const deviceLean = deviceTilt.lean;
  /**
   * Whether the pointer currently owns the lean. A ref rather than state: this
   * component deliberately does not re-render as the cursor moves, and hovering
   * is not a reason to break that.
   */
  const pointerOwnsLean = useRef(false);

  const applyLean = useCallback((lean: Lean) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--flip-lean-x", `${lean.tiltX}deg`);
    frame.style.setProperty("--flip-lean-y", `${lean.tiltY}deg`);
  }, []);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      pointerOwnsLean.current = true;
      applyLean(
        leanFromPointer(
          ((clientX - rect.left) / rect.width) * 100,
          ((clientY - rect.top) / rect.height) * 100,
          MAX_TILT,
        ),
      );
    },
    [applyLean],
  );

  const rest = useCallback(() => {
    pointerOwnsLean.current = false;
    const frame = frameRef.current;
    if (!frame) return;
    // Back to however the phone is being held, when there is one — flat is only
    // the resting position on a device with no orientation to fall back on.
    if (deviceLean) {
      applyLean(deviceLean);
      return;
    }
    frame.style.setProperty("--flip-lean-x", "0deg");
    frame.style.setProperty("--flip-lean-y", "0deg");
  }, [applyLean, deviceLean]);

  useEffect(() => {
    if (!deviceLean || pointerOwnsLean.current) return;
    applyLean(deviceLean);
  }, [deviceLean, applyLean]);

  const canFlip = Boolean(backUrl);

  return (
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
      <div
        className="relative h-full w-full rounded-[inherit] transition-transform duration-500 ease-out [transform-style:preserve-3d]"
        style={{
          // The turn composes with the lean rather than replacing it, so a card
          // being tipped can be flipped without snapping back to square.
          transform: `rotateX(var(--flip-lean-x)) rotateY(calc(var(--flip-lean-y) + ${turn}deg))`,
        }}
      >
        <div className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden]">
          {children}
        </div>

        {backUrl && (
          <div
            className="absolute inset-0 overflow-hidden rounded-[inherit] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            aria-hidden={!flipped}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backUrl}
              alt={backAlt}
              draggable={false}
              className="h-full w-full rounded-[inherit] object-contain"
            />
          </div>
        )}
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
  );
}
