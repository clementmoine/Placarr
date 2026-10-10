/**
 * Seed Yu-Gi-Oh! local catalogue from ScanFlip FR (titles + faces).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir, packLogsDir, packStagingDir } from "@/lib/packPaths";
import { installCardFace } from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  harvestScanflipCards,
  scanflipFaceUrl,
  type ScanflipCardRow,
  type ScanflipExplorerSpec,
} from "@/providers/shared/scanflip/client";
import {
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

import { YUGIOH_PACK_ID } from "../pack";
import {
  formatYugiohReference,
  parseYugiohPrintedCode,
  yugiohPrintKey,
} from "../printKey";

/** Explorateur Yu-Gi-Oh! sur ScanFlip — spec passée au client partagé. */
const SCANFLIP_EXPLORER: ScanflipExplorerSpec = {
  path: "/fr/yugioh/cards",
  telefuncFile:
    "/components/contexts/yugioh-card-explorer/YugiohCardExplorer.onSettingsUpdate.telefunc.ts",
  defaultFilters: {
    languages: ["fr_FR"],
    name: "",
    exactMatch: false,
    atk: [0, 5000],
    def: [0, 5000],
    level: [0, 13],
    pendulum: [0, 13],
    releaseDate: [2002, 2026],
    ownership: "ALL",
    rarities: [],
  },
};

const LEDGER = "cards-fr.json";
const SCANFLIP_REFERER = "https://www.scanflip.fr/fr/yugioh/cards";
const SCANFLIP_ARTEFACT = "yugioh:scanflip-fr";

export function yugiohScanflipLedgerPath(): string {
  return path.join(packLogsDir(YUGIOH_PACK_ID), "scanflip", LEDGER);
}

function legacyYugiohScanflipLedgerPath(): string {
  return path.join(packStagingDir(YUGIOH_PACK_ID), "scanflip", LEDGER);
}

export async function harvestYugiohScanflip(opts: {
  maxPages?: number;
  languages?: string[];
} = {}): Promise<{ cards: number; path: string; totalCount: number }> {
  const { cards, totalCount } = await harvestScanflipCards(SCANFLIP_EXPLORER, {
    languages: opts.languages ?? ["fr_FR"],
    maxPages: opts.maxPages,
    delayMs: 150,
  });
  const out = yugiohScanflipLedgerPath();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        source: "scanflip.fr/fr/yugioh/cards",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        totalCount,
        count: cards.length,
        note: "FR TCG prints via ScanFlip telefunc. Original EN/JA not invented.",
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards: cards.length, path: out, totalCount };
}

function loadLedger(): ScanflipCardRow[] {
  for (const p of [
    yugiohScanflipLedgerPath(),
    legacyYugiohScanflipLedgerPath(),
  ]) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as {
        cards?: ScanflipCardRow[];
      };
      const cards = raw.cards ?? [];
      if (p === legacyYugiohScanflipLedgerPath() && cards.length) {
        mkdirSync(path.dirname(yugiohScanflipLedgerPath()), { recursive: true });
        writeFileSync(yugiohScanflipLedgerPath(), readFileSync(p));
      }
      return cards;
    } catch {
      /* try next */
    }
  }
  return [];
}

/** After install OK: durable under logs/ + purge staging scanflip/. */
export function promoteAndPurgeYugiohScanflipStaging(): {
  purged: boolean;
  contentHash: string | null;
} {
  const durable = yugiohScanflipLedgerPath();
  const legacy = legacyYugiohScanflipLedgerPath();
  if (!existsSync(durable) && existsSync(legacy)) {
    mkdirSync(path.dirname(durable), { recursive: true });
    writeFileSync(durable, readFileSync(legacy));
  }
  if (!existsSync(durable)) return { purged: false, contentHash: null };
  const contentHash = hashCatalogArtefactBytes(readFileSync(durable));
  recordCatalogPromoteAndPurgeStaging({
    ledgerPath: packCatalogIngestLedgerPath(YUGIOH_PACK_ID),
    artefactId: SCANFLIP_ARTEFACT,
    contentHash,
    stagingPath: path.join(packStagingDir(YUGIOH_PACK_ID), "scanflip"),
  });
  return { purged: true, contentHash };
}

export async function installYugiohScanflip(
  index: LocalPrintsIndex,
  opts: { downloadFaces?: boolean; limit?: number } = {},
): Promise<{ prints: number; titles: number; faces: number }> {
  let cards = loadLedger();
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);

  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;

  for (const card of cards) {
    const parsed = parseYugiohPrintedCode(card.code);
    if (!parsed) continue;
    const printKey = yugiohPrintKey(parsed.set, parsed.number);
    if (!printKey) continue;

    const fullName = card.version?.trim()
      ? `${card.name.trim()} — ${card.version.trim()}`
      : card.name.trim();

    printRows.push({
      printKey,
      setCode: parsed.set,
      number: parsed.number,
      cardType: card.generalType?.toLowerCase() || parsed.set,
      titles: [
        {
          lang: "fr",
          fullName:
            fullName || formatYugiohReference(parsed.set, parsed.number),
          rarity: card.rarityName ?? card.rarityCode,
        },
      ],
    });

    const faceUrl = scanflipFaceUrl(card);
    if (opts.downloadFaces === false || !faceUrl) continue;

    const destDir = packCardDir(YUGIOH_PACK_ID, {
      set: parsed.set,
      lang: "fr",
      card: parsed.number,
    });
    const artName = "art.scanflip.webp";
    const installed = await installCardFace({
      destDir,
      artName,
      url: faceUrl,
      webpQuality: 85,
      referer: SCANFLIP_REFERER,
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey,
      lang: "fr",
      art: installed.art,
      sourceUrl: faceUrl,
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

/**
 * ScanFlip CDN URLs — catalogue identity is sqlite; no cards-index patch.
 */
export function applyYugiohScanflipArtUrls(): { patched: number } {
  return { patched: 0 };
}
