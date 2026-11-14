import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { listPackStorytelling } from "@/lib/admin/packStorytelling";
import {
  isCataloguePackId,
  resolveCataloguePackId,
} from "@/lib/admin/cataloguePacks";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const packRaw = url.searchParams.get("pack");
  const pack =
    resolveCataloguePackId(packRaw) ??
    (isCataloguePackId(packRaw) ? packRaw : null);
  if (!pack || !isCataloguePackId(pack)) {
    return NextResponse.json(
      { error: "pack must be a Catalogue pack id" },
      { status: 400 },
    );
  }

  const q = url.searchParams.get("q");
  const stories = listPackStorytelling(pack, { q });
  return NextResponse.json({ pack, stories });
}
