"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { MaskKind } from "@/core/enrich/media/maskCoverage";
import {
  peekMaskBlob,
  requestMaskBlob,
  subscribeToMaskBlobs,
} from "@/lib/client/maskBlobStore";

/**
 * A mask URL, as something CSS can actually wear on iOS.
 *
 * Returns `null` until the file is in memory. Callers must draw no masked layer
 * while it is `null`. `kind` selects foil vs varnish Safari conversion.
 */
export function useMaskBlob(
  url: string | null | undefined,
  kind: MaskKind = "foil",
): string | null {
  const snapshot = useCallback(() => peekMaskBlob(url, kind), [url, kind]);
  const blob = useSyncExternalStore(
    subscribeToMaskBlobs,
    snapshot,
    () => null,
  );

  useEffect(() => {
    requestMaskBlob(url, kind);
  }, [url, kind]);

  return blob;
}
