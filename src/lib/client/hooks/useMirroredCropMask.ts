"use client";

import { useEffect, useState } from "react";

import { isEditDerivativeUrl } from "@/core/enrich/media/coverUrl";

/**
 * Whether a mask has to be re-cut to follow the artwork.
 *
 * Only a cropped local artwork moves the goalposts: an untouched cover still
 * has the mask's own shape, and a remote one was never cropped here.
 */
export function maskNeedsMirroring(
  artworkUrl: string | null | undefined,
  maskUrl: string | null | undefined,
): boolean {
  return Boolean(
    artworkUrl &&
    maskUrl &&
    artworkUrl.startsWith("/uploads/") &&
    isEditDerivativeUrl(artworkUrl),
  );
}

/**
 * A foil mask cut to the same framing as the artwork it overlays.
 *
 * The mask covers the whole card, so once the collector crops the artwork the
 * two stop sharing a shape and `object-contain` letterboxes them differently —
 * the shimmer drifts off the foil areas. The server replays the artwork's own
 * rectangle onto the mask and caches the result by framing.
 *
 * Falls back to the mask as published whenever there is nothing to mirror or
 * the request fails: a slightly misaligned shimmer beats none at all.
 */
export function useMirroredCropMask(
  artworkUrl: string | null | undefined,
  maskUrl: string | null | undefined,
  role = "cover",
): string | null | undefined {
  const [mirrored, setMirrored] = useState<string | null>(null);

  // Dropping the previous answer is adjusted during render rather than in the
  // effect: a mask cut for the old framing must never be shown over the new
  // artwork, not even for the frame before the fetch resolves.
  const request = `${artworkUrl}|${maskUrl}|${role}`;
  const [prevRequest, setPrevRequest] = useState(request);
  if (prevRequest !== request) {
    setPrevRequest(request);
    setMirrored(null);
  }

  useEffect(() => {
    if (!maskNeedsMirroring(artworkUrl, maskUrl)) return;

    const controller = new AbortController();
    const query = new URLSearchParams({
      source: artworkUrl!,
      target: maskUrl!,
      role,
    });

    fetch(`/api/images/crop/mirror?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { url?: string } | null) => {
        if (data?.url) setMirrored(data.url);
      })
      .catch(() => {
        // Aborted, or the mirror failed: keep the published mask.
      });

    return () => controller.abort();
  }, [artworkUrl, maskUrl, role]);

  return mirrored ?? maskUrl;
}
