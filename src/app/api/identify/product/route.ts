/**
 * Guest-safe sealed SKU lookup for scan hydrate (skuKey → name / face).
 */
import { NextRequest, NextResponse } from "next/server";

import { parseSealedSkuKey } from "@/core/collect/sealedOpen";
import { requireGuestOrHigher } from "@/lib/auth";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { assetsSealedProductRoleUrl } from "@/lib/packAssetUrls";
import { sealedProductKey } from "@/providers/shared/sealedProducts/indexFormat";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const skuKey = (req.nextUrl.searchParams.get("skuKey") || "").trim();
  if (!skuKey) {
    return NextResponse.json({ error: "skuKey required" }, { status: 400 });
  }
  const parsed = parseSealedSkuKey(skuKey);
  if (!parsed) {
    return NextResponse.json({ error: "invalid skuKey" }, { status: 400 });
  }

  const entry = loadSealedProductEntries(parsed.packId).find(
    (row) =>
      row.slug === parsed.slug ||
      sealedProductKey(parsed.packId, row.slug) === skuKey,
  );
  if (!entry) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }

  const productKey = sealedProductKey(parsed.packId, entry.slug);
  const lang = entry.lang?.trim().toLowerCase() || "fr";
  const imageUrl =
    entry.image?.trim() ||
    assetsSealedProductRoleUrl(parsed.packId, entry.slug, lang, "face");

  return NextResponse.json({
    productKey,
    packId: parsed.packId,
    slug: entry.slug,
    name: (entry.name ?? "").trim() || entry.slug.replace(/-/g, " "),
    imageUrl,
    language: entry.lang,
    kind: entry.kind,
  });
}
