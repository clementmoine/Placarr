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

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const rawUrl = req.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  if (!isAllowedRemoteImageProxyTarget(rawUrl)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  const cached = findCachedRemoteImageUpload(rawUrl);
  if (cached) {
    return imageResponse(cached.buffer, cached.contentType, true);
  }

  let fetched = await fetchRemoteImageBuffer(
    screenScraperMediaFetchUrl(rawUrl),
    {
      allowSubThresholdFallback: true,
    },
  );

  // A stored ScreenScraper cover may point at a region the game doesn't have
  // (NOMEDIA): fall back to an actually-available cover so old items self-heal.
  if (!fetched) {
    const altUrl = await resolveScreenScraperCoverFallback(rawUrl);
    if (altUrl) {
      const altCached = findCachedRemoteImageUpload(altUrl);
      if (altCached) {
        return imageResponse(altCached.buffer, altCached.contentType, true);
      }
      fetched = await fetchRemoteImageBuffer(
        screenScraperMediaFetchUrl(altUrl),
        {
          allowSubThresholdFallback: true,
        },
      );
    }
  }

  if (!fetched) {
    return NextResponse.json({ error: "Image unavailable" }, { status: 404 });
  }

  const persisted = persistRemoteImageUpload(rawUrl, fetched.buffer, {
    contentType: fetched.contentType,
    sourceUrl: fetched.sourceUrl,
  });

  return imageResponse(persisted.buffer, persisted.contentType, false);
}
