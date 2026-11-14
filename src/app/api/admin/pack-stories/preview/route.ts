import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { resolveStoryMentionPreview } from "@/lib/admin/storyMentionPreview";
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

  const kindRaw = (url.searchParams.get("kind") ?? "").trim().toLowerCase();
  const kind = kindRaw === "print" || kindRaw === "sealed" ? kindRaw : null;
  const id = url.searchParams.get("id")?.trim() || "";
  const label = url.searchParams.get("label")?.trim() || undefined;
  if (!kind || !id) {
    return NextResponse.json(
      { error: "kind (print|sealed) and id are required" },
      { status: 400 },
    );
  }

  const preview = await resolveStoryMentionPreview({
    packId: pack,
    kind,
    id,
    label,
  });
  return NextResponse.json(preview);
}
