import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { dataRoot } from "@/lib/runtimeData";

const PACKS = new Set(["lorcana", "pokemon"]);
const MAX_APK_BYTES = 512 * 1024 * 1024;

/**
 * Admin-only: store APKs pulled via WebUSB (or manual upload) under
 * ``data/<staging>/apks/`` for later Unity extract.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const limited = consumeRateLimit(`foil-apk:${auth.user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  }

  const form = await req.formData();
  const pack = String(form.get("pack") || "").trim();
  if (!PACKS.has(pack)) {
    return NextResponse.json(
      { error: "pack must be lorcana or pokemon" },
      { status: 400 },
    );
  }

  const files = form.getAll("apk").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "apk file(s) required" }, { status: 400 });
  }

  const destDir = path.join(dataRoot(), pack, "apks");
  await mkdir(destDir, { recursive: true });

  const saved: { name: string; bytes: number; path: string }[] = [];
  for (const file of files) {
    if (file.size <= 0 || file.size > MAX_APK_BYTES) {
      return NextResponse.json(
        { error: `Invalid size for ${file.name}` },
        { status: 400 },
      );
    }
    const safeName = path.basename(file.name).replace(/[^\w.-]+/g, "_");
    if (!safeName.toLowerCase().endsWith(".apk")) {
      return NextResponse.json(
        { error: `${safeName} must be .apk` },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    // ZIP local header / APK magic
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return NextResponse.json(
        { error: `${safeName} is not a ZIP/APK` },
        { status: 400 },
      );
    }
    const dest = path.join(destDir, safeName);
    await writeFile(dest, buf);
    saved.push({
      name: safeName,
      bytes: buf.length,
      path: `data/${staging}/apks/${safeName}`,
    });
  }

  return NextResponse.json({
    ok: true,
    pack,
    saved,
    hint:
      pack === "lorcana"
        ? "Ensuite: pnpm foil:lorcana -- --providers lorcanamobile --apk data/lorcana/apks/base.apk (fusionne aussi split_UnityDataAssetPack.apk du même dossier)"
        : "Live: refresh CDN reste le chemin principal; APK = secours schéma.",
  });
}
