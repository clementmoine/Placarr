import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/config";
import { foilPackDir } from "@/lib/runtimeData";
import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";

type Ctx = { params: Promise<{ path?: string[] }> };

const PACK_ID = /^[a-z0-9_-]+$/i;

/** Foil assets require a session (same policy as former static ``/foil``). */
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

  const filePath =
    resolveUnderRoot(foilPackDir(pack), rest) ??
    resolveLegacyPngBesideWebp(foilPackDir(pack), rest) ??
    resolveWebpBesideLegacyPng(foilPackDir(pack), rest);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Pack assets are versioned, so they keep `immutable`; the request only
  // buys them a 304 instead of a re-download when a cache does revalidate.
  return streamFileResponse(filePath, { request: req });
}

/** During PNG→WebP migration, ``….webp`` URLs may still hit a ``….png`` on disk. */
function resolveLegacyPngBesideWebp(
  root: string,
  segments: string[],
): string | null {
  const last = segments[segments.length - 1];
  if (!last || !/\.webp$/i.test(last)) return null;
  const legacy = [...segments.slice(0, -1), last.replace(/\.webp$/i, ".png")];
  return resolveUnderRoot(root, legacy);
}

/** Manifest may still ask for ``….png`` after files were renamed to ``….webp``. */
function resolveWebpBesideLegacyPng(
  root: string,
  segments: string[],
): string | null {
  const last = segments[segments.length - 1];
  if (!last || !/\.png$/i.test(last)) return null;
  const webp = [...segments.slice(0, -1), last.replace(/\.png$/i, ".webp")];
  return resolveUnderRoot(root, webp);
}
