/**
 * Brickset API v3 — catalogue LEGO (sets, EAN/UPC, boîtes).
 * @see https://brickset.com/article/52664/api-version-3-documentation
 */
import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { httpGet } from "@/lib/http/httpClient";

const BRICKSET_BASE = "https://brickset.com/api/v3.asmx";

export type BricksetSet = {
  setId: number;
  setNumber: string;
  name: string;
  sourceUrl: string;
  year?: number;
  theme?: string;
  subtheme?: string;
  pieces?: number;
  minifigs?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  rating?: number;
  ratingCount?: number;
  ageMin?: number;
  ageMax?: number;
  barcodeEan?: string;
  barcodeUpc?: string;
  description?: string;
  retailPriceEur?: number;
};

type BricksetRawSet = {
  setID?: number;
  number?: string;
  numberVariant?: number;
  name?: string;
  year?: number;
  theme?: string;
  subtheme?: string;
  pieces?: number | null;
  minifigs?: number | null;
  bricksetURL?: string;
  rating?: number;
  ratingCount?: number;
  image?: { imageURL?: string; thumbnailURL?: string };
  ageRange?: { min?: number | null; max?: number | null };
  barcode?: { EAN?: string; UPC?: string };
  extendedData?: { description?: string; notes?: string };
  LEGOCom?: {
    DE?: { retailPrice?: number | null };
    UK?: { retailPrice?: number | null };
    US?: { retailPrice?: number | null };
  };
};

type BricksetGetSetsResponse = {
  status?: string;
  message?: string;
  matches?: number;
  sets?: BricksetRawSet[];
};

export function bricksetApiKey(): string | undefined {
  return process.env.BRICKSET_API_KEY?.trim() || undefined;
}

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function formatSetNumber(raw: BricksetRawSet): string | undefined {
  const number = cleanText(raw.number);
  if (!number) return undefined;
  if (raw.numberVariant != null && raw.numberVariant > 0) {
    return `${number}-${raw.numberVariant}`;
  }
  return number.includes("-") ? number : `${number}-1`;
}

/** @internal exported for unit tests */
export function mapBricksetRawSet(
  raw: BricksetRawSet | null,
): BricksetSet | null {
  if (!raw?.setID || !raw.name?.trim()) return null;
  const setNumber = formatSetNumber(raw);
  if (!setNumber) return null;
  const retail =
    raw.LEGOCom?.DE?.retailPrice ??
    raw.LEGOCom?.UK?.retailPrice ??
    raw.LEGOCom?.US?.retailPrice ??
    undefined;
  return {
    setId: raw.setID,
    setNumber,
    name: raw.name.trim(),
    sourceUrl:
      cleanText(raw.bricksetURL) || `https://brickset.com/sets/${setNumber}`,
    year: raw.year,
    theme: cleanText(raw.theme),
    subtheme: cleanText(raw.subtheme),
    pieces: raw.pieces ?? undefined,
    minifigs: raw.minifigs ?? undefined,
    imageUrl: cleanText(raw.image?.imageURL),
    thumbnailUrl: cleanText(raw.image?.thumbnailURL),
    rating: raw.rating,
    ratingCount: raw.ratingCount,
    ageMin: raw.ageRange?.min ?? undefined,
    ageMax: raw.ageRange?.max ?? undefined,
    barcodeEan: normalizeProductBarcode(raw.barcode?.EAN) || undefined,
    barcodeUpc: normalizeProductBarcode(raw.barcode?.UPC) || undefined,
    description: cleanText(raw.extendedData?.description),
    retailPriceEur:
      typeof retail === "number" && Number.isFinite(retail)
        ? Math.round(retail * 100)
        : undefined,
  };
}

async function bricksetGetSets(
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<BricksetSet[]> {
  const apiKey = bricksetApiKey();
  if (!apiKey) return [];
  throwIfAborted(signal);
  const search = new URLSearchParams({
    apiKey,
    userHash: "",
    params: JSON.stringify(params),
  });
  try {
    const response = await httpGet(
      `${BRICKSET_BASE}/getSets?${search.toString()}`,
      {
        signal,
        timeout: 20_000,
        headers: {
          Accept: "application/json",
          "User-Agent": "Placarr/1.0 (personal collection)",
        },
      },
    );
    const body = response.data as BricksetGetSetsResponse;
    if (body?.status !== "success") return [];
    return (body.sets ?? [])
      .map((entry) => mapBricksetRawSet(entry))
      .filter((entry): entry is BricksetSet => Boolean(entry));
  } catch (error) {
    if (isAbortError(error)) throw error;
    return [];
  }
}

export async function searchBricksetSets(
  query: string,
  signal?: AbortSignal,
): Promise<BricksetSet[]> {
  const q = query.trim();
  if (!q) return [];
  return bricksetGetSets(
    {
      query: q,
      pageSize: 8,
      pageNumber: 1,
      orderBy: "Rank",
      extendedData: 1,
    },
    signal,
  );
}

export async function fetchBricksetSetByNumber(
  setNumber: string,
  signal?: AbortSignal,
): Promise<BricksetSet | null> {
  const number = setNumber.trim();
  if (!number) return null;
  const hits = await bricksetGetSets(
    {
      setNumber: number.includes("-") ? number : `${number}-1`,
      pageSize: 5,
      extendedData: 1,
    },
    signal,
  );
  return hits[0] ?? null;
}

function setMatchesBarcode(set: BricksetSet, barcode: string): boolean {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return false;
  return (
    barcodesEquivalent(normalized, set.barcodeEan) ||
    barcodesEquivalent(normalized, set.barcodeUpc)
  );
}

export async function resolveBricksetSet(input: {
  name?: string;
  barcode?: string | null;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<BricksetSet | null> {
  throwIfAborted(input.signal);
  if (!bricksetApiKey()) return null;

  const barcode = normalizeProductBarcode(input.barcode) || undefined;
  if (barcode) {
    const byBarcode = await searchBricksetSets(barcode, input.signal);
    const match = byBarcode.find((set) => setMatchesBarcode(set, barcode));
    if (match) return match;
  }

  const queries = Array.from(
    new Set(
      [...(input.lookupQueries ?? []), input.name ?? ""]
        .map((q) => q.trim())
        .filter(Boolean),
    ),
  );
  for (const query of queries) {
    // Bare set numbers like 75192 or 75192-1.
    if (/^\d{3,6}(-\d+)?$/.test(query)) {
      const byNumber = await fetchBricksetSetByNumber(query, input.signal);
      if (byNumber) return byNumber;
    }
    const hits = await searchBricksetSets(query, input.signal);
    if (barcode) {
      const match = hits.find((set) => setMatchesBarcode(set, barcode));
      if (match) return match;
      continue;
    }
    if (hits[0]) return hits[0];
  }
  return null;
}

export async function collectBricksetMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchBricksetSets(query);
  return collectObjectMappingSignals(hits[0] ?? { query });
}
