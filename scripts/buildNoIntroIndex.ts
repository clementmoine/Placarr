#!/usr/bin/env tsx
/**
 * Prebuild No-Intro SQLite index from a local Logiqx DAT file.
 * Never downloads — set NOINTRO_DAT_PATH to a `.dat` / `.xml` on disk.
 */
import { buildNoIntroIndex } from "@/providers/nointro/indexStore";

async function main() {
  const db = await buildNoIntroIndex();
  if (!db) {
    console.error(
      "Failed to build No-Intro index. Set NOINTRO_DAT_PATH to a local DAT file.",
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
  console.log(
    `No-Intro index ready (${typeof gameCount === "number" ? gameCount : "?"} games, ${typeof romCount === "number" ? romCount : "?"} roms).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
