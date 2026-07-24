/**
 * MyLudo promote/reuse of durable SearchYield (typed datas.php hits)
 * via ProviderEvidence — bridges Next scan and worker refresh.
 * Search is POST-like (GET + body params); evidence uses a synthetic URL key.
 */
import {
  getFreshProviderEvidence,
  putProviderEvidence,
  PROVIDER_EVIDENCE_SEARCH_KIND,
  PROVIDER_EVIDENCE_SEARCH_TTL_MS,
} from "@/core/enrich/providerEvidenceStore";

const PROVIDER_ID = "myludo";
const SEARCH_PATH = "/views/search/datas.php";

/** Typed SearchYield hit (subset required for promote/reuse). */
export type MyLudoSearchEvidenceHit = {
  url: string;
  gameId: string;
  title?: string;
};

function isMyLudoSearchHits(
  value: unknown,
): value is MyLudoSearchEvidenceHit[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return (
      typeof record.url === "string" &&
      record.url.trim().length > 0 &&
      typeof record.gameId === "string" &&
      record.gameId.trim().length > 0 &&
      (record.title === undefined || typeof record.title === "string")
    );
  });
}

function isMyLudoSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes(SEARCH_PATH)) return false;
    const type = parsed.searchParams.get("type")?.trim();
    if (type === "search") {
      return Boolean(parsed.searchParams.get("words")?.trim());
    }
    if (type === "barcode") {
      return Boolean(parsed.searchParams.get("code")?.trim());
    }
    return false;
  } catch {
    return (
      url.includes(SEARCH_PATH) &&
      (url.includes("words=") || url.includes("code="))
    );
  }
}

/** Synthetic evidence key for a MyLudo search/barcode request. */
export function myLudoSearchEvidenceUrl(params: {
  type: "search" | "barcode";
  words?: string;
  code?: string;
}): string {
  const url = new URL(`https://www.myludo.fr${SEARCH_PATH}`);
  url.searchParams.set("type", params.type);
  if (params.type === "barcode" && params.code) {
    url.searchParams.set("code", params.code);
  } else if (params.words) {
    url.searchParams.set("words", params.words);
  }
  return url.toString();
}

/** Fresh SearchYield hits for a synthetic datas.php search URL, or null. */
export async function readMyLudoSearchEvidence(
  searchUrl: string,
): Promise<MyLudoSearchEvidenceHit[] | null> {
  try {
    if (!isMyLudoSearchUrl(searchUrl)) return null;
    const row = await getFreshProviderEvidence(PROVIDER_ID, searchUrl);
    if (!row || row.kind !== PROVIDER_EVIDENCE_SEARCH_KIND) return null;
    if (!isMyLudoSearchHits(row.yieldJson)) return null;
    return row.yieldJson;
  } catch (error) {
    console.warn("[MyLudo] Failed to read durable search evidence:", error);
    return null;
  }
}

/** Persist typed search hits so worker can skip repeating the same search GET. */
export async function promoteMyLudoSearchEvidence(
  searchUrl: string,
  hits: MyLudoSearchEvidenceHit[],
): Promise<void> {
  if (!isMyLudoSearchUrl(searchUrl)) return;
  try {
    await putProviderEvidence({
      providerId: PROVIDER_ID,
      url: searchUrl,
      kind: PROVIDER_EVIDENCE_SEARCH_KIND,
      yieldJson: hits,
      ttlMs: PROVIDER_EVIDENCE_SEARCH_TTL_MS,
    });
  } catch (error) {
    console.warn("[MyLudo] Failed to promote durable search evidence:", error);
  }
}
