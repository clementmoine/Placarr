/**
 * Photo → top‑k printKeys from on-disk visual indexes.
 * Detect+crop card (AABB / homography), then DINOv2 with dHash fallback when
 * the embedding is soft (common on small / loose live frames).
 */
import { NextRequest, NextResponse } from "next/server";

import {
  embedCardFaceBuffer,
  prefetchCardEmbed,
} from "@/core/identify/cardEmbed";
import {
  embeddingIndexesAvailable,
  loadCardEmbeddingIndex,
  matchCardEmbedding,
  matchCardEmbeddingAcrossPacks,
  matchCardEmbeddingByCollectorHint,
} from "@/core/identify/cardEmbeddingIndex";
import {
  parseCollectorNumberHint,
  printKeyMatchesCollectorHint,
  rerankMatchesByCollectorHint,
} from "@/core/identify/collectorNumberHint";
import {
  buildCardIdentifyViews,
  finalizeIdentifyConfidence,
  IDENTIFY_EMBED_SHORTLIST_MAX,
  mergeCardIdentifyMatches,
  pickHybridIdentifyMatches,
} from "@/core/identify/cardIdentifyViews";
import {
  listCardVisualIndexPackIds,
  loadCardVisualIndex,
  type CardVisualMatch,
} from "@/core/identify/cardVisualIndex";
import {
  extractCardVisualSignals,
  matchCardVisualSignals,
  matchCardVisualSignalsAcrossPacks,
} from "@/core/identify/cardVisualSignals";
import { requireGuestOrHigher } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { isCataloguePackId } from "@/lib/admin/cataloguePacks";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import {
  prefetchPaddleCollectorOcr,
  recognizeCollectorBandServer,
} from "@/lib/server/ocr/paddleCollectorOcr";

// Warm PP-OCR + DINOv2 outside the identify hot path (soft-fail).
void prefetchPaddleCollectorOcr();
void prefetchCardEmbed();

/** Live camera: art-band dHash ≤10; 14 flooded FP across games. */
const DHASH_MAX_DISTANCE = 10;
const DHASH_MIN_MARGIN = 2;
/**
 * DINOv2 milli-dissimilarity search ceiling (candidates only — the sure /
 * doubt / miss gate lives in identifyConfidence.ts). Correct live hits reach
 * ~500 on the worst phone frames; a tighter ceiling turned them into empty
 * shortlists → silent miss instead of an honest doubt.
 */
const EMBED_MAX_DISTANCE = 450;
const EMBED_MIN_MARGIN = 20;
const LIVE_LIMIT = 8;
/** Dewarp + a few AABB fallbacks — keep ≤4 for live latency. */
const VIEW_LIMIT = 4;

function withFaceUrl(match: CardVisualMatch): CardVisualMatch & {
  faceUrl: string | null;
  method?: "embed" | "dhash";
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

function sanitizePreferLang(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lang = raw.trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(lang)) return null;
  return lang.slice(0, 2);
}

type EmbedViewsResult = {
  matches: CardVisualMatch[];
  /** First view query vector — reused for OCR break-glass (no second embed). */
  query: Float32Array | null;
};

async function matchEmbedViews(
  views: { buffer: Buffer }[],
  packId: string | null,
  packIds: string[],
  preferLang: string | null,
): Promise<EmbedViewsResult | null> {
  const queries = (
    await Promise.all(views.map((v) => embedCardFaceBuffer(v.buffer)))
  ).filter((q): q is Float32Array => q != null);
  if (!queries.length) return null;
  const query = queries[0] ?? null;

  if (packId) {
    const index = loadCardEmbeddingIndex(packId);
    if (!index?.meta.entries.length) return null;
    return {
      query,
      matches: mergeCardIdentifyMatches(
        queries.map((q) =>
          matchCardEmbedding(q, index, {
            limit: LIVE_LIMIT,
            maxDistance: EMBED_MAX_DISTANCE,
            minMargin: 0,
            preferLang,
          }),
        ),
        { limit: LIVE_LIMIT, minMargin: EMBED_MIN_MARGIN },
      ),
    };
  }

  const embedPackIds = packIds.filter(
    (id) => loadCardEmbeddingIndex(id)?.meta.entries.length,
  );
  if (!embedPackIds.length) return null;
  return {
    query,
    matches: mergeCardIdentifyMatches(
      queries.map((q) =>
        matchCardEmbeddingAcrossPacks(q, {
          packIds: embedPackIds,
          limit: LIVE_LIMIT,
          maxDistance: EMBED_MAX_DISTANCE,
          minMargin: 0,
          preferLang,
        }),
      ),
      { limit: LIVE_LIMIT, minMargin: EMBED_MIN_MARGIN },
    ),
  };
}

