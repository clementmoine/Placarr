import axios from "axios";

import { coverDownloadCandidates } from "@/lib/media/coverDownloadCandidates";
import { flareSolverrCookiesFor } from "@/lib/http/flareSolverr";
import {
  MIN_COVER_SHORTEST_EDGE,
  readBufferImageMetrics,
  shortestImageEdge,
} from "@/lib/media/imageMetrics";
import {
  remoteImageProxyProviderFor,
  remoteImageRequestHeaders,
} from "@/lib/media/remoteProxy";
import { looksLikeImageBuffer } from "@/lib/media/imageBuffer";

export type RemoteImageFetchResult = {
  buffer: Buffer;
  contentType?: string;
  sourceUrl: string;
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

function isAcceptableCoverFetch(
  ranked: RankedFetch,
): ranked is RankedFetch & { shortestEdge: number } {
  return (
    ranked.shortestEdge === 0 ||
    ranked.shortestEdge >= MIN_COVER_SHORTEST_EDGE
  );
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
): Promise<RemoteImageFetchResult | null> {
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
        if (isAcceptableCoverFetch(ranked)) {
          return ranked;
        }
        best = pickBetterFetch(best, ranked);
        break;
      } catch {
        if (attempt < 2) await sleep(400 + attempt * 600);
      }
    }
  }

  return best;
}

export async function fetchRemoteImageBuffer(
  url: string,
): Promise<RemoteImageFetchResult | null> {
  const candidates = remoteImageDownloadCandidates(url);
  const referer = remoteImageRequestHeaders(url).Referer;
  const proxyProvider = remoteImageProxyProviderFor(url);

  const direct = await fetchBestFromCandidates(candidates, (candidate) =>
    tryFetchUrl(candidate),
  );
  if (direct) return direct;

  if (!referer) return null;

  const shortFlareTimeoutMs = proxyProvider?.remoteImageFlareTimeoutMs;
  if (shortFlareTimeoutMs !== undefined) {
    const flare = await flareSolverrCookiesFor(referer, shortFlareTimeoutMs);
    if (flare) {
      const proxied = await fetchBestFromCandidates(candidates, (candidate) =>
        tryFetchUrl(candidate, {
          Cookie: flare.cookie,
          "User-Agent": flare.userAgent,
        }),
      );
      if (proxied) return proxied;
    }
    return null;
  }

  const flare = await flareSolverrCookiesFor(referer);
  if (!flare) return null;

  return fetchBestFromCandidates(candidates, (candidate) =>
    tryFetchUrl(candidate, {
      Cookie: flare.cookie,
      "User-Agent": flare.userAgent,
    }),
  );
}
