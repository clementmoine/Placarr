import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { requireGuestOrHigher } from "@/lib/auth";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import { stripCropSuffixFromUrl } from "@/core/enrich/media/coverUrl";
import {
  cropFractionsOf,
  cropFractionsTag,
  mirrorCropBox,
} from "@/core/enrich/media/cropMirror";
import { applyCropBox, type CropBox } from "@/core/enrich/media/imageTrim";

const UPLOADS_PREFIX = "/uploads/";

/**
 * Resolve an uploads URL to a file path, refusing anything that escapes the
 * directory. The URL arrives from the client, so `..` and absolute paths have
 * to die here rather than at `readFileSync`.
 */
function uploadsFilePath(url: string): string | null {
  if (!url.startsWith(UPLOADS_PREFIX)) return null;
  const fileName = path.basename(url.split("?")[0].split("#")[0]);
  if (!fileName || fileName === "." || fileName === "..") return null;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(uploadsDir, fileName);
  if (path.dirname(filePath) !== uploadsDir) return null;
  return fs.existsSync(filePath) ? filePath : null;
}

function parseRole(raw: string | null | undefined): string {
  const role = raw?.trim().toLowerCase();
  return role && /^[a-z]+$/.test(role) ? role : "cover";
}

/** The rectangle already applied to `sourceUrl` for this role, if any. */
function readStoredCrop(sourceUrl: string, role: string): CropBox | null {
  const original = stripCropSuffixFromUrl(sourceUrl);
  const filePath = uploadsFilePath(original);
  if (!filePath) return null;

  const ext = path.extname(filePath);
  const marker = role === "cover" ? "" : `-${role}`;
  const sidecar = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, ext)}_crop${marker}.json`,
  );

  try {
    if (!fs.existsSync(sidecar)) return null;
    const parsed = JSON.parse(fs.readFileSync(sidecar, "utf8")) as CropBox;
    const usable =
      Number.isFinite(parsed?.left) &&
      Number.isFinite(parsed?.top) &&
      parsed?.width > 0 &&
      parsed?.height > 0;
    return usable ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Crop a companion image — a foil mask — to the framing already applied to the
 * artwork it overlays.
 *
 * A mask covers the whole card. Once the collector crops the artwork the two no
 * longer share a shape, `object-contain` letterboxes them differently, and the
 * shimmer lands off the foil areas. Replaying the same *relative* rectangle
 * gives them a common aspect ratio again.
 *
 * Answers with the untouched target whenever there is nothing to mirror, so the
 * caller can use the result unconditionally.
 */
export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const params = new URL(req.url).searchParams;
    const source = params.get("source");
    const target = params.get("target");
    if (!source || !target) {
      return NextResponse.json(
        { error: "source and target are required" },
        { status: 400 },
      );
    }

    const stored = readStoredCrop(source, parseRole(params.get("role")));
    const fractions = stored ? cropFractionsOf(stored) : null;
    if (!fractions) return NextResponse.json({ url: target });

    // The mask is usually remote; localizing it is what makes it croppable at
    // all, and the download is cached by content hash.
    const localTarget = target.startsWith(UPLOADS_PREFIX)
      ? target
      : await downloadRemoteImage(target);
    const targetPath = localTarget ? uploadsFilePath(localTarget) : null;
    if (!targetPath) return NextResponse.json({ url: target });

    const ext = path.extname(targetPath);
    // Tagged by framing, so a re-crop writes a new file instead of overwriting
    // one the browser has cached, and two copies of a card cropped differently
    // never collide on the same mask.
    const derivedName = `${path.basename(targetPath, ext)}_crop-m${cropFractionsTag(fractions)}${ext}`;
    const derivedPath = path.join(
      process.cwd(),
      "public",
      "uploads",
      derivedName,
    );
    const derivedUrl = `${UPLOADS_PREFIX}${derivedName}`;
    if (fs.existsSync(derivedPath)) {
      return NextResponse.json({ url: derivedUrl });
    }

    const buffer = fs.readFileSync(targetPath);
    const metadata = await sharp(buffer).rotate().metadata();
    const box = mirrorCropBox(
      fractions,
      metadata.width ?? 0,
      metadata.height ?? 0,
    );
    if (!box) return NextResponse.json({ url: target });

    fs.writeFileSync(derivedPath, await applyCropBox(buffer, box));
    return NextResponse.json({ url: derivedUrl });
  } catch (error) {
    console.error("[GET /api/images/crop/mirror]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
