/**
 * Foil gap audit CLI — `pnpm foil:audit-gaps` [--strict]
 *
 * Shared engine: `@/lib/admin/foilGaps`
 */

import "@/lib/foilMetaLoad.server";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  computeFoilGaps,
  foilGapsReportPath,
} from "@/lib/admin/foilGaps";

function parseArgs(argv: string[]) {
  let strict = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--strict") strict = true;
  }
  return { strict };
}

function main() {
  const { strict } = parseArgs(process.argv.slice(2));
  const report = computeFoilGaps();
  const reportPath = foilGapsReportPath();
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const section = (title: string, lines: string[]) => {
    console.log(title);
    if (lines.length === 0) {
      console.log("  (none)");
      return;
    }
    for (const line of lines) console.log(`  ${line}`);
  };

  console.log("Foil gaps — map these, then ship (see docs/foil_new_finish.md)\n");
  section(
    "Pokémon WebGL — dump .frag not in discovered names",
    report.pokemonWebgl.extraFrags,
  );
  section(
    "Pokémon WebGL — foiled leaf missing motifs",
    report.pokemonWebgl.missingSharedMotifs,
  );
  section(
    "Pokémon CSS — Live leaf → fallback only",
    report.pokemonCss.fallbackOnlyLeaves,
  );
  section(
    "Pokémon CSS — simey rarity CSS without HoloShader port",
    report.pokemonCss.simeyUnported.map(
      (g) => `${g.tree}/${g.stem}.css → expect ${g.expectedId}`,
    ),
  );
  section(
    "Lorcana CSS — catalogue foilType → silver only",
    report.lorcanaCss.fallbackOnlyFinishes,
  );
  section(
    "Lorcana CSS — catalogue varnishType → hotFoil only (non-family)",
    report.lorcanaCss.fallbackOnlyVarnishes,
  );
  section(
    "Lorcana CSS — web stems to review (not chrome / not recipe)",
    report.lorcanaCss.unlistedFromLastDump,
  );
  section(
    "APK-gated (analyse ouverte — docs/foil_apk_sources.md)",
    report.apkGated.map((i) => i.detail),
  );
  console.log(`\nReport: ${reportPath}`);
  console.log(`Actionable: ${report.actionableCount}`);

  if (strict && report.actionableCount > 0) {
    process.exitCode = 1;
  }
}

main();
