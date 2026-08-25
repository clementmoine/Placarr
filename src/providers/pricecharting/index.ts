import type { BarcodeLookupType } from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { matchPrimaryBarcode } from "@/core/catalog/matchContext";
import {
  probeBarcodeMetadataSamples,
  rawProbe,
  type BarcodeMetadataProbeSample,
} from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { pricedOffers } from "@/core/catalog/priceOffers";

import {
  priceChartingAttachmentRole,
  priceChartingAttachmentType,
} from "./imageLabels";
import {
  fetchMetadataFromPriceCharting,
  fetchMetadataFromPriceChartingByName,
  fetchMetadataFromPriceChartingGameUrl,
  fetchPricesFromPriceCharting,
  fetchPricesFromPriceChartingGameUrl,
  priceChartingCatalogAlignsWithTitles,
  priceChartingUrlIsPal,
} from "./fetch";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";
import { buildPriceChartingCatalogLink } from "./catalogLink";
import { productNameFromPriceChartingGameUrl } from "./offerProductName";
import { cleanCode, detectPlatformKey } from "@/core/identify/query";
import { barcodeSuggestsPalRegion } from "@/core/identify/normalize";
import { withMetadataPlatformKeys } from "@/core/enrich/media/platformKeyStamp";
import { barcodeSourceFactsFromFields } from "@/core/identify/evidence/sourceFacts";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type { PriceChartingMetadata } from "@/core/identify/lookup/providerTypes";

export { fetchMetadataFromPriceCharting, fetchPricesFromPriceCharting };

const FALLBACK_BARCODES = ["0045496365226", "5030917191690", "045496360730"];

const METADATA_PROBE_SAMPLES: BarcodeMetadataProbeSample[] = [
  {
    barcode: "0045496365226",
    fallbackName: "Mario Kart Wii",
    fallbackPlatform: "Wii",
    isPal: true,
  },
  {
    barcode: "5030917191690",
    fallbackName: "Super Mario Galaxy",
    fallbackPlatform: "Wii",
    isPal: true,
  },
  {
    barcode: "045496360730",
    fallbackName: "Super Smash Bros. Brawl",
    fallbackPlatform: "Wii",
    isPal: false,
  },
];

const BARCODE_TYPES: BarcodeLookupType[] = ["games", "hardware", "generic"];
const PRICE_SOURCE = "PriceCharting";
const PRICE_SHELF_TYPES = new Set(["games", "hardware"]);

/**
 * Hardware catalog titles often already include the device ("Playstation 3
 * System 60GB"). Game & Watch-style SKUs split device into `platform` and
 * edition into `title` — prepend the device when missing.
 */
function hardwarePriceChartingBarcodeName(
  title: string,
  platform?: string | null,
): string {
  const cleanedTitle = title.replace(/\s+/g, " ").trim();
  const cleanedPlatform = (platform || "").replace(/\s+/g, " ").trim();
  if (!cleanedPlatform) return cleanedTitle;
  const fold = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s*&\s*/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (fold(cleanedTitle).includes(fold(cleanedPlatform))) {
    return cleanedTitle;
  }
  return `${cleanedPlatform} ${cleanedTitle}`;
}

function priceChartingScanOffers(
  prices: NonNullable<NonNullable<PriceChartingMetadata>["prices"]>,
) {
  const sourceExtra = {
    ...(prices.sourceUrl ? { sourceUrl: prices.sourceUrl } : {}),
    ...(prices.productName ? { productName: prices.productName } : {}),
  };
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "loose",
      priceCents: prices.priceUsed,
      rawValue: prices,
      extra: sourceExtra,
    },
    {
      condition: "cib",
      priceCents: prices.priceUsedCIB,
      rawValue: prices,
      extra: sourceExtra,
    },
    {
      condition: "new",
      priceCents: prices.priceNew,
      rawValue: prices,
      extra: sourceExtra,
    },
  ]);
}

