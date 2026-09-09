import { NextResponse } from "next/server";

import { resolveAssetsDiskRoot, splitAssetsPackPath } from "@/lib/packPaths";
import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";

type Ctx = { params: Promise<{ path?: string[] }> };

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

  const mapped = resolveAssetsDiskRoot(split.pack, split.rest);
  if (!mapped) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filePath = resolveUnderRoot(mapped.root, mapped.relative);
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
