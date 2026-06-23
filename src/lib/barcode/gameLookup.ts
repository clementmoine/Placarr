import { detectPlatformKey } from "@/lib/barcode/query";
import {
  containsGameClassicsKeyword,
  GAME_CLASSICS_KEYWORDS,
} from "@/lib/barcode/listingTerms";
import { cleanSearchQuery } from "@/services/metadataSearchUtils";
import {
  fetchFromScreenScraper,
  fetchFromTMDB,
} from "@/services/metadataResolvers";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";

export const CLASSICS_KEYWORDS = GAME_CLASSICS_KEYWORDS;

export type PlatformSignal = {
  value?: string | null;
  weight: number;
};

export type NamedListing = {
  name: string;
  /** New/used price (cents) when the source resolved to a single product (e.g. ChasseAuxLivres). */
  priceNew?: number;
  priceUsed?: number;
};

export type GameLookupInputs = {
  pc: { title?: string; platform?: string } | null;
  sd: {
    igdb_metadata?: {
      name?: string;
      platform?: { name?: string } | null;
    } | null;
  } | null;
  calListings: NamedListing[];
  amc: NamedListing[];
  freakxy: NamedListing[];
  picclick: NamedListing[];
  contextPlatformKey: string | null;
};

export function pickPlatformKeyFromSignals(
  signals: PlatformSignal[],
): string | null {
  const scores = new Map<string, number>();

  for (const signal of signals) {
    if (!signal.value) continue;
    const platformKey = detectPlatformKey(signal.value);
    if (!platformKey) continue;
    scores.set(platformKey, (scores.get(platformKey) || 0) + signal.weight);
  }

  const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best) return null;
  if (second && best[1] - second[1] < 0.4) return null;

  return best[0];
}

function pushListingSignals(
  listings: NamedListing[],
  candidates: string[],
  platformSignals: PlatformSignal[],
  weight: number,
) {
  listings.forEach((listing) => {
    candidates.push(listing.name);
    platformSignals.push({ value: listing.name, weight });
  });
}

export function buildGameLookupContext(inputs: GameLookupInputs) {
  const candidates: string[] = [];
  const productPlatformSignals: PlatformSignal[] = [];

  if (inputs.pc?.title) {
    const value = inputs.pc.platform
      ? `${inputs.pc.title} (${inputs.pc.platform})`
      : inputs.pc.title;
    candidates.push(value);
    productPlatformSignals.push({
      value,
      weight: inputs.pc.platform ? 3.5 : 1.2,
    });
  }
  if (inputs.sd?.igdb_metadata?.name) {
    const sdPlatform = inputs.sd.igdb_metadata.platform?.name;
    const value = sdPlatform
      ? `${inputs.sd.igdb_metadata.name} (${sdPlatform})`
      : inputs.sd.igdb_metadata.name;
    candidates.push(value);
    productPlatformSignals.push({ value, weight: sdPlatform ? 1.4 : 0.8 });
  }

  pushListingSignals(inputs.calListings, candidates, productPlatformSignals, 0.9);
  pushListingSignals(inputs.amc, candidates, productPlatformSignals, 1.1);
  pushListingSignals(inputs.freakxy, candidates, productPlatformSignals, 0.8);
  pushListingSignals(inputs.picclick, candidates, productPlatformSignals, 0.9);

  const detectedPlatform =
    pickPlatformKeyFromSignals(productPlatformSignals) ||
    inputs.contextPlatformKey;

  let gameTitle = "";
  if (inputs.pc?.title) gameTitle = inputs.pc.title;
  else if (inputs.sd?.igdb_metadata?.name) {
    gameTitle = inputs.sd.igdb_metadata.name;
  } else if (inputs.picclick[0]?.name) gameTitle = inputs.picclick[0].name;
  else if (inputs.amc[0]?.name) gameTitle = inputs.amc[0].name;
  else if (inputs.calListings[0]?.name) gameTitle = inputs.calListings[0].name;
  else if (inputs.freakxy[0]?.name) gameTitle = inputs.freakxy[0].name;

  const hasNtscIndicator = candidates.some((candidate) =>
    /\b(ntsc|us|usa|jp|jpn|japan)\b/i.test(candidate),
  );

  return {
    candidates,
    platformSignals: productPlatformSignals,
    detectedPlatform,
    gameTitle,
    isPal: !hasNtscIndicator,
    isClassics: candidates.some(containsGameClassicsKeyword),
  };
}

export async function enrichGameBarcodeLookups(params: {
  cleanedBarcode: string;
  contextPlatformKey: string | null;
  inputs: GameLookupInputs;
  pc: unknown;
  searchLabel: "games" | "generic";
}): Promise<{ pc: unknown; ss: unknown }> {
  const context = buildGameLookupContext(params.inputs);
  const gameDbPlatform = context.detectedPlatform || params.contextPlatformKey;
  let pc = params.pc;

  if (!pc && context.gameTitle && gameDbPlatform) {
    try {
      console.log(
        `[PriceCharting Fallback] Barcode not found, trying name fallback: ${context.gameTitle} (isPal: ${context.isPal}, isClassics: ${context.isClassics})`,
      );
      pc = await fetchMetadataFromPriceCharting(
        params.cleanedBarcode,
        context.gameTitle,
        gameDbPlatform,
        context.isPal,
        context.isClassics,
      );
    } catch (error) {
      console.error(
        `[PriceCharting Fallback] Error in ${params.searchLabel} search:`,
        error,
      );
    }
  }

  let ss: unknown = null;
  if (gameDbPlatform) {
    try {
      ss = await fetchFromScreenScraper(
        context.gameTitle,
        params.cleanedBarcode,
        gameDbPlatform,
      );
    } catch (error) {
      console.error(
        `[ScreenScraper] Error fetching in ${params.searchLabel} search:`,
        error,
      );
    }
  }

  return { pc, ss };
}

export function pickMovieTitleFromListings(
  picclick: NamedListing[],
  amc: NamedListing[],
  calListings: NamedListing[],
): string {
  if (picclick[0]?.name) return picclick[0].name;
  if (amc[0]?.name) return amc[0].name;
  if (calListings[0]?.name) return calListings[0].name;
  return "";
}

export async function fetchTmdbForMovieTitle(
  movieTitle: string,
  logLabel: string,
): Promise<unknown> {
  if (!movieTitle) return null;

  try {
    const cleanedMovieTitle = cleanSearchQuery(movieTitle);
    if (!cleanedMovieTitle) return null;

    console.log(
      `[TMDB ${logLabel}] Querying TMDB for: "${cleanedMovieTitle}" (from: "${movieTitle}")`,
    );
    return fetchFromTMDB(cleanedMovieTitle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[TMDB] Error fetching in ${logLabel} search:`, message);
    return null;
  }
}
