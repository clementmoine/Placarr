import { detectPlatformKey } from "@/lib/barcode/query";
import {
  containsGameClassicsKeyword,
  GAME_CLASSICS_KEYWORDS,
} from "@/lib/barcode/listingTerms";
import { cleanSearchQuery } from "@/lib/search/query";
import { createGameBarcodeEnrichmentDeps } from "@/services/provider/barcode";

import type { GameBarcodeEnrichmentDeps } from "@/types/providerModule";

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
      platform?: { name?: string | null } | null;
    } | null;
  } | null;
  calListings: NamedListing[];
  amc: NamedListing[];
  freakxy: NamedListing[];
  ebay: NamedListing[];
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

  pushListingSignals(
    inputs.calListings,
    candidates,
    productPlatformSignals,
    0.9,
  );
  pushListingSignals(inputs.amc, candidates, productPlatformSignals, 1.1);
  pushListingSignals(inputs.freakxy, candidates, productPlatformSignals, 0.8);
  pushListingSignals(inputs.ebay, candidates, productPlatformSignals, 0.9);

  const detectedPlatform =
    pickPlatformKeyFromSignals(productPlatformSignals) ||
    inputs.contextPlatformKey;

  let gameTitle = "";
  if (inputs.pc?.title) gameTitle = inputs.pc.title;
  else if (inputs.sd?.igdb_metadata?.name) {
    gameTitle = inputs.sd.igdb_metadata.name;
  } else if (inputs.ebay[0]?.name) gameTitle = inputs.ebay[0].name;
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
  enrichmentDeps?: GameBarcodeEnrichmentDeps;
}): Promise<{ pc: unknown; ss: unknown }> {
  const deps = params.enrichmentDeps ?? createGameBarcodeEnrichmentDeps();
  const context = buildGameLookupContext(params.inputs);
  const gameDbPlatform = context.detectedPlatform || params.contextPlatformKey;
  let pc = params.pc;

  if (
    !pc &&
    context.gameTitle &&
    gameDbPlatform &&
    deps.fetchReferencePriceByBarcode
  ) {
    try {
      console.log(
        `[Barcode enrich] Reference-price fallback for ${context.gameTitle} (pal=${context.isPal}, classics=${context.isClassics})`,
      );
      pc = await deps.fetchReferencePriceByBarcode(
        params.cleanedBarcode,
        context.gameTitle,
        gameDbPlatform,
        context.isPal,
        context.isClassics,
      );
    } catch (error) {
      console.error(
        `[Barcode enrich] Reference-price fallback failed (${params.searchLabel}):`,
        error,
      );
    }
  }

  let ss: unknown = null;
  if (gameDbPlatform && deps.fetchGameMediaByBarcode) {
    try {
      ss = await deps.fetchGameMediaByBarcode(
        context.gameTitle,
        params.cleanedBarcode,
        gameDbPlatform,
      );
    } catch (error) {
      console.error(
        `[Barcode enrich] Game media lookup failed (${params.searchLabel}):`,
        error,
      );
    }
  }

  return { pc, ss };
}

export function pickMovieTitleFromListings(
  ebay: NamedListing[],
  amc: NamedListing[],
  calListings: NamedListing[],
): string {
  if (ebay[0]?.name) return ebay[0].name;
  if (amc[0]?.name) return amc[0].name;
  if (calListings[0]?.name) return calListings[0].name;
  return "";
}

export async function fetchTmdbForMovieTitle(
  movieTitle: string,
  logLabel: string,
  enrichmentDeps?: GameBarcodeEnrichmentDeps,
): Promise<unknown> {
  if (!movieTitle) return null;

  const deps = enrichmentDeps ?? createGameBarcodeEnrichmentDeps();
  if (!deps.fetchMovieByTitle) return null;

  try {
    const cleanedMovieTitle = cleanSearchQuery(movieTitle);
    if (!cleanedMovieTitle) return null;

    console.log(
      `[Barcode enrich] Movie name-database lookup (${logLabel}): "${cleanedMovieTitle}"`,
    );
    return deps.fetchMovieByTitle(cleanedMovieTitle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Barcode enrich] Movie name-database lookup failed (${logLabel}):`,
      message,
    );
    return null;
  }
}
