import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { CATALOGUE_PACKS, cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { packApksDir } from "@/lib/packPaths";

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
  if (!cataloguePackInfo(pack)?.hasFoilMeta) {
    const allowed = CATALOGUE_PACKS.filter((info) => info.hasFoilMeta).map(
      (info) => info.id,
    );
    return NextResponse.json(
      { error: `pack must be one of: ${allowed.join(", ")}` },
      { status: 400 },
    );
  }

  const files = form.getAll("apk").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "apk file(s) required" },
      { status: 400 },
    );
  }

  const destDir = packApksDir(pack);
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
      path: `data/${pack}/staging/apks/${safeName}`,
    });
  }

  return NextResponse.json({
    ok: true,
    pack,
    saved,
    hint:
      pack === "lorcana"
        ? "APK enregistré. Lance Extract / Sync depuis Catalogue (admin) — Unity fusionne aussi split_UnityDataAssetPack.apk du même dossier."
        : "APK enregistré. Live: Extract Catalogue (CDN) est le chemin principal ; APK = secours schéma.",
  });
}
