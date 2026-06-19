import axios from "axios";

import { fetchCoverFromCoverProjectCdn } from "./cdnLookup";

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.thecoverproject.net/",
};

async function fetchCoverFromCoverProjectSearch(
  name: string,
  platformName: string,
): Promise<string | null> {
  const queries = [
    platformName ? `${name} ${platformName}` : null,
    name,
  ].filter(Boolean) as string[];

  for (const q of queries) {
    try {
      const searchUrl = `https://www.thecoverproject.net/search_simple.php?name=${encodeURIComponent(q)}`;
      const res = await axios.get<string>(searchUrl, {
        headers: SEARCH_HEADERS,
        timeout: 12000,
      });
      const html = res.data;

      const cdnThumbMatch = html.match(
        /(https?:\/\/[^"']*coverproject[^"']*(?:_thumb|_cover)[^"']*\.(?:jpg|png|webp))/i,
      );
      if (cdnThumbMatch) {
        return cdnThumbMatch[1];
      }

      const cdnMatch = html.match(
        /(https?:\/\/[^"']*coverproject\.sfo2\.cdn[^"']*\.(?:jpg|png|webp))/i,
      );
      if (cdnMatch) return cdnMatch[1];
    } catch (error: unknown) {
      const status =
        typeof error === "object" && error !== null && "response" in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 403) {
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[CoverProject] Search failed for "${q}": ${message}`);
    }
  }

  return null;
}

/**
 * Resolves a Cover Project front cover via the public CDN (Cloudflare-safe),
 * with HTML search as a secondary fallback when the site is reachable.
 */
export async function fetchCoverFromCoverProject(
  name: string,
  platformName: string,
): Promise<string | null> {
  const cdnCover = await fetchCoverFromCoverProjectCdn(name, platformName);
  if (cdnCover) {
    return cdnCover;
  }

  return fetchCoverFromCoverProjectSearch(name, platformName);
}
