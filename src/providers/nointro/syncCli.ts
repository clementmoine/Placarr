#!/usr/bin/env tsx
/**
 * Out-of-band No-Intro DAT pack sync + optional index rebuild.
 *
 * Local zip:  NOINTRO_DAT_PACK=/path/to/pack.zip pnpm nointro:sync
 * Remote zip: NOINTRO_DAT_PACK_URL=… NOINTRO_ALLOW_DOWNLOAD=1 pnpm nointro:sync
 *
 * Extract dest: NOINTRO_DAT_PATH (or .cache/nointro/dats).
 * Scan path never downloads — this script is intentional prebuild only.
 */
import { buildNoIntroIndex } from "@/providers/nointro/indexStore";
import { syncNoIntroDatPack } from "@/providers/nointro/syncDatPack";

async function main() {
  const skipBuild = process.argv.includes("--no-build");

  const synced = await syncNoIntroDatPack({ allowDownload: true });
  if (!synced) {
    console.error(
      "Failed to sync No-Intro DAT pack. Set NOINTRO_DAT_PACK (local zip) or NOINTRO_DAT_PACK_URL.",
    );
    process.exit(1);
  }

  console.log(
    `DAT pack ready (${synced.files.length} file(s) in ${synced.destDir}).`,
  );

  if (skipBuild) return;

  // Point the index build at the sync destination when DAT_PATH was unset.
  if (!process.env.NOINTRO_DAT_PATH?.trim()) {
    process.env.NOINTRO_DAT_PATH = synced.destDir;
  }

  const db = await buildNoIntroIndex({ datPath: synced.destDir });
  if (!db) {
    console.error("DAT pack synced but index build failed.");
    process.exit(1);
  }

  const gameCount = (
    db.prepare("SELECT COUNT(*) AS count FROM games").get() as
      { count?: number } | undefined
  )?.count;
  console.log(
    `No-Intro index ready (${typeof gameCount === "number" ? gameCount : "?"} games).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
