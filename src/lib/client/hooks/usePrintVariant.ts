"use client";

import { useEffect, useState } from "react";

import { resolveStoredVariant } from "@/core/enrich/variants";

/** What the provider says a printing exists as. Shape mirrors `PrintCandidate`. */
export type PrintVariantInfo = {
  finishes?: string[];
  plainFinishes?: string[];
  variantImageUrls?: Record<string, string>;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
};

/**
 * Ask the provider what this printing exists as.
 *
 * Asked live rather than read from storage: `Metadata.facts` is rebuilt from
 * field evidence after every store, so a persisted copy both has to survive two
 * allow-lists and drifts when a set is corrected. The provider's index is held
 * in memory server-side, so the answer is cheap.
 */
export function usePrintVariant(
  printKey: string | null | undefined,
  shelfType: string | null | undefined,
): PrintVariantInfo | null {
  const [info, setInfo] = useState<PrintVariantInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!printKey || !shelfType) {
        setInfo(null);
        return;
      }
      try {
        const response = await fetch(
          `/api/prints?printKey=${encodeURIComponent(printKey)}&type=${encodeURIComponent(shelfType)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          candidate?: PrintVariantInfo | null;
        };
        setInfo(data.candidate ?? null);
      } catch {
        // Unknown simply means no variant picker and no effect, never a failure.
      }
    })();

    return () => controller.abort();
  }, [printKey, shelfType]);

  return info;
}

export type VariantRendering = {
  /** Artwork to show: the variant's own file when the provider has one. */
  imageUrl: string | null;
  /** Masks to composite, empty when this copy carries no effect. */
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
};

/**
 * How a copy should be drawn, given its variant.
 *
 * A plain finish gets nothing — the point of a foil effect is that it separates
 * a foil copy from a normal one, so shimmering on both would say nothing. An
 * unrecognized variant is treated as plain rather than guessed at.
 */
export function variantRendering(
  variant: string | null | undefined,
  info: PrintVariantInfo | null,
  fallbackImageUrl: string | null,
): VariantRendering {
  const plain = {
    imageUrl: fallbackImageUrl,
    foilMaskUrl: null,
    varnishMaskUrl: null,
  };
  if (!info) return plain;

  const resolved = resolveStoredVariant(variant, info.finishes);
  if (!resolved) return plain;

  const isPlainFinish = (info.plainFinishes ?? []).some(
    (finish) => finish.toLowerCase() === resolved.toLowerCase(),
  );
  if (isPlainFinish) return plain;

  return {
    imageUrl: info.variantImageUrls?.[resolved] ?? fallbackImageUrl,
    foilMaskUrl: info.foilMaskUrl ?? null,
    varnishMaskUrl: info.varnishMaskUrl ?? null,
  };
}
