import { Prisma, PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const q = searchParams.get("q");
    const shelfId = searchParams.get("shelfId");

    if (id) {
      const item = await prisma.item.findUnique({
        where: { id },
        include: { shelf: true },
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
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
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(items);
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
    const { shelfId, name, description, imageUrl, barcode, condition } = body;

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
      },
    });

    return NextResponse.json(item);
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

    const item = await prisma.item.update({
      where: { id },
      data,
      include: {
        shelf: true,
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
