import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/core/catalog/healthUtils";
import { httpGet } from "@/lib/http/httpClient";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { SourceProduct } from "@/core/identify/evidence/types";
import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { formatScore } from "@/core/enrich/search/searchUtils";
import { cleanSearchQuery } from "@/core/enrich/search/searchUtils";
import {
  createScreenScraperResolver,
  rewriteScreenScraperGameInfoUrl,
} from "./resolver";
import { getScreenScraperSystemId } from "@/core/identify/platforms/platforms";
import {
  buildScreenScraperBaseParams,
  getScreenScraperEnv,
  SCREEN_SCRAPER_ENV_NAMES,
  SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
} from "./env";
import { isScreenScraperQuotaBlocked } from "./cache";
import { screenScraperAttachmentFromMediaUrl } from "./mediaUrl";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { metadataProbe, probeErrorResult } from "@/lib/dev/mappingProbe";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { getCachedScreenScraperGame } from "./cache";

function screenScraperExtractableRawKeys(
  game: Record<string, unknown> | null | undefined,
): string[] {
  if (!game) return [];
  return collectObjectMappingSignals({
    noms: game.noms,
    synopsis: game.synopsis,
    medias: game.medias,
    dates: game.dates,
    editeur: game.editeur,
    developpeur: game.developpeur,
    classifications: game.classifications,
    note: game.note,
    joueurs: game.joueurs,
    modes: game.modes,
    id: game.id,
  });
}

const fetchFromScreenScraper = createScreenScraperResolver({
  cleanSearchQuery,
  formatScore,
});

// Build ScreenScraper evidence products: the canonical title plus its regional
// titles and aliases (each tagged with its region; non-primary spellings flagged
// as aliases), all carrying the same cover and platform key.
function buildScreenScraperProducts(
  ss: NonNullable<BarcodeLookupPayload["ss"]>,
): SourceProduct[] {
  const products: SourceProduct[] = [
    { name: ss.title!, coverUrl: ss.imageUrl, platformKey: ss.platformKey },
  ];
  for (const regionalTitle of ss.regionalTitles || []) {
    products.push({
      name: regionalTitle.text,
      coverUrl: ss.imageUrl,
      region: regionalTitle.region,
      platformKey: ss.platformKey,
      isAlias:
        regionalTitle.text.toLowerCase().trim() !==
        ss.title?.toLowerCase().trim(),
    });
  }
  for (const alias of ss.aliases || []) {
    const regional = ss.regionalTitles?.find(
      (title) => title.text.toLowerCase().trim() === alias.toLowerCase().trim(),
    );
    products.push({
      name: alias,
      coverUrl: ss.imageUrl,
      region: regional?.region,
      platformKey: ss.platformKey,
      isAlias: true,
    });
  }
  return products;
}

