import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getCatalogueProductDetailAsync } from "@/lib/admin/catalogueProducts";
import {
  isCataloguePackId,
  resolveCataloguePackId,
} from "@/lib/admin/cataloguePacks";

type RouteContext = {
  params: Promise<{ productKey: string }>;
};

/**
 * Full sealed SKU for the Scellés content dialog.
 * `productKey` is URL-encoded (`pokemon%3A%3Aslug`).
 */
export async function GET(req: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const pack =
    resolveCataloguePackId(url.searchParams.get("pack")) ??
    (isCataloguePackId(url.searchParams.get("pack"))
      ? url.searchParams.get("pack")
      : null);
  if (!pack || !isCataloguePackId(pack)) {
    return NextResponse.json(
      { error: "pack must be a Catalogue pack id" },
      { status: 400 },
    );
  }

  const { productKey: rawKey } = await context.params;
  const productKey = decodeURIComponent(rawKey ?? "").trim();
  if (!productKey) {
    return NextResponse.json({ error: "productKey required" }, { status: 400 });
  }

  const detail = await getCatalogueProductDetailAsync(pack, productKey);
  if (!detail) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
