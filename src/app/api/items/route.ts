import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";

import {
  fetchAndStoreMetadata,
  downloadRemoteImage,
} from "@/services/metadata";
import { presentItem, presentItemFromStorage } from "@/lib/presentItem";
import { resolveShelfId, resolveItemId } from "@/lib/resolveIds";
import { slugify } from "@/lib/slugs";
import { buildItemSearchConditions } from "@/lib/itemSearch";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;
  const isAdmin = auth.user.role === "admin";

  const searchParams = req.nextUrl.searchParams;
  const id = searchParams.get("id");
  const q = searchParams.get("q");
  const shelfId = searchParams.get("shelfId");
  const includeMetadata = searchParams.get("includeMetadata") !== "false"; // Par défaut true

  if (id) {
    const resolvedId = await resolveItemId(id, shelfId, auth.user.id);
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      include: {
        shelf: true,
        metadata: includeMetadata
          ? {
              include: {
                attachments: true,
                authors: true,
                publishers: true,
              },
            }
          : false,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // L'item appartient à l'utilisateur, est admin, ou se trouve dans une
    // étagère publique (consultation cross-user via collections partagées).
    if (!isAdmin && item.userId !== auth.user.id && !item.shelf.isPublic) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(presentItemFromStorage(item));
  }

  const whereClause: Prisma.ItemWhereInput = {};

  // Les listes/recherches sont restreintes aux items de l'utilisateur
  // (le cross-user public passe par /api/explore). L'admin voit tout.
  if (!isAdmin) {
    whereClause.userId = auth.user.id;
  }

  if (q) {
    whereClause.OR = buildItemSearchConditions(q);
  }

  if (shelfId) {
    whereClause.shelfId = await resolveShelfId(shelfId, auth.user.id);
  }

  const items = await prisma.item.findMany({
    where: whereClause,
    include: {
      shelf: true,
      metadata: includeMetadata
        ? {
            include: {
              attachments: true,
              authors: true,
              publishers: true,
            },
          }
        : false,
    },
    orderBy: { createdAt: "desc" },
  });

  if (includeMetadata) {
    return NextResponse.json(items.map((item) => presentItemFromStorage(item)));
  }

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can create items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot create items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const {
      shelfId,
      name,
      description,
      imageUrl,
      backgroundImageUrl,
      barcode,
      condition,
      fetchMetadata = true,
    } = body;
    if (typeof shelfId !== "string" || !shelfId.trim()) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
      );
    }

    const resolvedShelfId = await resolveShelfId(shelfId, auth.user.id);

    // Check if shelf exists and user has permission to add items to it
    const shelf = await prisma.shelf.findUnique({
      where: { id: resolvedShelfId },
      select: { type: true, userId: true, name: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    // Only allow if user is admin or the shelf owner
    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to add items to this shelf" },
        { status: 403 },
      );
    }

    let localImageUrl = imageUrl;
    let localBackgroundImageUrl = backgroundImageUrl;

    if (imageUrl) {
      localImageUrl = await downloadRemoteImage(imageUrl);
    }
    if (backgroundImageUrl) {
      localBackgroundImageUrl = await downloadRemoteImage(backgroundImageUrl);
    }

    const item = await prisma.item.create({
      data: {
        shelfId: resolvedShelfId,
        name,
        slug: slugify(name),
        description,
        imageUrl: localImageUrl,
        backgroundImageUrl: localBackgroundImageUrl,
        barcode,
        condition,
        userId: auth.user.id,
      },
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

    if (fetchMetadata) {
      try {
        const metadata = await fetchAndStoreMetadata(
          item.id,
          name,
          shelf.type,
          barcode,
          true,
          shelf.name,
        );

        if (metadata) {
          return NextResponse.json(
            presentItem({
              ...item,
              metadata,
              shelf: item.shelf,
            }),
          );
        }
      } catch (metadataError) {
        console.error("Error fetching metadata:", metadataError);
      }
    }

    return NextResponse.json(presentItemFromStorage(item));
  } catch (error) {
    console.error("Error in POST request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can update items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot update items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { id, refreshMetadata, lookupQuery, ...data } = body;
    if (typeof data.name === "string") {
      data.slug = slugify(data.name);
    }
    if (typeof data.shelfId === "string") {
      data.shelfId = await resolveShelfId(data.shelfId, auth.user.id);
    }
    const shelfContext =
      typeof data.shelfId === "string" ? data.shelfId : undefined;
    const resolvedId = await resolveItemId(id, shelfContext, auth.user.id);

    // Check if item exists and user has permission to update it
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      select: { userId: true, shelf: { select: { type: true } } },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Only allow if user is admin or the item owner
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to update this item" },
        { status: 403 },
      );
    }

    if (data.imageUrl) {
      data.imageUrl = await downloadRemoteImage(data.imageUrl);
    }
    if (data.backgroundImageUrl) {
      data.backgroundImageUrl = await downloadRemoteImage(
        data.backgroundImageUrl,
      );
    }

    const updatedItem = await prisma.item.update({
      where: { id: resolvedId },
      data,
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

    if (refreshMetadata) {
      try {
        if (updatedItem.imageUrl && updatedItem.imageUrl.startsWith("http")) {
          await prisma.item.update({
            where: { id: updatedItem.id },
            data: { imageUrl: null },
          });
          updatedItem.imageUrl = null;
        }

        const metadata = await fetchAndStoreMetadata(
          updatedItem.id,
          lookupQuery || updatedItem.name,
          updatedItem.shelf.type,
          lookupQuery ? undefined : updatedItem.barcode || undefined,
          true,
          updatedItem.shelf.name,
        );

        if (metadata) {
          return NextResponse.json(
            presentItem({
              ...updatedItem,
              metadata,
              shelf: updatedItem.shelf,
            }),
          );
        }
      } catch (metadataError) {
        console.error("Error refreshing metadata:", metadataError);
      }
    }

    return NextResponse.json(presentItemFromStorage(updatedItem));
  } catch (error) {
    console.error("Error in PATCH request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can delete items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot delete items" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const shelfId = searchParams.get("shelfId");

    if (!id) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
      );
    }

    const resolvedId = await resolveItemId(id, shelfId, auth.user.id);

    // Check if item exists and user has permission to delete it
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      select: { userId: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Only allow if user is admin or the item owner
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this item" },
        { status: 403 },
      );
    }

    await prisma.item.delete({
      where: { id: resolvedId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
