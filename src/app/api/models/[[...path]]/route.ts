/**
 * Serve `/models/…` through the same compressed stream as `/assets`
 * (ONNX + wasm + dict). `beforeFiles` rewrite in next.config sends
 * `/models/*` here so `public/models` is not served raw uncompressed.
 */
import path from "node:path";

import { NextResponse } from "next/server";

import {
  resolveUnderRoot,
  streamFileResponse,
} from "@/lib/media/streamDataFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function modelsRoot(): string {
  return path.join(process.cwd(), "public", "models");
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const filePath = resolveUnderRoot(modelsRoot(), segments);
  if (!filePath) {
    return new NextResponse("Not found", { status: 404 });
  }
  return streamFileResponse(filePath, {
    request: req,
    cache: "immutable",
    headers: {
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
