"use client";

import { useCallback, useState } from "react";

/** Which way the empty space runs, and therefore which edges border it. */
export type EdgeAxis = "vertical" | "horizontal";

export type ImageEdgeColors = {
  /** Colour of the first edge along {@link axis}: top, or left. */
  from: string;
  /** Colour of the opposite edge: bottom, or right. */
  to: string;
  axis: EdgeAxis;
};

/**
 * How many points are read along an edge. The line is averaged across its
 * length, so this only trades precision for work — 32 is already far more than
 * a gradient two colours wide can show.
 */
const EDGE_SAMPLES = 32;

/** Below this the pixel is see-through and says nothing about the edge colour. */
const MIN_ALPHA = 24;

/**
 * Mean colour of an RGBA strip, ignoring see-through pixels, or `null` when
 * nothing in it is opaque enough to speak for the edge.
 */
export function averageStrip(data: Uint8ClampedArray): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let counted = 0;

  for (let offset = 0; offset + 3 < data.length; offset += 4) {
    if ((data[offset + 3] ?? 0) < MIN_ALPHA) continue;
    r += data[offset] ?? 0;
    g += data[offset + 1] ?? 0;
    b += data[offset + 2] ?? 0;
    counted += 1;
  }

  if (!counted) return null;
  return `rgb(${Math.round(r / counted)} ${Math.round(g / counted)} ${Math.round(b / counted)})`;
}

/**
 * Pair the two edge strips into a gradient, or give up if either is unreadable.
 *
 * Split out from the canvas work so the counting — where the mistakes live —
 * can be tested directly.
 */
export function edgeColorsFromStrips(
  fromStrip: Uint8ClampedArray,
  toStrip: Uint8ClampedArray,
  axis: EdgeAxis,
): ImageEdgeColors | null {
  const from = averageStrip(fromStrip);
  const to = averageStrip(toStrip);
  return from && to ? { from, to, axis } : null;
}

/**
 * Where the gap falls, given the artwork's shape and the box it sits in.
 *
 * A contained image leaves its gap on one axis only, and it is the *opposite*
 * one to the intuition: proportionally wider than its frame means it is scaled
 * to fit the width, so it comes up short vertically and the bands sit above and
 * below. Taller than its frame puts them left and right.
 */
export function edgeAxisFor(
  imageAspect: number,
  containerAspect: number,
): EdgeAxis {
  return imageAspect > containerAspect ? "vertical" : "horizontal";
}

/** CSS gradient bleeding those edges outwards. */
export function edgeGradient(colors: ImageEdgeColors): string {
  const direction = colors.axis === "vertical" ? "to bottom" : "to right";
  return `linear-gradient(${direction}, ${colors.from}, ${colors.to})`;
}

/**
 * Read the outermost line of pixels on one side of the source image.
 *
 * One pixel deep, at native resolution: the colour that has to meet the empty
 * space is the one *on* the border, and anything thicker averages the artwork
 * behind it into the answer. Only the length is downsampled, to
 * {@link EDGE_SAMPLES} points.
 */
function readEdgeStrip(
  image: HTMLImageElement,
  axis: EdgeAxis,
  side: "from" | "to",
): Uint8ClampedArray | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  const vertical = axis === "vertical";

  const canvas = document.createElement("canvas");
  canvas.width = vertical ? EDGE_SAMPLES : 1;
  canvas.height = vertical ? 1 : EDGE_SAMPLES;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const sourceX = vertical ? 0 : side === "from" ? 0 : width - 1;
  const sourceY = vertical ? (side === "from" ? 0 : height - 1) : 0;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    vertical ? width : 1,
    vertical ? 1 : height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * The colours of the edges an image is letterboxed against, so a contained
 * cover bleeds into its container instead of floating on a slab.
 *
 * Sampled in the browser rather than stored: it works on every image already in
 * the library without re-enriching anything, and the source is same-origin
 * (`/uploads`, or the Next optimizer) so the canvas is never tainted.
 *
 * Stays `null` for an image that cannot be measured — a missing answer must fall
 * back to the plain background, never to a guessed colour.
 */
/** Optional frame size when the `<img>` no longer fills the letterbox box. */
export type EdgeMeasureBox = { width: number; height: number };

export function useImageEdgeColors(): {
  colors: ImageEdgeColors | null;
  measure: (image: HTMLImageElement, box?: EdgeMeasureBox) => void;
  reset: () => void;
} {
  const [colors, setColors] = useState<ImageEdgeColors | null>(null);

  const measure = useCallback(
    (image: HTMLImageElement, box?: EdgeMeasureBox) => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      // Foil CSS nests the art in a ratio box; letterboxing lives on the outer
      // frame — pass that frame here or the axis reads as "no gap".
      const boxWidth = box?.width || image.clientWidth || image.width;
      const boxHeight = box?.height || image.clientHeight || image.height;
      if (!boxWidth || !boxHeight) return;

      try {
        const axis = edgeAxisFor(
          image.naturalWidth / image.naturalHeight,
          boxWidth / boxHeight,
        );
        const from = readEdgeStrip(image, axis, "from");
        const to = readEdgeStrip(image, axis, "to");
        if (!from || !to) return;

        const measured = edgeColorsFromStrips(from, to, axis);
        if (measured) setColors(measured);
      } catch {
        // A tainted canvas or a decode failure simply means no bleed.
      }
    },
    [],
  );

  // Pointing the same slot at another image must drop the old measurement:
  // holding it until the new one decodes paints one cover's colours behind
  // another's, which is exactly the artefact this hook exists to avoid.
  const reset = useCallback(() => setColors(null), []);

  return { colors, measure, reset };
}
