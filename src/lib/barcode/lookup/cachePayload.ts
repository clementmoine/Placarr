import type { MetadataObservation } from "@/types/metadataObservation";
import {
  parseBarcodeCacheObservations,
  pickCoverUrlFromObservations,
  pickDisplayTitleFromObservations,
} from "@/lib/barcode/evidence/observations";
import { pickBarcodeFieldValuesFromObservations } from "@/lib/barcode/evidence/projections";
import {
  formatDisplayNameWithEdition,
  inferEditionFromNames,
} from "@/lib/barcode/evidence/edition";
import { prisma } from "@/lib/db/prisma";
import {
  BARCODE_CACHE_VERSION,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  versionProvider,
} from "@/lib/barcode/titleUtils";
import {
  clusterSuggestions,
  mergeDuplicateMatches,
  type ResolvedMatch,
} from "@/lib/barcode/evidence";
import { decode as decodeHTMLEntities } from "html-entities";
import { isCleanCachedProvider } from "@/services/provider/evidence";
import { coverUrlQualityRank, isbnCoverUrlForBarcode } from "@/services/provider/registry";
import type { BarcodeCache, RawName } from "@prisma/client";

type CachedBarcodeRecord = BarcodeCache & {
  rawNames: RawName[];
};

function deduplicate<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = keyFn(item).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getPrioritizedImageUrl(title: string): Promise<string | null> {
  const metas = await prisma.metadata.findMany({
    where: { title },
    select: { imageUrl: true },
  });

  if (metas.length === 0) return null;

  // Prefer authoritative box art over screenshot-style covers, by the provider's
  // registry-declared cover quality (coverUrlHost + isRealBoxCover) — no provider
  // named here. Equal ranks keep their original (stable) order.
  const sortedMetas = metas.sort(
    (a, b) =>
      coverUrlQualityRank(b.imageUrl || "") -
      coverUrlQualityRank(a.imageUrl || ""),
  );

  return sortedMetas[0].imageUrl || null;
}

