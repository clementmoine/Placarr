/**
 * Produits scellés qui contiennent ce tirage (« Inclus dans »).
 */
import { NextRequest, NextResponse } from "next/server";

import { sealedContainmentForShelfPrint } from "@/lib/collect/itemSealedContainment";
import { prisma } from "@/lib/db/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { resolveItemId, resolveShelfId } from "@/lib/routing/resolveIds";
import type { MediaType } from "@/types/providerRegistry";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shelfId: string; itemId: string }> },
) {
  const auth = await requireGuestOrHigher(request);
  if (auth instanceof NextResponse) return auth;

  const { shelfId: rawShelf, itemId: rawItem } = await context.params;
  const shelfId = await resolveShelfId(rawShelf);
  if (!shelfId) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  const itemId = await resolveItemId(rawItem, shelfId, auth.user.id);
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      userId: true,
      printKey: true,
      language: true,
      shelfId: true,
      shelf: { select: { id: true, name: true, type: true } },
    },
  });
  if (!item || item.shelfId !== shelfId) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const printKey = item.printKey?.trim();
  if (!printKey) {
    return NextResponse.json({ sources: [] });
  }

  const sources = await sealedContainmentForShelfPrint({
    shelfType: item.shelf.type as MediaType,
    shelfName: item.shelf.name,
    printKey,
    language: item.language,
  });

  return NextResponse.json({ sources });
}
