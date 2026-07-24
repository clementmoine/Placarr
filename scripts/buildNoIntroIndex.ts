#!/usr/bin/env tsx
/**
 * Prebuild No-Intro SQLite index from local Logiqx DAT file(s).
 * Never downloads — set NOINTRO_DAT_PATH to a `.dat`/`.xml` file or a directory.
 */
import { buildNoIntroIndex } from "@/providers/nointro/indexStore";

async function main() {
  const db = await buildNoIntroIndex();
  if (!db) {
    console.error(
      "Failed to build No-Intro index. Set NOINTRO_DAT_PATH to a local DAT file or directory of .dat/.xml files.",
    );
    process.exit(1);
  }

  const gameCount = (
    db.prepare("SELECT COUNT(*) AS count FROM games").get() as
      | { count?: number }
      | undefined
  )?.count;
  const romCount = (
    db.prepare("SELECT COUNT(*) AS count FROM roms").get() as
      | { count?: number }
      | undefined
  )?.count;
  const datCount = (
    db
      .prepare("SELECT COUNT(DISTINCT datName) AS count FROM games")
      .get() as { count?: number } | undefined
  )?.count;
  console.log(
    `No-Intro index ready (${typeof gameCount === "number" ? gameCount : "?"} games, ${typeof romCount === "number" ? romCount : "?"} roms, ${typeof datCount === "number" ? datCount : "?"} DAT set(s)).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
