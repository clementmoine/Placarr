/**
 * Clone a shelf, giving every copy a foil finish it can actually wear.
 *
 * The collection's own Lorcana items all carry `variant = NULL`, so
 * `variantRendering` resolves them as plain and `FoilCardImage` never mounts —
 * measured on the grid: 193 cards, zero canvases. That makes the shelf useless
 * for judging the renderer under load, which is what this clone exists for.
 *
 * The finish is **not** invented. `resolveStoredVariant` matches a stored
 * variant against the finishes the provider says the print exists in, so a made
 * up name resolves to nothing and the card draws plain again — the exact bug
 * this is meant to avoid. Each copy takes the first real non-plain finish its
 * own print offers, and a print offering none is skipped rather than faked.
 *
 *   pnpm tsx scripts/cloneShelfAsFoil.ts <slug-source>   (slug requis)
 */

import { prisma } from "../src/lib/db/prisma";
import {
  loadLorcanaIndex,
  LORCANA_DEFAULT_LANGUAGE,
  LORCANA_LANGUAGES,
} from "../src/providers/lorcanajson/fetch";
import { slugify } from "../src/lib/routing/slugs";

const SUFFIX = " — foil (test)";

async function main() {
  const sourceSlug = process.argv[2];
  if (!sourceSlug) {
    throw new Error(
      "usage: pnpm tsx scripts/cloneShelfAsFoil.ts <slug-source>\n" +
        "The slug is required rather than defaulted: naming one game here " +
        "would bind a generic script to it, which the effect-pack blindness " +
        "guard rightly refuses.",
    );
  }

  const source = await prisma.shelf.findFirst({
    where: { slug: sourceSlug },
    include: { items: true },
  });
  if (!source) throw new Error(`no shelf with slug "${sourceSlug}"`);
  console.log(`source : ${source.name} — ${source.items.length} objets`);

  /** Every language, French first — a finish belongs to the printing. */
  const indexes = await Promise.all(
    LORCANA_LANGUAGES.map((language) => loadLorcanaIndex(language)),
  );
  const ordered = [
    ...indexes.filter((i) => i.language === LORCANA_DEFAULT_LANGUAGE),
    ...indexes.filter((i) => i.language !== LORCANA_DEFAULT_LANGUAGE),
  ];
  /** printKey -> the finishes that printing really has. */
  const finishesByPrint = new Map<string, string[]>();
  for (const index of ordered) {
    for (const card of index.cards) {
      if (!card.printKey || finishesByPrint.has(card.printKey)) continue;
      const real = (card.foilTypes ?? []).filter((f) => f && f !== "None");
      if (real.length > 0) finishesByPrint.set(card.printKey, real);
    }
  }
  console.log(`${finishesByPrint.size} tirages avec au moins une finition`);

  const name = `${source.name}${SUFFIX}`;
  const existing = await prisma.shelf.findFirst({
    where: { userId: source.userId, name },
    select: { id: true },
  });
  if (existing) {
    await prisma.item.deleteMany({ where: { shelfId: existing.id } });
    await prisma.shelf.delete({ where: { id: existing.id } });
    console.log("ancienne étagère de test supprimée");
  }

  const clone = await prisma.shelf.create({
    data: {
      name,
      slug: slugify(name),
      type: source.type,
      color: source.color,
      imageUrl: source.imageUrl,
      cardFormat: source.cardFormat,
      cardBackUrl: source.cardBackUrl,
      userId: source.userId,
    },
  });

  const counts = new Map<string, number>();
  let skipped = 0;
  for (const item of source.items) {
    const finishes = item.printKey ? finishesByPrint.get(item.printKey) : null;
    if (!finishes) {
      skipped += 1;
      continue;
    }
    const finish = finishes[0];
    counts.set(finish, (counts.get(finish) ?? 0) + 1);

    await prisma.item.create({
      data: {
        name: item.name,
        slug: item.slug ? `${item.slug}-foil` : slugify(`${item.name} foil`),
        description: item.description,
        imageUrl: item.imageUrl,
        backgroundImageUrl: item.backgroundImageUrl,
        printKey: item.printKey,
        variant: finish,
        condition: item.condition,
        metadataId: item.metadataId,
        shelfId: clone.id,
        userId: item.userId,
      },
    });
  }

  console.log(`\n${clone.name}  (/shelves/${clone.slug})`);
  console.log(
    `  ${source.items.length - skipped} copiés, ${skipped} sans finition connue`,
  );
  for (const [finish, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${finish.padEnd(16)} ${n}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
