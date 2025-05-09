import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: Request) {
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
        return NextResponse.json(shelf);
      }

      const shelf = await prisma.shelf.findUnique({
        where: { id },
        include: {
          items: {
            orderBy: { name: "asc" },
          },
        },
      });

      if (!shelf) {
        return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
      }
      return NextResponse.json(shelf);
    }

    if (q) {
      const searchTerm = q.trim();

      const shelves = await prisma.shelf.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            // Recherche dans les items de l'étagère
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { name, imageUrl, color } = body;

    const shelf = await prisma.shelf.create({
      data: { name, imageUrl, color },
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

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    const item = await prisma.shelf.update({
      where: { id },
      data,
      include: {
        items: true,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error in PATCH request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
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
