"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  peekMaskBlob,
  requestMaskBlob,
  subscribeToMaskBlobs,
} from "@/lib/client/maskBlobStore";

/**
 * A mask URL, as something CSS can actually wear on iOS.
 *
 * Returns `null` until the file is in memory. Callers must draw no masked layer
 * while it is `null`: a layer with an unresolved mask is not a faint layer, it is
 * an unmasked one covering the whole card. Plain now and foil a moment later is
 * the right degradation — see `maskBlobStore` for why the wait exists at all.
 */
export function useMaskBlob(url: string | null | undefined): string | null {
  const snapshot = useCallback(() => peekMaskBlob(url), [url]);
  const blob = useSyncExternalStore(
    subscribeToMaskBlobs,
    snapshot,
    // Nothing is in memory during the server render, and there is no document
    // to create an object URL against.
    () => null,
  );

  useEffect(() => {
    requestMaskBlob(url);
  }, [url]);

  return blob;
}
