/**
 * Install nikita DBC JA titles (+ optional faces) onto existing FR JCC prints.
 */
import { existsSync, readFileSync } from "node:fs";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { cardFolderName } from "../scrape/dbzcollection";
import { dbsJccJaLedgerPath } from "../harvest/nikitaDbc";
import { DBS_JCC_PACK_ID } from "../pack";
import type { NikitaDbcCard } from "../parse/nikitaDbc";

function loadJaCards(): NikitaDbcCard[] {
  const p = dbsJccJaLedgerPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as { cards?: NikitaDbcCard[] };
  return raw.cards ?? [];
}

export async function installDbsJccJaTitles(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ titles: number; faces: number; unmatched: string[] }> {
  const cards = loadJaCards();
  const unmatched: string[] = [];
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;

  for (const card of cards) {
    const name = card.nameJa?.trim();
    if (!name) continue;
    /*
      Same collector number as FR (`d0005`). Prefer the non-grouped retail print
      when several variants share the number.
    */
    const hits = index
      .searchRows(card.number, { language: "fr", limit: 20 })
      .filter((row) => row.number === card.number);
    const hit =
      hits.find((row) => !row.grouping) ?? hits[0] ?? null;
    if (!hit) {
      unmatched.push(card.printed);
      continue;
    }

    printRows.push({
      printKey: hit.printKey,
      setCode: hit.setCode,
      number: hit.number,
      cardType: hit.cardType ?? hit.setCode,
      grouping: hit.grouping ?? null,
      titles: [{ lang: "ja", fullName: name }],
    });

    if (opts.downloadFaces === false || !card.faceUrlJa) continue;

    const destDir = packCardDir(DBS_JCC_PACK_ID, {
      set: hit.setCode,
      lang: "ja",
      card: cardFolderName(hit.number, hit.grouping),
    });
    const artName = "art.nikita.jpg";
    const installed = await installCardFace({
      destDir,
      artName,
      url: card.faceUrlJa,
      minBytes: 2_000,
      timeoutMs: 30_000,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey: hit.printKey,
      lang: "ja",
      art: installed.art,
      sourceUrl: card.faceUrlJa,
    });
  }

  let titles = 0;
  if (printRows.length) {
    titles = index.writePrints(printRows).titles;
  }
  if (assets.length) index.writeAssets(assets);
  return { titles, faces, unmatched };
}
