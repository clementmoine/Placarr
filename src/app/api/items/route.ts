import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";

import {
  fetchAndStoreMetadata,
  formatMetadataFromStorage,
} from "@/services/metadata";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const id = searchParams.get("id");
  const q = searchParams.get("q");
  const shelfId = searchParams.get("shelfId");
  const includeMetadata = searchParams.get("includeMetadata") !== "false"; // Par défaut true

  if (id) {
    const item = await prisma.item.findUnique({
      where: { id },
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

    if (item.metadata) {
      const formattedMetadata = formatMetadataFromStorage(item.metadata);
      return NextResponse.json({
        ...item,
        imageUrl: item.imageUrl || formattedMetadata.imageUrl,
        metadata: formattedMetadata,
      });
    }

    return NextResponse.json(item);
  }

  const whereClause: Prisma.ItemWhereInput = {};

  if (q) {
    whereClause.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
      { barcode: { contains: q } },
    ];
  }

  if (shelfId) {
    whereClause.shelfId = shelfId;
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
    return NextResponse.json(
      items.map((item) => ({
        ...item,
        imageUrl:
          item.imageUrl ||
          (item.metadata
            ? formatMetadataFromStorage(item.metadata).imageUrl
            : null),
        metadata: item.metadata
          ? formatMetadataFromStorage(item.metadata)
          : null,
      })),
    );
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
      barcode,
      condition,
      fetchMetadata = true,
    } = body;

    // Check if shelf exists and user has permission to add items to it
    const shelf = await prisma.shelf.findUnique({
      where: { id: shelfId },
      select: { type: true, userId: true },
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

    const item = await prisma.item.create({
      data: {
        shelfId,
        name,
        description,
        imageUrl,
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
        );

        if (metadata) {
          return NextResponse.json({
            ...item,
            metadata,
          });
        }
      } catch (metadataError) {
        console.error("Error fetching metadata:", metadataError);
      }
    }

    return NextResponse.json(item);
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

    // Check if item exists and user has permission to update it
    const item = await prisma.item.findUnique({
      where: { id },
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

    const updatedItem = await prisma.item.update({
      where: { id },
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
        const metadata = await fetchAndStoreMetadata(
          updatedItem.id,
          lookupQuery || updatedItem.name,
          updatedItem.shelf.type,
          updatedItem.barcode || undefined,
          true,
        );

        if (metadata) {
          return NextResponse.json({
            ...updatedItem,
            metadata,
          });
        }
      } catch (metadataError) {
        console.error("Error refreshing metadata:", metadataError);
      }
    }

    if (updatedItem.metadata) {
      return NextResponse.json({
        ...updatedItem,
        metadata: formatMetadataFromStorage(updatedItem.metadata),
      });
    }

    return NextResponse.json(updatedItem);
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

    if (!id) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
      );
    }

    // Check if item exists and user has permission to delete it
    const item = await prisma.item.findUnique({
      where: { id },
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
      where: { id },
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