/** EUR + US catalog chips when both regional fiches were resolved. */
export function buildPriceChartingRegionLinkFacts(
  pcMeta: PriceChartingMetadata,
): MetadataFact[] {
  const urls = Array.from(
    new Set(
      [pcMeta.url, pcMeta.siblingUrl].filter((url): url is string =>
        Boolean(url?.includes("/game/")),
      ),
    ),
  );
  if (urls.length === 0) return [];

  const multi = urls.length > 1;
  return urls.map((url) => {
    const isPal = priceChartingUrlIsPal(url);
    return {
      kind: "external-link" as const,
      label: multi
        ? `PriceCharting (${isPal ? "EUR" : "US"})`
        : "PriceCharting",
      value: "Voir la fiche",
      url,
      source: "pricecharting",
      confidence: 0.7,
      // Prefer EUR in UI ordering when both regions exist.
      priority: isPal ? 44 : 42,
    };
  });
}

function buildPriceChartingAttachments(
  pcMeta: PriceChartingMetadata,
  isPal: boolean,
) {
  const seen = new Set<string>();
  const attachments: Array<{
    type: "cover" | "image";
    url: string;
    source: string;
    role: string;
    title?: string;
  }> = [];

  const push = (
    url: string | undefined,
    title?: string,
    imageIsPal?: boolean,
  ) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    const regionIsPal = imageIsPal ?? isPal;
    attachments.push({
      type: priceChartingAttachmentType(title),
      url,
      source: "pricecharting",
      role: priceChartingAttachmentRole(title, regionIsPal),
      ...(title ? { title } : {}),
    });
  };

  for (const image of pcMeta.images || []) {
    push(image.url, image.label, image.isPal);
  }
  const primaryImage = pcMeta.images?.find((image) =>
    /main image/i.test(image.label || ""),
  );
  push(
    pcMeta.coverUrl,
    primaryImage?.label ?? pcMeta.images?.[0]?.label,
    primaryImage?.isPal ?? pcMeta.images?.[0]?.isPal,
  );

  return attachments.length > 0 ? attachments : undefined;
}

/** Stable record id for a PriceCharting `/game/{platform}/{slug}` fiche. */
export function parsePriceChartingRecordIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./i, "");
    if (host !== "pricecharting.com") return null;
    const match = parsed.pathname.match(/^\/game\/([^/]+)\/([^/]+)\/?$/i);
    if (!match?.[1] || !match[2]) return null;
    if (/search-products/i.test(match[2])) return null;
    return `${match[1]}/${match[2]}`.toLowerCase();
  } catch {
    return null;
  }
}

function mapPriceChartingMetadataResult(
  pcMeta: PriceChartingMetadata,
  options: { isPal: boolean; barcode?: string },
): MetadataResult {
  const facts: MetadataFact[] = [];
  if (pcMeta.ageRating) {
    facts.push({
      kind: "age-rating",
      label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
      value:
        pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
      source: "pricecharting",
      confidence: 0.62,
      priority: 58,
    });
  }
  facts.push(...buildPriceChartingRegionLinkFacts(pcMeta));

  return withMetadataPlatformKeys({
    title: pcMeta.title,
    platformKey: pcMeta.platform
      ? detectPlatformKey(pcMeta.platform) || undefined
      : undefined,
    barcode: pcMeta.barcode || options.barcode || undefined,
    imageUrl: pcMeta.coverUrl || undefined,
    attachments: buildPriceChartingAttachments(pcMeta, options.isPal),
    facts: facts.length > 0 ? facts : undefined,
  });
}

