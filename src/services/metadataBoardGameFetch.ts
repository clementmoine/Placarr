import {
  dedupeFieldEvidence,
  metadataFieldEvidence,
} from "@/services/metadataFacts";
import {
  mergeBoardGameMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import { orderedProviderIdsForType } from "@/services/metadataProviderSelection";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import { PRESTASHOP_RETAILER_CONFIGS } from "@/services/providers/prestashop";
import { fetchFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import type { MetadataResult } from "@/types/metadataProvider";

const BOARD_GAME_RETAILER_IDS = [
  "philibert",
  ...PRESTASHOP_RETAILER_CONFIGS.map((config) => config.id),
];

const BOARD_GAME_RETAILER_LABELS: Record<string, string> = {
  philibert: "Philibert",
  ...Object.fromEntries(
    PRESTASHOP_RETAILER_CONFIGS.map((config) => [config.id, config.label]),
  ),
};

async function fetchScraperBoardGameFallback(
  name: string,
  barcode?: string | null,
): Promise<MetadataResult | null> {
  const cleanedBarcode = barcode?.replace(/[^\d]/g, "") || "";
  if (!cleanedBarcode) return null;

  const products = await fetchFromAchatMoinsCher(cleanedBarcode);
  const product = products[0];
  if (!product?.name) return null;

  return {
    title: product.name,
    barcode: cleanedBarcode,
    imageUrl: product.coverUrl || undefined,
    attachments: product.coverUrl
      ? [{ type: "cover", url: product.coverUrl, source: "achatmoinscher" }]
      : undefined,
  };
}

export async function fetchFromAllBoardGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const boardGameProviderOrder = [
    "boardgamegeek",
    "wikidata",
    ...BOARD_GAME_RETAILER_IDS,
  ];
  const selectedProviderIds = orderedProviderIdsForType(
    "boardgames",
    boardGameProviderOrder,
  );

  const settled = await Promise.allSettled(
    selectedProviderIds.map(async (providerId) => ({
      providerId,
      value: await metadataProviderResolverMap
        .get(providerId)
        ?.resolve({ name, barcode, platform }),
    })),
  );

  const byProvider = new Map<string, MetadataResult | null>();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    byProvider.set(item.value.providerId, item.value.value || null);
  }

  const bgg = byProvider.get("boardgamegeek") || null;
  const wikidata = byProvider.get("wikidata") || null;
  const retailers = BOARD_GAME_RETAILER_IDS.flatMap((providerId) => {
    const value = byProvider.get(providerId);
    return value ? [{ providerId, value }] : [];
  });

  const hasPrimaryMetadata = Boolean(
    bgg?.title || wikidata?.title || retailers.some(({ value }) => value.title),
  );
  const hasCover = Boolean(
    bgg?.imageUrl ||
      wikidata?.imageUrl ||
      retailers.some(({ value }) => value.imageUrl),
  );

  const scraper =
    !hasPrimaryMetadata || !hasCover
      ? await fetchScraperBoardGameFallback(name, barcode)
      : null;

  if (!bgg && !wikidata && retailers.length === 0 && !scraper) {
    return null;
  }

  const merged = mergeBoardGameMetadata(
    bgg,
    wikidata,
    retailers.map(({ value }) => value),
    scraper,
  );
  const mergedWithEvidence: MetadataResult = {
    ...merged,
    fieldEvidence: dedupeFieldEvidence([
      ...metadataFieldEvidence("BoardGameGeek", bgg),
      ...metadataFieldEvidence("Wikidata", wikidata),
      ...retailers.flatMap(({ providerId, value }) =>
        metadataFieldEvidence(
          BOARD_GAME_RETAILER_LABELS[providerId] || providerId,
          value,
        ),
      ),
      ...metadataFieldEvidence("AchatMoinsCher", scraper),
      ...metadataFieldEvidence("MergedEngine", merged, {
        confidence: 0.78,
        priority: 190,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(mergedWithEvidence, name);
}