export async function buildCachedBarcodePayload(
  cachedResult: CachedBarcodeRecord,
  type: string | null,
  cleanedBarcode: string,
  options: { markStale?: boolean } = {},
) {
  const canUseRawCoverFromCache =
    !type || !cachedResult.shelfType || cachedResult.shelfType === type;
  const observations = parseBarcodeCacheObservations(cachedResult.observations);
  const projectedTitle = pickDisplayTitleFromObservations(observations);
  const projectedFields = pickBarcodeFieldValuesFromObservations(observations);
  const projectedCover = canUseRawCoverFromCache
    ? pickCoverUrlFromObservations(observations, coverUrlQualityRank)
    : null;
  const rawNames = cachedResult.rawNames.map((rn) => rn.value);
  const filteredNames = filterPlatformRedundancies(rawNames);
  const mappedNamesWithPriority = filteredNames.map((val, index) => {
    const firstNameIsRepresentative =
      isCleanCachedProvider(cachedResult.provider) ||
      options.markStale ||
      cachedResult.provider.includes(BARCODE_CACHE_VERSION);
    const priority = firstNameIsRepresentative && index === 0 ? 2 : 0;
    return { value: val, priority };
  });

  const matches = clusterSuggestions(mappedNamesWithPriority);
  const enrichedMatches = await Promise.all(
    matches.map(async (m) => {
      let coverUrl = await getPrioritizedImageUrl(m.name);

      if (!coverUrl && projectedCover) {
        coverUrl = projectedCover;
      }

      if (!coverUrl && canUseRawCoverFromCache) {
        const matchingRaw = cachedResult.rawNames.find((rn) => {
          const valNorm = rn.value.toLowerCase().trim();
          return (
            valNorm === m.name.toLowerCase().trim() ||
            m.suggestions.some((s) => s.toLowerCase().trim() === valNorm)
          );
        });
        if (matchingRaw?.coverUrl) {
          coverUrl = matchingRaw.coverUrl;
        }
      }

      if (!coverUrl && type === "books") {
        coverUrl = isbnCoverUrlForBarcode(type, cleanedBarcode);
      }

      return { ...m, coverUrl };
    }),
  );

  const mergedMatches = mergeDuplicateMatches(enrichedMatches);
  const preservePlatformSuffix = (type || cachedResult.shelfType) === "games";
  const cleanNameStr = cleanTitleForDisplay(
    decodeHTMLEntities(filteredNames[0] || rawNames[0] || ""),
    { preservePlatformSuffix },
  );
  const cleanSuggestions = Array.from(
    new Set(
      filteredNames.map((s) =>
        cleanTitleForDisplay(decodeHTMLEntities(s), {
          preservePlatformSuffix,
        }),
      ),
    ),
  );
  const cleanMatches = deduplicate(
    mergedMatches.map((m) => ({
      ...m,
      name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
        preservePlatformSuffix,
      }),
      suggestions: Array.from(
        new Set(
          m.suggestions.map((s) =>
            cleanTitleForDisplay(decodeHTMLEntities(s), {
              preservePlatformSuffix,
            }),
          ),
        ),
      ),
    })),
    (m) => m.name,
  );

  const edition =
    inferEditionFromNames(
      [
        cleanNameStr,
        ...cleanSuggestions,
        ...cleanMatches.flatMap((match) => [match.name, ...match.suggestions]),
        ...rawNames,
      ],
      cleanNameStr,
    ) || null;
  const displayName = formatDisplayNameWithEdition(cleanNameStr, edition);

  // Prefer the compile step's persisted title decision (cleanName/displayName/
  // edition columns) over the lossy re-derivation above — that re-derivation
  // strips integral edition terms ("Gottlieb Pinball Classics" → "Gottlieb
  // Pinball"). Pre-migration rows have no displayName and fall back to it.
  const storedDisplayName = cachedResult.displayName?.trim() || null;
  const useStored = storedDisplayName !== null;
  const observationTitle = !useStored ? projectedTitle : null;
  const finalCleanName = useStored
    ? cachedResult.cleanName?.trim() || cleanNameStr
    : observationTitle || cleanNameStr;
  const finalEdition = useStored ? cachedResult.edition?.trim() || null : edition;
  const finalDisplayName = useStored
    ? storedDisplayName
    : observationTitle
      ? formatDisplayNameWithEdition(observationTitle, edition)
      : displayName;
  // Surface the display title as the lead match for a reassembled edition or
  // when the persisted / projected title differs from the (re-stripped) lead.
  const surfaceDisplayName =
    Boolean(finalEdition) ||
    (useStored && finalDisplayName !== cleanMatches[0]?.name) ||
    Boolean(observationTitle && observationTitle !== cleanMatches[0]?.name);

  return {
    provider: options.markStale
      ? versionProvider(cachedResult.provider)
      : cachedResult.provider,
    rawNames: rawNames.map((rn) => decodeHTMLEntities(rn)),
    cleanName: finalCleanName,
    displayName: finalDisplayName,
    edition: finalEdition,
    suggestions: surfaceDisplayName
      ? Array.from(new Set([finalDisplayName, ...cleanSuggestions]))
      : cleanSuggestions,
    matches: surfaceDisplayName
      ? cleanMatches.map((match, index) =>
          index === 0
            ? {
                ...match,
                name: finalDisplayName,
                suggestions: Array.from(
                  new Set([finalDisplayName, ...match.suggestions]),
                ),
              }
            : match,
        )
      : cleanMatches,
    shelfType: cachedResult.shelfType,
    mediaFormat: cachedResult.mediaFormat ?? projectedFields.mediaFormat ?? null,
    platformKey:
      cachedResult.platformKey || projectedFields.platformKey || null,
    observations,
    observationSchemaVersion: cachedResult.observationSchemaVersion ?? null,
    priceNew: cachedResult.priceNew,
    priceUsed: cachedResult.priceUsed,
    priceUsedCIB: cachedResult.priceUsedCIB,
    staleCache: options.markStale || undefined,
  };
}

