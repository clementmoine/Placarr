/**
 * Moisson et pose des scans Coleka de Ninja Ranks.
 *
 * Deux temps, comme le reste du pack : `harvest` descend le listing puis les
 * faces dans le staging, `install` les copie sous `cards/nr/{numéro}/en/` et
 * les inscrit à l'index. Rien n'est deviné entre les deux — le parseur a déjà
 * refusé ce qu'il ne pouvait pas prouver, voir `parseColekaNinjaRanks`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packCatalogDb, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { fetchColekaListingHtml } from "@/providers/narutoccg/colekaListingFetch";

import {
  COLEKA_NINJA_RANKS_LANG,
  COLEKA_NINJA_RANKS_SET,
  colekaNinjaRanksBackUrlCandidates,
  colekaNinjaRanksCardKey,
  colekaNinjaRanksListingPageUrls,
  colekaNinjaRanksWwwFaceUrl,
  parseColekaNinjaRanksListing,
  type ColekaNinjaRanksCard,
} from "./parseColekaNinjaRanks";
import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

const STAGING_FOLDER = "coleka-ninja-ranks";
const LEDGER_FILE = "coleka-ninja-ranks.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const COLEKA_NINJA_RANKS_REFERER =
  "https://www.coleka.com/en/trading-cards/panini-cards/naruto-ninja-ranks_r25928";

export type ColekaNinjaRanksBackOnly = {
  setCode?: string;
  number: string;
  colekaRef: number;
  colekaId: string;
  pageUrl: string;
  backUrl: string;
  note?: string;
};

export type ColekaNinjaRanksRejectedFace = {
  setCode?: string;
  number: string;
  reason: string;
};

export type ColekaNinjaRanksLedger = {
  source: string;
  url: string;
  lang: string;
  sourceId: string;
  notIngested: { what: string; reason: string }[];
  backOnly?: ColekaNinjaRanksBackOnly[];
  rejectedFaces?: ColekaNinjaRanksRejectedFace[];
};

export function colekaNinjaRanksLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readColekaNinjaRanksLedger(): ColekaNinjaRanksLedger {
  return JSON.parse(
    readFileSync(colekaNinjaRanksLedgerPath(), "utf8"),
  ) as ColekaNinjaRanksLedger;
}

export function colekaNinjaRanksRejectedFaceKey(row: {
  setCode?: string;
  number: string;
}): string {
  const setCode = row.setCode?.trim() || COLEKA_NINJA_RANKS_SET;
  return `${setCode}-${row.number}`;
}

export function colekaNinjaRanksRejectedFaceKeys(
  ledger: ColekaNinjaRanksLedger = readColekaNinjaRanksLedger(),
): Set<string> {
  const keys = new Set<string>();
  for (const row of ledger.rejectedFaces ?? []) {
    keys.add(colekaNinjaRanksRejectedFaceKey(row));
  }
  return keys;
}

function purgeColekaRejectedFaces(
  index: LocalPrintsIndex,
  ledger: ColekaNinjaRanksLedger,
): void {
  const rejected = colekaNinjaRanksRejectedFaceKeys(ledger);
  if (!rejected.size) return;
  const lang = ledger.lang.trim().toLowerCase();
  const dbPath = packCatalogDb(NARUTO_RANKS_PACK_ID);
  if (!existsSync(dbPath)) return;
  const db = new DatabaseSync(dbPath);
  try {
    const stmt = db.prepare(
      `UPDATE print_assets
       SET art = NULL
       WHERE print_key = ? AND lang = ? AND art LIKE 'art.coleka%'`,
    );
    for (const key of rejected) {
      const [setCode, number] = key.split("-");
      const printKey = ninjaRanksPrintKey(setCode, number);
      if (!printKey) continue;
      stmt.run(printKey, lang);
    }
  } finally {
    db.close();
  }
  index.exportIndex();
}

function removeColekaRejectedFaceFiles(ledger: ColekaNinjaRanksLedger): void {
  /*
    Ne pas effacer `art.coleka` des dossiers cartes : le rejet ne concerne que
    l'affichage (index → `art.reconstructed` ou trou honnête). Le dump Coleka
    reste à côté, comme un scan Inkworks à côté d'un packshot curé.
  */
  void ledger;
}

export function colekaNinjaRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

export function colekaNinjaRanksStagingBasename(card: {
  setCode: string;
  number: string;
}): string {
  return colekaNinjaRanksCardKey(card);
}

/** `nr-0007` / `ff-0001` dans le staging — pas le slug Coleka. */
export function colekaNinjaRanksStagingFile(card: {
  setCode: string;
  number: string;
  faceUrl: string;
}): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${colekaNinjaRanksStagingBasename(card)}${ext || ".webp"}`;
}

/** `nr-0007-back.webp` — verso dérivé du recto. */
export function colekaNinjaRanksStagingBackFile(card: {
  setCode: string;
  number: string;
  faceUrl: string;
}): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${colekaNinjaRanksStagingBasename(card)}-back${ext || ".webp"}`;
}

