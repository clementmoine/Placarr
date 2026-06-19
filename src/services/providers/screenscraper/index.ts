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
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

const fetchFromScreenScraper = createScreenScraperResolver({
  cleanSearchQuery,
  formatScore,
});

type Resolver = (
  name: string,
  barcode?: string | null,
  platform?: string | null,
) => Promise<MetadataResult | null>;

function screenscraperCredentials() {
  const devId = process.env.SCREENSCRAPER_DEV_ID?.trim();
  const devPass = process.env.SCREENSCRAPER_DEV_PASSWORD?.trim();
  if (devId && devPass) {
    return {
      url: `https://api.screenscraper.fr/api2/ssuserInfos.php?devid=${devId}&devpassword=${devPass}&softname=Placarr&output=json`,
      error: "SCREENSCRAPER_DEV_ID / SCREENSCRAPER_DEV_PASSWORD missing",
    };
  }
  const user = process.env.SCREENSCRAPER_USER?.trim();
  const pass = process.env.SCREENSCRAPER_PASSWORD?.trim();
  if (user && pass) {
    return {
      url: `https://api.screenscraper.fr/api2/ssuserInfos.php?devid=${user}&devpassword=${pass}&softname=Placarr&output=json`,
      error: "SCREENSCRAPER_USER / SCREENSCRAPER_PASSWORD missing",
    };
  }
  return null;
}

export const screenscraperModule: ProviderModule = {
  info: {
    id: "screenscraper",
    label: "ScreenScraper",
    types: ["games"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "ageRating",
      "screenshots",
      "releaseDate",
      "people",
    ],
    auth: {
      kind: "key",
      env: ["SCREENSCRAPER_USER", "SCREENSCRAPER_PASSWORD"],
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
  createMetadataAdapter(deps) {
    const fetchFromScreenScraper = deps.fetchFromScreenScraper as Resolver;
    return {
      id: "screenscraper",
      async resolve({ name, barcode, platform }) {
        return fetchFromScreenScraper(name, barcode, platform);
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
    sampleInput: "The Legend of Zelda: Skyward Sword",
    context: { name: "Mario Kart Wii" },
  },
};

export { createScreenScraperResolver, pickSSCover } from "./resolver";
export type { SSMedia } from "./resolver";
