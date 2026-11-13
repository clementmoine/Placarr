import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { isAllowedRemoteImageProxyTarget } from "@/core/enrich/media/remoteImageProxyValidation.server";
import { fetchRemoteImageBuffer } from "@/core/enrich/media/remoteFetch";
import {
  findCachedRemoteImageUpload,
  persistRemoteImageUpload,
} from "@/core/enrich/media/remoteImageDiskCache";
import {
  resolveScreenScraperCoverFallback,
  screenScraperMediaFetchUrl,
} from "@/core/catalog/mediaProxy";

/** Browser may keep a private copy; disk cache is the real win across requests. */
const CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * UI hero must not wait through stacked Flare unlock + download attempts
 * (Booknode Cloudflare can burn ~90s and leave a blank cover). Miss → 404;
 * disk cache / later Sync can still densify.
 */
const PROXY_FETCH_BUDGET_MS = 25_000;

function imageResponse(
  buffer: Buffer,
  contentType: string,
  cacheHit: boolean,
): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType.startsWith("image/")
        ? contentType
        : "image/jpeg",
      "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}, immutable`,
      "X-Placarr-Image-Cache": cacheHit ? "HIT" : "MISS",
    },
  });
}

async function fetchWithinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), budgetMs);
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const rawUrl = req.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json(
      { error: "url is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isAllowedRemoteImageProxyTarget(rawUrl)) {
    return NextResponse.json(
      { error: "URL not allowed" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cached = findCachedRemoteImageUpload(rawUrl);
  if (cached) {
    return imageResponse(cached.buffer, cached.contentType, true);
  }

  const startedAt = Date.now();
  let fetched = await fetchWithinBudget(
    fetchRemoteImageBuffer(screenScraperMediaFetchUrl(rawUrl), {
      allowSubThresholdFallback: true,
    }),
    PROXY_FETCH_BUDGET_MS,
  );

  // A stored ScreenScraper cover may point at a region the game doesn't have
  // (NOMEDIA): fall back to an actually-available cover so old items self-heal.
  if (!fetched) {
    const remainingMs = PROXY_FETCH_BUDGET_MS - (Date.now() - startedAt);
    if (remainingMs > 1_000) {
      const altUrl = await resolveScreenScraperCoverFallback(rawUrl);
      if (altUrl) {
        const altCached = findCachedRemoteImageUpload(altUrl);
        if (altCached) {
          return imageResponse(altCached.buffer, altCached.contentType, true);
        }
        fetched = await fetchWithinBudget(
          fetchRemoteImageBuffer(screenScraperMediaFetchUrl(altUrl), {
            allowSubThresholdFallback: true,
          }),
          remainingMs,
        );
      }
    }
  }

  if (!fetched) {
    return NextResponse.json(
      { error: "Image unavailable" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const persisted = persistRemoteImageUpload(rawUrl, fetched.buffer, {
    contentType: fetched.contentType,
    sourceUrl: fetched.sourceUrl,
  });

  return imageResponse(persisted.buffer, persisted.contentType, false);
}
