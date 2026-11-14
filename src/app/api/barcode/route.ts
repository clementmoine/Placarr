import { NextRequest, NextResponse } from "next/server";

import { parseSealedSkuKey } from "@/core/collect/sealedOpen";
import { cleanCode } from "@/core/identify/query";
import { resolveBarcode } from "@/core/identify/resolver";
import { resolveSealedSkuByBarcode } from "@/core/identify/resolveSealedSkuByBarcode";
import { requireGuestOrHigher } from "@/lib/auth";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { assetsSealedProductRoleUrl } from "@/lib/packAssetUrls";

function sealedPayload(barcode: string) {
  const resolved = resolveSealedSkuByBarcode(barcode);
  if (!resolved) return null;
  if (resolved.confidence === "sure") {
    const parsed = parseSealedSkuKey(resolved.productKey);
    const entry = parsed
      ? loadSealedProductEntries(resolved.packId).find(
          (row) => row.slug === parsed.slug,
        )
      : null;
    const lang = entry?.lang?.trim().toLowerCase() || "fr";
    return {
      confidence: "sure" as const,
      productKey: resolved.productKey,
      packId: resolved.packId,
      name:
        (entry?.name ?? "").trim() ||
        parsed?.slug.replace(/-/g, " ") ||
        resolved.productKey,
      imageUrl:
        entry?.image?.trim() ||
        (parsed
          ? assetsSealedProductRoleUrl(
              resolved.packId,
              parsed.slug,
              lang,
              "face",
            )
          : null),
      language: entry?.lang ?? null,
    };
  }
  return {
    confidence: "doubt" as const,
    hits: resolved.hits.map((hit) => {
      const parsed = parseSealedSkuKey(hit.productKey);
      const entry = parsed
        ? loadSealedProductEntries(hit.packId).find(
            (row) => row.slug === parsed.slug,
          )
        : null;
      return {
        productKey: hit.productKey,
        packId: hit.packId,
        name:
          (entry?.name ?? "").trim() ||
          parsed?.slug.replace(/-/g, " ") ||
          hit.productKey,
        imageUrl: entry?.image ?? null,
      };
    }),
  };
}

export async function GET(req: NextRequest) {
  // Proxy vers des API tierces (souvent payantes) → auth obligatoire.
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const refreshParam =
    req.nextUrl.searchParams.get("refresh") ||
    req.nextUrl.searchParams.get("noCache") ||
    "";
  const shouldRefresh = ["1", "true", "yes"].includes(
    refreshParam.toLowerCase(),
  );
  const cleanedBarcode = cleanCode(req.nextUrl.searchParams.get("q"));
  const type = req.nextUrl.searchParams.get("type");
  const platformHint = req.nextUrl.searchParams.get("platform");

  if (!cleanedBarcode.length) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  const result = await resolveBarcode(cleanedBarcode, type, {
    refresh: shouldRefresh,
    platformHint,
  });
  return NextResponse.json({
    ...result,
    sealed: sealedPayload(cleanedBarcode),
  });
}
