"use client";

import { OrientedMediaRotator } from "@/components/OrientedMediaFrame";
import { sealedBagWindowStyle } from "@/components/SealedBagOverlay";
import { cn } from "@/lib/shared/utils";

/**
 * The card back, standing in for a face that has not been drawn yet.
 *
 * Turned with the card, like everything else on it. Painted as a CSS
 * `background-image` it could only ever be upright, so a Location — a portrait
 * card held sideways — showed an upright back cropped into a landscape frame
 * while its foil loaded. A card lying face-down on the table is at whatever
 * angle the card is.
 *
 * Behind the face rather than under it: an absolute layer placed first in the
 * frame, so the artwork fading in from `opacity-0` reveals it and nothing has
 * to coordinate z-indexes.
 *
 * Under a sealed bag the face sits in the bag window, inset from the frame;
 * the back takes the same window, or it showed around the card as a bigger one.
 */
export function CardBackSkeleton({
  url,
  faceQuarterTurns,
  orientedAspect,
  sealed = false,
}: {
  url?: string | null;
  faceQuarterTurns?: number | null;
  /** Oriented aspect of the frame (after the swap), e.g. `7 / 5`. */
  orientedAspect?: string;
  /** Card shown inside a sealed bag: the back stays in the bag window. */
  sealed?: boolean;
}) {
  if (!url) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute overflow-hidden",
        sealed ? null : "inset-0 rounded-[inherit]",
      )}
      style={sealed ? sealedBagWindowStyle() : undefined}
    >
      <OrientedMediaRotator
        faceQuarterTurns={faceQuarterTurns}
        orientedAspect={orientedAspect}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      </OrientedMediaRotator>
    </div>
  );
}
