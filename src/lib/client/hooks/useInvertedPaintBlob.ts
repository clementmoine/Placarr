"use client";

/**
 * Project Live etch into Simey `--foil` paint space (blob URL).
 *
 * Live `_CardEtch` is dark lines on white (~lum 196). poke-holo's EN foil scans
 * are light lines on black (~lum 26). Polarity + μ projection live in
 * `simeyPaintSpace` — invert alone left μ≈59; we also gain toward Simey μ.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { projectRgbaBufferToSimeyFoil } from "@/effects/pokemon/simeyPaintSpace";

const blobs = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function peekInvertedPaintBlob(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  return blobs.get(url) ?? null;
}

async function invertToBlobUrl(source: Blob): Promise<string> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return URL.createObjectURL(source);
  }
  try {
    const bitmap = await createImageBitmap(source);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return URL.createObjectURL(source);
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      projectRgbaBufferToSimeyFoil(image.data);
      ctx.putImageData(image, 0, 0);
      const png = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (png) return URL.createObjectURL(png);
      return URL.createObjectURL(source);
    } finally {
      bitmap.close();
    }
  } catch {
    return URL.createObjectURL(source);
  }
}

export function requestInvertedPaintBlob(url: string | null | undefined): void {
  if (!url) return;
  if (blobs.has(url) || pending.has(url)) return;
  pending.add(url);
  void (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = await invertToBlobUrl(blob);
      if (!blobs.has(url)) {
        blobs.set(url, objectUrl);
        announce();
      } else {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      // Coat falls back to the dark slab in the recipe.
    } finally {
      pending.delete(url);
    }
  })();
}

/** Blob URL of an RGB-inverted paint plate, or null until ready. */
export function useInvertedPaintBlob(
  url: string | null | undefined,
): string | null {
  const snapshot = useCallback(() => peekInvertedPaintBlob(url), [url]);
  const blob = useSyncExternalStore(subscribe, snapshot, () => null);
  useEffect(() => {
    requestInvertedPaintBlob(url);
  }, [url]);
  return blob;
}
