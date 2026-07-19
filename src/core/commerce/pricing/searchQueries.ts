import { stripLegalMarkSymbols } from "@/core/enrich/search/query";
import {
  hasExplicitVolumeMarker,
  stripVolumeMarkersKeepingNumber,
} from "@/core/enrich/titles/volumeNumber";
import { stripTitleIntentYear } from "@/core/enrich/titles/intentYear";

function normalizedShelfName(shelfName?: string | null): string {
  return (shelfName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function physicalMediaHintsFromShelfName(
  shelfName?: string | null,
): string[] {
  const shelf = normalizedShelfName(shelfName);
  const hints: string[] = [];
  if (/bluray|blu-ray|4k|uhd/.test(shelf)) hints.push("bluray");
  if (/\bdvd\b/.test(shelf)) hints.push("dvd");
  if (/vinyl|disque/.test(shelf)) hints.push("vinyl");
  if (/\bcd\b/.test(shelf)) hints.push("cd");
  return hints;
}

/** Marketplace queries: media-specific variants first, then bare titles. */
export function buildPriceSearchQueries(
  names: string[],
  shelfName?: string | null,
): string[] {
  const hints = physicalMediaHintsFromShelfName(shelfName);
  const queries: string[] = [];
  const seen = new Set<string>();

  const add = (value: string) => {
    const trimmed = stripLegalMarkSymbols(value.trim()) || value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(trimmed);
  };

  for (const name of names) {
    const raw = stripLegalMarkSymbols(name.trim()) || name.trim();
    if (!raw) continue;
    // "(2023)" is a shelf disambiguator — search the catalog title without it.
    const trimmed = stripTitleIntentYear(raw) || raw;
    for (const hint of hints) {
      if (!trimmed.toLowerCase().includes(hint)) {
        add(`${trimmed} ${hint}`);
      }
    }
    if (hasExplicitVolumeMarker(trimmed)) {
      const bareIssue = stripVolumeMarkersKeepingNumber(trimmed);
      add(bareIssue);
      // Marketplace copy usually spaces French interim suffixes ("100 bis").
      const spacedBare = bareIssue.replace(
        /(\d+)(bis|ter|quater)\b/gi,
        "$1 $2",
      );
      add(spacedBare);
      const spacedMarked = trimmed.replace(
        /(n[°º]\s*\d+)(bis|ter|quater)\b/gi,
        "$1 $2",
      );
      add(spacedMarked);
    }
    add(trimmed);
  }

  return queries;
}
