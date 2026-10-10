import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { requireGuestOrHigher } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import {
  editDerivativeBaseName,
  DEFAULT_EDIT_ROLE,
  stripEditSuffixFromUrl,
} from "@/core/enrich/media/coverUrl";
import {
  applyCropBox,
  normalizeRotation,
  orientedDimensions,
  suggestCropBox,
  type CropBox,
} from "@/core/enrich/media/imageTrim";
import { localizePackAssetToUploads } from "@/lib/media/assetsPath";
import { toUploadWebp } from "@/lib/media/losslessWebp";
import { ASSETS_URL_PREFIX } from "@/lib/packAssetUrls";
import { UPLOADS_PREFIX, uploadsFilePath } from "@/lib/media/uploadsPath";
import { uploadsDir } from "@/lib/runtimeData";

/**
 * Every raster this app writes is WebP — uploads, and the derivatives it makes
 * of them. Keeping the source extension would re-introduce PNG on disk at
 * several times the size on every crop of a provider scan that arrived as PNG.
 */
const DERIVATIVE_EXTENSION = ".webp";

/**
 * What the crop is for. The same artwork often serves as both the cover and the
 * background, and a crop keyed on the file alone made cropping one rewrite the
 * other's image. `cover` keeps the bare `_edited` name so existing files stay
 * valid; anything else gets its own marker.
 */
function parseCropRole(raw: string | null | undefined): string {
  const role = raw?.trim().toLowerCase();
  // Letters only: the marker goes into a filename, and `stripEditSuffixFromUrl`
  // has to be able to take it back off again.
  return role && /^[a-z]+$/.test(role) ? role : DEFAULT_EDIT_ROLE;
}

/** Base name of the derivative for this source and role, without extension. */
function derivedBaseName(originalFilePath: string, role: string): string {
  const ext = path.extname(originalFilePath);
  return editDerivativeBaseName(path.basename(originalFilePath, ext), role);
}

/**
 * Where the applied rectangle is remembered, next to the file it produced.
 *
 * Stored as a sidecar rather than a column because the same editor serves
 * items, shelves and avatars: the box belongs to the derived image, not to
 * whichever record happens to point at it.
 */
function cropSidecarPath(originalFilePath: string, role: string): string {
  return path.join(
    path.dirname(originalFilePath),
    `${derivedBaseName(originalFilePath, role)}.json`,
  );
}

function readStoredCrop(
  originalFilePath: string,
  role: string,
): CropBox | null {
  try {
    const sidecar = cropSidecarPath(originalFilePath, role);
    if (!fs.existsSync(sidecar)) return null;
    const parsed = JSON.parse(fs.readFileSync(sidecar, "utf8")) as CropBox;
    const usable =
      Number.isFinite(parsed?.left) &&
      Number.isFinite(parsed?.top) &&
      parsed?.width > 0 &&
      parsed?.height > 0;
    // Normalized on the way out: a sidecar written by an older build has no
    // rotation at all, and a hand-edited one could say anything.
    return usable
      ? { ...parsed, rotate: normalizeRotation(parsed.rotate) }
      : null;
  } catch {
    return null;
  }
}

