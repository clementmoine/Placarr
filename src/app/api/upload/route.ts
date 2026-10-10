import { NextRequest, NextResponse } from "next/server";
import { uploadsDir } from "@/lib/runtimeData";
import { requireGuestOrHigher } from "@/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { trimLightImageMargins } from "@/core/enrich/media/imageTrim";
import { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { toUploadWebp } from "@/lib/media/losslessWebp";

/**
 * Raster formats only. SVG is deliberately absent: uploads are served from
 * `data/uploads`, which the proxy matcher excludes from auth, so an SVG
 * carrying a `<script>` would execute on the app's own origin for anyone
 * opening its URL — stored XSS. Re-adding it needs sanitising *and* a
 * `Content-Disposition`/CSP story, not just a MIME entry.
 *
 * Accepted inputs are re-encoded to WebP q88 on disk (uniform upload store).
 */
const ALLOWED_MIMETYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Guest users are read-only and cannot upload images
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot upload files" },
      { status: 403 },
    );
  }

  // Keyed by account, not address: an authenticated user filling the disk is
  // the realistic case, and the session is the thing we can trust here.
  const throttle = consumeRateLimit(`upload:${auth.user.id}`, {
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many uploads, try again later" },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    // Opt-in, never the default. Trimming rewrites the stored URL to a derived
    // `_edited` file with no way back to the original framing, and it guesses
    // wrong often enough — on logos whose padding is deliberate, on card art
    // that is already edge to edge. Framing is the collector's call; the
    // assisted flow suggests a box (`suggestCropBox`) instead of imposing one.
    const trim = formData.get("trim") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate MIME type
    if (!ALLOWED_MIMETYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed types: ${ALLOWED_MIMETYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds the 5MB limit" },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);

    // `file.type` is whatever the client claimed. Check the bytes before this
    // lands in a publicly served directory.
    if (!looksLikeImageBuffer(originalBuffer, file.type)) {
      return NextResponse.json(
        { error: "File content is not a valid image" },
        { status: 400 },
      );
    }

    // Annoté : `originalBuffer` est un `Buffer<ArrayBuffer>` et le rognage rend
    // un `Buffer` ordinaire ; sans ça la réaffectation ne passe plus depuis que
    // les types Node distinguent les deux.
    let storeBuffer: Buffer = originalBuffer;
    if (trim) {
      storeBuffer = await trimLightImageMargins(originalBuffer, {
        minMarginPixels: 30,
      });
    }

    let webp: Buffer;
    try {
      webp = await toUploadWebp(storeBuffer);
    } catch {
      return NextResponse.json(
        { error: "Could not encode image as WebP" },
        { status: 400 },
      );
    }

    const filename = `${randomUUID()}.webp`;
    const relativePath = `/uploads/${filename}`;
    const targetDir = uploadsDir();
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, filename), webp);

    return NextResponse.json({ url: relativePath });
  } catch (error) {
    console.error("Error in upload POST request:", error);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 },
    );
  }
}
