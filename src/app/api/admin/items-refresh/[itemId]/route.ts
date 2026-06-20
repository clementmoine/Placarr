import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { presentItemFromStorage } from "@/lib/presentItem";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreMetadata } from "@/services/metadata";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { itemId } = await context.params;

  try {
    const body = await req.json().catch(() => ({}));
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        shelf: true,
        metadata: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const lookupQuery =
      typeof body.lookupQuery === "string" && body.lookupQuery.trim()
        ? body.lookupQuery.trim()
        : item.metadata?.title || item.name;

    const metadata = await fetchAndStoreMetadata(
      item.id,
      lookupQuery,
      item.shelf.type,
      item.barcode || undefined,
      true,
      item.shelf.name,
      true,
      true, // isBackground
    );

    const refreshedItem = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        shelf: true,
        metadata: {
          include: {
            attachments: true,
            authors: true,
            publishers: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: Boolean(metadata),
      metadata,
      item: refreshedItem ? presentItemFromStorage(refreshedItem) : null,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Admin Items Refresh] Error refreshing item:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 },
    );
  }
}
