/**
 * Install carddass.fr/dbz Wayback faces onto dbsjcc FR prints.
 *
 * Matching: series 1–10 → partN; prefer ungrouped; skip pouvoirs.
 * Faces land as `art.carddass.jpg` under lang=`fr` — never overwrite
 * `art.dbzcollection.jpg` as the preferred index art (disk dumps coexist;
 * localTcgLine emits every `art.*` for the Images picker).
 * Wayback URLs are ephemeral → local conservation via installCardFace.
 */
import { existsSync, readFileSync } from "node:fs";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import type { DbsjccPrintCandidate } from "../harvest/chitoroshop";
import {
  dbsJccCarddassFrLedgerPath,
  matchCarddassFrToDbsjccPrint,
  selectCarddassFrInstallRows,
  type CarddassFrDbzFace,
} from "../harvest/carddassFr";
import { DBS_JCC_PACK_ID } from "../pack";
import { cardFolderName } from "../scrape/dbzcollection";

function loadFaces(): CarddassFrDbzFace[] {
  const p = dbsJccCarddassFrLedgerPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    faces?: CarddassFrDbzFace[];
  };
  return raw.faces ?? [];
}

function candidatesForNumber(
  index: LocalPrintsIndex,
  number: string,
): DbsjccPrintCandidate[] {
  const rows = index
    .searchRows(number, { language: "fr", limit: 40 })
    .filter((row) => row.number === number);
  const byKey = new Map<string, DbsjccPrintCandidate>();
  for (const row of rows) {
    if (byKey.has(row.printKey)) continue;
    byKey.set(row.printKey, {
      printKey: row.printKey,
      setCode: row.setCode,
      number: row.number,
      grouping: row.grouping ?? null,
    });
  }
  return [...byKey.values()];
}

/** Only claim the preferred `art` slot when FR has none yet. */
function shouldIndexPreferredArt(
  index: LocalPrintsIndex,
  printKey: string,
): boolean {
  const row = index.lookupRow(printKey, { language: "fr" });
  const art = row?.art?.trim() ?? "";
  return !art || art === "art.carddass.jpg";
}

async function flushAssets(
  index: LocalPrintsIndex,
  assets: LocalPrintAssetWrite[],
): Promise<void> {
  if (!assets.length) return;
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      index.writeAssets(assets);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/locked/i.test(msg) || attempt === maxAttempts) throw err;
      // next-server may hold read locks — brief backoff then retry.
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

export type InstallCarddassFrReport = {
  listed: number;
  candidates: number;
  matched: number;
  faces: number;
  resumed: number;
  failed: number;
  indexed: number;
  skipped: string[];
  unmatched: string[];
};

export async function installDbsJccCarddassFr(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<InstallCarddassFrReport> {
  const listed = loadFaces();
  const rows = selectCarddassFrInstallRows(listed);
  const skipped: string[] = [];
  const unmatched: string[] = [];
  const pendingAssets: LocalPrintAssetWrite[] = [];
  let matched = 0;
  let downloaded = 0;
  let resumed = 0;
  let failed = 0;
  let indexed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const candidates = candidatesForNumber(index, row.number);
    const decision = matchCarddassFrToDbsjccPrint(
      row.number,
      row.setHint,
      candidates,
    );

    if (decision.kind !== "match") {
      skipped.push(`${row.printed} (s${row.series}): ${decision.reason}`);
      unmatched.push(row.printed);
      continue;
    }

    matched += 1;
    if (opts.downloadFaces === false) continue;

    const { print } = decision;
    const destDir = packCardDir(DBS_JCC_PACK_ID, {
      set: print.setCode,
      lang: "fr",
      card: cardFolderName(print.number, print.grouping),
    });
    const artName = "art.carddass.jpg";
    const installed = await installCardFace({
      destDir,
      artName,
      url: row.waybackUrl,
      referer: "http://www.carddass.fr/dbz/",
      minBytes: 2_000,
      timeoutMs: 45_000,
    });
    if (!installed) {
      failed += 1;
      skipped.push(`${row.printed} (s${row.series}): face download failed`);
      continue;
    }
    if (installed.downloaded) downloaded += 1;
    else resumed += 1;

    // Disk dump is the source of truth for multi-art; only fill an empty slot.
    if (shouldIndexPreferredArt(index, print.printKey)) {
      pendingAssets.push({
        printKey: print.printKey,
        lang: "fr",
        art: installed.art,
        sourceUrl: row.waybackUrl,
      });
      indexed += 1;
    }

    if (pendingAssets.length >= 40) {
      await flushAssets(index, pendingAssets.splice(0));
    }
    if ((i + 1) % 50 === 0) {
      console.log(
        `── FR carddass.fr progress — ${i + 1}/${rows.length} (dl ${downloaded}, resume ${resumed}, fail ${failed})`,
      );
    }
  }

  await flushAssets(index, pendingAssets);

  return {
    listed: listed.length,
    candidates: rows.length,
    matched,
    faces: downloaded,
    resumed,
    failed,
    indexed,
    skipped,
    unmatched,
  };
}