async function refreshPriceChartingOffers(ctx: BarcodePriceRefreshContext) {
  if (!PRICE_SHELF_TYPES.has(ctx.shelfType)) return [];
  const mediaType = ctx.shelfType === "hardware" ? "hardware" : "games";
  const acceptanceTitles = [
    ctx.primaryName,
    ...ctx.fallbackNames,
    ...ctx.acceptanceTitles,
  ].filter(Boolean);

  // Prefer already-resolved /game/ fiches from metadata links (no second seek).
  const storedUrls = providerProductUrlsForKey(
    "pricecharting",
    ctx.providerProductUrls,
  ).filter((url) => url.includes("/game/") && !url.includes("search-products"));
  const orderedUrls = [...storedUrls].sort((left, right) => {
    const leftPal = priceChartingUrlIsPal(left) ? 1 : 0;
    const rightPal = priceChartingUrlIsPal(right) ? 1 : 0;
    return ctx.isPal ? rightPal - leftPal : leftPal - rightPal;
  });
  for (const url of orderedUrls) {
    const fromUrl = await fetchPricesFromPriceChartingGameUrl(url, {
      ...(ctx.evidenceOnly ? { evidenceOnly: true } : {}),
    });
    if (!fromUrl) continue;
    const productName =
      fromUrl.productName?.trim() ||
      productNameFromPriceChartingGameUrl(fromUrl.sourceUrl || url);
    // Stale pin after rename (Metallic Blue item still pointing at Pink+White).
    if (
      productName &&
      acceptanceTitles.length > 0 &&
      !priceChartingCatalogAlignsWithTitles(productName, acceptanceTitles, {
        mediaType,
        allowFranchiseStem: mediaType === "games",
      })
    ) {
      continue;
    }
    return priceChartingScanOffers(fromUrl);
  }

  // Evidence-only: never fall through to name-seek HTTP (SearchYield alone
  // still needs a detail GET unless DetailYield is already pinned above).
  if (ctx.evidenceOnly) return [];

  // Hardware shelves ("Consoles") are not a PriceCharting platform slug — omit
  // shelfName so we don't invent a platform gate; title residual uses mediaType.
  const fallbackPlatform =
    mediaType === "hardware"
      ? undefined
      : (ctx.shelfName ?? ctx.platformKey ?? undefined);
  const result = await fetchPricesFromPriceCharting(
    matchPrimaryBarcode(ctx) || ctx.cleanedBarcode,
    [ctx.primaryName, ...ctx.fallbackNames].filter(Boolean),
    fallbackPlatform,
    ctx.isPal,
    ctx.isClassics,
    { mediaType },
  );
  if (!result) return [];
  return priceChartingScanOffers(result);
}

