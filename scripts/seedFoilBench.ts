/**
 * Fill a bench shelf with one real print per foil finish.
 *
 * The playroom draws each look on a card that carries that finish, and falls
 * back to a shared card for the ones the collection has none of. That fallback
 * is honest but useless for judging: a recipe ends in `mix-blend-mode` against
 * the artwork, so a Tempest look over a Silver print tells you very little.
 *
 * These are real prints, chosen from the provider's own index by finish — but
 * they are **not owned copies**, so they go on their own shelf rather than into
 * the Lorcana collection, where they would inflate its counts and its value.
 * Deleting that shelf undoes all of this.
 *
 *   pnpm tsx scripts/seedFoilBench.ts
 */

import { prisma } from "../src/lib/db/prisma";
import {
  loadLorcanaIndex,
  LORCANA_DEFAULT_LANGUAGE,
  LORCANA_LANGUAGES,
} from "../src/providers/lorcanajson/fetch";
import { slugify } from "../src/lib/routing/slugs";

const SHELF_NAME = "Lorcana — banc d'essai";

/** Every finish the publisher ships, whether or not anyone owns one. */
const WANTED_FINISHES = [
  "Silver",
  "Satin",
  "Lore",
  "Lava",
  "Magma",
  "Glitter",
  "VerticalWave",
  "SeaWave",
  "RainbowPillars",
  "FreeForm1",
  "FreeForm2",
  "Tempest",
  "CalendarWave",
];

async function main() {
  try {
    const user = await prisma.user.findFirst({
      where: { role: "admin" },
      select: { id: true },
    });
    if (!user) throw new Error("no admin user to hang the bench shelf on");

    /**
     * Every language, French first — the same order the app uses everywhere.
     *
     * Preference is not availability: Tempest, FreeForm2 and CalendarWave
     * appear on no French printing at all, so a bench reading only FR could
     * never show three of the thirteen looks. The finish belongs to the
     * printing, not to the text on it.
     */
    const indexes = await Promise.all(
      LORCANA_LANGUAGES.map((language) => loadLorcanaIndex(language)),
    );
    const byPreference = [
      ...indexes.filter((index) => index.language === LORCANA_DEFAULT_LANGUAGE),
      ...indexes.filter((index) => index.language !== LORCANA_DEFAULT_LANGUAGE),
    ];
    const cards = byPreference.flatMap((index) => index.cards);
    console.log(
      byPreference
        .map((index) => `${index.language.toUpperCase()} ${index.cards.length}`)
        .join(" + "),
    );

    /** One print per finish. First match wins — any card of that finish does. */
    const chosen = new Map<string, (typeof cards)[number]>();
    for (const finish of WANTED_FINISHES) {
      const card = cards.find(
        (entry) =>
          entry.foilTypes?.includes(finish) &&
          entry.imageUrl &&
          entry.foilMaskUrl,
      );
      if (card) chosen.set(finish, card);
      else console.warn(`  aucune carte trouvée pour ${finish}`);
    }

    /** And one carrying each varnish, so the stamped coats have a mask too. */
    for (const varnish of ["MetallicHotFoil", "ChromeRainbowHotFoil"]) {
      const card = cards.find(
        (entry) =>
          entry.varnishType === varnish &&
          entry.imageUrl &&
          entry.varnishMaskUrl,
      );
      if (card) chosen.set(varnish, card);
      else console.warn(`  aucune carte trouvée pour ${varnish}`);
    }

    const shelf = await prisma.shelf.upsert({
      where: {
        // A shelf is unique per user and slug in practice; find-or-create.
        id:
          (
            await prisma.shelf.findFirst({
              where: { userId: user.id, name: SHELF_NAME },
              select: { id: true },
            })
          )?.id ?? "00000000-0000-0000-0000-000000000000",
      },
      update: {},
      create: {
        name: SHELF_NAME,
        slug: slugify(SHELF_NAME),
        type: "tcg",
        color: "#8b5cf6",
        cardFormat: "tcg",
        userId: user.id,
      },
    });
    console.log(`étagère : ${shelf.name} (${shelf.id})`);

    for (const [finish, card] of chosen) {
      const name = `${card.fullName ?? card.name} — ${finish}`;
      const existing = await prisma.item.findFirst({
        where: { shelfId: shelf.id, printKey: card.printKey, variant: finish },
        select: { id: true },
      });
      if (existing) {
        console.log(`  = ${finish.padEnd(20)} déjà là`);
        continue;
      }
      await prisma.item.create({
        data: {
          name,
          slug: slugify(name),
          printKey: card.printKey,
          variant: finish,
          condition: "new",
          imageUrl: card.imageUrl,
          shelfId: shelf.id,
          userId: user.id,
        },
      });
      console.log(`  + ${finish.padEnd(20)} ${card.printKey}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
