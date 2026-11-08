/**
 * Manifest of packs that publish on-device embedding shards
 * (`/assets/<pack>/card-embedding-index.{json,f16}` and product full-frame
 * twins): size, freshness and centroid per pack, cheapest first. The phone
 * asks once per camera session, shortlists packs by centroid for each query
 * and streams shards in the background — it never has to download everything
 * before answering.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  buildClientPackManifest,
  buildClientProductPackManifest,
} from "@/core/identify/clientPackManifest";
import { requireGuestOrHigher } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;
  // Only shards the phone can use (current model/dim) — a pack still on a
  // previous model is skipped here rather than downloaded then rejected.
  const packs = buildClientPackManifest();
  const productPacks = buildClientProductPackManifest();
  return NextResponse.json(
    { packs, productPacks },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
