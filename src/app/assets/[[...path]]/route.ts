import { NextResponse } from "next/server";

import { resolveAssetsDiskRoot, splitAssetsPackPath } from "@/lib/packPaths";
import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";
import { narutoRetailAssetsRest } from "@/providers/naruto/narutocarddass/diskArtAttachments";

type Ctx = { params: Promise<{ path?: string[] }> };

function resolveAssetFile(
  pack: string,
  rest: string[],
): string | null {
  const mapped = resolveAssetsDiskRoot(pack, rest);
  if (!mapped) return null;
  const hit = resolveUnderRoot(mapped.root, mapped.relative);
  if (hit) return hit;

  // Stale Metadata still points at `…/ta0081-promo/…` while bytes are retail.
  if (pack === "naruto/carddass" || pack.startsWith("naruto/")) {
    const retailRest = narutoRetailAssetsRest(rest);
    if (!retailRest) return null;
    const retailMapped = resolveAssetsDiskRoot(pack, retailRest);
    if (!retailMapped) return null;
    return resolveUnderRoot(retailMapped.root, retailMapped.relative);
  }
  return null;
}

/** Pack assets are public — the collection is browsable without unlock. */
export async function GET(req: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  if (!segments?.length) {
    return new NextResponse("Not found", { status: 404 });
  }
  const split = splitAssetsPackPath(segments);
  if (!split || split.rest.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = resolveAssetFile(split.pack, split.rest);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }
  return streamFileResponse(filePath, {
    request: req,
    /*
      Pack faces keep stable names (`art.imadoki.jpg`, `art.coleka.webp`) while
      harvest/install rewrites them in place. `immutable` made a remapped NS
      planche invisible: the file on disk was Kakashi and the browser kept
      serving the old sequential cut forever.
    */
    cache: "revalidate",
  });
}
