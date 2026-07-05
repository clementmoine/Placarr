import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { isAllowedRemoteImageProxyTarget } from "@/core/enrich/media/remoteImageProxyValidation.server";
import { fetchRemoteImageBuffer } from "@/core/enrich/media/remoteFetch";

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

  const fetched = await fetchRemoteImageBuffer(rawUrl, {
    allowSubThresholdFallback: true,
  });
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
