import { cleanCode } from "@/lib/barcode/query";
import { cleanSearchQuery } from "@/services/metadataSearchUtils";
import { prisma } from "@/lib/prisma";

const TRAILING_PLATFORM_SUFFIX =
  /\s+(ps1|ps2|ps3|ps4|ps5|xbox(?:\s+original)?|gamecube|wii|psp|nds|3ds|switch)\s*$/i;

export function expandBarcodeAlternateNames(values: string[]): string[] {
  const seen = new Set<string>();
  const expanded: string[] = [];

  for (const value of values) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;

    for (const candidate of [
      trimmed,
      trimmed.replace(TRAILING_PLATFORM_SUFFIX, "").trim(),
      cleanSearchQuery(trimmed),
    ]) {
      const key = candidate.toLowerCase();
      if (!candidate || seen.has(key)) continue;
      seen.add(key);
      expanded.push(candidate);
    }
  }

  return expanded;
}

export async function loadBarcodeAlternateNames(
  barcode?: string | null,
): Promise<string[]> {
  const cleanedBarcode = cleanCode(barcode || "");
  if (!cleanedBarcode) return [];

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });
  if (!cached?.rawNames.length) return [];

  return expandBarcodeAlternateNames(
    cached.rawNames.map((rawName) => rawName.value),
  );
}
