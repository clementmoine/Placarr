/**
 * Scans curés (`curated/cards/{set}/{lang}/{number}/art.reconstructed.*`) →
 * `art.reconstructed.webp` sous `data/naruto/data-carddass/cards/` + index SQLite.
 *
 * C'est l'arbre qui commande, avec enrichissement optionnel via
 * `curated/sources/reconstructed-faces.json`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import { writeLosslessWebpFile } from "@/lib/media/losslessWebp";
import { curatedDestStale } from "@/providers/shared/curatedCardsInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { dataCarddassPrintKey, isDataCarddassSetCode } from "../printKey";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "../pack";

const LEDGER_FILE = "reconstructed-faces.json";
const ART_BASENAME = "art.reconstructed";

export type DataCarddassReconstructedFaceLedgerRow = {
  setCode: string;
  number: string;
  printed?: string;
  lang?: string;
  sourceFile: string;
  note?: string;
};

export type DataCarddassReconstructedFacesLedger = {
  sourceId: string;
  lang?: string;
  faces: DataCarddassReconstructedFaceLedgerRow[];
};

export function readDataCarddassReconstructedFacesLedger(
  curatedRoot = narutoDataCarddassCuratedDir(),
): DataCarddassReconstructedFacesLedger {
  const file = path.join(curatedRoot, "sources", LEDGER_FILE);
  if (!existsSync(file)) {
    return { sourceId: "reconstructed", lang: "ja", faces: [] };
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DataCarddassReconstructedFacesLedger;
  } catch {
    return { sourceId: "reconstructed", lang: "ja", faces: [] };
  }
}

export type DiscoveredCuratedFace = {
  setCode: string;
  lang: string;
  number: string;
  artSource: string;
  printed?: string;
};

function pickFaceFile(cardDir: string): string | null {
  const files = readdirSync(cardDir);
  const recon = files.find((f) => /^art\.reconstructed\.(png|webp|jpe?g)$/i.test(f));
  if (recon) return path.join(cardDir, recon);
  const src = files.find((f) => /^source\.(png|webp|jpe?g)$/i.test(f));
  if (src) return path.join(cardDir, src);
  return null;
}

export function listCuratedDataCarddassFaces(
  curatedRoot = narutoDataCarddassCuratedDir(),
): DiscoveredCuratedFace[] {
  const cardsRoot = path.join(curatedRoot, "cards");
  if (!existsSync(cardsRoot)) return [];
  const out: DiscoveredCuratedFace[] = [];

  for (const set of readdirSync(cardsRoot)) {
    const setCode = set.toLowerCase();
    if (!isDataCarddassSetCode(setCode)) continue;
    const setDir = path.join(cardsRoot, set);
    if (!statSync(setDir).isDirectory()) continue;

    for (const langOrNum of readdirSync(setDir)) {
      const segDir = path.join(setDir, langOrNum);
      if (!statSync(segDir).isDirectory()) continue;

      if (/^[a-z]{2}$/i.test(langOrNum)) {
        const lang = langOrNum.toLowerCase();
        for (const num of readdirSync(segDir)) {
          const cardDir = path.join(segDir, num);
          if (!statSync(cardDir).isDirectory()) continue;
          const art = pickFaceFile(cardDir);
          if (art) {
            out.push({
              setCode,
              lang,
              number: num.toLowerCase(),
              artSource: art,
            });
          }
        }
      } else {
        const art = pickFaceFile(segDir);
        if (art) {
          out.push({
            setCode,
            lang: "ja",
            number: langOrNum.toLowerCase(),
            artSource: art,
          });
        }
      }
    }
  }
  return out;
}

async function writeFaceWebp(
  src: string,
  dest: string,
  force?: boolean,
): Promise<boolean> {
  if (!force && !curatedDestStale(src, dest)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  if (/\.webp$/i.test(src)) {
    copyFileSync(src, dest);
    return true;
  }
  await writeLosslessWebpFile(src, dest);
  return true;
}

export async function installDataCarddassReconstructedFaces(
  options: {
    force?: boolean;
    index?: LocalPrintsIndex;
    curatedRoot?: string;
  } = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const curatedRoot = options.curatedRoot ?? narutoDataCarddassCuratedDir();
  const ledger = readDataCarddassReconstructedFacesLedger(curatedRoot);
  const discovered = listCuratedDataCarddassFaces(curatedRoot);

  const byKey = new Map<string, DiscoveredCuratedFace>();
  for (const item of discovered) {
    byKey.set(`${item.setCode}:${item.lang}:${item.number}`, item);
  }

  for (const row of ledger.faces) {
    const setCode = row.setCode.trim().toLowerCase();
    const number = row.number.trim().toLowerCase();
    const lang = (row.lang ?? ledger.lang ?? "ja").trim().toLowerCase();
    const key = `${setCode}:${lang}:${number}`;
    const src = path.join(curatedRoot, row.sourceFile);
    if (existsSync(src)) {
      byKey.set(key, {
        setCode,
        lang,
        number,
        artSource: src,
        printed: row.printed,
      });
    }
  }

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art?: string;
    sourceUrl?: string | null;
  }[] = [];

  for (const card of byKey.values()) {
    const printKey = dataCarddassPrintKey(card.setCode, card.number);
    if (!printKey) {
      failed.push(card.printed ?? `${card.setCode}-${card.number}`);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: card.setCode,
      lang: card.lang,
      card: card.number,
    });
    const key = `${card.setCode}/${card.lang}/${card.number}`;
    const destArt = path.join(cardDir, `${ART_BASENAME}.webp`);

    try {
      const changed = await writeFaceWebp(card.artSource, destArt, options.force);
      if (changed) {
        written.push(key);
      } else {
        skipped.push(key);
      }
      assets.push({
        printKey,
        lang: card.lang,
        art: `${ART_BASENAME}.webp`,
      });
    } catch {
      failed.push(key);
    }
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }

  return { written, skipped, failed };
}
