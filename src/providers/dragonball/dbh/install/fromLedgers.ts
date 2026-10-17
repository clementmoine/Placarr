/**
 * Install DBH ledger into local prints index + optional face download.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { DBH_PACK_ID, dbhCuratedDir } from "../pack";
import { dbhPrintKey } from "../printKey";
import type { DbhCard } from "../scrape/cardlist";

function loadLedger(): DbhCard[] {
  const p = path.join(dbhCuratedDir(), "sources", "carddass-dbh.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as { cards?: DbhCard[] };
  return raw.cards ?? [];
}

export async function installDbhFromLedger(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; faceLimit?: number } = {},
): Promise<{ prints: number; titles: number; faces: number }> {
  const cards = loadLedger();
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  let faceAttempts = 0;
  const faceLimit = opts.faceLimit ?? Number.POSITIVE_INFINITY;

  for (const card of cards) {
    const printKey = dbhPrintKey(card.set, card.number);
    if (!printKey) continue;
    const nameJa = (card.nameJa ?? "").trim();
    if (!nameJa) continue;
    printRows.push({
      printKey,
      setCode: card.set,
      number: card.number,
      cardType: card.set,
      category: card.categoryLabel || null,
      sourceUrl: card.faceUrl || null,
      titles: [
        {
          lang: "ja",
          fullName: nameJa,
          rarity: card.rarity ?? null,
        },
      ],
    });

    if (opts.downloadFaces === false) continue;
    if (faceAttempts >= faceLimit) continue;
    faceAttempts += 1;

    const destDir = packCardDir(DBH_PACK_ID, {
      set: card.set,
      lang: "ja",
      card: card.number,
    });
    const installed = await installCardFace({
      destDir,
      artName: "art.jpg",
      url: card.faceUrl,
      minBytes: 1_500,
      timeoutMs: 30_000,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey,
      lang: "ja",
      art: installed.art,
      sourceUrl: card.faceUrl,
    });
  }

  let prints = 0;
  let titles = 0;
  if (printRows.length) {
    const w = index.writePrints(printRows);
    prints = w.prints;
    titles = w.titles;
  }
  if (assets.length) index.writeAssets(assets);
  return { prints, titles, faces };
}
