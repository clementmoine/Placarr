/**
 * When the soft identity bag grows (aliases / metadata title), re-run price
 * accept gates against fresh ProviderEvidence only — zero HTTP.
 */
import {
  buildMatchContext,
  toBarcodePriceRefreshContext,
} from "@/core/catalog/matchContext";
import { collectRefreshBarcodePriceOffers } from "@/core/catalog/barcodePrices";
import { persistItemPrices } from "@/core/commerce/pricing/resolver";
import { cleanCode } from "@/core/identify/query";
import type { ProviderProductUrlRef } from "@/types/providerModule";

export type ReconfrontItemPricesInput = {
  itemId: string;
  metadataId: string;
  shelfType: string;
  shelfName?: string | null;
  itemName: string;
  metadataTitle?: string | null;
  aliases?: readonly string[] | null;
  barcode?: string | null;
  platformKey?: string | null;
  providerProductUrls?: ProviderProductUrlRef[];
};

function identityBag(input: ReconfrontItemPricesInput): string[] {
  const primary = input.itemName.trim();
  // Trust stored soft aliases as-is (CECH / regional SKUs may not share tokens
  // with the shelf name — that is why they unlock SearchYield on replay).
  const aliases = (input.aliases ?? [])
    .map((alias) => alias.trim())
    .filter(Boolean);
  const titles = [
    primary,
    input.metadataTitle?.trim() || "",
    ...aliases,
  ].filter(Boolean);
  return Array.from(new Set(titles));
}

/**
 * Re-pick marketplace/reference prices from durable SearchYield / DetailYield
 * with the current acceptance bag. No-op when evidence is missing/expired.
 */
export async function reconfrontItemPricesFromDurableEvidence(
  input: ReconfrontItemPricesInput,
): Promise<number> {
  const bag = identityBag(input);
  if (bag.length === 0) return 0;

  const primary = bag[0]!;
  const barcode = input.barcode ? cleanCode(input.barcode) : "";
  const match = buildMatchContext({
    shelfType: input.shelfType,
    shelfName: input.shelfName,
    primaryTitle: primary,
    titles: bag,
    acceptanceTitles: bag,
    barcodes: barcode ? [barcode] : [],
    platformKey: input.platformKey,
    providerProductUrls: input.providerProductUrls,
  });

  const offers = await collectRefreshBarcodePriceOffers(
    toBarcodePriceRefreshContext(match, {
      expandSearchQueries: false,
      evidenceOnly: true,
    }),
  );
  if (offers.length === 0) return 0;

  await persistItemPrices({
    itemId: input.itemId,
    metadataId: input.metadataId,
    shelfType: input.shelfType,
    shelfName: input.shelfName,
    itemNames: bag,
    priceOffers: offers,
  });
  return offers.length;
}
