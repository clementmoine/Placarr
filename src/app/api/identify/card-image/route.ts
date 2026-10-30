/**
 * Photo → top‑k printKeys from on-disk visual indexes (dHash).
 * User must confirm — no auto-accept. No pack default in core/API.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  dHashFromBuffer,
  listCardVisualIndexPackIds,
  loadCardVisualIndex,
  matchCardVisualHash,
  matchCardVisualHashAcrossPacks,
  type CardVisualMatch,
} from "@/core/identify/cardVisualIndex";
import { requireGuestOrHigher } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { isCataloguePackId } from "@/lib/admin/cataloguePacks";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";

/** Live camera: art-band dHash ≤10; 14 flooded FP across games. */
const LIVE_MAX_DISTANCE = 10;
const LIVE_LIMIT = 8;
const LIVE_MIN_MARGIN = 2;

function withFaceUrl(match: CardVisualMatch): CardVisualMatch & {
  faceUrl: string | null;
} {
  const packId = match.packId?.trim();
  const rel = match.artRel?.trim();
  if (!packId || !rel) {
    return { ...match, faceUrl: null };
  }
  const parts = rel.split(/[/\\]/).filter(Boolean);
  if (!parts.length) return { ...match, faceUrl: null };
  return {
    ...match,
    faceUrl: assetsPackFileUrl(packId, ...parts),
  };
}

function sanitizePackId(raw: string): string | null {
  const packId = raw.trim();
  if (!packId || packId.includes("..") || pathLooksAbsolute(packId)) {
    return null;
  }
  if (!isCataloguePackId(packId)) return null;
  return packId;
}

function pathLooksAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value);
}

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Live camera ~1 sample/s while hunting; slower once a suggestion is stable.
  // ~10 min of continuous hunt at 1/s, or a long confirm session.
  const throttle = consumeRateLimit(`card-image:${auth.user.id}`, {
    limit: 600,
    windowMs: 10 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "card_lookup_rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("image");
    const packRaw = form.get("packId");
    const packId =
      typeof packRaw === "string" && packRaw.trim()
        ? sanitizePackId(packRaw)
        : null;
    if (typeof packRaw === "string" && packRaw.trim() && !packId) {
      return NextResponse.json({ error: "invalid packId" }, { status: 400 });
    }
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 1_000 || buffer.length > 12_000_000) {
      return NextResponse.json({ error: "bad image size" }, { status: 400 });
    }

    // Art-band dHash — same crop as index build (must stay in sync).
    const hash = await dHashFromBuffer(buffer, { artBand: true });
    if (!hash) {
      return NextResponse.json({ error: "unreadable image" }, { status: 422 });
    }

    if (packId) {
      const index = loadCardVisualIndex(packId);
      if (!index || index.entries.length === 0) {
        return NextResponse.json(
          {
            matches: [],
            error:
              "visual index missing — run Catalogue Sync / buildCardVisualIndex",
          },
          { status: 503 },
        );
      }
      const matches = matchCardVisualHash(hash, index, {
        limit: LIVE_LIMIT,
        maxDistance: LIVE_MAX_DISTANCE,
        minMargin: LIVE_MIN_MARGIN,
      }).map(withFaceUrl);
      return NextResponse.json({
        packId,
        lang: index.lang,
        matches,
        requireConfirm: true,
        ambiguous: matches.some((m) => m.ambiguous),
      });
    }

    const packIds = listCardVisualIndexPackIds();
    if (!packIds.length) {
      return NextResponse.json(
        {
          matches: [],
          error:
            "visual index missing — run Catalogue Sync / buildCardVisualIndex",
        },
        { status: 503 },
      );
    }

    const matches = matchCardVisualHashAcrossPacks(hash, {
      packIds,
      limit: LIVE_LIMIT,
      maxDistance: LIVE_MAX_DISTANCE,
      minMargin: LIVE_MIN_MARGIN,
    }).map(withFaceUrl);
    return NextResponse.json({
      packIds,
      matches,
      requireConfirm: true,
      ambiguous: matches.some((m) => m.ambiguous),
    });
  } catch (error) {
    console.error("[POST /api/identify/card-image]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
