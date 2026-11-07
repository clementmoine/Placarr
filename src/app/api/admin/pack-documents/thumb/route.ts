import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import {
  readPackDocumentsIndex,
  upsertPackDocumentEntry,
  writePackDocumentsIndex,
} from "@/lib/admin/packDocuments";
import {
  documentThumbUrl,
  ensurePackDocumentThumb,
} from "@/lib/admin/packDocumentThumbs";

/**
 * Lazy PDF/image preview — writes sibling `*.thumb.webp` and redirects to the
 * file route. Idempotent.
 */
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

  try {
    const thumbRel = await ensurePackDocumentThumb({
      packId: pack,
      relativePath,
    });
    if (!thumbRel) {
      return NextResponse.json(
        { error: "preview unavailable" },
        { status: 404 },
      );
    }

    // Persist path on the index entry when we know the document id.
    const index = readPackDocumentsIndex(pack);
    const entry = index.documents.find((d) => d.relativePath === relativePath);
    if (entry && entry.thumbRelativePath !== thumbRel) {
      writePackDocumentsIndex(
        pack,
        upsertPackDocumentEntry(index, {
          ...entry,
          thumbRelativePath: thumbRel,
        }),
      );
    }

    return NextResponse.redirect(
      new URL(documentThumbUrl(pack, thumbRel), url.origin),
      302,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
