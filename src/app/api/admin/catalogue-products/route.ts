import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { listCatalogueProducts } from "@/lib/admin/catalogueProducts";
import {
  isCataloguePackId,
  resolveCataloguePackId,
} from "@/lib/admin/cataloguePacks";

export async function GET(req: Request) {
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

  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "48");
  const q = url.searchParams.get("q") ?? undefined;

  return NextResponse.json(
    listCatalogueProducts({
      pack,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 48,
      q,
    }),
  );
}
