"use client";

import type { ReactNode } from "react";
import { CARD_FACE_RADIUS } from "@/components/OrientedMediaFrame";
import {
  SEALED_BAG_CHROME_INSET,
  SEALED_BAG_PEEL_STRIP_URL,
  SEALED_BAG_SLICES,
  SEALED_BAG_URL,
  type SealedBagVariant,
  sealedCardInsetStyle,
} from "@/core/render/sealedBag";
import { cn } from "@/lib/shared/utils";

export type SealedBagOverlayProps = {
  /**
   * Card back: mirror the bag and stack the centered peel strip.
   * Card front: bag face only, upright.
   */
  side?: "front" | "back";
  /**
   * `adaptive` (default) — 9-slice. `full` — single PNG (playroom A/B).
   */
  variant?: SealedBagVariant;
  className?: string;
  /**
   * Card face to tuck **inside** the bag window. Prefer this over painting the
   * bag on a full-bleed sibling — otherwise the print sits under a flat frame.
   */
  children?: ReactNode;
};

const BAG_FILTER =
  "brightness(0.96) contrast(1.12) drop-shadow(0 0 0.45px rgba(0,0,0,0.22)) drop-shadow(0 1px 1px rgba(0,0,0,0.1))";

function BagFaceImg({
  src,
  className,
  mirrored,
}: {
  src: string;
  className?: string;
  mirrored?: boolean;
}) {
  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn(
          "absolute inset-0 h-full w-full object-fill brightness-0 opacity-[0.12]",
          mirrored && "scale-x-[-1]",
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn(
          "absolute inset-0 h-full w-full object-fill",
          mirrored && "scale-x-[-1]",
        )}
        style={{ filter: BAG_FILTER }}
      />
    </div>
  );
}

function AdaptiveBagLayers({ mirrored }: { mirrored: boolean }) {
  const { urls } = SEALED_BAG_SLICES;
  // Chrome tracks = pinch/rim only; the card inset is slightly deeper
  // ({@link SEALED_CARD_INSET_ADAPTIVE}) so art clears the crimps.
  const colPct = SEALED_BAG_CHROME_INSET.left;
  const rowPct = SEALED_BAG_CHROME_INSET.top;
  const cells = [
    urls.cornerTl,
    urls.edgeTop,
    urls.cornerTr,
    urls.edgeLeft,
    urls.windowFilm,
    urls.edgeRight,
    urls.cornerBl,
    urls.edgeBottom,
    urls.cornerBr,
  ] as const;

  return (
    <>
      <div
        className={cn("absolute inset-0 grid", mirrored && "scale-x-[-1]")}
        style={{
          gridTemplateColumns: `var(--sealed-bag-rim, ${colPct}) 1fr var(--sealed-bag-rim, ${colPct})`,
          gridTemplateRows: `var(--sealed-bag-seal, ${rowPct}) 1fr var(--sealed-bag-seal, ${rowPct})`,
        }}
      >
        {cells.map((src, i) => (
          <div key={i} className="relative min-h-0 min-w-0">
            <BagFaceImg src={src} />
          </div>
        ))}
      </div>
      {mirrored ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SEALED_BAG_PEEL_STRIP_URL}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-fill brightness-0 opacity-[0.1]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SEALED_BAG_PEEL_STRIP_URL}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-fill"
            style={{ filter: BAG_FILTER }}
          />
        </>
      ) : null}
    </>
  );
}

function FullBagLayers({ mirrored }: { mirrored: boolean }) {
  return (
    <>
      <BagFaceImg src={SEALED_BAG_URL} mirrored={mirrored} />
      {mirrored ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SEALED_BAG_PEEL_STRIP_URL}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-fill brightness-0 opacity-[0.1]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SEALED_BAG_PEEL_STRIP_URL}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-fill"
            style={{ filter: BAG_FILTER }}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Packaging for `finish === "sealed"` (and foil+bag demos). Cross-TCG —
 * stretch to the oriented card box so portrait / landscape / square all work.
 *
 * With `children`: inset art + plastic sheen + bag on top.
 * Without: bag layers only (caller already inset the face).
 */
export function SealedBagOverlay({
  side = "front",
  variant = "adaptive",
  className,
  children,
}: SealedBagOverlayProps) {
  const mirrored = side === "back";
  /*
    Clear PE assets are mostly near-white speculars. On light chrome they wash
    out; a faint black silhouette + alpha-aware drop-shadow restores the rim
    without a rectangular box-shadow through the transparent window.
  */
  const bagLayers = (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-[inherit]",
        !children && className,
      )}
      aria-hidden
    >
      {variant === "adaptive" ? (
        <AdaptiveBagLayers mirrored={mirrored} />
      ) : (
        <FullBagLayers mirrored={mirrored} />
      )}
    </div>
  );

  if (!children) return bagLayers;

  const pctInset = sealedCardInsetStyle(variant);
  const inset =
    variant === "adaptive"
      ? {
          top: `var(--sealed-bag-seal, ${pctInset.top})`,
          right: `var(--sealed-bag-rim, ${pctInset.right})`,
          bottom: `var(--sealed-bag-seal, ${pctInset.bottom})`,
          left: `var(--sealed-bag-rim, ${pctInset.left})`,
        }
      : pctInset;

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        className="absolute z-0 overflow-hidden"
        style={{
          ...inset,
          // Same TCG corner as shelf tiles — sharp square edges punched through
          // the bag and read as a sticker, not a card in plastic.
          borderRadius: CARD_FACE_RADIUS,
          clipPath: `inset(0 round ${CARD_FACE_RADIUS})`,
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
          {children}
        </div>
        {/* Clear PE film — light catch so the print reads under plastic. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-gradient-to-br from-white/35 via-white/[0.06] to-black/20 mix-blend-soft-light"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] shadow-[inset_0_0_8px_rgba(0,0,0,0.12)]"
        />
      </div>
      {bagLayers}
    </div>
  );
}
