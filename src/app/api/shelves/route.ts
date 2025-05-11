import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireGuestOrHigher } from "@/lib/auth";

import { formatMetadataFromStorage } from "@/services/metadata";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const q = searchParams.get("q");

    if (id) {
      if (q) {
        const searchTerm = q.trim();
        const shelf = await prisma.shelf.findUnique({
          where: { id },
          include: {
            items: {
              where: {
                OR: [
                  { name: { contains: searchTerm } },
                  { description: { contains: searchTerm } },
                  { barcode: { contains: searchTerm } },
                ],
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

        // Format items with metadata
        const formattedShelf = {
          ...shelf,
          items: shelf.items.map((item) => {
            if (item.metadata) {
              const formattedMetadata = formatMetadataFromStorage(
                item.metadata,
              );
              return {
                ...item,
                imageUrl: item.imageUrl || formattedMetadata.imageUrl,
                metadata: formattedMetadata,
              };
            }
            return item;
          }),
        };

        return NextResponse.json(formattedShelf);
      }

      const shelf = await prisma.shelf.findUnique({
        where: { id },
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

      // Format items with metadata
      const formattedShelf = {
        ...shelf,
        items: shelf.items.map((item) => {
          if (item.metadata) {
            const formattedMetadata = formatMetadataFromStorage(item.metadata);
            return {
              ...item,
              imageUrl: item.imageUrl || formattedMetadata.imageUrl,
              metadata: formattedMetadata,
            };
          }
          return item;
        }),
      };

      return NextResponse.json(formattedShelf);
    }

    if (q) {
      const searchTerm = q.trim();

      const shelves = await prisma.shelf.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            {
              items: {
                some: {
                  OR: [
                    { name: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                    { barcode: { contains: searchTerm } },
                  ],
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