export type CachedBarcodePayload = Awaited<
  ReturnType<typeof buildCachedBarcodePayload>
>;

export function cleanCompiledResultForResponse(
  selectedResult: {
    rawNames: string[];
    cleanName: string;
    displayName?: string;
    edition?: string | null;
    suggestions: string[];
    matches: ResolvedMatch[];
    observations?: MetadataObservation[];
    observationSchemaVersion?: string;
  },
  selectedType: string,
) {
  const preservePlatformSuffix = selectedType === "games";
  // The compiled cleanName is already the consensus engine's final base/title:
  // when it keeps an edition term ("Gottlieb Pinball Classics", edition null) the
  // word is part of the title, not a re-release suffix. Re-stripping it here is
  // what dropped it to "Gottlieb Pinball" — so preserve edition terms; the base
  // for a GENUINE edition (Ghost Recon 2 + "Classics") was already separated by
  // compile, so there is nothing to preserve there.
  const cleanNameStr = cleanTitleForDisplay(
    decodeHTMLEntities(selectedResult.cleanName),
    { preservePlatformSuffix, preserveEditionTerms: true },
  );
  const edition = selectedResult.edition ?? null;
  const cleanSuggestions = Array.from(
    new Set(
      selectedResult.suggestions.map((s) =>
        cleanTitleForDisplay(decodeHTMLEntities(s), {
          preservePlatformSuffix,
        }),
      ),
    ),
  );
  const cleanMatches = deduplicate(
    selectedResult.matches.map((m) => ({
      ...m,
      name: cleanTitleForDisplay(decodeHTMLEntities(m.name), {
        preservePlatformSuffix,
      }),
      suggestions: Array.from(
        new Set(
          m.suggestions.map((s) =>
            cleanTitleForDisplay(decodeHTMLEntities(s), {
              preservePlatformSuffix,
            }),
          ),
        ),
      ),
    })),
    (m) => m.name,
  );

  const resolvedEdition =
    edition ??
    inferEditionFromNames(
      [
        ...selectedResult.rawNames,
        cleanNameStr,
        ...cleanSuggestions,
        ...cleanMatches.flatMap((match) => [match.name, ...match.suggestions]),
      ],
      cleanNameStr,
    );
  const resolvedDisplayName = formatDisplayNameWithEdition(
    cleanNameStr,
    resolvedEdition,
  );
  // Surface the display title as the lead match whenever it differs from the
  // lead clean match — true both for a reassembled edition ("… — Classics") and
  // for a title whose integral edition term the per-match cleaning stripped
  // ("Gottlieb Pinball" → "Gottlieb Pinball Classics").
  const surfaceDisplayName = resolvedDisplayName !== cleanMatches[0]?.name;
  const finalSuggestions = surfaceDisplayName
    ? Array.from(new Set([resolvedDisplayName, ...cleanSuggestions]))
    : cleanSuggestions;
  const finalMatches = surfaceDisplayName
    ? cleanMatches.map((match, index) =>
        index === 0
          ? {
              ...match,
              name: resolvedDisplayName,
              suggestions: Array.from(
                new Set([resolvedDisplayName, ...match.suggestions]),
              ),
            }
          : match,
      )
    : cleanMatches;

  return {
    rawNames: selectedResult.rawNames.map((rn) => decodeHTMLEntities(rn)),
    cleanName: cleanNameStr,
    displayName: resolvedDisplayName,
    edition: resolvedEdition,
    suggestions: finalSuggestions,
    matches: finalMatches,
    observations: selectedResult.observations,
    observationSchemaVersion: selectedResult.observationSchemaVersion,
  };
}
