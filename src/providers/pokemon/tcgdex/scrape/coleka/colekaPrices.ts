/**
 * Coleka deals prices for Pokémon McDo FR leaves (`_r35163`, `_r42012`).
 */
import path from "node:path";

import {
  harvestColekaDealsForPack,
  writeColekaPriceLedger,
  type ColekaDealsRubriqueTarget,
  type ColekaPriceLedger,
} from "@/providers/shared/coleka/dealsHarvest";
import { printKeyFromTcgdexIds } from "../../fetch";
import { colekaMcdoLocalId } from "./parseColekaPokemon";
import colekaMcdoFr from "../../curated/sources/coleka-mcdo-fr.json";

const POKEMON_PACK_ID = "pokemon";

export function colekaMcdoPriceLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src/providers/pokemon/tcgdex/curated/sources",
    "coleka-mcdo-prices.json",
  );
}

type McdoBranch = {
  id: string;
  setId: string;
  label: string;
  url: string;
  listedCount: number;
  scrape: boolean;
};

function rubriqueIdFromUrl(url: string): string | null {
  const m = /_r(\d+)\b/i.exec(url);
  return m?.[1] ?? null;
}

export function colekaMcdoDealsTargets(): ColekaDealsRubriqueTarget[] {
  const branches = (colekaMcdoFr.branches ?? []) as McdoBranch[];
  return branches
    .filter((b) => b.scrape !== false)
    .map((branch) => {
      const rubriqueId = rubriqueIdFromUrl(branch.url);
      if (!rubriqueId) {
        throw new Error(`Coleka McDo branch ${branch.id} missing _r id`);
      }
      return {
        rubriqueId,
        label: branch.label,
        listedCount: branch.listedCount,
        resolvePrintKey: (deal) => {
          const localId = colekaMcdoLocalId(deal.refItem ?? "");
          if (!localId) return null;
          return printKeyFromTcgdexIds(branch.setId, localId);
        },
        resolvePrinted: (deal) => deal.refItem,
      } satisfies ColekaDealsRubriqueTarget;
    });
}

export async function harvestColekaMcdoPrices(
  opts: { signal?: AbortSignal } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const ledger = await harvestColekaDealsForPack(
    POKEMON_PACK_ID,
    colekaMcdoDealsTargets(),
    opts,
  );
  const outPath = writeColekaPriceLedger(colekaMcdoPriceLedgerPath(), ledger);
  return { ledger, outPath };
}
