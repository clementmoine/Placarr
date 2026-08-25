import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/config";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import "@/lib/foilMetaLoad.server";
import {
  loadCardsIndexJson,
  loadFoilManifest,
  loadFragStems,
  loadLiveFoilMasks,
  loadLiveOwned,
  loadMaterialSheets,
  loadReprintMeta,
  loadSharedMotifs,
  loadTextureFlags,
} from "@/lib/foilMetaLoad";

/**
 * Foil meta for browser hydrate (playroom / FoilCardImage).
 * Prefer this over `/assets/…` JSON — one admin-auth round-trip, no asset CDN.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const raw = new URL(req.url).searchParams.get("pack")?.trim() || "pokemon";
  const pack = cataloguePackInfo(raw);
  if (!pack?.hasFoilMeta) {
    return NextResponse.json({ error: "unknown pack" }, { status: 400 });
  }
  if (pack.id === "lorcana") {
    return NextResponse.json({
      cardsIndex: loadCardsIndexJson("lorcana"),
      manifest: loadFoilManifest("lorcana"),
    });
  }
  return NextResponse.json({
    liveFoilMasks: loadLiveFoilMasks(),
    liveOwned: loadLiveOwned(),
    reprintMeta: loadReprintMeta(),
    materialSheets: loadMaterialSheets(),
    textureFlags: loadTextureFlags(),
    sharedMotifs: loadSharedMotifs(),
    fragStems: loadFragStems(),
  });
}
