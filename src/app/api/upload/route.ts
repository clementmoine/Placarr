import { NextRequest, NextResponse } from "next/server";
import { requireGuestOrHigher } from "@/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { trimLightImageMargins } from "@/core/enrich/media/imageTrim";
import { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";
import { consumeRateLimit } from "@/lib/http/rateLimit";

/**
 * Raster formats only. SVG is deliberately absent: uploads are served from
 * `public/uploads`, which the proxy matcher excludes from auth, so an SVG
 * carrying a `<script>` would execute on the app's own origin for anyone
 * opening its URL — stored XSS. Re-adding it needs sanitising *and* a
 * `Content-Disposition`/CSP story, not just a MIME entry.
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
    // Margin-trimming suits box art, but mangles logos (e.g. shelf logos) whose
    // padding/transparency is intentional. Callers opt out with `trim=false`.
    const trim = formData.get("trim") !== "false";

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

    // Determine correct extension from mime-type
    let extension = "png";
    if (file.type === "image/jpeg") extension = "jpg";
    else if (file.type === "image/webp") extension = "webp";
    else if (file.type === "image/gif") extension = "gif";

    const filename = `${randomUUID()}.${extension}`;
    const relativePath = `/uploads/${filename}`;

    // Path in the workspace public/uploads folder
    const workspaceRoot = process.cwd();
    const uploadsDir = join(workspaceRoot, "public", "uploads");

    // Ensure uploads directory exists
    await mkdir(uploadsDir, { recursive: true });

    // Write file to uploads directory
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

    const originalFilePath = join(uploadsDir, filename);
    await writeFile(originalFilePath, originalBuffer);

    let finalRelativePath = relativePath;
    if (trim) {
      const croppedBuffer = await trimLightImageMargins(originalBuffer, {
        minMarginPixels: 30,
      });
      if (croppedBuffer !== originalBuffer) {
        const ext = extension;
        const baseName = filename.substring(
          0,
          filename.length - (ext.length + 1),
        );
        const cropFilename = `${baseName}_crop.${ext}`;
        const cropFilePath = join(uploadsDir, cropFilename);
        await writeFile(cropFilePath, croppedBuffer);
        finalRelativePath = `/uploads/${cropFilename}`;
      }
    }

    return NextResponse.json({ url: finalRelativePath });
  } catch (error) {
    console.error("Error in upload POST request:", error);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 },
    );
  }
}
