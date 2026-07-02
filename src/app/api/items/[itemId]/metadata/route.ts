import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { withRequestUiLocale } from "@/lib/locale/serverPreference";
import { presentItemFromStorage } from "@/lib/item/present";
import { resolveItemId } from "@/lib/routing/resolveIds";
import { startItemMetadataRefresh } from "@/lib/jobs/scheduleMetadataRefresh";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  return withRequestUiLocale(req, async (uiLocale) => {
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
    const resolvedItemId = await resolveItemId(itemId, shelfId, auth.user.id);
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

    const { startedAt: metadataRefreshStartedAt } =
      await startItemMetadataRefresh({
        itemId: item.id,
        lookupQuery,
        shelfType: item.shelf.type,
        barcode: item.barcode,
        shelfName: item.shelf.name,
        clearRemoteCover: Boolean(
          item.imageUrl && item.imageUrl.startsWith("http"),
        ),
      });

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

    return NextResponse.json(
      {
        accepted: true,
        metadataRefreshStartedAt: metadataRefreshStartedAt.toISOString(),
        item: refreshedItem ? presentItemFromStorage(refreshedItem, { uiLocale }) : null,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[API Metadata Refresh] Error refreshing metadata:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
  });
}
