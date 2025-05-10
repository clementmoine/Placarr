// app/api/items/route.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchAndStoreMetadata,
  formatMetadataFromStorage,
} from "@/services/metadata";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
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
      const searchTerm = q.trim();
      whereClause.OR = [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { barcode: { contains: searchTerm } },
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
      orderBy: {
        name: "asc",
      },
    });

    if (includeMetadata) {
      const formattedItems = items.map((item) => {
        if (item.metadata) {
          const formattedMetadata = formatMetadataFromStorage(item.metadata);
          return {
            ...item,
            imageUrl: item.imageUrl || formattedMetadata.imageUrl,
            metadata: formattedMetadata,
          };
        }
        return item;
      });

      return NextResponse.json(formattedItems);
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error in GET request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
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

    const shelf = await prisma.shelf.findUnique({
      where: { id: shelfId },
      select: { type: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    const item = await prisma.item.create({
      data: {
        shelfId,
        name,
        description,
        imageUrl,
        barcode,
        condition,
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
  try {
    const body = await req.json();
    const { id, refreshMetadata, lookupQuery, ...data } = body;

    const item = await prisma.item.update({
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
          item.id,
          lookupQuery || item.name,
          item.shelf.type,
          item.barcode || undefined,
          true,
        );

        if (metadata) {
          return NextResponse.json({
            ...item,
            metadata,
          });
        }
      } catch (metadataError) {
        console.error("Error refreshing metadata:", metadataError);
      }
    }

    if (item.metadata) {
      return NextResponse.json({
        ...item,
        metadata: formatMetadataFromStorage(item.metadata),
      });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error in PATCH request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
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
