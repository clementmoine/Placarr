/**
 * Moisson (optionnelle) + audit des titres FR JCC vs sources attestées.
 *
 *   pnpm exec tsx src/providers/dragonball/dbsjcc/scripts/auditFrTitles.ts
 *   pnpm exec tsx …/auditFrTitles.ts --harvest-carddass
 *   pnpm exec tsx …/auditFrTitles.ts --harvest-dbzc
 *   pnpm exec tsx …/auditFrTitles.ts --harvest-dbzc --sets part1,part2
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { auditDbsjccFrTitles } from "../audit/titleSources";
import { harvestCarddassFrDbzNames } from "../harvest/carddassFrNames";
import { harvestDbzcollectionNames } from "../harvest/dbzcollectionNames";
import { dbsJccCuratedDir } from "../pack";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--harvest-carddass")) {
    const out = await harvestCarddassFrDbzNames();
    console.log(`── carddass.fr names — ${out.names} → ${out.path}`);
  }
  if (argv.includes("--harvest-dbzc")) {
    const setsArg = argv.find((a) => a.startsWith("--sets="))?.slice("--sets=".length);
    const setCodes = setsArg
      ? setsArg.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const out = await harvestDbzcollectionNames({ setCodes });
    console.log(
      `── dbzcollection names — ${out.named} with Nom, ${out.missingNom} without → ${out.path}`,
    );
  }

  const rows = auditDbsjccFrTitles();
  const reportPath = path.join(
    dbsJccCuratedDir(),
    "sources",
    "title-audit-fr.json",
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        observed: new Date().toISOString(),
        flagged: rows.length,
        rows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`── audit FR titles — ${rows.length} flagged → ${reportPath}`);
  for (const row of rows.slice(0, 40)) {
    console.log(
      `${row.printKey} | ${row.catalogTitle} | ${row.flags.join(",")} | ${JSON.stringify(row.sources)}`,
    );
  }
  if (rows.length > 40) console.log(`… +${rows.length - 40} more`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
