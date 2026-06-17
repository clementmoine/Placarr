import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireGuestOrHigher } from "@/lib/auth";

import { formatMetadataFromStorage } from "@/services/metadata";
import { getCoverImage } from "@/lib/itemMedia";
import { resolveShelfId } from "@/lib/resolveIds";
import { buildItemSearchConditions } from "@/lib/itemSearch";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const q = searchParams.get("q");

    if (id) {
      const resolvedId = await resolveShelfId(id);
      if (q) {
        const searchTerm = q.trim();
        const shelf = await prisma.shelf.findUnique({
          where: { id: resolvedId },
          include: {
            items: {
              where: {
                OR: buildItemSearchConditions(searchTerm),
              },
              include: {
                metadata: {
                  include: {
                    attachments: true,
                    authors: true,
                    publishers: true,
                  },
                },
              },
              orderBy: { name: "asc" },
            },
          },
        });

        if (!shelf) {
          return NextResponse.json(
            { error: "Shelf not found" },
            { status: 404 },
          );
        }

        // Only allow if user is admin or the owner
        if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Fetch prices from BarcodeCache
        const barcodes = shelf.items
          .map((item) => item.barcode)
          .filter((b): b is string => !!b);
        const cleanBarcodes = barcodes
          .map((b) => b.replace(/[^\d]/g, "").trim())
          .filter(Boolean);
        const priceCaches =
          cleanBarcodes.length > 0
            ? await prisma.barcodeCache.findMany({
                where: { barcode: { in: cleanBarcodes } },
              })
            : [];
        const priceMap = new Map(priceCaches.map((c) => [c.barcode, c]));

        // Format items with metadata and prices
        const formattedShelf = {
          ...shelf,
          items: shelf.items.map((item) => {
            const clean = item.barcode
              ? item.barcode.replace(/[^\d]/g, "").trim()
              : "";
            const cache = clean ? priceMap.get(clean) : null;
            const prices = {
              priceNew: cache?.priceNew ?? null,
              priceUsed: cache?.priceUsed ?? null,
              priceUsedCIB: cache?.priceUsedCIB ?? null,
              priceLastUpdated: cache?.priceLastUpdated ?? null,
            };

            if (item.metadata) {
              const formattedMetadata = formatMetadataFromStorage(
                item.metadata,
              );
              return {
                ...item,
                imageUrl: getCoverImage({
                  imageUrl: item.imageUrl,
                  metadata: formattedMetadata,
                  shelf: { type: shelf.type } as any,
                }),
                metadata: formattedMetadata,
                ...prices,
              };
            }
            return {
              ...item,
              ...prices,
            };
          }),
        };

        return NextResponse.json(formattedShelf);
      }

      const shelf = await prisma.shelf.findUnique({
        where: { id: resolvedId },
        include: {
          items: {
            include: {
              metadata: {
                include: { attachments: true, authors: true, publishers: true },
              },
            },
            orderBy: { name: "asc" },
          },
        },
      });

      if (!shelf) {
        return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
      }

      // Only allow if user is admin or the owner
      if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      // Fetch prices from BarcodeCache
      const barcodes = shelf.items
        .map((item) => item.barcode)
        .filter((b): b is string => !!b);
      const cleanBarcodes = barcodes
        .map((b) => b.replace(/[^\d]/g, "").trim())
        .filter(Boolean);
      const priceCaches =
        cleanBarcodes.length > 0
          ? await prisma.barcodeCache.findMany({
              where: { barcode: { in: cleanBarcodes } },
            })
          : [];
      const priceMap = new Map(priceCaches.map((c) => [c.barcode, c]));

      // Format items with metadata and prices
      const formattedShelf = {
        ...shelf,
        items: shelf.items.map((item) => {
          const clean = item.barcode
            ? item.barcode.replace(/[^\d]/g, "").trim()
            : "";
          const cache = clean ? priceMap.get(clean) : null;
          const prices = {
            priceNew: cache?.priceNew ?? null,
            priceUsed: cache?.priceUsed ?? null,
            priceUsedCIB: cache?.priceUsedCIB ?? null,
            priceLastUpdated: cache?.priceLastUpdated ?? null,
          };

          if (item.metadata) {
            const formattedMetadata = formatMetadataFromStorage(item.metadata);
            return {
              ...item,
              imageUrl: getCoverImage({
                imageUrl: item.imageUrl,
                metadata: formattedMetadata,
                shelf: { type: shelf.type } as any,
              }),
              metadata: formattedMetadata,
              ...prices,
            };
          }
          return {
            ...item,
            ...prices,
          };
        }),
      };

      return NextResponse.json(formattedShelf);
    }

    if (q) {
      const searchTerm = q.trim();

      const shelves = await prisma.shelf.findMany({
        where: {
          userId: auth.user.id,
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            {
              items: {
                some: {
                  OR: buildItemSearchConditions(searchTerm),
                },
              },
            },
          ],
        },
        include: {
          _count: {
            select: {
              items: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      return NextResponse.json(shelves);
    }

    const shelves = await prisma.shelf.findMany({
      where: {
        userId: auth.user.id,
      },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(shelves);
  } catch (error) {
    console.error("Error in GET request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can create shelves
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot create shelves" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();

    const { name, imageUrl, color, type } = body;

    const shelf = await prisma.shelf.create({
      data: {
        name,
        imageUrl,
        color,
        type,
        userId: auth.user.id,
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(shelf);
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

  // Only admin and regular users can update shelves
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot update shelves" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { id, ...data } = body;

    // Check if shelf exists and user has permission to update it
    const shelf = await prisma.shelf.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    // Only allow if user is admin or the owner
    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to update this shelf" },
        { status: 403 },
      );
    }

    const updatedShelf = await prisma.shelf.update({
      where: { id },
      data,
      include: {
        items: true,
      },
    });

    return NextResponse.json(updatedShelf);
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

  // Only admin and regular users can delete shelves
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot delete shelves" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
      );
    }

    // Check if shelf exists and user has permission to delete it
    const shelf = await prisma.shelf.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    // Only allow if user is admin or the owner
    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this shelf" },
        { status: 403 },
      );
    }

    await prisma.shelf.delete({
      where: { id },
      include: {
        items: true,
      },
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
