/**
 * HowLongToBeat promote/reuse of durable SearchYield (typed bleed search games)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Search is init+POST; evidence uses a synthetic `/search?q=&platform=` URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "howlongtobeat";

/** Typed SearchYield hit (subset required for promote/reuse + pickBest). */
export type HowLongToBeatSearchEvidenceHit = {
  game_id: number;
  game_name: string;
  game_alias?: string;
  game_type?: string;
  game_image?: string;
  comp_main?: number;
  comp_plus?: number;
  comp_100?: number;
  comp_all?: number;
  review_score?: number;
  profile_platform?: string;
  release_world?: number;
};

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isHowLongToBeatSearchHits(
  value: unknown,
): value is HowLongToBeatSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.game_id === "number" &&
      Number.isFinite(record.game_id) &&
      typeof record.game_name === "string" &&
      record.game_name.trim().length > 0 &&
      isOptionalString(record.game_alias) &&
      isOptionalString(record.game_type) &&
      isOptionalString(record.game_image) &&
      isOptionalNumber(record.comp_main) &&
      isOptionalNumber(record.comp_plus) &&
      isOptionalNumber(record.comp_100) &&
      isOptionalNumber(record.comp_all) &&
      isOptionalNumber(record.review_score) &&
      isOptionalString(record.profile_platform) &&
      isOptionalNumber(record.release_world)
    );
  });
}

function isHowLongToBeatSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("howlongtobeat.com") &&
      parsed.pathname.includes("/search") &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return url.includes("howlongtobeat.com") && url.includes("q=");
  }
}

/** Synthetic evidence key for a HowLongToBeat bleed search. */
export function howLongToBeatSearchEvidenceUrl(input: {
  query: string;
  platform?: string;
}): string {
  const url = new URL("https://howlongtobeat.com/search");
  url.searchParams.set("q", input.query.trim());
  if (input.platform?.trim()) {
    url.searchParams.set("platform", input.platform.trim());
  }
  return url.toString();
}

/** Fresh SearchYield hits for a synthetic `/search?q=` URL, or null. */
export async function readHowLongToBeatSearchEvidence(
  searchUrl: string,
): Promise<HowLongToBeatSearchEvidenceHit[] | null> {
  try {
    if (!isHowLongToBeatSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isHowLongToBeatSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn(
      "[HowLongToBeat] Failed to read durable search evidence:",
      error,
    );
    return null;
  }
}

/** Persist typed search games so worker can skip init+POST for the same query. */
export async function promoteHowLongToBeatSearchEvidence(
  searchUrl: string,
  hits: HowLongToBeatSearchEvidenceHit[],
): Promise<void> {
  if (!isHowLongToBeatSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn(
      "[HowLongToBeat] Failed to promote durable search evidence:",
      error,
    );
  }
}
