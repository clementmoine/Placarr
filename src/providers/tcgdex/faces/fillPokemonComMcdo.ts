/**
 * Official pokemon.com Happy Meal McDo faces → `art.pokemoncom.png`.
 *
 * Source: mcdn marketing tiles under cms2/img/misc/_tiles/happy-meal/…
 * (news galleries). Not the encyclopédie cms3/cards/full path.
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
} from "../faceChoice";
import { pokemonPaperCardDir } from "../paperCardDisk";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type PokemonComMcdoCampaign = {
  id: string;
  setId: string;
  lang: string;
  cardCount: number;
  pathTemplate: string;
  newsUrl?: string;
  label?: string;
};

export type PokemonComMcdoLedger = {
  source: string;
  baseUrl: string;
  campaigns: PokemonComMcdoCampaign[];
};

export type PokemonComFillReport = {
  campaignId: string;
  setId: string;
  lang: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

function curatedLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "tcgdex",
    "curated",
    "sources",
    "pokemoncom-mcdo.json",
  );
}

export function loadPokemonComMcdoLedger(
  filePath = curatedLedgerPath(),
): PokemonComMcdoLedger {
  return JSON.parse(readFileSync(filePath, "utf8")) as PokemonComMcdoLedger;
}

/** Fill `{nn}` with zero-padded card number (01…). */
export function pokemonComMcdoImageUrl(
  baseUrl: string,
  pathTemplate: string,
  localId: number,
): string {
  const nn = String(localId).padStart(2, "0");
  const rel = pathTemplate.replaceAll("{nn}", nn);
  return `${baseUrl.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export async function fillPokemonComMcdoCampaign(opts: {
  campaign: PokemonComMcdoCampaign;
  baseUrl: string;
  force?: boolean;
  cardsRoot?: string;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<PokemonComFillReport> {
  const lang = opts.campaign.lang.trim().toLowerCase();
  const report: PokemonComFillReport = {
    campaignId: opts.campaign.id,
    setId: opts.campaign.setId,
    lang,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  const downloadImage = opts.downloadImage ?? download;

  for (let n = 1; n <= opts.campaign.cardCount; n++) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.campaign.setId,
      lang,
      localId: String(n),
      cardsRoot: opts.cardsRoot,
    });
    const outName = pokemonFaceFilename("pokemoncom", "art", "png");
    const outPath = path.join(cardDir, outName);
    if (!opts.force && existsSync(outPath)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    const url = pokemonComMcdoImageUrl(
      opts.baseUrl,
      opts.campaign.pathTemplate,
      n,
    );
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

export async function fillPokemonComMcdoFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    ledgerPath?: string;
    downloadImage?: (url: string) => Promise<Buffer | null>;
  } = {},
): Promise<PokemonComFillReport[]> {
  const ledger = loadPokemonComMcdoLedger(opts.ledgerPath);
  const reports: PokemonComFillReport[] = [];
  for (const campaign of ledger.campaigns) {
    reports.push(
      await fillPokemonComMcdoCampaign({
        campaign,
        baseUrl: ledger.baseUrl,
        force: opts.force,
        cardsRoot: opts.cardsRoot,
        downloadImage: opts.downloadImage,
      }),
    );
  }
  return reports;
}
