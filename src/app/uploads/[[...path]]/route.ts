import { NextResponse } from "next/server";
import path from "node:path";

import { isEditDerivativeUrl } from "@/core/enrich/media/coverUrl";
import { uploadsDir } from "@/lib/runtimeData";
import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const root = uploadsDir();
  const filePath =
    resolveUnderRoot(root, segments) ?? resolveMigratedWebp(root, segments);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }
  return streamFileResponse(filePath, {
    request: req,
    /*
      Uploads are content-hashed, so their bytes never change — except the crop
      derivatives, which are deliberately rewritten under the same name so that
      reverting a crop is just dropping the suffix. Promising `immutable` on
      those made a re-crop invisible: the file on disk was the new framing and
      the browser kept serving the old one out of cache, forever.
    */
    cache: isEditDerivativeUrl(path.basename(filePath))
      ? "revalidate"
      : "immutable",
  });
}

/** Legacy DB paths may still point at ``.png``/``.jpg``; serve sibling ``.webp``. */
function resolveMigratedWebp(
  root: string,
  segments: string[] | undefined,
): string | null {
  if (!segments?.length) return null;
  const last = segments[segments.length - 1];
  if (!last || !/\.(png|jpe?g)$/i.test(last)) return null;
  const webp = [
    ...segments.slice(0, -1),
    last.replace(/\.(png|jpe?g)$/i, ".webp"),
  ];
  return resolveUnderRoot(root, webp);
}
