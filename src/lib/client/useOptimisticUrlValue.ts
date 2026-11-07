"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Instant UI value while `router.replace` catches up the URL search params.
 *
 * `pending === null` means “follow the URL”. A pending `{ value }` wins until
 * `urlValue` equals it (Object.is), then clears — so a click never waits on
 * Next.js searchParams before the segmented control / tabs update.
 */
export function useOptimisticUrlValue<T>(urlValue: T): {
  value: T;
  setOptimistic: (next: T) => void;
  clearOptimistic: () => void;
} {
  const [pending, setPending] = useState<{ value: T } | null>(null);

  useEffect(() => {
    if (pending != null && Object.is(pending.value, urlValue)) {
      setPending(null);
    }
  }, [urlValue, pending]);

  const setOptimistic = useCallback((next: T) => {
    setPending({ value: next });
  }, []);

  const clearOptimistic = useCallback(() => {
    setPending(null);
  }, []);

  return {
    value: pending != null ? pending.value : urlValue,
    setOptimistic,
    clearOptimistic,
  };
}
