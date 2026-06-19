import { NextRequest, NextResponse } from "next/server";
import { requireGuestOrHigher } from "@/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { trimLightImageMargins } from "@/lib/server/imageTrim";

// Allowed MIME types for images
const ALLOWED_MIMETYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

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
    else if (file.type === "image/svg+xml") extension = "svg";

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
    const originalFilePath = join(uploadsDir, filename);
    await writeFile(originalFilePath, originalBuffer);

    const croppedBuffer = await trimLightImageMargins(originalBuffer, {
      minMarginPixels: 30,
    });

    let finalRelativePath = relativePath;
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

    return NextResponse.json({ url: finalRelativePath });
  } catch (error) {
    console.error("Error in upload POST request:", error);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 },
    );
  }
}
