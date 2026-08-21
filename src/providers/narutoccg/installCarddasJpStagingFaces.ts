/**
 * Copy official Wayback GIFs into `cards/{family}/{id}/ja/art.carddas.*`.
 * Keep nikita / Suruga / every other dump. Skip numbered chrome (`001.gif`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import { extFromMagic, saveNarutoFace } from "./narutoFaceBytes";
import { carddasJpStagingFaceInstallTarget } from "./parseCarddasJpAsset";
import { NARUTO_STAGING_CARDDAS_JP } from "./scrapeCarddasJp";

const LANG = "ja";

export type InstallCarddasJpStagingFacesOptions = {
  force?: boolean;
  root?: string;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkFiles(abs));
    else if (/\.(gif|jpe?g|png|webp)$/i.test(name)) out.push(abs);
  }
  return out;
}

export async function installCarddasJpStagingFaces(
  opts: InstallCarddasJpStagingFacesOptions = {},
): Promise<{ listed: number; copied: number; skipped: number }> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_CARDDAS_JP);
  const cardsDir = path.join(root, "cards");
  const files = walkFiles(staging);
  let listed = 0;
  let copied = 0;
  let skipped = 0;
  console.log("── JA carddas.com GIFs → cards/{family}/{id}/ja/art.carddas.*");
  for (const abs of files) {
    const diskId = carddasJpStagingFaceInstallTarget(path.basename(abs));
    if (!diskId) continue;
    listed += 1;
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, LANG) ??
      path.join(cardsDir, "ninja", diskId, LANG);
    const buf = readFileSync(abs);
    if (extFromMagic(buf) === ".bin") continue;
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "carddas",
      lang: LANG,
      force: opts.force,
    });
    if (saved === "skip") skipped += 1;
    else copied += 1;
  }
  console.log(
    JSON.stringify({ carddasJpStagingFaces: true, listed, copied, skipped }),
  );
  return { listed, copied, skipped };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  installCarddasJpStagingFaces().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
