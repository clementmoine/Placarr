/**
 * BANDAI CARD GAMES Fest — Premium Card Collection vol.00 (JP faces).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_CARDGAME_PACK_ID } from "../pack";
import { narutoCardgameCuratedDir } from "../curatedPaths";
import { narutoCardgameSourcePath } from "../syncedSources";
import { narutoCardgamePrintKey } from "../printKey";

const ART_NAME = "art.bandai.webp";
const REFERER =
  "https://www.bandaicardgames-fest.com/26-27/jp/tokyo/products/828.html";

type FestCard = {
  number: string;
  grouping?: string | null;
  nameJa: string;
  faceUrl: string;
};

type FestLedger = {
  sourceId: string;
  url: string;
  setCode: string;
  productNameJa?: string;
  cards: FestCard[];
};

function loadLedger(): FestLedger {
  const file = narutoCardgameSourcePath("bandai-fest-premium-vol00.json");
  return JSON.parse(readFileSync(file, "utf8")) as FestLedger;
}

export async function installBandaiFestPremiumVol00(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{ prints: number; titles: number; faces: number }> {
  const ledger = loadLedger();
  const setCode = (ledger.setCode || "premium00").trim().toLowerCase();
  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;

  for (const card of ledger.cards) {
    const number = card.number.trim().toLowerCase();
    const grouping = card.grouping?.trim().toLowerCase() || null;
    const printKey = narutoCardgamePrintKey(setCode, number, grouping);
    if (!printKey) continue;
    const diskNumber = grouping ? `${number}-${grouping}` : number;

    printRows.push({
      printKey,
      setCode,
      number,
      grouping,
      cardType: "card",
      category: "Chakra",
      sourceUrl: ledger.url,
      titles: [
        {
          lang: "ja",
          fullName: card.nameJa,
          rarity: "Premium",
        },
      ],
    });

    if (opts.downloadFaces === false) continue;

    const destDir = packCardDir(NARUTO_CARDGAME_PACK_ID, {
      set: setCode,
      lang: "ja",
      card: diskNumber,
    });
    const installed = await installCardFace({
      destDir,
      artName: ART_NAME,
      url: card.faceUrl,
      referer: REFERER,
      minBytes: 8_000,
    });
    if (!installed) continue;
    faces += installed.downloaded ? 1 : 0;
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

/** Copy Fest packshot into curated products for sealed ingest. */
export async function ensureBandaiFestPremiumPackshot(): Promise<string | null> {
  const ledger = loadLedger() as FestLedger & { packshotUrl?: string };
  const url = ledger.packshotUrl?.trim();
  if (!url) return null;
  const destDir = path.join(
    narutoCardgameCuratedDir(),
    "products",
    "premium-chakra-vol00-jp",
    "ja",
  );
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "art.bandai.webp");
  if (existsSync(dest)) return dest;
  const installed = await installCardFace({
    destDir,
    artName: "art.bandai.webp",
    url,
    referer: REFERER,
    minBytes: 4_000,
  });
  return installed ? dest : null;
}
