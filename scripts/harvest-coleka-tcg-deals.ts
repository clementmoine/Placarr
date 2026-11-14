/**
 * One-shot harvest of Coleka deals prices for every TCG pack that uses Coleka.
 *
 * Logged-in session (premium trial / account):
 *   COLEKA_COOKIE='PHPSESSID=…; colekaID2=…' pnpm exec tsx scripts/harvest-coleka-tcg-deals.ts
 *
 * Without cookie, deals ajax often returns an empty body.
 *
 * Lives under `scripts/` (not `providers/shared/`) so shared stays sibling-blind.
 */
import { harvestColekaBleachS1Prices } from "@/providers/bleach/bleachscb/harvest/colekaPrices";
import { harvestColekaLamincardsPrices } from "@/providers/dragonball/dbslamincards/harvest/colekaPrices";
import { harvestColekaLeclercPrices } from "@/providers/leclerc/colekaPrices";
import { harvestColekaCarddassPrices } from "@/providers/naruto/narutocarddass/harvest/colekaPrices";
import { harvestColekaRanksPrices } from "@/providers/naruto/narutoranks/harvest/colekaPrices";
import { harvestColekaUltraPrices } from "@/providers/naruto/narutoultra/harvest/colekaPrices";
import { harvestColekaMcdoPrices } from "@/providers/pokemon/tcgdex/scrape/coleka/colekaPrices";

async function main(): Promise<void> {
  if (!process.env.COLEKA_COOKIE?.trim()) {
    console.warn(
      "⚠ COLEKA_COOKIE unset — deals ajax is usually empty without a session.",
    );
  }
  const jobs = [
    ["bleach/scb", harvestColekaBleachS1Prices],
    ["naruto/carddass", harvestColekaCarddassPrices],
    ["naruto/ultra-challenge", harvestColekaUltraPrices],
    ["naruto/ninja-ranks", harvestColekaRanksPrices],
    ["dragonball/lamincards", harvestColekaLamincardsPrices],
    ["pokemon (McDo FR)", harvestColekaMcdoPrices],
    ["leclerc (Marvel/Disney)", harvestColekaLeclercPrices],
  ] as const;

  for (const [label, run] of jobs) {
    try {
      const { ledger, outPath } = await run();
      console.log(
        `✓ ${label} — ${ledger.withPrintKey} printKey / ${ledger.uniqueItems} items / cote ${ledger.withQuotation} → ${outPath}`,
      );
    } catch (err) {
      console.error(
        `✗ ${label} — ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
