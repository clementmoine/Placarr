import { isBarcodePlaceholderItemName } from "@/core/item/placeholderName";
import { isMetadataTitleAligned } from "@/core/metadata/titleMatching";

import {
  hasCatalogReferenceListingNoise,
  pickBestCatalogDisplayTitle,
} from "./displayScore";

export function shouldRefineCatalogDisplayTitle(
  title: string,
  barcode?: string | null,
): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;

  return (
    hasCatalogReferenceListingNoise(trimmed) ||
    isBarcodePlaceholderItemName(trimmed, barcode)
  );
}

export function refineCatalogDisplayTitle(
  preliminaryTitle: string,
  candidates: Array<string | null | undefined>,
  barcode?: string | null,
): string {
  const trimmed = preliminaryTitle.trim();
  if (!trimmed) return preliminaryTitle;

  if (!shouldRefineCatalogDisplayTitle(trimmed, barcode)) {
    return trimmed;
  }

  const resolvedBarcode = barcode ?? trimmed;
  const isBarcodePlaceholder = isBarcodePlaceholderItemName(
    trimmed,
    resolvedBarcode,
  );

  const nonEmpty = candidates.filter((candidate): candidate is string =>
    Boolean(candidate?.trim()),
  );
  const filtered = isBarcodePlaceholder
    ? nonEmpty.filter(
        (candidate) =>
          !isBarcodePlaceholderItemName(candidate, resolvedBarcode) &&
          !hasCatalogReferenceListingNoise(candidate),
      )
    : nonEmpty.filter(
        (candidate) =>
          isMetadataTitleAligned({ title: candidate }, [trimmed], 0.58) ||
          isMetadataTitleAligned({ title: trimmed }, [candidate], 0.58),
      );

  return pickBestCatalogDisplayTitle(filtered) ?? trimmed;
}

export function resolveMetadataDisplayTitle(
  metadata: {
    title?: string | null;
    aliases?: string[] | null;
    regionalTitles?: Array<{ text: string }> | null;
  },
  barcode?: string | null,
): string | undefined {
  const preliminary = metadata.title?.trim();
  if (!preliminary) return undefined;

  const candidates = [
    preliminary,
    ...(metadata.aliases || []),
    ...(metadata.regionalTitles || []).map((entry) => entry.text),
  ];

  return refineCatalogDisplayTitle(preliminary, candidates, barcode);
}
