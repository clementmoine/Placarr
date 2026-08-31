import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { writeLosslessWebpFile } from "@/lib/media/losslessWebp";

import { narutoKayouCuratedDir } from "./pack";

/** Mirror `curated/cards/official/*.png` → `data/.../cards/official/*.webp`. */
export async function installKayouOfficialCardBacks(opts: {
  curatedCardsDir?: string;
  destCardsDir: string;
  dryRun?: boolean;
}): Promise<number> {
  const officialSrc = path.join(
    opts.curatedCardsDir ?? path.join(narutoKayouCuratedDir(), "cards"),
    "official",
  );
  if (!existsSync(officialSrc)) return 0;
  const destDir = path.join(opts.destCardsDir, "official");
  let installed = 0;
  for (const name of readdirSync(officialSrc)) {
    if (!/\.png$/i.test(name)) continue;
    const src = path.join(officialSrc, name);
    const dest = path.join(destDir, name.replace(/\.png$/i, ".webp"));
    if (opts.dryRun) {
      installed += 1;
      continue;
    }
    await writeLosslessWebpFile(src, dest);
    installed += 1;
  }
  return installed;
}
