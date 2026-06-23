import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
  pingUrl,
} from "@/lib/providerHealthUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { formatScore } from "@/services/metadataSearchUtils";
import { cleanSearchQuery } from "@/services/metadataSearchUtils";
import { createScreenScraperResolver } from "./resolver";
import { getScreenScraperEnv, SCREEN_SCRAPER_ENV_NAMES } from "./env";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

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

function screenscraperCredentials() {
  const credentials = getScreenScraperEnv();
  if (!credentials) return null;

  return {
    url: `https://api.screenscraper.fr/api2/ssuserInfos.php?devid=${credentials.devId}&devpassword=${credentials.devPass}&softname=Placarr&output=json`,
  };
}

export const screenscraperModule: ProviderModule = {
  info: {
    id: "screenscraper",
    label: "ScreenScraper",
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
    notes: "Meilleur pour les jaquettes physiques scannées (box-2D/3D).",
  },
  evidence: {
    label: "ScreenScraper",
    sourceWeight: 0.46,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "screenscraper",
      async resolve({ name, barcode, platform, isBackground }: any) {
        return fetchFromScreenScraper(name, barcode, platform, {
          isBackground,
        });
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: (() => {
    const credentials = screenscraperCredentials();
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
        const isUp = await pingUrl(credentials.url);
        return {
          ok: isUp,
          latency: Date.now() - start,
          error: isUp ? null : "Host unreachable or invalid credentials",
        };
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
};

export { createScreenScraperResolver, pickSSCover } from "./resolver";
export type { SSMedia } from "./resolver";
