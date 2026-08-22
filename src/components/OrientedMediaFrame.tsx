"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  faceRotateDeg,
  faceDisplayAspect,
  normalizeFaceQuarterTurns,
  orientAspectRatio,
} from "@/lib/text/cardFormat";
import { cn } from "@/lib/shared/utils";

function parseAspect(aspect: string): { w: number; h: number } | null {
  const match = aspect.trim().match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

/**
 * Largest W×H with ratio `aspectW:aspectH` that fits in `boxW×boxH`.
 */
export function containOrientedBox(
  boxW: number,
  boxH: number,
  aspectW: number,
  aspectH: number,
): { width: number; height: number } {
  if (!(boxW > 0 && boxH > 0 && aspectW > 0 && aspectH > 0)) {
    return { width: 0, height: 0 };
  }
  const heightLimited = {
    width: (boxH * aspectW) / aspectH,
    height: boxH,
  };
  if (heightLimited.width <= boxW + 1e-9) return heightLimited;
  return {
    width: boxW,
    height: (boxW * aspectH) / aspectW,
  };
}

/**
 * The corner on the card's own *upright* rectangle — the box a face is always
 * laid out in, turned or not. Inline: Tailwind chokes on `var(--x, 4% / 3%)`.
 *
 * A card is 63×88mm with a ~3mm corner, so 4% of the short side and 3% of the
 * long side land within a tenth of a millimetre of each other: the corner reads
 * round, which is the whole point of quoting two percentages.
 */
export const CARD_FACE_RADIUS = "var(--card-face-radius, 4% / 3%)";

/**
 * The same corner against a frame that is already turned (a Location or BREAK
 * tile, landscape on screen).
 *
 * The percentages swap with the axes — and only here. Quoting `4% / 3%` on a
 * 7:5 box measures 4% of the *long* side against 3% of the short one, and the
 * corner comes out flattened; a face laid out before the rotate is still an
 * upright card and keeps {@link CARD_FACE_RADIUS}.
 */
export function cardFaceRadius(
  faceQuarterTurns: number | null | undefined = 0,
): string {
  const odd = Math.abs(normalizeFaceQuarterTurns(faceQuarterTurns)) % 2 === 1;
  return odd ? "var(--card-face-radius-turned, 3% / 4%)" : CARD_FACE_RADIUS;
}

/** {@link cardFaceRadius} as a `clip-path`. */
export function cardFaceClipPath(
  faceQuarterTurns: number | null | undefined = 0,
): string {
  return `inset(0 round ${cardFaceRadius(faceQuarterTurns)})`;
}

/**
 * Rotates children inside a box that already has the oriented aspect.
 * Portrait assets with sideways content fill a landscape tile after 90°.
 *
 * Pre-rotate box is parent height × parent width (via % of a known-correct
 * oriented parent). Avoid cqh/cqw — size containment in this subtree cycles.
 *
 * Always pass `rounded-[inherit]`: FlippableCard / HoloCardImage / FoilCardImage
 * clip via inherited radius. An intermediate without it zeroes the chain and
 * every face goes square-cornered (shelf, fiche, fullscreen, playroom).
 *
 * WebGL canvases ignore ancestor `clip-path` when a `rotate` sits between the
 * clip and the canvas (Location / BREAK go square). Clip *inside* the rotate,
 * wrapping the face with no transform between clip and canvas — rounding in
 * pre-rotate space, then rotating, yields a rounded oriented silhouette.
 */
export function OrientedMediaRotator({
  faceQuarterTurns = 0,
  orientedAspect,
  className,
  children,
}: {
  faceQuarterTurns?: number | null;
  /** Oriented aspect of the parent frame (after swap), e.g. `7 / 5`. */
  orientedAspect?: string;
  className?: string;
  children: ReactNode;
}) {
  const deg = faceRotateDeg(faceQuarterTurns);
  if (deg === 0) {
    return (
      <div
        className={cn("relative h-full w-full rounded-[inherit]", className)}
      >
        {children}
      </div>
    );
  }

  const ratio = orientedAspect ? parseAspect(orientedAspect) : null;
  // Parent W×H with W/H = aw/ah → pre-rotate child is H×W:
  //   width  = H = (ah/aw)·W → (ah/aw)*100% of parent width
  //   height = W = (aw/ah)·H → (aw/ah)*100% of parent height
  const rotatorStyle: CSSProperties = ratio
    ? {
        width: `${(ratio.h / ratio.w) * 100}%`,
        height: `${(ratio.w / ratio.h) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${deg}deg)`,
      }
    : {
        width: "100%",
        height: "100%",
        transform: `translate(-50%, -50%) rotate(${deg}deg)`,
      };

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-[inherit]",
        className,
      )}
    >
      <div className="absolute left-1/2 top-1/2" style={rotatorStyle}>
        {/*
          Rounded here, before the rotate, where the box is still the upright
          card — hence `CARD_FACE_RADIUS` and not the turned variant.

          Radius *and* clip-path: the clip alone is not enough, because a WebGL
          canvas escapes an ancestor `clip-path` once the card sits in a
          `preserve-3d` scene, and only a rounded box of its own still cuts it.
          The `border-radius` is also what the face's `rounded-[inherit]` chain
          inherits from — without it the `<img>` back was rounded while the
          foil face stayed square.
        */}
        <div
          className="relative h-full w-full overflow-hidden"
          style={{
            borderRadius: CARD_FACE_RADIUS,
            clipPath: `inset(0 round ${CARD_FACE_RADIUS})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Same shelf-format rectangle, optionally rotated. Odd quarter turns swap the
 * aspect (5:7 → 7:5) and rotate the face so portrait assets with sideways
 * content (e.g. Pokémon BREAK) read correctly.
 *
 * - `fill-width` (grid): width 100%, height from aspect-ratio.
 * - `contain` (focus): a full-bleed host measures the parent; the face gets
 *   explicit px sizes so flex shrink-wrap cannot collapse or stretch the ratio.
 *
 * Soft chrome (radius, shadow) may sit on this node for inheritance. Do not put
 * `overflow-hidden` here when the face tilts — clip on the tilting element so
 * the radius moves with the card. Avoid `border` on the sized box (`border-box`
 * shrinks content away from the oriented ratio).
 */
export function OrientedMediaFrame({
  aspectRatio,
  faceQuarterTurns = 0,
  landscapeFace = false,
  fit = "fill-width",
  className,
  style,
  children,
}: {
  /** Base aspect before orientation (e.g. shelf `5 / 7`). */
  aspectRatio: string;
  faceQuarterTurns?: number | null;
  /** Native landscape scan — swap frame, do not rotate pixels. */
  landscapeFace?: boolean;
  fit?: "fill-width" | "contain";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const turns = landscapeFace ? 0 : normalizeFaceQuarterTurns(faceQuarterTurns);
  const oriented = faceDisplayAspect(aspectRatio, {
    faceQuarterTurns: turns,
    landscapeFace,
  });
  const ratio = parseAspect(oriented);
  const hostRef = useRef<HTMLDivElement>(null);
  const [containPx, setContainPx] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (fit !== "contain" || !ratio) return;
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      setContainPx(
        containOrientedBox(rect.width, rect.height, ratio.w, ratio.h),
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [fit, oriented, ratio]);
  const containBox = fit === "contain" && ratio ? containPx : null;

  const sizeStyle: CSSProperties = (() => {
    if (fit === "contain" && ratio) {
      if (!containBox || containBox.width <= 0 || containBox.height <= 0) {
        return { width: 0, height: 0, aspectRatio: oriented };
      }
      return {
        aspectRatio: oriented,
        width: containBox.width,
        height: containBox.height,
      };
    }
    return {
      aspectRatio: oriented,
      width: "100%",
      height: "auto",
    };
  })();

  const face = (
    <div
      className={cn("relative rounded-[inherit]", className)}
      style={{ ...sizeStyle, ...style }}
    >
      <OrientedMediaRotator
        faceQuarterTurns={turns}
        orientedAspect={oriented}
        className="absolute inset-0"
      >
        {children}
      </OrientedMediaRotator>
    </div>
  );

  if (fit === "contain") {
    return (
      <div
        ref={hostRef}
        className="flex h-full min-h-0 w-full min-w-0 items-center justify-center"
      >
        {face}
      </div>
    );
  }

  return face;
}
