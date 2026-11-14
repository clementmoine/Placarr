import { NextRequest, NextResponse } from "next/server";

import { removeItemMediaImage } from "@/core/collect/removeItemMediaImage";
import { presentItemFromStorage } from "@/core/collect/present";
import { withRequestUiLocale } from "@/core/locale/serverPreference";
import { requireGuestOrHigher } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId } from "@/lib/routing/resolveIds";

/**
 * DELETE /api/items/:itemId/media — drop one gallery image (attachment and/or
 * cover pin). Provider sync may recreate catalogue rows later; no blocklist.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;

    if (auth.user.role === "guest") {
      return NextResponse.json(
        { error: "Guests cannot edit item media" },
        { status: 403 },
      );
    }

    const { itemId } = await context.params;
    const shelfId = req.nextUrl.searchParams.get("shelfId");

    try {
      const body = await req.json().catch(() => ({}));
      const url =
        typeof body.url === "string" ? body.url.trim() : "";
      if (!url) {
        return NextResponse.json(
          { error: "url is required" },
          { status: 400 },
        );
      }

      const resolvedItemId = await resolveItemId(
        itemId,
        shelfId,
        auth.user.id,
      );
      const item = await prisma.item.findUnique({
        where: { id: resolvedItemId },
        select: { id: true, userId: true },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      let result;
      try {
        result = await removeItemMediaImage({ itemId: item.id, url });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to remove image";
        if (message === "Image not found on item") {
          return NextResponse.json({ error: message }, { status: 404 });
        }
        if (message === "Image URL is required") {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        throw error;
      }

      const refreshed = await prisma.item.findUnique({
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
        ...result,
        item: refreshed
          ? presentItemFromStorage(refreshed, { uiLocale })
          : null,
      });
    } catch (error) {
      console.error("[API Item Media] Error removing image:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
