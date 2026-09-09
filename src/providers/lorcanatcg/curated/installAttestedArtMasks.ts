/**
 * Glitter MotifMask for attested Lorcast fills (no RB mask).
 *
 * Prefer a hand-authored file under `curated/masks/<printKey>.png` (colons →
 * hyphens), else greyscale the local art into `mask.attested.webp`.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cardDiskIdFromPrintKey } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";

import { ATTESTED_ART_MASK_FILE } from "./attestedFinishes";
import ledger from "./attestedFinishes.json";

export { ATTESTED_ART_MASK_FILE };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CURATED_MASKS_DIR = path.join(HERE, "masks");

const ART_STEMS = [
  "art.lorcast.avif",
  "art.lorcast.webp",
  "art.lorcast.jpg",
  "art.webp",
  "art.jpg",
  "art.png",
] as const;

function curatedMaskPath(printKey: string): string | null {
  const stem = printKey.replace(/:/g, "-");
  for (const ext of [".png", ".webp", ".jpg", ".jpeg"] as const) {
    const candidate = path.join(CURATED_MASKS_DIR, `${stem}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findArtFile(cardDir: string): string | null {
  for (const stem of ART_STEMS) {
    const candidate = path.join(cardDir, stem);
    if (existsSync(candidate)) return candidate;
  }
  try {
    const hit = readdirSync(cardDir).find((name) => /^art\./i.test(name));
    return hit ? path.join(cardDir, hit) : null;
  } catch {
    return null;
  }
}

export type InstallAttestedArtMasksOptions = {
  packId?: string;
  languages?: readonly string[];
  dryRun?: boolean;
  force?: boolean;
};

export type InstallAttestedArtMaskResult = {
  printKey: string;
  installed: boolean;
  dest: string | null;
  source?: "curated" | "art";
  reason?: string;
};

async function writeMotifMask(
  sharp: typeof import("sharp").default,
  source: string,
  dest: string,
): Promise<void> {
  mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(source)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .webp({ lossless: true, effort: 6 })
    .toFile(dest);
}

/**
 * For each attested print, install `mask.attested.webp` (curated first, else art).
 */
export async function installAttestedArtMasks(
  opts: InstallAttestedArtMasksOptions = {},
): Promise<InstallAttestedArtMaskResult[]> {
  const packId = opts.packId ?? "lorcana";
  const languages = opts.languages ?? ["en", "fr", "de", "it"];
  const cardsRoot = packCardsDir(packId);
  const results: InstallAttestedArtMaskResult[] = [];

  const sharp = (await import("sharp")).default;

  for (const entry of ledger.entries) {
    const curated = curatedMaskPath(entry.printKey);
    let installedAny = false;
    let lastDest: string | null = null;
    let source: "curated" | "art" | undefined;

    for (const lang of languages) {
      const id = cardDiskIdFromPrintKey(entry.printKey, lang);
      if (!id) continue;
      const cardDir = path.join(cardsRoot, id.set, id.lang, id.card);
      const art = findArtFile(cardDir);
      const input = curated ?? art;
      if (!input) continue;

      const dest = path.join(cardDir, ATTESTED_ART_MASK_FILE);
      lastDest = dest;
      source = curated ? "curated" : "art";
      if (!opts.force && existsSync(dest)) {
        installedAny = true;
        continue;
      }
      if (opts.dryRun) {
        installedAny = true;
        continue;
      }

      await writeMotifMask(sharp, input, dest);
      installedAny = true;
    }

    results.push({
      printKey: entry.printKey,
      installed: installedAny,
      dest: lastDest,
      source,
      reason: installedAny
        ? undefined
        : "no curated mask and no local art for attested print",
    });
  }

  return results;
}
