import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import {
  fetchAndStoreMetadata,
  formatMetadataFromStorage,
} from "@/services/metadata";
import { resolveItemId } from "@/lib/resolveIds";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot refresh metadata" },
      { status: 403 },
    );
  }

  const { itemId } = await context.params;
  const shelfId = req.nextUrl.searchParams.get("shelfId");

  try {
    const body = await req.json().catch(() => ({}));
    const resolvedItemId = await resolveItemId(itemId, shelfId);
    const item = await prisma.item.findUnique({
      where: { id: resolvedItemId },
      include: {
        shelf: true,
        metadata: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
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
      metadata,
      item: refreshedItem
        ? {
            ...refreshedItem,
            metadata: refreshedItem.metadata
              ? formatMetadataFromStorage(refreshedItem.metadata)
              : null,
          }
        : null,
    });
  } catch (error) {
    console.error("[API Metadata Refresh] Error refreshing metadata:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
