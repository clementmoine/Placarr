/**
 * Faces Ultra Challenge depuis AnimeCollection (h400).
 *
 * La checklist laststicker donne les titres ; AC donne les scans numérotés
 * 1–100 (plus grands que LastSticker, et sans mur robots sur `/cartes/`).
 * Mapping attesté dans `curated/sources/animecollection.json`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";
import { NARUTO_ULTRA_SET_CODE, ultraChallengePrintKey } from "./printKey";

const LEDGER_FILE = "animecollection.json";
const STAGING_FOLDER = "animecollection-faces";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type AnimeCollectionFaceRow = {
  printed: string;
  number: string;
  acId: string;
};

export type AnimeCollectionFacesLedger = {
  source: string;
  url: string;
  sourceId: string;
  lang: string;
  faceUrlTemplate: string;
  faces: AnimeCollectionFaceRow[];
};

export function animeCollectionFacesLedgerPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", LEDGER_FILE);
}

export function readAnimeCollectionFacesLedger(): AnimeCollectionFacesLedger {
  return JSON.parse(
    readFileSync(animeCollectionFacesLedgerPath(), "utf8"),
  ) as AnimeCollectionFacesLedger;
}

export function animeCollectionFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_ULTRA_PACK_ID), STAGING_FOLDER);
}

/** `http://…/h400_{acId}_carte.jpg` depuis le template curé. */
export function animeCollectionFaceUrl(
  ledger: AnimeCollectionFacesLedger,
  acId: string,
): string {
  return ledger.faceUrlTemplate.replace("{acId}", acId.trim());
}

export function animeCollectionStagingFile(row: AnimeCollectionFaceRow): string {
  return `${row.number}.jpg`;
}

/**
 * Relève `(numéro imprimé, acId)` depuis le HTML de la page set AC.
 * Les blocs hors chiffres (ex. « Checklist ») sont ignorés.
 */
export function parseAnimeCollectionUltraFaces(
  html: string,
): AnimeCollectionFaceRow[] {
  const re =
    /title="[^"]*"[^>]*>\s*<div class="bc_texte_numero">(\d+)<\/div>.*?h100_(\d+)_carte/gs;
  const out: AnimeCollectionFaceRow[] = [];
  const seen = new Set<number>();
  for (const match of html.matchAll(re)) {
    const printed = Number.parseInt(match[1]!, 10);
    const acId = match[2]!;
    if (!Number.isFinite(printed) || printed < 1 || printed > 100) continue;
    if (seen.has(printed)) continue;
    seen.add(printed);
    out.push({
      printed: String(printed),
      number: String(printed).padStart(4, "0"),
      acId,
    });
  }
  return out.sort(
    (a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10),
  );
}

async function downloadImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
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

export type AnimeCollectionHarvest = {
  cards: number;
  ok: number;
  skip: number;
  fail: number;
};

export async function harvestAnimeCollectionFaces(
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<AnimeCollectionHarvest> {
  const ledger = readAnimeCollectionFacesLedger();
  const staging = opts.stagingDir ?? animeCollectionFacesStagingDir();
  mkdirSync(staging, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of ledger.faces) {
    const dest = path.join(staging, animeCollectionStagingFile(row));
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(
      animeCollectionFaceUrl(ledger, row.acId),
      ledger.url,
    );
    if (!buf) {
      fail += 1;
    } else {
      writeFileSync(dest, buf);
      ok += 1;
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return { cards: ledger.faces.length, ok, skip, fail };
}

export type AnimeCollectionInstall = {
  faces: number;
  missing: string[];
};

export function installAnimeCollectionFaces(
  index: LocalPrintsIndex,
  opts: {
    stagingDir?: string;
    /** Ne poser / ré-indexer que ces numéros (ex. après purge d’un gabarit Coleka). */
    onlyNumbers?: readonly string[];
  } = {},
): AnimeCollectionInstall {
  const ledger = readAnimeCollectionFacesLedger();
  const staging = opts.stagingDir ?? animeCollectionFacesStagingDir();
  const lang = ledger.lang?.trim().toLowerCase() || "fr";
  const only = opts.onlyNumbers?.length
    ? new Set(opts.onlyNumbers.map((n) => n.trim()))
    : null;
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  if (!existsSync(staging)) {
    return {
      faces: 0,
      missing: ledger.faces
        .filter((f) => !only || only.has(f.number))
        .map((f) => f.number),
    };
  }

  for (const row of ledger.faces) {
    if (only && !only.has(row.number)) continue;
    const src = path.join(staging, animeCollectionStagingFile(row));
    if (!existsSync(src)) {
      missing.push(row.number);
      continue;
    }
    const printKey = ultraChallengePrintKey(row.number);
    if (!printKey) {
      missing.push(row.number);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_ULTRA_PACK_ID),
      NARUTO_ULTRA_SET_CODE,
      lang,
      row.number,
    );
    mkdirSync(destDir, { recursive: true });
    const art = `art.${ledger.sourceId}.jpg`;
    copyFileSync(src, path.join(destDir, art));
    assets.push({
      printKey,
      lang,
      art,
      sourceUrl: animeCollectionFaceUrl(ledger, row.acId),
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}
