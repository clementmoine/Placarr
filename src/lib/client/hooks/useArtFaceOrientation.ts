"use client";

import { useEffect, useMemo, useState } from "react";

import { mergeArtFaceOrientation } from "@/lib/text/artFaceOrientation";
import type { ArtFaceOrientation } from "@/lib/text/artFaceOrientation";

export type ArtFaceOrientationHint = ArtFaceOrientation & {
  landscapePrint?: boolean;
};

/**
 * Resolve face frame from catalogue hints, then refine when the artwork loads.
 *
 * - w > h → landscape frame, no rotation
 * - h > w on a print known to be landscape → rotate 90°
 */
export function useArtFaceOrientation(
  imageUrl: string | null | undefined,
  hint: ArtFaceOrientationHint | null | undefined,
): Required<ArtFaceOrientation> {
  const [pixels, setPixels] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    setPixels(null);
    const url = imageUrl?.trim();
    if (!url) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setPixels({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = url;
    return () => {
      img.onload = null;
      img.src = "";
    };
  }, [imageUrl]);

  return useMemo(() => {
    const server = hint ?? {};
    const resolved = pixels
      ? mergeArtFaceOrientation(server, pixels.width, pixels.height)
      : server;
    return {
      landscapeFace: resolved.landscapeFace === true,
      faceQuarterTurns: resolved.faceQuarterTurns ?? 0,
    };
  }, [hint, pixels]);
}
