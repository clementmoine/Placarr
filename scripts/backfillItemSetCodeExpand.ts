/**
 * Pose `Item.setCode` et **duplique** les cartes inter-sets.
 *
 * Après le passage set-scoped, un item sans `setCode` coche encore toutes les
 * listes qui portent son printKey (legacy). Pour les reprints (NI-049 → s1+s5),
 * on crée une copie par membership : tu gardes celles que tu as vraiment et tu
 * supprimes le reste.
 *
 * - 1 set catalogue → stamp `setCode` sur l'item ;
 * - N sets → item d'origine = 1ᵉʳ set (tri numérique), + N−1 clones ;
 * - 0 set → laissé tel quel (indécidable).
 *
 * Ne touche **pas** aux items qui ont déjà un `setCode`.
 *
 *   pnpm tsx scripts/backfillItemSetCodeExpand.ts           # dry-run
 *   pnpm tsx scripts/backfillItemSetCodeExpand.ts --apply
 */
import "dotenv/config";

import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { planSetCodeExpand } from "@/core/collect/setCodeExpand";
import { parsePrintKey } from "@/core/identify/printKey";
import { prisma } from "@/lib/db/prisma";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import type { MediaType } from "@/types/providerRegistry";

const apply = process.argv.includes("--apply");

/** printKey → set ids, pour une langue de checklist. */
async function membershipsByPrintKey(input: {
  games: ReadonlySet<string>;
  language: string | null;
  shelfType: MediaType;
}): Promise<Map<string, string[]>> {
  const bags = new Map<string, Set<string>>();
  for (const pack of PROVIDER_MODULES) {
    if (
      typeof pack.listPrintSets !== "function" ||
      typeof pack.listSetPrints !== "function"
    ) {
      continue;
    }
    const packGames = pack.printGames ?? [];
    if (
      input.games.size > 0 &&
      !packGames.some((game) => input.games.has(game))
    ) {
      continue;
    }
    const type = (pack.info.types.includes(input.shelfType)
      ? input.shelfType
      : pack.info.types[0] ?? "tcg") as MediaType;
    let sets: Awaited<ReturnType<NonNullable<typeof pack.listPrintSets>>>;
    try {
      sets = await Promise.resolve(
        pack.listPrintSets!(type, input.language),
      );
    } catch {
      continue;
    }
    for (const set of sets) {
      if (
        input.language &&
        set.languages?.length &&
        !set.languages.includes(input.language)
      ) {
        continue;
      }
      let prints: Awaited<ReturnType<NonNullable<typeof pack.listSetPrints>>>;
      try {
        prints = await Promise.resolve(
          pack.listSetPrints!({
            setId: set.id,
            language: input.language,
          }),
        );
      } catch {
        continue;
      }
      const setId = set.id.trim().toLowerCase();
      if (!setId) continue;
      for (const row of prints) {
        const key = row.printKey?.trim().toLowerCase();
        if (!key) continue;
        const bag = bags.get(key) ?? new Set<string>();
        bag.add(setId);
        bags.set(key, bag);
      }
    }
  }
  return new Map(
    [...bags].map(([key, setIds]) => [
      key,
      [...setIds].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    ]),
  );
}

async function main(): Promise<void> {
  const items = await prisma.item.findMany({
    where: { printKey: { not: null }, setCode: null },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      backgroundImageUrl: true,
      barcode: true,
      printKey: true,
      variant: true,
      language: true,
      condition: true,
      metadataId: true,
      shelfId: true,
      userId: true,
      loanedTo: true,
      loanedAt: true,
      shelf: { select: { type: true } },
    },
  });

  console.log(
    `items sans setCode : ${items.length}${apply ? "" : " (dry-run)"}`,
  );
  if (items.length === 0) return;

  /*
    Index par (type d'étagère, langue) — la membership FR de s6 est vide, la
    membership EN ne l'est pas. Mélanger les langues inventerait des cases.
  */
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const lang = item.language?.trim().toLowerCase() || "";
    const key = `${item.shelf.type}|${lang}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let stamped = 0;
  let expandedItems = 0;
  let clones = 0;
  let unknown = 0;
  const samples: string[] = [];

  for (const [groupKey, groupItems] of groups) {
    const [shelfTypeRaw, langRaw] = groupKey.split("|");
    const shelfType = (shelfTypeRaw || "tcg") as MediaType;
    const language = langRaw || null;
    const games = new Set<string>();
    for (const item of groupItems) {
      const game = parsePrintKey(item.printKey)?.game;
      if (game) games.add(game);
    }
    console.log(
      `\n— ${shelfType} / lang=${language || "∅"} : ${groupItems.length} item(s), games=${[...games].join(",") || "∅"}`,
    );
    const memberships = await membershipsByPrintKey({
      games,
      language,
      shelfType,
    });

    for (const item of groupItems) {
      const printKey = item.printKey!.trim().toLowerCase();
      const plan = planSetCodeExpand(memberships.get(printKey) ?? []);
      if (plan.kind === "none") {
        unknown += 1;
        if (samples.length < 15) {
          samples.push(`${printKey} « ${item.name} » — aucun set catalogue`);
        }
        continue;
      }
      if (plan.kind === "stamp") {
        stamped += 1;
        if (!apply) continue;
        await prisma.item.update({
          where: { id: item.id },
          data: { setCode: plan.setCode },
        });
        continue;
      }

      expandedItems += 1;
      clones += plan.createSetCodes.length;
      if (samples.length < 15) {
        samples.push(
          `${printKey} → keep ${plan.keepSetCode}, +${plan.createSetCodes.join(",")}`,
        );
      }
      if (!apply) continue;

      await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id: item.id },
          data: { setCode: plan.keepSetCode },
        });
        const reserved = new Set<string>();
        for (const setCode of plan.createSetCodes) {
          const slug = await allocateUniqueItemSlug(item.shelfId, item.name, {
            print: {
              printKey: item.printKey,
              variant: item.variant,
              language: item.language,
            },
            reserved,
          });
          reserved.add(slug);
          await tx.item.create({
            data: {
              name: item.name,
              slug,
              description: item.description,
              imageUrl: item.imageUrl,
              backgroundImageUrl: item.backgroundImageUrl,
              barcode: item.barcode,
              printKey: item.printKey,
              setCode,
              variant: item.variant,
              language: item.language,
              condition: item.condition,
              metadataId: item.metadataId,
              shelfId: item.shelfId,
              userId: item.userId,
              loanedTo: item.loanedTo,
              loanedAt: item.loanedAt,
            },
          });
        }
      });
    }
  }

  console.log(`\nstamp (1 set)     : ${stamped}`);
  console.log(`expand (N sets)   : ${expandedItems} item(s) → +${clones} clone(s)`);
  console.log(`indécidables      : ${unknown}`);
  for (const row of samples) console.log(`  ${row}`);
  if (!apply) {
    console.log("\n(essai à blanc — relancer avec --apply)");
  }
}

void main().finally(() => prisma.$disconnect());
