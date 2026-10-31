/**
 * Packs that currently publish on-device embedding shards
 * (`/assets/<pack>/card-embedding-index.{json,f16}`). The phone asks once per
 * camera session, then loads / revalidates shards itself.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  listCardEmbeddingIndexPackIds,
  loadCardEmbeddingIndex,
} from "@/core/identify/cardEmbeddingIndex";
import { requireGuestOrHigher } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;
  // Only shards the phone can use (current model/dim) — a pack still on a
  // previous model is skipped here rather than downloaded then rejected.
  const packs = listCardEmbeddingIndexPackIds().filter((id) =>
    Boolean(loadCardEmbeddingIndex(id)?.meta.entries.length),
  );
  return NextResponse.json(
    { packs },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
