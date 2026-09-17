/**
 * Harvest Coleka Bleach Serie 1 FR (`_r37171`) → curated ledger + face install.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { bleachScbCuratedDir, BLEACH_SCB_PACK_ID } from "./pack";
import {
  COLEKA_BLEACH_ORIGIN,
  COLEKA_BLEACH_S1_LISTING_PATH,
  COLEKA_BLEACH_SOURCE_ID,
  colekaBleachS1ListingPageUrls,
  parseColekaBleachListing,
  type ColekaBleachCard,
} from "./parseColekaBleach";
import { bleachScbPrintKey } from "./printKey";

const STAGING_FOLDER = "coleka";
const LEDGER_FILE = "coleka-bleach-s1.json";

export type ColekaBleachLedger = {
  source: string;
  sourceId: string;
  lang: string;
  url: string;
  listedCount: number;
  cards: ColekaBleachCard[];
};

export function colekaBleachLedgerPath(): string {
  return path.join(bleachScbCuratedDir(), "sources", LEDGER_FILE);
}

export function colekaBleachStagingDir(): string {
  return path.join(packStagingDir(BLEACH_SCB_PACK_ID), STAGING_FOLDER);
}

export function readColekaBleachLedger(): ColekaBleachLedger | null {
  const p = colekaBleachLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as ColekaBleachLedger;
}

function mergeByPrinted(
  ...lists: ColekaBleachCard[][]
): ColekaBleachCard[] {
  const by = new Map<string, ColekaBleachCard>();
  for (const list of lists) {
    for (const card of list) by.set(card.printed, card);
  }
  return [...by.values()].sort((a, b) => a.printed.localeCompare(b.printed));
}

export async function harvestColekaBleachS1(
  opts: { force?: boolean } = {},
): Promise<{ cards: ColekaBleachCard[]; outPath: string }> {
  const staging = colekaBleachStagingDir();
  mkdirSync(staging, { recursive: true });
  const pageCards: ColekaBleachCard[][] = [];
  const urls = colekaBleachS1ListingPageUrls();
  for (let i = 0; i < urls.length; i += 1) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(
      urls[i]!,
      dest,
      opts.force === true,
    );
    if (!html) continue;
    pageCards.push(parseColekaBleachListing(html).cards);
  }

  const cards = mergeByPrinted(...pageCards);
  const outPath = colekaBleachLedgerPath();
  mkdirSync(path.dirname(outPath), { recursive: true });
  const ledger: ColekaBleachLedger = {
    source: "coleka.com Bleach Serie 1",
    sourceId: COLEKA_BLEACH_SOURCE_ID,
    lang: "fr",
    url: `${COLEKA_BLEACH_ORIGIN}${COLEKA_BLEACH_S1_LISTING_PATH}`,
    listedCount: cards.length,
    cards,
  };
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return { cards, outPath };
}

/**
 * Install Coleka FR faces as `art.coleka.webp` on disk.
 *
 * Priority: Carddass.fr Wayback (`art.carddass.*`) is official — it always
 * owns the index `art` when present. Coleka is fallback only (no title overwrite).
 */
export async function installColekaBleachFaces(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean } = {},
): Promise<{
  prints: number;
  titles: number;
  faces: number;
}> {
  const ledger = readColekaBleachLedger();
  const cards = ledger?.cards ?? [];
  if (!cards.length) return { prints: 0, titles: 0, faces: 0 };

  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;

  for (const card of cards) {
    const printKey = bleachScbPrintKey(card.set, card.number);
    if (!printKey) continue;

    if (opts.downloadFaces === false || !card.faceUrl) continue;
    const destDir = packCardDir(BLEACH_SCB_PACK_ID, {
      set: card.set,
      lang: "fr",
      card: card.number,
    });
    const installed = await installCardFace({
      destDir,
      artName: "art.coleka.webp",
      url: card.faceUrl,
      referer: card.pageUrl || `${COLEKA_BLEACH_ORIGIN}/`,
      minBytes: 2_000,
      timeoutMs: 40_000,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;

    // Official Carddass face already on disk → keep it in the index.
    if (existsSync(path.join(destDir, "art.carddass.jpg"))) continue;
    if (existsSync(path.join(destDir, "art.carddass.webp"))) continue;

    assets.push({
      printKey,
      lang: "fr",
      art: installed.art,
      sourceUrl: card.faceUrl,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { prints: 0, titles: 0, faces };
}
