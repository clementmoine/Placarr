/**
 * Move on-disk Kayou face folders from ledger alias ids (`nr.cc.*`, `nr.ss.*`)
 * onto canonical paths (`cc.*`, `nrss.*`) after index purge.
 */
import {
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";

import { packCardsDir, packStagingDir } from "@/lib/packPaths";

import { canonicalizeKayouNumber } from "./kayouIdNormalize";
import { kayouFacesStagingDir } from "./narutocardsFaces";
import { NARUTO_KAYOU_PACK_ID } from "./pack";

export type KayouAliasFaceRelocateReport = {
  renamed: number;
  merged: number;
  stagingRenamed: number;
  removed: number;
};

function isAliasNumber(number: string): boolean {
  const n = number.trim().toLowerCase();
  return canonicalizeKayouNumber(n) !== n;
}

function mergeAliasDirIntoCanonical(aliasDir: string, canonDir: string): boolean {
  if (!existsSync(aliasDir)) return false;
  let moved = false;
  if (!existsSync(canonDir)) {
    renameSync(aliasDir, canonDir);
    return true;
  }
  for (const file of readdirSync(aliasDir)) {
    const from = path.join(aliasDir, file);
    const to = path.join(canonDir, file);
    if (!existsSync(to)) {
      renameSync(from, to);
      moved = true;
    }
  }
  if (readdirSync(aliasDir).length === 0) {
    rmSync(aliasDir, { recursive: true, force: true });
  }
  return moved;
}

export function relocateKayouAliasFaceDirs(
  opts: {
    cardsDir?: string;
    stagingDir?: string;
  } = {},
): KayouAliasFaceRelocateReport {
  const cardsRoot = opts.cardsDir ?? packCardsDir(NARUTO_KAYOU_PACK_ID);
  const staging = opts.stagingDir ?? kayouFacesStagingDir();
  const report: KayouAliasFaceRelocateReport = {
    renamed: 0,
    merged: 0,
    stagingRenamed: 0,
    removed: 0,
  };

  if (!existsSync(cardsRoot)) return report;

  for (const setCode of readdirSync(cardsRoot)) {
    const langRoot = path.join(cardsRoot, setCode, "en");
    if (!existsSync(langRoot)) continue;
    for (const number of readdirSync(langRoot)) {
      if (!isAliasNumber(number)) continue;
      const canon = canonicalizeKayouNumber(number);
      const aliasDir = path.join(langRoot, number);
      const canonDir = path.join(langRoot, canon);
      if (!existsSync(canonDir)) {
        renameSync(aliasDir, canonDir);
        report.renamed += 1;
        continue;
      }
      if (mergeAliasDirIntoCanonical(aliasDir, canonDir)) {
        report.merged += 1;
      }
      if (existsSync(aliasDir)) {
        rmSync(aliasDir, { recursive: true, force: true });
        report.removed += 1;
      }
    }
  }

  if (existsSync(staging)) {
    for (const file of readdirSync(staging)) {
      if (!file.endsWith(".webp")) continue;
      const stem = file.slice(0, -".webp".length);
      const dash = stem.indexOf("-");
      if (dash <= 0) continue;
      const setCode = stem.slice(0, dash);
      const number = stem.slice(dash + 1);
      if (!isAliasNumber(number)) continue;
      const canonStem = `${setCode}-${canonicalizeKayouNumber(number)}`;
      const from = path.join(staging, file);
      const to = path.join(staging, `${canonStem}.webp`);
      if (existsSync(to)) {
        rmSync(from, { force: true });
        report.removed += 1;
        continue;
      }
      renameSync(from, to);
      report.stagingRenamed += 1;
    }
  }

  return report;
}
