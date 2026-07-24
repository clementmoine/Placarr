#!/usr/bin/env tsx
/**
 * Prebuild LaunchBox SQLite index from Metadata.zip / Metadata.xml.
 * Scan path never downloads — run this script (or set LAUNCHBOX_ALLOW_DOWNLOAD=1).
 */
import { buildLaunchBoxIndex } from "@/providers/launchbox/indexStore";

async function main() {
  const db = await buildLaunchBoxIndex({ allowDownload: true });
  if (!db) {
    console.error(
      "Failed to build LaunchBox index. Check network / unzip / LAUNCHBOX_* paths.",
    );
    process.exit(1);
  }

  const gameCount = (
    db.prepare("SELECT COUNT(*) AS count FROM games").get() as
      | { count?: number }
      | undefined
  )?.count;
  console.log(
    `LaunchBox index ready (${typeof gameCount === "number" ? gameCount : "?"} games).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
