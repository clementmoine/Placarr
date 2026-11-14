/**
 * One-shot : items sans `variant` → finition plain du catalogue.
 *
 * Avant le sélecteur de finish, les ajouts partaient en `variant = null`.
 * En master set ça ne coche ni None ni Silver. On pose la finition « sans
 * foil » annoncée par le provider (`None` Lorcana, `normal` ailleurs…).
 *
 * Les foils déjà taguées (Silver, …) ne sont pas touchées.
 *
 * Usage : `pnpm exec tsx scripts/backfill-blank-variant-plain.ts`
 * Dry-run : `DRY_RUN=1 pnpm exec tsx scripts/backfill-blank-variant-plain.ts`
 */
import "dotenv/config";

import { finishesOwnedByBlankVariant } from "@/core/enrich/variants";
import { lookupPrintCandidate } from "@/core/identify/printSearch";
import { prisma } from "@/lib/db/prisma";
import type { MediaType } from "@/types/providerRegistry";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

async function plainFinishFor(
  printKey: string,
  shelfType: string | null,
): Promise<string | null> {
  const type = (shelfType?.trim() || "tcg") as MediaType;
  try {
    const candidate = await lookupPrintCandidate(printKey, type, {});
    if (!candidate) return null;
    const plains = finishesOwnedByBlankVariant(
      candidate.finishes,
      candidate.plainFinishes,
    );
    return plains[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const blanks = await prisma.item.findMany({
    where: {
      printKey: { not: null },
      OR: [{ variant: null }, { variant: "" }],
    },
    select: {
      id: true,
      printKey: true,
      shelf: { select: { type: true } },
    },
  });

  console.log(`blank variants: ${blanks.length}${DRY_RUN ? " (dry-run)" : ""}`);

  const byFinish = new Map<string, number>();
  const unresolved: string[] = [];
  let updated = 0;

  // Cache printKey → plain finish
  const cache = new Map<string, string | null>();

  for (const item of blanks) {
    const printKey = item.printKey!.trim();
    const cacheKey = `${item.shelf.type ?? ""}|${printKey}`;
    let plain = cache.get(cacheKey);
    if (plain === undefined) {
      plain = await plainFinishFor(printKey, item.shelf.type);
      cache.set(cacheKey, plain);
    }
    if (!plain) {
      unresolved.push(printKey);
      continue;
    }
    byFinish.set(plain, (byFinish.get(plain) ?? 0) + 1);
    if (!DRY_RUN) {
      await prisma.item.update({
        where: { id: item.id },
        data: { variant: plain },
      });
    }
    updated += 1;
  }

  console.log("would set / set:", Object.fromEntries(byFinish));
  console.log(`updated: ${updated}`);
  if (unresolved.length) {
    const unique = [...new Set(unresolved)];
    console.log(`unresolved: ${unique.length}`, unique.slice(0, 20));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
