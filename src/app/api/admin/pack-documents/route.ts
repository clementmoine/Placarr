import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import {
  listDocumentPackIds,
  listPackDocuments,
  PACK_DOCUMENT_KINDS,
} from "@/lib/admin/packDocuments";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const pack = url.searchParams.get("pack");
  const lang = url.searchParams.get("lang");
  const kind = url.searchParams.get("kind");
  const q = url.searchParams.get("q");

  const packId = pack && pack !== "all" ? pack : null;
  const documents = listPackDocuments({
    pack: packId,
    lang: lang && lang !== "all" ? lang : null,
    kind: kind && kind !== "all" ? kind : null,
    q,
  });

  // Locales for the filter Select must come from the unfiltered pack — deriving
  // them from `documents` drops every other code once a lang is selected, so the
  // trigger briefly (or permanently while loading) has value with no SelectItem.
  const availableLocales = [
    ...new Set(
      listPackDocuments({ pack: packId }).map((doc) => doc.lang).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    documents,
    packs: listDocumentPackIds(),
    kinds: PACK_DOCUMENT_KINDS,
    availableLocales,
  });
}
