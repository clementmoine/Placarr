import { httpGet } from "@/lib/http/httpClient";

import { coverDownloadCandidates } from "@/core/enrich/media/coverDownloadCandidates";
import { coverUrlExpectsHighResolution } from "@/core/enrich/media/coverResolution";
import {
  flareSolverrCookiesFor,
  flareSolverrDownloadImages,
} from "@/lib/http/flareSolverr";
import {
  readBufferImageMetrics,
  shortestImageEdge,
} from "@/core/enrich/media/imageMetrics";
import {
  remoteImageProxyProviderFor,
  remoteImageRequestHeaders,
} from "@/core/enrich/media/remoteProxy";
import { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";

export type RemoteImageFetchResult = {
  buffer: Buffer;
  contentType?: string;
  sourceUrl: string;
};

export type FetchRemoteImageOptions = {
  /**
   * UI proxy may serve a tiny mod11 fallback when /full/ JPEGs are blocked.
   * Localization keeps this false so /full/ URLs are not persisted as CDN thumbs.
   */
  allowSubThresholdFallback?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryFetchUrl(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<RemoteImageFetchResult | null> {
  const response = await httpGet<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15_000,
    // Cookie / UA variants must not share in-flight slots with bare GETs
    // (Anubis HTML must not win the race against a Flare-unlocked JPEG).
    noDedup: true,
    headers: {
      ...remoteImageRequestHeaders(url),
      ...extraHeaders,
    },
    validateStatus: () => true,
  });

  if (response.status !== 200) return null;

  const buffer = Buffer.from(response.data);
  const contentType = response.headers?.["content-type"] as string | undefined;
  if (!looksLikeImageBuffer(buffer, contentType)) return null;

  return { buffer, contentType, sourceUrl: url };
}

export function remoteImageDownloadCandidates(url: string): string[] {
  return Array.from(new Set(coverDownloadCandidates(url)));
}

type RankedFetch = RemoteImageFetchResult & { shortestEdge: number };

async function rankFetchedImageAsync(
  result: RemoteImageFetchResult,
): Promise<RankedFetch> {
  const metrics = await readBufferImageMetrics(result.buffer);
  return {
    ...result,
    shortestEdge: shortestImageEdge(metrics),
  };
}

function pickBetterFetch(
  current: RankedFetch | null,
  next: RankedFetch,
): RankedFetch {
  if (!current) return next;
  if (next.shortestEdge !== current.shortestEdge) {
    return next.shortestEdge > current.shortestEdge ? next : current;
  }
  return next.buffer.length > current.buffer.length ? next : current;
}

async function fetchBestFromCandidates(
  candidates: string[],
  fetchOne: (candidate: string) => Promise<RemoteImageFetchResult | null>,
): Promise<RankedFetch | null> {
  let best: RankedFetch | null = null;

  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fetched = await fetchOne(candidate);
        if (!fetched) {
          if (attempt < 2) await sleep(400 + attempt * 600);
          continue;
        }

        const ranked = await rankFetchedImageAsync(fetched);
        best = pickBetterFetch(best, ranked);
        break;
      } catch {
        if (attempt < 2) await sleep(400 + attempt * 600);
      }
    }
  }

  return best;
}

function expectsHighResolution(url: string): boolean {
  if (coverUrlExpectsHighResolution(url)) return true;
  return remoteImageDownloadCandidates(url).some(coverUrlExpectsHighResolution);
}

function isAcceptableForRequest(
  ranked: RankedFetch | null,
  url: string,
  options: FetchRemoteImageOptions,
): ranked is RankedFetch {
  if (!ranked) return false;
  if (options.allowSubThresholdFallback) return true;
  if (!expectsHighResolution(url)) return true;
  // Prefer a real /full/ asset over a CDN thumb when the request URL promised one.
  return coverUrlExpectsHighResolution(ranked.sourceUrl);
}

function cookieFetchLooksComplete(
  cookieFetch: RankedFetch | null,
  fullCandidates: string[],
): cookieFetch is RankedFetch {
  if (!cookieFetch) return false;
  return (
    fullCandidates.length === 0 ||
    coverUrlExpectsHighResolution(cookieFetch.sourceUrl)
  );
}

async function fetchCandidatesWithFlareCookies(
  candidates: string[],
  unlockUrl: string,
  timeout: number,
): Promise<RankedFetch | null> {
  const flare = await flareSolverrCookiesFor(unlockUrl, timeout);
  if (!flare) return null;
  return fetchBestFromCandidates(candidates, (candidate) =>
    tryFetchUrl(candidate, {
      Cookie: flare.cookie,
      "User-Agent": flare.userAgent,
    }),
  );
}

async function fetchWithOptionalFlare(
  url: string,
  candidates: string[],
  referer: string,
  flareTimeoutMs?: number,
): Promise<RankedFetch | null> {
  const timeout = flareTimeoutMs ?? 60_000;
  const fullCandidates = candidates.filter((candidate) =>
    coverUrlExpectsHighResolution(candidate),
  );

  // 1) Asset URL first — Anubis (LDDb) mints usable auth cookies on the cover
  //    GET; homepage-only cookies often still return challenge HTML.
  // 2) Site referer next (Booknode / Referer-gated CDNs).
  const unlockUrls = Array.from(
    new Set([candidates[0] || url, referer].filter(Boolean)),
  );

  let cookieFetch: RankedFetch | null = null;
  for (const unlockUrl of unlockUrls) {
    cookieFetch = await fetchCandidatesWithFlareCookies(
      candidates,
      unlockUrl,
      timeout,
    );
    if (cookieFetchLooksComplete(cookieFetch, fullCandidates)) {
      return cookieFetch;
    }
  }

  // Prefer /full/ targets when present (Booknode fork with downloadUrls).
  // Plain candidates are included so Anubis hosts still try the browser path
  // when the local FlareSolverr build supports it.
  const downloadTargets = (
    fullCandidates.length > 0 ? fullCandidates : candidates
  ).slice(0, 4);
  if (downloadTargets.length === 0) {
    return cookieFetch;
  }

  const downloads = await flareSolverrDownloadImages(
    referer,
    downloadTargets,
    timeout,
  );
  let best: RankedFetch | null = cookieFetch;
  for (const download of downloads) {
    const ranked = await rankFetchedImageAsync({
      buffer: download.buffer,
      contentType: download.contentType,
      sourceUrl: download.url,
    });
    best = pickBetterFetch(best, ranked);
  }
  return best;
}

export async function fetchRemoteImageBuffer(
  url: string,
  options: FetchRemoteImageOptions = {},
): Promise<RemoteImageFetchResult | null> {
  const candidates = remoteImageDownloadCandidates(url);
  const referer = remoteImageRequestHeaders(url).Referer;
  const proxyProvider = remoteImageProxyProviderFor(url);
  const highResExpected =
    !options.allowSubThresholdFallback && expectsHighResolution(url);

  const direct = await fetchBestFromCandidates(candidates, (candidate) =>
    tryFetchUrl(candidate),
  );

  if (isAcceptableForRequest(direct, url, options)) {
    return direct;
  }

  if (!referer) {
    return highResExpected ? null : direct;
  }

  const shortFlareTimeoutMs = proxyProvider?.remoteImageFlareTimeoutMs;
  const proxied = await fetchWithOptionalFlare(
    url,
    candidates,
    referer,
    shortFlareTimeoutMs,
  );

  if (isAcceptableForRequest(proxied, url, options)) {
    return proxied;
  }

  if (highResExpected) return null;
  return proxied ?? direct;
}