/** Localize a remote or pack gallery image so it can be cropped like any other. */
async function resolveLocalUrl(rawUrl: string): Promise<string | null> {
  const url = rawUrl.trim();
  if (!url) return null;
  // `stripEditSuffixFromUrl` drops the query first: the gallery appends a
  // cache-busting `?v=` to a crop it just rewrote, and the suffix regex is
  // anchored at the end — leaving it on turned every second crop into a 404.
  if (url.startsWith(UPLOADS_PREFIX)) return stripEditSuffixFromUrl(url);
  /*
    Catalogue faces live under `/assets/` (read-only pack data). Cropping needs
    a writable original in uploads — sidecars and `_edited` derivatives must not
    land inside `data/<pack>/`. Copy-on-edit, keyed by the asset URL.
  */
  if (url.startsWith(`${ASSETS_URL_PREFIX}/`)) {
    return localizePackAssetToUploads(stripEditSuffixFromUrl(url));
  }
  if (!/^https?:\/\//i.test(url)) return null;
  return downloadRemoteImage(url);
}

/**
 * The original, resolved to a file, then named by that file.
 *
 * Stripping `_edited.webp` yields `<name>.webp` while the source it came from may
 * still be `<name>.png` — {@link uploadsFilePath} finds it either way, but the
 * URL handed back has to be the one that exists, or "revert to original" would
 * point a cover at a 404.
 */
async function resolveOriginal(
  rawUrl: string,
): Promise<{ url: string; filePath: string } | null> {
  const localUrl = await resolveLocalUrl(rawUrl);
  const filePath = localUrl ? uploadsFilePath(localUrl) : null;
  if (!filePath) return null;
  return { url: `${UPLOADS_PREFIX}${path.basename(filePath)}`, filePath };
}

/** Suggested rectangle + source dimensions, to seed the editor. */
export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = new URL(req.url).searchParams.get("url");
    if (!raw) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const original = await resolveOriginal(raw);
    if (!original) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const { url: localUrl, filePath } = original;

    const buffer = fs.readFileSync(filePath);
    const metadata = await sharp(buffer).rotate().metadata();
    const suggestion = await suggestCropBox(buffer, { minMarginPixels: 30 });

    return NextResponse.json({
      url: localUrl,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      suggestion,
      // Reopening must show what is actually applied, not re-propose the
      // automatic guess over the framing the collector already chose.
      current: readStoredCrop(
        filePath,
        parseCropRole(new URL(req.url).searchParams.get("role")),
      ),
    });
  } catch (error) {
    console.error("[GET /api/images/crop]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

type CropRequest = {
  url?: unknown;
  /** Quarter-turn applied before the box — see {@link CropBox.rotate}. */
  rotate?: unknown;
  crop?: { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
};

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? Math.round(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Write the cropped derivative and return its URL. The original file stays on
 * disk untouched, so "revert" is just dropping the `_edited` suffix.
 */
export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot edit images" },
      { status: 403 },
    );
  }

  const throttle = consumeRateLimit(`crop:${auth.user.id}`, {
    limit: 240,
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many crops, try again later" },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = (await req.json()) as CropRequest;
    const raw = typeof body.url === "string" ? body.url : "";
    const left = positiveInt(body.crop?.left);
    const top = positiveInt(body.crop?.top);
    const width = positiveInt(body.crop?.width);
    const height = positiveInt(body.crop?.height);

    if (left == null || top == null || !width || !height) {
      return NextResponse.json({ error: "Invalid crop" }, { status: 400 });
    }

    const original = await resolveOriginal(raw);
    if (!original) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const { url: localUrl, filePath } = original;

    const buffer = fs.readFileSync(filePath);
    const rotate = normalizeRotation(body.rotate);
    /*
      Bounds come from the *rotated* source, because that is the space the
      collector drew the rectangle in. Clamping against the upright dimensions
      would reject a perfectly good box on any quarter turn.
    */
    const { width: imageWidth, height: imageHeight } = await orientedDimensions(
      buffer,
      rotate,
    );
    if (!imageWidth || !imageHeight) {
      return NextResponse.json({ error: "Unreadable image" }, { status: 422 });
    }

    // Clamp instead of rejecting: a rectangle dragged to the very edge can round
    // a pixel past the bounds, and losing the edit over that would be absurd.
    const box = {
      left: Math.min(left, imageWidth - 1),
      top: Math.min(top, imageHeight - 1),
      width: Math.min(width, imageWidth - Math.min(left, imageWidth - 1)),
      height: Math.min(height, imageHeight - Math.min(top, imageHeight - 1)),
      imageWidth,
      imageHeight,
      rotate,
    };

    const cropped = await toUploadWebp(await applyCropBox(buffer, box));
    const role = parseCropRole(
      typeof (body as { role?: unknown }).role === "string"
        ? (body as { role?: string }).role
        : null,
    );
    const croppedName = `${derivedBaseName(filePath, role)}${DERIVATIVE_EXTENSION}`;
    fs.writeFileSync(path.join(uploadsDir(), croppedName), cropped);
    fs.writeFileSync(cropSidecarPath(filePath, role), JSON.stringify(box));

    return NextResponse.json({
      url: `${UPLOADS_PREFIX}${croppedName}`,
      originalUrl: localUrl,
    });
  } catch (error) {
    console.error("[POST /api/images/crop]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Forget the stored rectangle, so the editor opens on the automatic suggestion
 * again rather than restoring a framing the collector has just discarded.
 *
 * The derived `_edited` file is deliberately left alone: another record may still
 * point at it, and an unreferenced file costs nothing next to a broken cover.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot edit images" },
      { status: 403 },
    );
  }

  try {
    const raw = new URL(req.url).searchParams.get("url");
    if (!raw) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const original = await resolveOriginal(raw);
    if (!original) {
      // Nothing to forget is a success, not a failure.
      return NextResponse.json({ cleared: false });
    }
    const { url: localUrl, filePath } = original;

    const sidecar = cropSidecarPath(
      filePath,
      parseCropRole(new URL(req.url).searchParams.get("role")),
    );
    const existed = fs.existsSync(sidecar);
    if (existed) fs.unlinkSync(sidecar);

    return NextResponse.json({ cleared: existed, url: localUrl });
  } catch (error) {
    console.error("[DELETE /api/images/crop]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
