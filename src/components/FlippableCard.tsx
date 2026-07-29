"use client";

import { useState } from "react";

import { cn } from "@/lib/shared/utils";

type FlippableCardProps = {
  /** The card itself — usually a `HoloCardImage`, effects and all. */
  children: React.ReactNode;
  /** Where the back lives. Without one there is nothing to flip to. */
  backUrl?: string | null;
  backAlt: string;
  /** Label for the control, so this component stays free of locale plumbing. */
  flipLabel: string;
  className?: string;
};

/**
 * A card you can turn over.
 *
 * Both faces are laid on top of each other and the whole thing is rotated, with
 * `backface-visibility` hiding whichever is looking away. That keeps the front
 * mounted through the turn — it carries the foil layers, and remounting them
 * mid-rotation would restart their animation.
 *
 * With no back it renders its child and nothing else: a flip onto a placeholder
 * would say less than no flip at all.
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
  className,
}: FlippableCardProps) {
  const [flipped, setFlipped] = useState(false);

  if (!backUrl) return <>{children}</>;

  return (
    <div
      className={cn("relative h-full w-full [perspective:1400px]", className)}
    >
      <div
        className="relative h-full w-full transition-transform duration-700 ease-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : undefined }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          {children}
        </div>

        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          aria-hidden={!flipped}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backUrl}
            alt={backAlt}
            className="h-full w-full rounded-[inherit] object-contain"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setFlipped((previous) => !previous);
        }}
        aria-pressed={flipped}
        className="absolute -bottom-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-colors hover:bg-black/75"
      >
        {flipLabel}
      </button>
    </div>
  );
}
