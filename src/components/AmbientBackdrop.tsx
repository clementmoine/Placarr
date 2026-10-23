"use client";

import { faceRotateDeg } from "@/lib/text/cardFormat";

/**
 * The blurred banner behind a fiche.
 *
 * When the artwork behind it is the card's own face, it is turned like the
 * card. A Location has no background of its own, so the hero falls back to the
 * cover — a portrait scan whose art is sideways — and the page was topped by a
 * banner lying on its side.
 *
 * The turned case swaps the box with container units rather than measuring it:
 * `100cqh × 100cqw` is the parent's height by its width, so rotating a quarter
 * turn lands exactly back on the parent's own rectangle, at any viewport, with
 * no ResizeObserver and no layout pass of our own.
 */
export function AmbientBackdrop({
  imageUrl,
  quarterTurns,
  className,
}: {
  imageUrl: string;
  /** Quarter-turns the card face is displayed at; 0 for anything not a card. */
  quarterTurns?: number | null;
  className?: string;
}) {
  const paint = `bg-cover bg-center opacity-[0.50] transition-all duration-1000 ease-out`;
  const deg = faceRotateDeg(quarterTurns);

  if (deg === 0) {
    return (
      <div
        className={`absolute inset-0 ${paint} ${className ?? ""}`}
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
    );
  }

  return (
    // `containerType` inline, not as a Tailwind arbitrary property: this build
    // does not emit `[container-type:size]`, and without the container the
    // `cq*` units below silently fall back to viewport units.
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ containerType: "size" }}
    >
      <div
        className={`absolute left-1/2 top-1/2 ${paint} ${className ?? ""}`}
        style={{
          width: "100cqh",
          height: "100cqw",
          transform: `translate(-50%, -50%) rotate(${deg}deg)`,
          backgroundImage: `url(${imageUrl})`,
        }}
      />
    </div>
  );
}
