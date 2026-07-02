import { resolveMetadataDisplayTitle } from "@/lib/title/refineCatalogDisplayTitle";
import { pickBestCatalogDisplayTitle } from "@/lib/title/displayScore";

import { isBarcodePlaceholderItemName } from "./placeholderName";

/**
 * Structural shape shared by MetadataResult and the Prisma metadata row
 * (null-tolerant), so suggestions work on both without conversion.
 */
export type MetadataTitleSource = {
  title?: string | null;
  aliases?: string[] | null;
  regionalTitles?: Array<{ text: string }> | null;
};

function uniqueTrimmedTitles(
  values: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(trimmed);
  }

  return ordered;
}

export function collectMetadataTitleSuggestions(
  metadata: MetadataTitleSource | null | undefined,
  options: {
    itemName?: string | null;
    barcode?: string | null;
  } = {},
): string[] {
  if (!metadata) return [];

  const itemName = options.itemName?.trim() ?? "";
  const barcode = options.barcode ?? null;
  const candidates = uniqueTrimmedTitles([
    resolveMetadataDisplayTitle(metadata, barcode),
    metadata.title,
    ...(metadata.aliases || []),
    ...(metadata.regionalTitles || []).map((entry) => entry.text),
    itemName,
  ]);

  const filtered = candidates.filter(
    (candidate) => !isBarcodePlaceholderItemName(candidate, barcode),
  );

  const pool = filtered.length > 0 ? filtered : candidates;

  const preferred =
    resolveMetadataDisplayTitle(metadata, barcode) ||
    pickBestCatalogDisplayTitle(pool) ||
    pool[0];

  return uniqueTrimmedTitles([preferred, ...pool]);
}

export function resolveBestMetadataTitleSuggestion(
  metadata: MetadataTitleSource | null | undefined,
  options: {
    itemName?: string | null;
    barcode?: string | null;
  } = {},
): string | null {
  return collectMetadataTitleSuggestions(metadata, options)[0] ?? null;
}
