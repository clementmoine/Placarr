/**
 * Light refresh: when the stored fiche is already good — canonical cover,
 * title aligned with the item, complete gallery, prices refreshed recently —
 * a re-run has nothing left to seek. The scrape pass is then skipped entirely
 * instead of re-querying the fiches it already pinned, which is what used to
 * make a "nothing changed" refresh still cost a full Flare round.
 *
 * Any capability gap still wins over this: the gate only applies once
 * `metadataPassCapabilitiesIncomplete` is false.
 */
import { PROVIDER_MODULES, PROVIDERS } from "@/core/catalog/catalog";
import {
  canonicalProviderIdForSource,
  isCanonicalCoverSource,
} from "@/core/catalog/sourceTraits";
import { metadataHasDisplayImage } from "@/core/enrich/displayImage";
import { metadataResultsNeedGalleryEnrichment } from "@/core/enrich/galleryEnrichment";
import { metadataResultsHavePrimaryBookCover } from "@/core/enrich/scrapePassGate";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";
import type { MetadataResult } from "@/types/metadataProvider";
import type { MediaType } from "@/types/providerRegistry";
import { METADATA_TITLE_ALIGN_FLOOR } from "@/core/enrich/titles/identityThresholds";

/** Prices older than this are worth a full pass again. */
export const LIGHT_REFRESH_PRICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PRICE_REFRESH_SHELF_TYPES = new Set(
  PROVIDER_MODULES.filter(
    (providerModule) => providerModule.refreshBarcodePriceOffers,
  ).flatMap((providerModule) => providerModule.info.types),
);

/**
 * Registry traits that mark a cover as the catalog one rather than a
 * marketplace listing photo. Read from `info`, never from a provider list.
 */
function isCanonicalCoverProviderSource(source?: string | null): boolean {
  if (isCanonicalCoverSource(source)) return true;
  const id = canonicalProviderIdForSource(source);
  if (!id) return false;
  const provider = PROVIDERS.find((entry) => entry.id === id);
  if (!provider) return false;
  return Boolean(provider.canonical || provider.isRealBoxCover);
}

/** A cover the ranking would keep — not a marketplace listing photo. */
export function metadataResultsHaveCanonicalCover(
  type: MediaType,
  results: Array<MetadataResult | null | undefined>,
): boolean {
  if (type === "books") return metadataResultsHavePrimaryBookCover(results);

  for (const result of results) {
    if (!result || !metadataHasDisplayImage(result)) continue;
    for (const attachment of result.attachments ?? []) {
      if (attachment.type !== "cover" && attachment.type !== "artwork") {
        continue;
      }
      if (isCanonicalCoverProviderSource(attachment.source)) return true;
    }
  }
  return false;
}

export type LightRefreshInput = {
  type: MediaType;
  /** The item's own name — the title the fiche has to still match. */
  itemName: string;
  stored: MetadataResult | null | undefined;
  barcode?: string | null;
  priceLastUpdated?: Date | string | null;
  now?: number;
};

function priceIsRecent(
  type: MediaType,
  priceLastUpdated: Date | string | null | undefined,
  now: number,
): boolean {
  // Shelf types nobody prices (toys, tcg…) must not be held back by a stamp
  // that will never be written.
  if (!PRICE_REFRESH_SHELF_TYPES.has(type)) return true;
  if (!priceLastUpdated) return false;
  const at = new Date(priceLastUpdated).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at <= LIGHT_REFRESH_PRICE_MAX_AGE_MS;
}

/**
 * True when the stored fiche leaves the scrape pass nothing to do.
 * Deliberately conservative: every unknown answers "no", i.e. full refresh.
 */
export function isLightRefreshEligible(input: LightRefreshInput): boolean {
  const stored = input.stored;
  if (!stored) return false;

  const itemName = input.itemName.trim();
  if (!itemName) return false;

  if (!metadataResultsHaveCanonicalCover(input.type, [stored])) return false;

  if (
    !isMetadataTitleAligned(stored, [itemName], METADATA_TITLE_ALIGN_FLOOR, {
      shelfType: input.type,
    })
  ) {
    return false;
  }

  // A sparse gallery is exactly what the scrape pass is there to heal.
  if (
    metadataResultsNeedGalleryEnrichment(
      input.type,
      [stored],
      input.barcode ? input.barcode.trim() : "",
    )
  ) {
    return false;
  }

  return priceIsRecent(
    input.type,
    input.priceLastUpdated,
    input.now ?? Date.now(),
  );
}
