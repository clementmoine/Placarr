import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/core/games/platforms";
import { attachmentTitleMediaTypeConflicts } from "@/core/metadata/titleMatching";

import type { EbayProduct } from "./types";

function detectPlatformKeysInListingTitle(
  title: string,
): Set<VideoGamePlatformKey> {
  const keys = new Set<VideoGamePlatformKey>();
  const direct = detectVideoGamePlatformKey(title);
  if (direct) keys.add(direct);

  for (const segment of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!segment) continue;
    if (isVideoGamePlatformKey(segment)) {
      keys.add(segment);
      continue;
    }
    const detected = detectVideoGamePlatformKey(segment);
    if (detected) keys.add(detected);
  }

  return keys;
}

function listingScore(
  product: EbayProduct,
  platformKey: VideoGamePlatformKey,
): number {
  let score = product.catalog ? 100 : 0;
  const keys = detectPlatformKeysInListingTitle(product.name);
  if (keys.has(platformKey)) score += 50;
  return score;
}

/** Drop cross-platform / non-game marketplace hits on a platform-specific game shelf. */
export function filterEbayProductsForGameShelf(
  products: readonly EbayProduct[],
  platformKey: VideoGamePlatformKey,
  productTitle: string,
): EbayProduct[] {
  const foreignPlatformPresent = products.some((product) => {
    const keys = detectPlatformKeysInListingTitle(product.name);
    return keys.size > 0 && !keys.has(platformKey);
  });
  const shelfPlatformPresent = products.some((product) =>
    detectPlatformKeysInListingTitle(product.name).has(platformKey),
  );

  return products.filter((product) => {
    if (
      attachmentTitleMediaTypeConflicts(productTitle, product.name, {
        mediaType: "games",
      })
    ) {
      return false;
    }

    const keys = detectPlatformKeysInListingTitle(product.name);
    if (keys.size > 0 && !keys.has(platformKey)) return false;

    // Generic marketplace titles lose once a shelf-platform hit exists, or when
    // other listings already prove the query is pulling cross-platform SKUs.
    if (
      keys.size === 0 &&
      !product.catalog &&
      (shelfPlatformPresent || foreignPlatformPresent)
    ) {
      return false;
    }

    return true;
  });
}

export function rankEbayProductsForGameShelf(
  products: readonly EbayProduct[],
  platformKey: VideoGamePlatformKey,
): EbayProduct[] {
  return [...products].sort(
    (a, b) => listingScore(b, platformKey) - listingScore(a, platformKey),
  );
}

export function prepareEbayProductsForGameShelf(
  products: readonly EbayProduct[],
  platformKey: VideoGamePlatformKey | null | undefined,
  productTitle: string,
): EbayProduct[] {
  if (!platformKey) return [...products];
  const filtered = filterEbayProductsForGameShelf(
    products,
    platformKey,
    productTitle,
  );
  return rankEbayProductsForGameShelf(filtered, platformKey);
}
