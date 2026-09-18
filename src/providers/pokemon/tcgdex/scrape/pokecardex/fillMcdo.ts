/**
 * McDo paper faces from PokéCardex scans → `art.pokecardex.jpg`.
 *
 * Complements Coleka photos / pokemon.com marketing tiles; faceChoice ranks
 * which file the UI shows (scans preferred over Coleka photos).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import {
  POKECARDEX_SCANS_ORIGIN,
  pokecardexScanUrl,
  type PokecardexScanZone,
} from "./scanUrl";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type PokecardexMcdoCampaign = {
  id: string;
  seriesCode: string;
  setId: string;
  lang: string;
  zone: PokecardexScanZone;
  cardCount: number;
  label?: string;
};

export type PokecardexMcdoLedger = {
  source: string;
  scansOrigin?: string;
  campaigns: PokecardexMcdoCampaign[];
};

export type PokecardexMcdoFillReport = {
  campaignId: string;
  setId: string;
  lang: string;
  seriesCode: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

function ledgerPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemon",
    "tcgdex",
    "curated",
    "sources",
    "pokecardex-mcdo.json",
  );
}

export function loadPokecardexMcdoLedger(
  filePath = ledgerPath(),
): PokecardexMcdoLedger {
  return JSON.parse(readFileSync(filePath, "utf8")) as PokecardexMcdoLedger;
}

async function downloadScan(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.pokecardex.com/",
        Accept: "image/jpeg,image/webp,image/*;q=0.8,*/*;q=0.5",
      },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

export async function fillPokecardexMcdoCampaign(opts: {
  campaign: PokecardexMcdoCampaign;
  scansOrigin?: string;
  force?: boolean;
  cardsRoot?: string;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<PokecardexMcdoFillReport> {
  const lang = opts.campaign.lang.trim().toLowerCase();
  const report: PokecardexMcdoFillReport = {
    campaignId: opts.campaign.id,
    setId: opts.campaign.setId,
    lang,
    seriesCode: opts.campaign.seriesCode,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  const downloadImage = opts.downloadImage ?? downloadScan;
  const origin = opts.scansOrigin ?? POKECARDEX_SCANS_ORIGIN;

  for (let n = 1; n <= opts.campaign.cardCount; n++) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.campaign.setId,
      lang,
      localId: String(n),
      cardsRoot: opts.cardsRoot,
    });
    const outName = pokemonFaceFilename("pokecardex", "art", "jpg");
    const outPath = path.join(cardDir, outName);
    if (!opts.force && existsSync(outPath)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    const url = pokecardexScanUrl({
      seriesCode: opts.campaign.seriesCode,
      zone: opts.campaign.zone,
      localId: n,
      imageClass: "original",
      origin,
    });
    const buf = await downloadImage(url);
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(outPath, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }

  return report;
}

export async function fillPokecardexMcdoFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    ledgerPath?: string;
    downloadImage?: (url: string) => Promise<Buffer | null>;
  } = {},
): Promise<PokecardexMcdoFillReport[]> {
  const ledger = loadPokecardexMcdoLedger(opts.ledgerPath);
  const reports: PokecardexMcdoFillReport[] = [];
  for (const campaign of ledger.campaigns) {
    reports.push(
      await fillPokecardexMcdoCampaign({
        campaign,
        scansOrigin: ledger.scansOrigin,
        force: opts.force,
        cardsRoot: opts.cardsRoot,
        downloadImage: opts.downloadImage,
      }),
    );
  }
  return reports;
}
