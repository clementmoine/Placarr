import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/lib/provider/healthUtils";
import axios from "axios";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import type { SourceProduct } from "@/lib/barcode/evidence/types";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { formatScore } from "@/services/metadata/searchUtils";
import { cleanSearchQuery } from "@/services/metadata/searchUtils";
import { resolveWithLookupQueries } from "@/services/metadata/searchUtils";
import { createScreenScraperResolver } from "./resolver";
import {
  buildScreenScraperBaseParams,
  getScreenScraperEnv,
  SCREEN_SCRAPER_ENV_NAMES,
  SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
} from "./env";
import { isScreenScraperQuotaBlocked } from "./cache";
import { screenScraperAttachmentFromMediaUrl } from "./mediaUrl";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";
import { metadataProbe, probeErrorResult } from "@/lib/dev/mappingProbe";

const fetchFromScreenScraper = createScreenScraperResolver({
  cleanSearchQuery,
  formatScore,
});

type Resolver = (
  name: string,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean },
) => Promise<MetadataResult | null>;

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
    coverUrlHost: "screenscraper",
    types: ["games"],
    rateLimited: true,
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
    canonical: true,
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
      async resolve({ name, barcode, platform, isBackground, lookupQueries }: any) {
        return resolveWithLookupQueries(
          lookupQueries,
          name,
          (query) =>
            fetchFromScreenScraper(query, barcode, platform, {
              isBackground,
            }),
        );
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
          const response = await axios.get(
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
      label: "ScreenScraper - Barcode",
      kind: "metadata-barcode",
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
