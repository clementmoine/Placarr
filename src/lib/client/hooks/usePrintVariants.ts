"use client";

import { useEffect, useState } from "react";

import type { PrintVariantInfo } from "./usePrintVariant";

/**
 * What a whole shelf of copies are prints of, in one request.
 *
 * A tile cannot draw the right foil until it knows which finishes its print
 * exists in, and a shelf holds dozens. Asking per tile would be dozens of round
 * trips for an answer the provider already holds in memory, so the keys go up
 * together and come back as a map.
 *
 * Returns an empty map until it has one — never a partial guess, since drawing
 * the wrong foil is worse than drawing none.
 */
export function usePrintVariants(
  printKeys: readonly (string | null | undefined)[],
  shelfType: string | null | undefined,
): Record<string, PrintVariantInfo> {
  const [byKey, setByKey] = useState<Record<string, PrintVariantInfo>>({});

  // Joined rather than passed as an array: a fresh array every render would
  // restart the request on every render.
  const keys = [...new Set(printKeys.filter(Boolean) as string[])]
    .sort()
    .join(",");

  useEffect(() => {
    if (!keys || !shelfType) return;
    const controller = new AbortController();

    fetch(
      `/api/prints?printKeys=${encodeURIComponent(keys)}&type=${encodeURIComponent(shelfType)}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (data: { candidates?: Record<string, PrintVariantInfo> } | null) => {
          if (data?.candidates) setByKey(data.candidates);
        },
      )
      .catch(() => {
        // Unknown simply means no effect on the tiles, never a failure.
      });

    return () => controller.abort();
  }, [keys, shelfType]);

  return byKey;
}
