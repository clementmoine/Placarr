#!/usr/bin/env tsx
/**
 * Prebuild No-Intro SQLite index (LaunchBox parity).
 * Uses local DAT path when present; otherwise syncs NOINTRO_DAT_PACK / URL
 * (download opt-in via allowDownload).
 *
 *   pnpm nointro:update
 *   pnpm nointro:update -- --enqueue   # catalog worker job (visible in app)
 */
import { enqueueBackgroundWorkJob, BACKGROUND_WORK_KIND } from "@/core/collect/jobs/workQueue";
import { buildNoIntroIndex } from "@/providers/nointro/indexStore";

async function main() {
  if (process.argv.includes("--enqueue")) {
    await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.nointroIndexSync,
      payload: { allowDownload: true },
      replaceOpenForKind: true,
    });
    console.log("Enqueued nointroIndexSync (catalog worker).");
    return;
  }

  const db = await buildNoIntroIndex({ allowDownload: true });
  if (!db) {
    console.error(
      "Failed to build No-Intro index. Set NOINTRO_DAT_PATH and/or NOINTRO_DAT_PACK (local zip) / NOINTRO_DAT_PACK_URL.",
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
    db.prepare("SELECT COUNT(DISTINCT datName) AS count FROM games").get() as
      | { count?: number }
      | undefined
  )?.count;
  console.log(
    `No-Intro index ready (${typeof gameCount === "number" ? gameCount : "?"} games, ${typeof romCount === "number" ? romCount : "?"} roms, ${typeof datCount === "number" ? datCount : "?"} DAT set(s)).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
