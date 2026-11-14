/**
 * Rebrickable API v3 — catalogue LEGO (sets, images, pièces).
 * @see https://rebrickable.com/api/v3/docs/
 */
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { httpGet } from "@/lib/http/httpClient";

const REBRICKABLE_BASE = "https://rebrickable.com/api/v3";

export type RebrickableSet = {
  setNum: string;
  name: string;
  sourceUrl: string;
  year?: number;
  numParts?: number;
  imageUrl?: string;
  themeId?: number;
};

type RebrickableRawSet = {
  set_num?: string;
  name?: string;
  year?: number;
  num_parts?: number;
  set_img_url?: string | null;
  set_url?: string;
  theme_id?: number;
};

type RebrickableListResponse = {
  count?: number;
  results?: RebrickableRawSet[];
};

export function rebrickableApiKey(): string | undefined {
  return process.env.REBRICKABLE_API_KEY?.trim() || undefined;
}

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

/** @internal exported for unit tests */
export function mapRebrickableRawSet(
  raw: RebrickableRawSet | null,
): RebrickableSet | null {
  if (!raw?.set_num?.trim() || !raw.name?.trim()) return null;
  const setNum = raw.set_num.trim();
  return {
    setNum,
    name: raw.name.trim(),
    sourceUrl:
      cleanText(raw.set_url) || `https://rebrickable.com/sets/${setNum}/`,
    year: raw.year,
    numParts: raw.num_parts,
    imageUrl: cleanText(raw.set_img_url) || undefined,
    themeId: raw.theme_id,
  };
}

async function rebrickableGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T | null> {
  const apiKey = rebrickableApiKey();
  if (!apiKey) return null;
  throwIfAborted(signal);
  try {
    const response = await httpGet(`${REBRICKABLE_BASE}${path}`, {
      signal,
      timeout: 20_000,
      headers: {
        Accept: "application/json",
        Authorization: `key ${apiKey}`,
        "User-Agent": "Placarr/1.0 (personal collection)",
      },
    });
    return response.data as T;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function searchRebrickableSets(
  query: string,
  signal?: AbortSignal,
): Promise<RebrickableSet[]> {
  const q = query.trim();
  if (!q) return [];
  const payload = await rebrickableGet<RebrickableListResponse>(
    `/lego/sets/?search=${encodeURIComponent(q)}&page_size=8`,
    signal,
  );
  return (payload?.results ?? [])
    .map((entry) => mapRebrickableRawSet(entry))
    .filter((entry): entry is RebrickableSet => Boolean(entry));
}

export async function fetchRebrickableSetByNum(
  setNum: string,
  signal?: AbortSignal,
): Promise<RebrickableSet | null> {
  const num = setNum.trim();
  if (!num) return null;
  const payload = await rebrickableGet<RebrickableRawSet>(
    `/lego/sets/${encodeURIComponent(num)}/`,
    signal,
  );
  return mapRebrickableRawSet(payload);
}

export async function resolveRebrickableSet(input: {
  name?: string;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<RebrickableSet | null> {
  throwIfAborted(input.signal);
  if (!rebrickableApiKey()) return null;

  const queries = Array.from(
    new Set(
      [...(input.lookupQueries ?? []), input.name ?? ""]
        .map((q) => q.trim())
        .filter(Boolean),
    ),
  );
  for (const query of queries) {
    if (/^\d{3,6}(-\d+)?$/.test(query)) {
      const normalized = query.includes("-") ? query : `${query}-1`;
      const byNum = await fetchRebrickableSetByNum(normalized, input.signal);
      if (byNum) return byNum;
    }
    const hits = await searchRebrickableSets(query, input.signal);
    if (hits[0]) return hits[0];
  }
  return null;
}

export async function collectRebrickableMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchRebrickableSets(query);
  return collectObjectMappingSignals(hits[0] ?? { query });
}
