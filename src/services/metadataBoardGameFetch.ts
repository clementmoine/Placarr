import {
  dedupeFieldEvidence,
  metadataFieldEvidence,
} from "@/services/metadataFacts";
import {
  mergeBoardGameMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import { orderedProviderIdsForType } from "@/services/metadataProviderSelection";
import {
  resolveMetadataProvidersInOrder,
  runQueuedMetadataProviderCall,
} from "@/lib/metadataProviderQueue";
import {
  fetchFromBGG,
  metadataProviderResolverMap,
} from "@/services/metadataResolvers";
import { loadBarcodeAlternateNames } from "@/lib/barcodeAlternateNames";
import { buildGameMetadataFallbackNames } from "@/lib/metadataTitleMatching";
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

  const products = await runQueuedMetadataProviderCall("achatmoinscher", () =>
    fetchFromAchatMoinsCher(cleanedBarcode),
  );
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

  const byProvider = await resolveMetadataProvidersInOrder(
    selectedProviderIds,
    { name, barcode, platform },
    metadataProviderResolverMap,
  );

  let bgg = byProvider.get("boardgamegeek") || null;
  const wikidata = byProvider.get("wikidata") || null;
  const retailers = BOARD_GAME_RETAILER_IDS.flatMap((providerId) => {
    const value = byProvider.get(providerId);
    return value ? [{ providerId, value }] : [];
  });

  if (!bgg) {
    const barcodeAlternateNames = await loadBarcodeAlternateNames(barcode);
    const fallbackNames = buildGameMetadataFallbackNames(
      name,
      barcodeAlternateNames,
      [wikidata, ...retailers.map(({ value }) => value)],
    );
    for (const fallbackName of fallbackNames.slice(0, 6)) {
      bgg = await runQueuedMetadataProviderCall("boardgamegeek", () =>
        fetchFromBGG(fallbackName),
      );
      if (bgg) break;
    }
  }

  const bggResolved = bgg;

  const hasPrimaryMetadata = Boolean(
    bggResolved?.title ||
      wikidata?.title ||
      retailers.some(({ value }) => value.title),
  );
  const hasCover = Boolean(
    bggResolved?.imageUrl ||
      wikidata?.imageUrl ||
      retailers.some(({ value }) => value.imageUrl),
  );

  const scraper =
    !hasPrimaryMetadata || !hasCover
      ? await fetchScraperBoardGameFallback(name, barcode)
      : null;

  if (!bggResolved && !wikidata && retailers.length === 0 && !scraper) {
    return null;
  }

  const merged = mergeBoardGameMetadata(
    bggResolved,
    wikidata,
    retailers.map(({ value }) => value),
    scraper,
  );
  const mergedWithEvidence: MetadataResult = {
    ...merged,
    fieldEvidence: dedupeFieldEvidence([
      ...metadataFieldEvidence("BoardGameGeek", bggResolved),
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
