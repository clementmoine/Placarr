import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { requireGuestOrHigher } from "@/lib/auth";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import {
  editDerivativeBaseName,
  stripEditSuffixFromUrl,
} from "@/core/enrich/media/coverUrl";
import {
  cropFractionsOf,
  cropFractionsTag,
  mirrorCropBox,
} from "@/core/enrich/media/cropMirror";
import {
  applyCropBox,
  normalizeRotation,
  orientedDimensions,
  type CropBox,
} from "@/core/enrich/media/imageTrim";
import { toLosslessWebp } from "@/lib/media/losslessWebp";
import { UPLOADS_PREFIX, uploadsFilePath } from "@/lib/media/uploadsPath";
import { uploadsDir } from "@/lib/runtimeData";

function parseRole(raw: string | null | undefined): string {
  const role = raw?.trim().toLowerCase();
  return role && /^[a-z]+$/.test(role) ? role : "cover";
}

/** The rectangle already applied to `sourceUrl` for this role, if any. */
function readStoredCrop(sourceUrl: string, role: string): CropBox | null {
  const original = stripEditSuffixFromUrl(sourceUrl);
  const filePath = uploadsFilePath(original);
  if (!filePath) return null;

  const ext = path.extname(filePath);
  // Named by the shared helper, not by a second copy of the rule: the two
  // drifted apart the moment the suffix changed.
  const sidecar = path.join(
    path.dirname(filePath),
    `${editDerivativeBaseName(path.basename(filePath, ext), role)}.json`,
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
    if (!fractions || !stored) return NextResponse.json({ url: target });
    // The artwork's rotation is part of what the mask has to follow: the shader
    // samples both in one UV space, so a mask left upright under a turned face
    // puts the shimmer at ninety degrees to the foil.
    const rotate = normalizeRotation(stored.rotate);

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
    //
    // Lossless WebP: this is a foil mask, and q88 would smear the very edges
    // the shader samples. `uploadsDir()`, not `public/uploads` — that path
    // stopped existing when uploads moved under the data root, so every mirror
    // mask had been failing on ENOENT and falling back to the unmirrored one.
    // The rotation joins the tag: two framings that differ only by a quarter
    // turn would otherwise share one cached mask, and the second would silently
    // get the first one's orientation.
    const derivedName = `${path.basename(targetPath, ext)}_edited-m${cropFractionsTag(fractions)}r${rotate}.webp`;
    const derivedPath = path.join(uploadsDir(), derivedName);
    const derivedUrl = `${UPLOADS_PREFIX}${derivedName}`;
    if (fs.existsSync(derivedPath)) {
      return NextResponse.json({ url: derivedUrl });
    }

    const buffer = fs.readFileSync(targetPath);
    // Measured *after* the same rotation the artwork got: the fractions are
    // relative to the turned frame, so mapping them onto the upright mask would
    // land the rectangle on the wrong axis.
    const { width, height } = await orientedDimensions(buffer, rotate);
    const box = mirrorCropBox(fractions, width, height);
    if (!box) return NextResponse.json({ url: target });

    fs.writeFileSync(
      derivedPath,
      await toLosslessWebp(await applyCropBox(buffer, { ...box, rotate })),
    );
    return NextResponse.json({ url: derivedUrl });
  } catch (error) {
    console.error("[GET /api/images/crop/mirror]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
