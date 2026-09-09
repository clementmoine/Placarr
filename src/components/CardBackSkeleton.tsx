"use client";

import { OrientedMediaRotator } from "@/components/OrientedMediaFrame";

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
 */
export function CardBackSkeleton({
  url,
  faceQuarterTurns,
  orientedAspect,
}: {
  url?: string | null;
  faceQuarterTurns?: number | null;
  /** Oriented aspect of the frame (after the swap), e.g. `7 / 5`. */
  orientedAspect?: string;
}) {
  if (!url) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
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