export const screenscraperModule: ProviderModule = {
  info: {
    id: "screenscraper",
    label: "ScreenScraper",
    factLabel: "SS",
    coverUrlHost: "screenscraper.fr",
    types: ["games"],
    rateLimited: true,
    // API terms: ~1 call/s per user — keep a margin.
    minRequestIntervalMs: 1_100,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "ageRating",
      "screenshots",
      "releaseDate",
      "people",
      "players",
    ],
    auth: {
      kind: "key",
      env: SCREEN_SCRAPER_ENV_NAMES,
      free: true,
    },
    supplyMode: "api_live",
    canonical: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    authoritative3dCoverRole: true,
    websiteUrl: "https://www.screenscraper.fr/",
    apiKeyDashboardUrl: "https://www.screenscraper.fr/",
    metadataMatchRecheck: true,
    gameMediaGallerySource: true,
    mappingProbeRetry: true,
    notes: "Meilleur pour les jaquettes physiques scannées (box-2D/3D).",
  },
  contributeGameBarcodeEnrichment: () => ({
    fetchGameMediaByBarcode: (name, barcode, platform) =>
      fetchFromScreenScraper(name, barcode, platform),
  }),
  isMetadataQuotaBlocked: isScreenScraperQuotaBlocked,
  evidence: {
    label: "ScreenScraper",
    sourceWeight: 0.46,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "screenscraper",
      async resolve({
        name,
        barcode,
        platform,
        isBackground,
        lookupQueries,
        signal,
      }) {
        return fetchFromScreenScraper(name, barcode, platform, {
          isBackground,
          signal,
          lookupQueries,
        });
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: (() => {
    const credentials = getScreenScraperEnv();
    if (!credentials) {
      return createUnconfiguredHealthCheck(
        "screenscraper",
        "ScreenScraper",
        "ScreenScraper credentials missing",
      );
    }
    return createMetadataHealthCheck(
      "screenscraper",
      "ScreenScraper",
      async () => {
        const start = Date.now();
        try {
          const response = await httpGet<{ response?: { error?: unknown } }>(
            "https://api.screenscraper.fr/api2/jeuRecherche.php",
            {
              params: {
                ...buildScreenScraperBaseParams(credentials),
                recherche: "zelda",
                systemeid: "9",
              },
              timeout: SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
              validateStatus: () => true,
            },
          );
          const latency = Date.now() - start;
          const apiError = response.data?.response?.error;
          const ok = response.status === 200 && !apiError;
          return {
            ok,
            latency,
            error: ok
              ? null
              : apiError
                ? String(apiError)
                : `HTTP ${response.status}`,
          };
        } catch (error) {
          return {
            ok: false,
            latency: Date.now() - start,
            error: error instanceof Error ? error.message : "Request failed",
          };
        }
      },
    );
  })(),
  testHandlers: {
    "screenscraper-barcode": {
      label: "ScreenScraper - Barcode cache",
      kind: "metadata-barcode",
      // SS has no EAN index — only resolves when a prior title lookup pinned a gameId.
      run: (query) => fetchFromScreenScraper("", query),
    },
    "screenscraper-metadata": {
      label: "ScreenScraper - Metadata",
      kind: "metadata",
      run: (query) => fetchFromScreenScraper(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "ScreenScraper",
      () => fetchFromScreenScraper(ctx.name, ctx.barcode, ctx.platform),
      "games",
    );
  },
  mappingProbe: {
    sampleInput: "The Legend of Zelda: Skyward Sword (Wii)",
    context: { name: "The Legend of Zelda: Skyward Sword", platform: "wii" },
  },
  runMappingProbe: async () => {
    if (isScreenScraperQuotaBlocked()) {
      return probeErrorResult(
        "ScreenScraper API quota exceeded — lookups pause for ~20 minutes",
        "blocked",
      );
    }
    const credentials = getScreenScraperEnv();
    if (!credentials) {
      return probeErrorResult(
        `ScreenScraper credentials missing — set ${SCREEN_SCRAPER_ENV_NAMES.join(" / ")}`,
        "blocked",
      );
    }
    const metadata = await fetchFromScreenScraper(
      "The Legend of Zelda: Skyward Sword",
      null,
      "wii",
    );
    const probe = metadataProbe(metadata);
    if (probe) return probe;
    return probeErrorResult(
      "No ScreenScraper match for probe sample — quota or title mismatch",
      "empty",
    );
  },
  collectMappingRawKeys: async (context) => {
    if (isScreenScraperQuotaBlocked()) return [];
    const ctx = probeContextOrDefault(context, {
      name: "The Legend of Zelda: Skyward Sword",
      platform: "wii",
    });
    const metadata = await fetchFromScreenScraper(
      ctx.name,
      ctx.barcode ?? null,
      ctx.platform ?? undefined,
    );
    const gameId = metadata?.externalIds?.screenscraper;
    const cached =
      gameId != null ? await getCachedScreenScraperGame(Number(gameId)) : null;
    return cached
      ? screenScraperExtractableRawKeys(cached as Record<string, unknown>)
      : collectObjectMappingSignals(metadata);
  },
  buildBarcodeSources(payload) {
    if (!payload.ss?.title) return [];
    return [
      {
        mediaType: "games",
        label: "ScreenScraper",
        products: buildScreenScraperProducts(payload.ss),
      },
    ];
  },
  isVerifiedCatalogProductUrl(url) {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "www.screenscraper.fr" &&
        parsed.pathname.includes("gameinfos.php") &&
        Boolean(parsed.searchParams.get("gameid"))
      );
    } catch {
      return false;
    }
  },
  normalizeCatalogProductUrl(url, ctx) {
    return rewriteScreenScraperGameInfoUrl(
      url,
      getScreenScraperSystemId(ctx?.platformKey),
    );
  },
  inferImageAttachmentFromMediaUrl(url) {
    const inferred = screenScraperAttachmentFromMediaUrl(url);
    if (!inferred) return null;
    return {
      type: inferred.type,
      role: inferred.role,
      source: "screenscraper",
    };
  },
};

export { createScreenScraperResolver, pickSSCover } from "./resolver";
export type { SSMedia } from "./resolver";
