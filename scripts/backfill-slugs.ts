/**
 * Remplit la colonne `slug` (= slugify(name)) pour toutes les étagères et items
 * existants. À lancer une fois après la migration `add_slug`.
 *
 *   pnpm exec ts-node scripts/backfill-slugs.ts
 *
 * Utilise le MÊME slugify que l'app pour garantir l'égalité slug ↔ résolution.
 */
import { PrismaClient } from "@prisma/client";
import { slugify } from "../src/lib/slugs";

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
        data: { slug: slugify(it.name) },
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
