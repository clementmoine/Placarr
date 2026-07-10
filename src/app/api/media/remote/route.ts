import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { isAllowedRemoteImageProxyTarget } from "@/core/enrich/media/remoteImageProxyValidation.server";
import { fetchRemoteImageBuffer } from "@/core/enrich/media/remoteFetch";
import {
  resolveScreenScraperCoverFallback,
  screenScraperMediaFetchUrl,
} from "@/providers/screenscraper/mediaProxy.server";

const CACHE_MAX_AGE_SECONDS = 60 * 60;

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

  const contentType = fetched.contentType?.startsWith("image/")
    ? fetched.contentType
    : "image/jpeg";

  return new NextResponse(new Uint8Array(fetched.buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `private, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  });
}
