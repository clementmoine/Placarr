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
} from "@/core/identify/cardVisualIndex";
import { requireGuestOrHigher } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { isCataloguePackId } from "@/lib/admin/cataloguePacks";

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

  const throttle = consumeRateLimit(`card-image:${auth.user.id}`, {
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many card lookups" },
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

    const hash = await dHashFromBuffer(buffer);
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
        limit: 5,
        maxDistance: 14,
      });
      return NextResponse.json({
        packId,
        lang: index.lang,
        matches,
        requireConfirm: true,
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
      limit: 5,
      maxDistance: 14,
    });
    return NextResponse.json({
      packIds,
      matches,
      requireConfirm: true,
    });
  } catch (error) {
    console.error("[POST /api/identify/card-image]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
