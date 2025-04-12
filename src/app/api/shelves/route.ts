// /app/api/shelves/route.ts
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

// GET: /api/shelves?id=SHELF_ID
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const shelf = await prisma.shelf.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }
    return NextResponse.json(shelf);
  }

  const shelves = await prisma.shelf.findMany({
    include: { items: true },
  });

  return NextResponse.json(shelves);
}

// POST: addShelf
// Body: { name, userId, imageUrl?, color? }
export async function POST(req: Request) {
  const body = await req.json();

  const { name, imageUrl, color } = body;

  const shelf = await prisma.shelf.create({
    data: { name, imageUrl, color },
  });

  return NextResponse.json(shelf);
}

// PATCH: updateItem
// Body: { id, name?, description?, imageUrl?, barcode? }
export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, ...data } = body;

  const item = await prisma.item.update({
    where: { id },
    data,
  });

  return NextResponse.json(item);
}
