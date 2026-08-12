import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/config";
import { resolveAssetsDiskRoot } from "@/lib/packPaths";
import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";

type Ctx = { params: Promise<{ path?: string[] }> };

const PACK_ID = /^[a-z0-9_-]+$/i;

/** Pack assets require a session (same policy as former ``/foil``). */
export async function GET(req: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { path: segments } = await ctx.params;
  if (!segments?.length) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [pack, ...rest] = segments;
  if (!pack || !PACK_ID.test(pack) || rest.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const mapped = resolveAssetsDiskRoot(pack, rest);
  if (!mapped) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filePath = resolveUnderRoot(mapped.root, mapped.relative);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }
  return streamFileResponse(filePath, { request: req });
}