/** Chemins candidats : nouveau `{set}-{num}` puis l'ancien `{num}` pour la base. */
function colekaNinjaRanksStagingFaceCandidates(
  staging: string,
  card: ColekaNinjaRanksCard,
): string[] {
  const primary = path.join(staging, colekaNinjaRanksStagingFile(card));
  if (card.setCode !== COLEKA_NINJA_RANKS_SET) return [primary];
  const ext = path.extname(primary).toLowerCase() || ".webp";
  return [primary, path.join(staging, `${card.number}${ext}`)];
}

function colekaNinjaRanksStagingBackCandidates(
  staging: string,
  card: ColekaNinjaRanksCard,
): string[] {
  const primary = path.join(staging, colekaNinjaRanksStagingBackFile(card));
  if (card.setCode !== COLEKA_NINJA_RANKS_SET) return [primary];
  const ext = path.extname(primary).toLowerCase() || ".webp";
  return [primary, path.join(staging, `${card.number}-back${ext}`)];
}

function resolveColekaNinjaRanksStagingFace(
  staging: string,
  card: ColekaNinjaRanksCard,
): string | null {
  for (const candidate of colekaNinjaRanksStagingFaceCandidates(
    staging,
    card,
  )) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveColekaNinjaRanksStagingBack(
  staging: string,
  card: ColekaNinjaRanksCard,
): string | null {
  for (const candidate of colekaNinjaRanksStagingBackCandidates(
    staging,
    card,
  )) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Verso attesté sur une fiche item sans recto listing prouvable. */
export function colekaBackOnlyStagingFile(
  number: string,
  backUrl: string,
): string {
  const ext = path.extname(new URL(backUrl).pathname).toLowerCase();
  return `${number}-back${ext || ".webp"}`;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: COLEKA_NINJA_RANKS_REFERER },
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

/** Essaie `-001` puis `-002` ; refuse un octet identique au recto. */
async function downloadColekaBack(
  card: ColekaNinjaRanksCard,
  frontBuf: Buffer | null,
): Promise<Buffer | null> {
  for (const url of colekaNinjaRanksBackUrlCandidates(card.faceUrl)) {
    if (url === colekaNinjaRanksWwwFaceUrl(card.faceUrl)) continue;
    const buf = await downloadImage(url);
    if (!buf) continue;
    if (frontBuf && buf.length === frontBuf.length && buf.equals(frontBuf)) {
      continue;
    }
    return buf;
  }
  return null;
}

export type ColekaNinjaRanksHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  backOk: number;
  backSkip: number;
  backFail: number;
  rejected: { ref: string; name: string; reason: string }[];
};

export async function harvestColekaNinjaRanks(
  opts: { force?: boolean } = {},
): Promise<ColekaNinjaRanksHarvest> {
  const staging = colekaNinjaRanksStagingDir();
  mkdirSync(staging, { recursive: true });
  const ledger = readColekaNinjaRanksLedger();
  const seen = new Map<string, ColekaNinjaRanksCard>();
  const rejected: ColekaNinjaRanksHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of colekaNinjaRanksListingPageUrls().entries()) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(url, dest, Boolean(opts.force));
    // Une page derrière le mur rend `null` : on s'arrête là plutôt que de
    // compter comme vide une page qu'on n'a pas lue.
    if (!html) continue;
    pages += 1;
    const parsed = parseColekaNinjaRanksListing(html);
    for (const card of parsed.cards) {
      const key = colekaNinjaRanksCardKey(card);
      if (!seen.has(key)) seen.set(key, card);
    }
    rejected.push(...parsed.rejected);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let backOk = 0;
  let backSkip = 0;
  let backFail = 0;
  for (const card of seen.values()) {
    const dest = path.join(staging, colekaNinjaRanksStagingFile(card));
    const existingFace = resolveColekaNinjaRanksStagingFace(staging, card);
    let frontBuf: Buffer | null = null;
    if (!opts.force && existingFace) {
      skip += 1;
      frontBuf = readFileSync(existingFace);
    } else {
      frontBuf = await downloadImage(card.faceUrl);
      if (!frontBuf) {
        fail += 1;
      } else {
        writeFileSync(dest, frontBuf);
        ok += 1;
      }
    }

    const backDest = path.join(staging, colekaNinjaRanksStagingBackFile(card));
    const existingBack = resolveColekaNinjaRanksStagingBack(staging, card);
    if (!opts.force && existingBack) {
      backSkip += 1;
    } else if (!frontBuf) {
      backFail += 1;
    } else {
      const backBuf = await downloadColekaBack(card, frontBuf);
      if (!backBuf) {
        backFail += 1;
      } else {
        writeFileSync(backDest, backBuf);
        backOk += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  for (const row of ledger.backOnly ?? []) {
    const backDest = path.join(
      staging,
      colekaBackOnlyStagingFile(row.number, row.backUrl),
    );
    if (!opts.force && existsSync(backDest)) {
      backSkip += 1;
    } else {
      const backBuf = await downloadImage(row.backUrl);
      if (!backBuf) {
        backFail += 1;
      } else {
        writeFileSync(backDest, backBuf);
        backOk += 1;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    pages,
    cards: seen.size,
    ok,
    skip,
    fail,
    backOk,
    backSkip,
    backFail,
    rejected,
  };
}

export type ColekaNinjaRanksInstall = {
  faces: number;
  backs: number;
  missing: string[];
};

export function installColekaNinjaRanks(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ColekaNinjaRanksInstall {
  const staging = opts.stagingDir ?? colekaNinjaRanksStagingDir();
  const ledger = readColekaNinjaRanksLedger();
  const lang = ledger.lang.trim().toLowerCase();
  const missing: string[] = [];
  const rejected = colekaNinjaRanksRejectedFaceKeys(ledger);

  removeColekaRejectedFaceFiles(ledger);

  if (!existsSync(staging)) {
    purgeColekaRejectedFaces(index, ledger);
    return { faces: 0, backs: 0, missing };
  }

  const assetsByKey = new Map<
    string,
    {
      printKey: string;
      lang: string;
      art?: string;
      back?: string;
      sourceUrl: string | null;
    }
  >();

  for (const [i] of colekaNinjaRanksListingPageUrls().entries()) {
    const listing = path.join(staging, `listing-${i}.html`);
    if (!existsSync(listing)) continue;
    const parsed = parseColekaNinjaRanksListing(readFileSync(listing, "utf8"));
    for (const card of parsed.cards) {
      if (rejected.has(colekaNinjaRanksCardKey(card))) continue;
      const src = resolveColekaNinjaRanksStagingFace(staging, card);
      const backSrc = resolveColekaNinjaRanksStagingBack(staging, card);
      if (!src) {
        missing.push(colekaNinjaRanksCardKey(card));
        continue;
      }
      const printKey = ninjaRanksPrintKey(card.setCode, card.number);
      if (!printKey) {
        missing.push(colekaNinjaRanksCardKey(card));
        continue;
      }
      /*
        `cards/{set}/{langue}/{numéro}` — dans cet ordre.

        C'est celui qu'`assetsCardUrl` reconstruit pour servir le fichier, et
        celui que le pack `dbs` respecte (`cards/sd16/fr/03/`). Ce pack-ci
        écrivait `{set}/{numéro}/{langue}` : les octets étaient bien là, l'URL
        pointait à côté, et l'admin n'a jamais montré une seule face. Le pack
        Carddass n'a pas ce problème parce qu'il passe par
        `narutoCardPathFromCollector`, qui ne sait lire que ses propres
        identifiants (`ni0001`) et rend `null` sur un numéro nu.
      */
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        card.setCode,
        lang,
        card.number,
      );
      mkdirSync(destDir, { recursive: true });
      const ext = path.extname(src).toLowerCase() || ".webp";
      const art = `art.${ledger.sourceId}${ext}`;
      copyFileSync(src, path.join(destDir, art));

      let back: string | undefined;
      if (backSrc) {
        const backFile = `back.${ledger.sourceId}${ext}`;
        copyFileSync(backSrc, path.join(destDir, backFile));
        back = backFile;
      }

      const assetKey = `${printKey}:${lang}`;
      const existing = assetsByKey.get(assetKey);
      assetsByKey.set(assetKey, {
        printKey,
        lang,
        art: existing?.art ?? art,
        back: back ?? existing?.back,
        sourceUrl: card.faceUrl,
      });
    }
  }

  for (const row of ledger.backOnly ?? []) {
    const backSrc = path.join(
      staging,
      colekaBackOnlyStagingFile(row.number, row.backUrl),
    );
    if (!existsSync(backSrc)) {
      missing.push(row.number);
      continue;
    }
    const setCode = row.setCode?.trim() || COLEKA_NINJA_RANKS_SET;
    const printKey = ninjaRanksPrintKey(setCode, row.number);
    if (!printKey) {
      missing.push(row.number);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      setCode,
      lang,
      row.number,
    );
    mkdirSync(destDir, { recursive: true });
    const ext = path.extname(backSrc).toLowerCase() || ".webp";
    const backFile = `back.${ledger.sourceId}${ext}`;
    copyFileSync(backSrc, path.join(destDir, backFile));

    const assetKey = `${printKey}:${lang}`;
    const existing = assetsByKey.get(assetKey);
    assetsByKey.set(assetKey, {
      printKey,
      lang,
      art: existing?.art,
      back: backFile,
      sourceUrl: row.pageUrl,
    });
  }

  const assets = [...assetsByKey.values()];
  if (assets.length) index.writeAssets(assets);
  purgeColekaRejectedFaces(index, ledger);
  return {
    faces: assets.filter((a) => a.art).length,
    backs: assets.filter((a) => a.back).length,
    missing,
  };
}

export { COLEKA_NINJA_RANKS_LANG };
