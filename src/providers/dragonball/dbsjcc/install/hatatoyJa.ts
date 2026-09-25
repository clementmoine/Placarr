/**
 * Install Hatatoy JA faces (+ JA titles) onto dbsjcc prints.
 *
 * Matching: prefer DB/part setHint; else lowest partN over promo/sp.
 * JA-only cards mint a new print when setHint is known.
 * Faces always land under lang=`ja` — never borrow FR art.
 */
import { existsSync, readFileSync } from "node:fs";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  dbsJccHatatoyLedgerPath,
  matchHatatoyToDbsjccPrint,
  type HatatoyFaceRow,
} from "../harvest/hatatoy";
import type { DbsjccPrintCandidate } from "../harvest/chitoroshop";
import { DBS_JCC_PACK_ID } from "../pack";
import { dbsjccPrintKey } from "../printKey";
import { cardFolderName } from "../scrape/dbzcollection";

function loadFaces(): HatatoyFaceRow[] {
  const p = dbsJccHatatoyLedgerPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    faces?: HatatoyFaceRow[];
  };
  return (raw.faces ?? []).filter((row) => row.ingest !== false);
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

export type InstallHatatoyJaReport = {
  listed: number;
  matched: number;
  minted: number;
  titles: number;
  faces: number;
  skipped: string[];
  unmatched: string[];
};

export async function installDbsJccHatatoyJa(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<InstallHatatoyJaReport> {
  const faces = loadFaces();
  const skipped: string[] = [];
  const unmatched: string[] = [];
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let matched = 0;
  let minted = 0;
  let downloaded = 0;

  for (const row of faces) {
    const candidates = candidatesForNumber(index, row.number);
    const decision = matchHatatoyToDbsjccPrint(
      row.number,
      row.setHint,
      candidates,
    );

    let printKey: string;
    let setCode: string;
    let grouping: string | null = null;

    if (decision.kind === "skip") {
      skipped.push(`${row.printed}: ${decision.reason}`);
      unmatched.push(row.printed);
      console.log(`── hatatoy skip — ${row.printed}: ${decision.reason}`);
      continue;
    }

    if (decision.kind === "mint") {
      const key = dbsjccPrintKey(decision.setCode, row.printed);
      if (!key) {
        skipped.push(`${row.printed}: cannot mint printKey`);
        unmatched.push(row.printed);
        continue;
      }
      printKey = key;
      setCode = decision.setCode;
      minted += 1;
    } else {
      printKey = decision.print.printKey;
      setCode = decision.print.setCode;
      grouping = decision.print.grouping;
      matched += 1;
    }

    const titles: LocalPrintWrite["titles"] = [];
    const ja = row.titleJa?.trim();
    if (ja) titles.push({ lang: "ja", fullName: ja });

    // Mint always needs a prints row; match only when we have a JA title to add
    // (avoid clobbering FR source_url when there is nothing new to write).
    if (decision.kind === "mint" || titles.length > 0) {
      printRows.push({
        printKey,
        setCode,
        number: row.number,
        cardType: setCode,
        grouping,
        ...(decision.kind === "mint" ? { sourceUrl: row.productUrl } : {}),
        titles,
      });
    }

    if (opts.downloadFaces === false) continue;

    const destDir = packCardDir(DBS_JCC_PACK_ID, {
      set: setCode,
      lang: "ja",
      card: cardFolderName(row.number, grouping),
    });
    const artName = "art.hatatoy.jpg";
    const installed = await installCardFace({
      destDir,
      artName,
      url: row.url,
      referer: "https://hatatoy.shop/",
      minBytes: 2_000,
      timeoutMs: 30_000,
    });
    if (!installed) {
      skipped.push(`${row.printed}: face download failed`);
      continue;
    }
    if (installed.downloaded) downloaded += 1;
    assets.push({
      printKey,
      lang: "ja",
      art: installed.art,
      sourceUrl: row.url,
    });
  }

  let titles = 0;
  if (printRows.length) {
    titles = index.writePrints(printRows).titles;
  }
  if (assets.length) index.writeAssets(assets);

  return {
    listed: faces.length,
    matched,
    minted,
    titles,
    faces: downloaded,
    skipped,
    unmatched,
  };
}
