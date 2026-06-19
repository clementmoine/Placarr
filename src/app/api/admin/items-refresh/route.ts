import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const items = await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      imageUrl: true,
      barcode: true,
      condition: true,
      createdAt: true,
      updatedAt: true,
      shelf: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      metadata: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          lastFetched: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    total: items.length,
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      metadata: item.metadata
        ? {
            ...item.metadata,
            lastFetched: item.metadata.lastFetched.toISOString(),
          }
        : null,
    })),
  });
}