export const pricechartingModule = defineProvider({
  info: {
    id: "pricecharting",
    label: "PriceCharting",
    minRequestIntervalMs: 500,
    referencePriceSource: true,
    evidenceOnlyPriceRefresh: true,
    catalogDisplayTitleFallback: true,
    types: ["games", "hardware"],
    capabilities: ["identify", "price", "cover"],
    auth: { kind: "none" },
    supplyMode: "api_live",
    canonical: false,
    isRealBoxCover: true,
    imageScoreAdjustment: 160,
    // GCS CDN host — lets orphan /uploads remaps recover `source` via
    // inferProviderIdFromMediaUrl when the attachment row lost its stamp.
    coverUrlHost: "images.pricecharting.com",
    websiteUrl: "https://www.pricecharting.com/",
    notes: "Prix de référence (jeux + systems/hardware PriceCharting).",
  },
  evidence: {
    label: "PriceCharting",
    sourceWeight: 0.38,
    // UPC/EAN → /game/ redirect is a catalog barcode hit (same role as iCollect
    // offline index). Without this, hardware-only PC hits are discarded as
    // "no canonical resolver" when marketplaces are empty.
    catalogTitleAnchor: true,
  },
  parseMetadataRecordIdFromUrl: parsePriceChartingRecordIdFromUrl,
  createMetadataAdapter() {
    return {
      id: "pricecharting",
      async resolve(ctx) {
        const cleanedBarcode = ctx.barcode ? cleanCode(ctx.barcode) : "";
        const isPal = barcodeSuggestsPalRegion(cleanedBarcode);
        const mediaType = ctx.type === "hardware" ? "hardware" : "games";
        const platform =
          ctx.type === "hardware" ? undefined : ctx.platform || undefined;
        const name = String(ctx.name || "").trim();

        let pcMeta: PriceChartingMetadata | null = null;

        // Prefer a memorized /game/ fiche (same pattern as BDovore pinned tome),
        // but drop it when the item was renamed away from that SKU (finish /
        // platform mismatch) so name/barcode seek can re-pin.
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "pricecharting");
        if (pinnedUrl) {
          pcMeta = await fetchMetadataFromPriceChartingGameUrl(pinnedUrl, {
            fallbackName: name || undefined,
            mediaType,
          });
          if (pcMeta?.title) {
            const acceptanceTitles = Array.from(
              new Set(
                [
                  name,
                  ...(ctx.lookupQueries ?? []),
                  ...(ctx.fallbackNames ?? []),
                  ...(ctx.match?.titles ?? []),
                ].filter(Boolean),
              ),
            );
            if (
              acceptanceTitles.length > 0 &&
              !priceChartingCatalogAlignsWithTitles(
                pcMeta.title,
                acceptanceTitles,
                {
                  mediaType,
                  allowFranchiseStem: mediaType === "games",
                },
              )
            ) {
              console.log(
                `[PriceCharting Metadata] Ignoring stale pinned fiche (title mismatch): ${pinnedUrl}`,
              );
              pcMeta = null;
            }
          }
        }

        if (!pcMeta && cleanedBarcode) {
          pcMeta = await fetchMetadataFromPriceCharting(
            cleanedBarcode,
            name || undefined,
            platform,
            isPal,
            undefined,
            { mediaType },
          );
        }
        if (!pcMeta && name) {
          pcMeta = await fetchMetadataFromPriceChartingByName(
            name,
            platform,
            isPal,
            undefined,
            { mediaType },
          );
        }
        if (!pcMeta) return null;

        return mapPriceChartingMetadataResult(pcMeta, {
          isPal,
          barcode: cleanedBarcode || undefined,
        });
      },
    };
  },
  buildBarcodeTasks(deps, type, { barcode, platformKey }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    const isPal = barcodeSuggestsPalRegion(barcode);
    const mediaType = type === "hardware" ? "hardware" : undefined;
    return {
      pc: deps.fetchMetadataFromPriceCharting(
        barcode,
        undefined,
        type === "games" ? platformKey || undefined : undefined,
        isPal,
        undefined,
        mediaType ? { mediaType } : undefined,
      ),
    };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchMetadataFromPriceCharting,
  }),
  contributeGameBarcodeEnrichment: () => ({
    fetchReferencePriceByBarcode: (
      barcode,
      searchName,
      platform,
      isPal,
      isClassics,
    ) =>
      fetchMetadataFromPriceCharting(
        barcode,
        searchName,
        platform,
        isPal,
        isClassics,
      ),
  }),
  buildCatalogExternalLink(ctx) {
    if (ctx.mediaType !== "games" && ctx.mediaType !== "hardware") return null;
    return buildPriceChartingCatalogLink(ctx);
  },
  isVerifiedCatalogProductUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host !== "pricecharting.com") return false;
    } catch {
      return false;
    }
    return url.includes("/game/") && !url.includes("search-products");
  },
  testHandlers: {
    "pricecharting-barcode": {
      label: "PriceCharting - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchMetadataFromPriceCharting(query),
    },
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: {
      name: "Mario Kart Wii",
      barcode: "0045496365226",
      platform: "Wii",
    },
    fallbackBarcodes: FALLBACK_BARCODES,
  },
  runMappingProbe: () =>
    probeBarcodeMetadataSamples(
      METADATA_PROBE_SAMPLES,
      (sample) =>
        fetchMetadataFromPriceCharting(
          sample.barcode,
          sample.fallbackName,
          sample.fallbackPlatform,
          sample.isPal,
        ),
      rawProbe,
      "PriceCharting",
    ),
  collectMappingRawKeys: async (context) => {
    const sample = METADATA_PROBE_SAMPLES[0];
    const ctx = probeContextOrDefault(context, {
      name: sample.fallbackName || "",
      barcode: sample.barcode,
      platform: sample.fallbackPlatform,
    });
    return mappingRawKeysFromFetch(() =>
      fetchMetadataFromPriceCharting(
        ctx.barcode || sample.barcode,
        ctx.name || sample.fallbackName,
        ctx.platform || sample.fallbackPlatform,
        sample.isPal,
      ),
    );
  },
  buildBarcodeSources(payload, ctx) {
    const pc = payload.pc;
    if (!pc?.title) return [];
    const mediaType = ctx.type === "hardware" ? "hardware" : "games";
    const platformKey = pc.platform ? detectPlatformKey(pc.platform) : null;
    const name =
      mediaType === "hardware"
        ? hardwarePriceChartingBarcodeName(pc.title, pc.platform)
        : pc.platform
          ? `${pc.title} (${pc.platform})`
          : pc.title;
    return [
      {
        mediaType,
        label: "PriceCharting",
        products: [
          {
            name,
            coverUrl: pc.coverUrl,
            platformKey,
            facts: barcodeSourceFactsFromFields({
              platformKey,
              ageRating: pc.ageRating ?? null,
            }),
          },
        ],
      },
    ];
  },
  extractScanPriceOffers(payload, shelfType) {
    if (!PRICE_SHELF_TYPES.has(shelfType) || !payload.pc?.prices) return [];
    return priceChartingScanOffers(payload.pc.prices);
  },
  refreshBarcodePriceOffers: refreshPriceChartingOffers,
});
