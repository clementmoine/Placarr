import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { resolvePackDocumentFile } from "@/lib/admin/packDocuments";

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const pack = url.searchParams.get("pack")?.trim();
  const relativePath = url.searchParams.get("path")?.trim();
  if (!pack || !relativePath) {
    return NextResponse.json(
      { error: "pack and path are required" },
      { status: 400 },
    );
  }

  const abs = resolvePackDocumentFile(pack, relativePath);
  if (!abs) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const stat = statSync(abs);
  const stream = createReadStream(abs);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": contentTypeFor(abs),
      "Content-Length": String(stat.size),
      "Content-Disposition": `inline; filename="${path.basename(abs)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
