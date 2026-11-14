/**
 * Catalogue scellé d'une étagère — pour le picker d'ajout (étape 3).
 *
 * Même périmètre modules que le conseil d'achat / checklist, sans auth admin.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import {
  gamesInShelf,
  sealedProductModulesForShelf,
} from "@/lib/collect/shelfChecklist";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { prisma } from "@/lib/db/prisma";
import { resolveShelfId } from "@/lib/routing/resolveIds";
import { sealedProductKey } from "@/providers/shared/sealedProducts/indexFormat";
import type { MediaType } from "@/types/providerRegistry";

export type ShelfSealedProductRow = {
  productKey: string;
  packId: string;
  slug: string;
  name: string;
  kind: string;
  imageUrl: string | null;
  language: string | null;
  priceCents: number | null;
  setCode: string | null;
  contentsKnown: boolean;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shelfId: string }> },
) {
  const auth = await requireGuestOrHigher(request);
  if (auth instanceof NextResponse) return auth;

  const { shelfId: raw } = await context.params;
  const shelfId = await resolveShelfId(raw);
  if (!shelfId) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId },
    select: { id: true, name: true, type: true, userId: true },
  });
  if (!shelf) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const language =
    request.nextUrl.searchParams.get("language")?.trim().toLowerCase() || null;

  const printItems = await prisma.item.findMany({
    where: { shelfId: shelf.id, printKey: { not: null } },
    select: { printKey: true },
  });
  const games = gamesInShelf(
    new Set(
      printItems
        .map((row) => row.printKey?.trim().toLowerCase())
        .filter((key): key is string => Boolean(key)),
    ),
  );

  const modules = sealedProductModulesForShelf({
    type: shelf.type as MediaType,
    games,
    catalogueIds: new Set(),
  });

  const byKey = new Map<string, ShelfSealedProductRow>();
  for (const mod of modules) {
    const packId = mod.catalog?.dataPack?.trim();
    if (!packId) continue;
    for (const entry of loadSealedProductEntries(packId)) {
      const slug = entry.slug?.trim();
      if (!slug) continue;
      const productKey = sealedProductKey(packId, slug);
      const lang = entry.lang?.trim().toLowerCase() || null;
      if (language && lang && lang !== language) continue;
      const name = entry.name?.trim() || slug;
      const prev = byKey.get(productKey);
      if (prev && prev.name && !entry.image) continue;
      byKey.set(productKey, {
        productKey,
        packId,
        slug,
        name,
        kind: entry.kind,
        imageUrl: entry.image ?? null,
        language: lang,
        priceCents:
          typeof entry.priceCents === "number" ? entry.priceCents : null,
        setCode: entry.catalogueSetId ?? entry.setCode ?? null,
        contentsKnown: Boolean(entry.contentsKnown),
      });
    }
  }

  const products = [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { numeric: true }),
  );

  return NextResponse.json({
    shelf: { id: shelf.id, name: shelf.name, type: shelf.type },
    language,
    products,
  });
}
