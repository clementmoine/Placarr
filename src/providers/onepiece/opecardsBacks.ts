/**
 * One Piece backs — thin wrapper around the shared TCG Cards harvest.
 *
 * Discovery is observation-driven (`/cards` HTML + type-label CDN probes),
 * not a hardcoded category list. See `harvestCommonBacks.ts`.
 */
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";
import { harvestTcgCardsDistinctBacks } from "@/providers/shared/dbscards/harvestCommonBacks";
import { tcgCardsStaticOrigin } from "@/providers/shared/dbscards/parseCommonBacks";

import { ONEPIECE_PACK_ID, onepieceCuratedDir } from "./pack";

/** @deprecated Prefer harvest observation; kept for URL unit tests. */
export function opecardsBackUrl(slug: string): string {
  const staticOrigin = tcgCardsStaticOrigin("https://www.opecards.fr");
  const segment = slug === "don" ? "don!!" : slug;
  return `${staticOrigin}/cards/common/back-${segment}.webp`;
}

export async function harvestOpecardsDistinctBacks(opts?: {
  force?: boolean;
  curatedCardsDir?: string;
  dataCardsDir?: string;
}): Promise<{
  probed: number;
  installed: string[];
  skippedDefault: string[];
  missing: string[];
  defaultSlug: string | null;
  observedCount: number;
}> {
  const result = await harvestTcgCardsDistinctBacks("opecards", {
    force: opts?.force,
    curatedCardsDir:
      opts?.curatedCardsDir ?? path.join(onepieceCuratedDir(), "cards"),
    dataCardsDir: opts?.dataCardsDir ?? packCardsDir(ONEPIECE_PACK_ID),
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
