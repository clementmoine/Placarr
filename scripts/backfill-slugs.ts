#!/usr/bin/env npx tsx
/**
 * Remplit la colonne `slug` pour toutes les étagères et items existants.
 * Les items utilisent slugifyItemName (numéros de volume sans zéros dans l'URL).
 *
 *   pnpm backfill:slugs
 */
import { PrismaClient } from "@prisma/client";

import { slugify, slugifyItemName } from "@/lib/routing/slugs";

try {
  process.loadEnvFile(".env");
} catch {
  console.warn("(.env not loaded)");
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const shelves = await prisma.shelf.findMany({
      select: { id: true, name: true },
    });
    for (const s of shelves) {
      await prisma.shelf.update({
        where: { id: s.id },
        data: { slug: slugify(s.name) },
      });
    }

    const items = await prisma.item.findMany({
      select: { id: true, name: true },
    });
    for (const it of items) {
      await prisma.item.update({
        where: { id: it.id },
        data: { slug: slugifyItemName(it.name) },
      });
    }

    console.log(`Backfilled ${shelves.length} shelves, ${items.length} items`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
