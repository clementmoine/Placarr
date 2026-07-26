import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { requireGuestOrHigher } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { downloadRemoteImage } from "@/core/enrich/media/imageDownload";
import { stripCropSuffixFromUrl } from "@/core/enrich/media/coverUrl";
import {
  applyCropBox,
  suggestCropBox,
  type CropBox,
} from "@/core/enrich/media/imageTrim";

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

/**
 * Where the applied rectangle is remembered, next to the file it produced.
 *
 * Stored as a sidecar rather than a column because the same editor serves
 * items, shelves and avatars: the box belongs to the derived image, not to
 * whichever record happens to point at it.
 */
function cropSidecarPath(originalFilePath: string): string {
  const ext = path.extname(originalFilePath);
  const baseName = path.basename(originalFilePath, ext);
  return path.join(path.dirname(originalFilePath), `${baseName}_crop.json`);
}

function readStoredCrop(originalFilePath: string): CropBox | null {
  try {
    const sidecar = cropSidecarPath(originalFilePath);
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

/** Localize a remote gallery image so it can be cropped like any other. */
async function resolveLocalUrl(rawUrl: string): Promise<string | null> {
  const url = rawUrl.trim();
  if (!url) return null;
  // `stripCropSuffixFromUrl` drops the query first: the gallery appends a
  // cache-busting `?v=` to a crop it just rewrote, and the suffix regex is
  // anchored at the end — leaving it on turned every second crop into a 404.
  if (url.startsWith(UPLOADS_PREFIX)) return stripCropSuffixFromUrl(url);
  if (!/^https?:\/\//i.test(url)) return null;
  return downloadRemoteImage(url);
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

    const localUrl = await resolveLocalUrl(raw);
    const filePath = localUrl ? uploadsFilePath(localUrl) : null;
    if (!filePath || !localUrl) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

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
      current: readStoredCrop(filePath),
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
  crop?: { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
};

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? Math.round(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Write the cropped derivative and return its URL. The original file stays on
 * disk untouched, so "revert" is just dropping the `_crop` suffix.
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

    const localUrl = await resolveLocalUrl(raw);
    const filePath = localUrl ? uploadsFilePath(localUrl) : null;
    if (!filePath || !localUrl) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const metadata = await sharp(buffer).rotate().metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;
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
    };

    const cropped = await applyCropBox(buffer, box);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const croppedName = `${baseName}_crop${ext}`;
    fs.writeFileSync(
      path.join(process.cwd(), "public", "uploads", croppedName),
      cropped,
    );
    fs.writeFileSync(cropSidecarPath(filePath), JSON.stringify(box));

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
 * The derived `_crop` file is deliberately left alone: another record may still
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

    const localUrl = await resolveLocalUrl(raw);
    const filePath = localUrl ? uploadsFilePath(localUrl) : null;
    if (!filePath || !localUrl) {
      // Nothing to forget is a success, not a failure.
      return NextResponse.json({ cleared: false });
    }

    const sidecar = cropSidecarPath(filePath);
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
