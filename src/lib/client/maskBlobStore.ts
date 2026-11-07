"use client";

/**
 * Foil masks, fetched into memory before they are ever named in CSS.
 *
 * WebKit on iOS does not apply a CSS mask whose image has not finished loading
 * by the time the style is resolved — and it never re-invalidates when the image
 * does arrive. What works is a `blob:` object URL already in memory.
 *
 * Publisher foil masks are JPEG coverage maps (no alpha). Safari does not apply
 * `mask-mode: luminance` to image masks, so we convert like their viewer
 * (`generate Safari mask`): coverage into the alpha channel, then mask in alpha.
 */

import {
  alphaIsUniformOpaque,
  applyMaskCoverage,
  type MaskKind,
} from "@/core/enrich/media/maskCoverage";

/** Source URL (+ kind) -> object URL of the (possibly converted) bytes. */
const blobs = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

function cacheKey(url: string, kind: MaskKind): string {
  return `${kind}|${url}`;
}

function announce() {
  for (const listener of listeners) listener();
}

export function subscribeToMaskBlobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The object URL if it is ready — never a fetch. */
export function peekMaskBlob(
  url: string | null | undefined,
  kind: MaskKind = "foil",
): string | null {
  if (!url) return null;
  return blobs.get(cacheKey(url, kind)) ?? null;
}

/**
 * Decode a fetched image, bake Safari alpha when needed, return a PNG blob URL.
 * Falls back to the raw bytes if canvas conversion is unavailable (tests / SSR).
 */
async function toSafariMaskBlob(source: Blob, kind: MaskKind): Promise<string> {
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
      if (alphaIsUniformOpaque(image.data)) {
        applyMaskCoverage(image.data, kind);
        ctx.putImageData(image, 0, 0);
        const png = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (png) return URL.createObjectURL(png);
      }
      return URL.createObjectURL(source);
    } finally {
      bitmap.close();
    }
  } catch {
    return URL.createObjectURL(source);
  }
}

/**
 * Fetch a mask into memory, if nobody has.
 *
 * The object URL is deliberately **never revoked**.
 */
export function requestMaskBlob(
  url: string | null | undefined,
  kind: MaskKind = "foil",
): void {
  if (!url) return;
  const key = cacheKey(url, kind);
  if (blobs.has(key) || pending.has(key)) return;

  pending.add(key);
  void (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = await toSafariMaskBlob(blob, kind);
      if (!blobs.has(key)) {
        blobs.set(key, objectUrl);
        announce();
      } else {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      // Leave the card plain rather than an unmasked wash.
    } finally {
      pending.delete(key);
    }
  })();
}

/** @internal test hook — the cache is deliberately session-long otherwise. */
export function resetMaskBlobStore(): void {
  for (const objectUrl of blobs.values()) URL.revokeObjectURL(objectUrl);
  blobs.clear();
  pending.clear();
  listeners.clear();
}