async function matchVisualViews(
  views: { buffer: Buffer }[],
  packId: string | null,
  packIds: string[],
): Promise<CardVisualMatch[] | null> {
  const signals = (
    await Promise.all(
      views.map((v) => extractCardVisualSignals(v.buffer, { artBand: true })),
    )
  ).filter((s): s is NonNullable<typeof s> => s != null);
  if (!signals.length) return null;

  if (packId) {
    const index = loadCardVisualIndex(packId);
    if (!index?.entries.length) return null;
    return mergeCardIdentifyMatches(
      signals.map((query) =>
        matchCardVisualSignals(query, index, {
          limit: LIVE_LIMIT,
          maxDHash: DHASH_MAX_DISTANCE,
          minMargin: 0,
        }),
      ),
      { limit: LIVE_LIMIT, minMargin: DHASH_MIN_MARGIN },
    );
  }

  if (!packIds.length) return null;
  const indexes = packIds
    .map((id) => loadCardVisualIndex(id))
    .filter((idx): idx is NonNullable<typeof idx> =>
      Boolean(idx?.entries.length),
    );
  if (!indexes.length) return null;
  return mergeCardIdentifyMatches(
    signals.map((query) =>
      matchCardVisualSignalsAcrossPacks(query, indexes, {
        limit: LIVE_LIMIT,
        maxDHash: DHASH_MAX_DISTANCE,
        minMargin: 0,
      }),
    ),
    { limit: LIVE_LIMIT, minMargin: DHASH_MIN_MARGIN },
  );
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

    const packIds = packId ? [packId] : listCardVisualIndexPackIds();
    // Gallery file uploads may be already-cropped faces (detector abstains
    // when the card fills >92% of the frame). Live camera must not.
    const sourceRaw = form.get("source");
    const fromGallery =
      typeof sourceRaw === "string" && sourceRaw.trim() === "gallery";
    /**
     * Full-client scan stack posts live frames with `fallback=1` only when
     * WASM/WebGPU identify failed. Gallery uploads stay server-primary.
     * `live` without fallback is still accepted during migration.
     */
    const fallbackRaw = form.get("fallback");
    const isFallback =
      fallbackRaw === "1" ||
      fallbackRaw === "true" ||
      req.nextUrl.searchParams.get("fallback") === "1";
    void isFallback;
    const preferLang = sanitizePreferLang(form.get("lang"));
    const ocrRaw = form.get("ocrText");
    let collectorHint =
      typeof ocrRaw === "string" ? parseCollectorNumberHint(ocrRaw) : null;

    const built = await buildCardIdentifyViews(buffer, {
      limit: VIEW_LIMIT,
      allowUndetectedFallbacks: fromGallery,
    });
    if (!built.views.length) {
      // Honest miss — empty table / no card / unreadable. Never invent hits.
      if (built.abstain === "unreadable") {
        return NextResponse.json(
          { error: "unreadable image", matches: [], abstain: built.abstain },
          { status: 422 },
        );
      }
      return NextResponse.json({
        matches: [],
        abstain: built.abstain ?? "no_card",
        requireConfirm: true,
      });
    }

    const views = built.views;
    const useEmbed = embeddingIndexesAvailable(packId ? [packId] : undefined);
    // PP-OCR on the dewarped/live card face in parallel with embed/dHash —
    // never blocks the critical match path beyond Promise.all.
    const ocrSource = views[0]?.buffer ?? buffer;
    const [embedResult, visualMatches, serverOcr] = await Promise.all([
      useEmbed
        ? matchEmbedViews(views, packId, packIds, preferLang)
        : Promise.resolve(null),
      matchVisualViews(views, packId, packIds),
      // Init is outside this timeout; 2.5s covers CPU contention with CLIP.
      recognizeCollectorBandServer(ocrSource, { timeoutMs: 2500 }),
    ]);
    const embedMatches = embedResult?.matches ?? null;
    const embedQuery = embedResult?.query ?? null;

    if (!embedMatches && !visualMatches) {
      return NextResponse.json(
        {
          matches: [],
          error:
            "visual index missing — run Catalogue Sync / buildCardVisualIndex",
        },
        { status: 503 },
      );
    }

    if (!collectorHint && serverOcr?.text) {
      collectorHint = parseCollectorNumberHint(serverOcr.text);
    }

    // Multi-pack: soft ceiling = IDENTIFY_EMBED_SHORTLIST_MAX (DINOv2 scale,
    // see identifyConfidence.ts). Cross-game abstain still blocks Naruto→DBS.
    const picked = pickHybridIdentifyMatches(embedMatches, visualMatches, {
      embedSoftDistance: IDENTIFY_EMBED_SHORTLIST_MAX,
      dhashSharpDistance: packId ? 8 : 6,
    });
    let method = picked.method;
    let shortlist = picked.matches;

    const embedTop = embedMatches?.[0] ?? null;
    const ocrAgreesWithEmbed =
      Boolean(collectorHint) &&
      Boolean(embedTop) &&
      printKeyMatchesCollectorHint(embedTop!.printKey, collectorHint!, null, {
        requireSet: Boolean(collectorHint?.set),
      });

    // Soft cross-game dHash often empties hybrid while CLIP #1 is right
    // (TB2-045: embed=108 dbscg, dhash=18 foreign). If OCR agrees with CLIP,
    // trust the embed shortlist — do not let sleeve/foil dHash veto.
    if (!shortlist.length && ocrAgreesWithEmbed && embedMatches) {
      shortlist = embedMatches;
      method = "embed";
    }

    // OCR collector beats a wrong-game global CLIP neighbor.
    // Reuse the CLIP query already computed — never embed twice.
    if (collectorHint && embedQuery && !ocrAgreesWithEmbed) {
      const byHint = matchCardEmbeddingByCollectorHint(
        embedQuery,
        collectorHint,
        {
          packIds: packId ? [packId] : packIds,
          preferLang,
          limit: LIVE_LIMIT,
          maxDistance: EMBED_MAX_DISTANCE,
        },
      );
      if (byHint.length) {
        shortlist = byHint;
        method = "embed";
      }
    }

    const reranked = rerankMatchesByCollectorHint(shortlist, collectorHint);
    const ocrReinforced =
      Boolean(collectorHint?.set) &&
      Boolean(reranked[0]) &&
      printKeyMatchesCollectorHint(
        reranked[0]!.printKey,
        collectorHint!,
        null,
        { requireSet: true },
      );
    const finalized = finalizeIdentifyConfidence(reranked, method, {
      ocrReinforced,
    });
    const matches = finalized.matches.map((m) => ({
      ...withFaceUrl(m),
      method: method === "hybrid" ? "dhash" : method,
      confidence: finalized.confidence,
    }));
    const index = packId ? loadCardVisualIndex(packId) : null;
    const ocrText =
      serverOcr?.text || (typeof ocrRaw === "string" ? ocrRaw : null) || null;
    const ocrStatus = serverOcr?.status ?? (ocrText ? "ok" : "empty");

    return NextResponse.json({
      packId: packId ?? undefined,
      lang: index?.lang,
      packIds: packId ? undefined : packIds,
      method,
      confidence: finalized.confidence,
      collectorHint: collectorHint?.needle,
      collectorSet: collectorHint?.set ?? null,
      ocrText,
      ocrStatus,
      ocrEngine: serverOcr?.engine ?? null,
      ocrSourceWidth: serverOcr?.sourceWidth ?? null,
      ocrSourceHeight: serverOcr?.sourceHeight ?? null,
      ocrWords: serverOcr?.words ?? [],
      viewsTried: views.length,
      viewIds: views.map((v) => v.id),
      // Always surface nearest neighbors for client debug HUD (even on miss).
      bestEmbedDistance: embedMatches?.[0]?.distance ?? null,
      bestDhashDistance: visualMatches?.[0]?.distance ?? null,
      bestEmbedKey: embedMatches?.[0]?.printKey ?? null,
      bestDhashKey: visualMatches?.[0]?.printKey ?? null,
      matches,
      requireConfirm: true,
      ambiguous: finalized.confidence !== "sure",
    });
  } catch (error) {
    console.error("[POST /api/identify/card-image]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
