import axios from "axios";

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
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15_000,
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
  let cookieFetch: RankedFetch | null = null;

  const flare = await flareSolverrCookiesFor(referer, timeout);
  if (flare) {
    cookieFetch = await fetchBestFromCandidates(candidates, (candidate) =>
      tryFetchUrl(candidate, {
        Cookie: flare.cookie,
        "User-Agent": flare.userAgent,
      }),
    );
    if (
      cookieFetch &&
      (!fullCandidates.length ||
        coverUrlExpectsHighResolution(cookieFetch.sourceUrl))
    ) {
      return cookieFetch;
    }
  }

  if (fullCandidates.length === 0) {
    return cookieFetch;
  }

  const downloads = await flareSolverrDownloadImages(
    referer,
    fullCandidates.slice(0, 4),
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
