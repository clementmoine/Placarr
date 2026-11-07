/**
 * Yu-Gi-Oh! backs — thin wrapper around the shared TCG Cards harvest.
 *
 * ygocards.fr ships a single classic Konami sleeve at
 * `cards/original/back.webp` (same family as opecards / lorcards).
 */
import { packCardsDir } from "@/lib/packPaths";
import { harvestTcgCardsDistinctBacks } from "@/providers/shared/tcgcards/harvestCommonBacks";

import { YUGIOH_PACK_ID } from "./pack";

export async function harvestYgocardsDistinctBacks(opts?: {
  force?: boolean;
  dataCardsDir?: string;
}): Promise<{
  probed: number;
  installed: string[];
  skippedDefault: string[];
  missing: string[];
  defaultSlug: string | null;
  observedCount: number;
}> {
  const result = await harvestTcgCardsDistinctBacks("ygocards", {
    force: opts?.force,
    dataCardsDir: opts?.dataCardsDir ?? packCardsDir(YUGIOH_PACK_ID),
  });
  return {
    probed: result.probed,
    installed: result.installed,
    skippedDefault: result.skippedDefault,
    missing: result.missing,
    defaultSlug: result.defaultSlug,
    observedCount: result.observed.length,
  };
}
