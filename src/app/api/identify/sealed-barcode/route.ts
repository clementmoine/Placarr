/**
 * Fast catalogue GTIN → sealed skuKey for live barcode scan.
 */
import { NextRequest, NextResponse } from "next/server";

import { cleanCode } from "@/core/identify/query";
import { resolveSealedSkuByBarcode } from "@/core/identify/resolveSealedSkuByBarcode";
import { requireGuestOrHigher } from "@/lib/auth";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { assetsSealedProductRoleUrl } from "@/lib/packAssetUrls";
import { parseSealedSkuKey } from "@/core/collect/sealedOpen";

function enrichHit(productKey: string, packId: string) {
  const parsed = parseSealedSkuKey(productKey);
  const slug = parsed?.slug;
  const entry = slug
    ? loadSealedProductEntries(packId).find((row) => row.slug === slug)
    : null;
  const lang = entry?.lang?.trim().toLowerCase() || "fr";
  return {
    productKey,
    packId,
    name: (entry?.name ?? "").trim() || slug?.replace(/-/g, " ") || productKey,
    imageUrl:
      entry?.image?.trim() ||
      (slug
        ? assetsSealedProductRoleUrl(packId, slug, lang, "face")
        : null),
    language: entry?.lang ?? null,
    kind: entry?.kind ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const code = cleanCode(req.nextUrl.searchParams.get("q"));
  if (!code) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  const resolved = resolveSealedSkuByBarcode(code);
  if (!resolved) {
    return NextResponse.json({ confidence: "miss", sealed: null });
  }
  if (resolved.confidence === "sure") {
    return NextResponse.json({
      confidence: "sure",
      sealed: enrichHit(resolved.productKey, resolved.packId),
    });
  }
  return NextResponse.json({
    confidence: "doubt",
    sealed: null,
    hits: resolved.hits.map((hit) => enrichHit(hit.productKey, hit.packId)),
  });
}
