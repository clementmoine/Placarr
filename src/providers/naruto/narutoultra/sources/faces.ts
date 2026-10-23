/**
 * Naruto Ultra Challenge face / album ledgers (card scans + sealed album art).
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
import { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";
import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import { hashCatalogArtefactBytes } from "@/providers/shared/catalogIngestLedger";
import {
  hashNarutoCuratedJson,
  narutoDigArtefactFresh,
  promoteAndPurgeNarutoDig,
} from "@/providers/naruto/shared/promoteNarutoDig";

import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "../pack";
import {
  COLEKA_ULTRA_LANG,
  COLEKA_ULTRA_LISTING_PATH,
  COLEKA_ULTRA_ORIGIN,
  colekaUltraListingPageUrls,
  parseColekaUltraListing,
  type ColekaUltraCard,
} from "../parse/coleka";
import { NARUTO_ULTRA_SET_CODE, ultraChallengePrintKey } from "../printKey";

/** Safari UA — AnimeCollection faces + Coleka album. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Chrome UA — Coleka Ultra faces (FlareSolverr listing). */
const COLEKA_ULTRA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// ─── AnimeCollection faces ───────────────────────────────────────────────

/**
 * Faces Ultra Challenge depuis AnimeCollection (h400).
 *
 * La checklist laststicker donne les titres ; AC donne les scans numérotés
 * 1–100 (plus grands que LastSticker, et sans mur robots sur `/cartes/`).
 * Mapping attesté dans `curated/sources/animecollection.json`.
 */

const AC_LEDGER_FILE = "animecollection.json";
const AC_STAGING_FOLDER = "animecollection-faces";
const AC_ARTEFACT = "faces:animecollection-ultra";

export function animeCollectionUltraFacesContentHash(): string {
  const ledger = readAnimeCollectionFacesLedger();
  return hashNarutoCuratedJson({
    faces: ledger.faces.map((f) => ({
      acId: f.acId,
      printed: f.printed,
      number: f.number,
    })),
  });
}

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
  return path.join(narutoUltraCuratedDir(), "sources", AC_LEDGER_FILE);
}

export function readAnimeCollectionFacesLedger(): AnimeCollectionFacesLedger {
  return JSON.parse(
    readFileSync(animeCollectionFacesLedgerPath(), "utf8"),
  ) as AnimeCollectionFacesLedger;
}

export function animeCollectionFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_ULTRA_PACK_ID), AC_STAGING_FOLDER);
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

async function downloadAnimeCollectionImage(
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
  const contentHash = animeCollectionUltraFacesContentHash();
  if (
    !opts.stagingDir &&
    narutoDigArtefactFresh({
      packId: NARUTO_ULTRA_PACK_ID,
      artefactId: AC_ARTEFACT,
      contentHash,
      force: opts.force,
    })
  ) {
    return {
      cards: ledger.faces.length,
      ok: 0,
      skip: ledger.faces.length,
      fail: 0,
    };
  }

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
    const buf = await downloadAnimeCollectionImage(
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
  if (missing.length === 0 && assets.length > 0 && !opts.stagingDir) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_ULTRA_PACK_ID,
      artefactId: AC_ARTEFACT,
      stagingRel: AC_STAGING_FOLDER,
      contentHash: animeCollectionUltraFacesContentHash(),
    });
  }
  return { faces: assets.length, missing };
}

// ─── Coleka Ultra faces ──────────────────────────────────────────────────

/**
 * Moisson Coleka Ultra Challenge via FlareSolverr (listing EN).
 *
 * Photos collectionneur (~995×1393) → `art.coleka.webp`. Préférées aux
 * thumbs AnimeCollection h400 quand les deux existent.
 */

const COLEKA_ULTRA_STAGING_FOLDER = "coleka-ultra-faces";
const COLEKA_ULTRA_LEDGER_FILE = "coleka-ultra-faces.json";
const COLEKA_ULTRA_ARTEFACT = "faces:coleka-ultra";
const COLEKA_ULTRA_REFERER = `${COLEKA_ULTRA_ORIGIN}${COLEKA_ULTRA_LISTING_PATH}`;

export function colekaUltraFacesContentHash(): string {
  return hashNarutoCuratedJson({
    ledger: readColekaUltraFacesLedger(),
    pages: colekaUltraListingPageUrls(),
  });
}

export type ColekaUltraFacesLedger = {
  source: string;
  url: string;
  sourceId: string;
  lang: string;
  listingPath: string;
};

export function colekaUltraFacesLedgerPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", COLEKA_ULTRA_LEDGER_FILE);
}

export function readColekaUltraFacesLedger(): ColekaUltraFacesLedger {
  return JSON.parse(
    readFileSync(colekaUltraFacesLedgerPath(), "utf8"),
  ) as ColekaUltraFacesLedger;
}

export function colekaUltraFacesStagingDir(): string {
  return path.join(
    packStagingDir(NARUTO_ULTRA_PACK_ID),
    COLEKA_ULTRA_STAGING_FOLDER,
  );
}

export function colekaUltraStagingFile(card: ColekaUltraCard): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${card.number}${ext || ".webp"}`;
}

async function downloadColekaUltraImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": COLEKA_ULTRA_UA, Referer: COLEKA_ULTRA_REFERER },
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

export type ColekaUltraHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  rejected: { ref: string; name: string; reason: string }[];
};

export async function harvestColekaUltraFaces(
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<ColekaUltraHarvest> {
  const contentHash = colekaUltraFacesContentHash();
  if (
    !opts.stagingDir &&
    narutoDigArtefactFresh({
      packId: NARUTO_ULTRA_PACK_ID,
      artefactId: COLEKA_ULTRA_ARTEFACT,
      contentHash,
      force: opts.force,
    })
  ) {
    return {
      pages: 0,
      cards: 0,
      ok: 0,
      skip: 0,
      fail: 0,
      rejected: [],
    };
  }

  const staging = opts.stagingDir ?? colekaUltraFacesStagingDir();
  mkdirSync(staging, { recursive: true });
  const seen = new Map<string, ColekaUltraCard>();
  const rejected: ColekaUltraHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of colekaUltraListingPageUrls().entries()) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(url, dest, Boolean(opts.force));
    if (!html) continue;
    pages += 1;
    const parsed = parseColekaUltraListing(html);
    for (const card of parsed.cards) {
      if (!seen.has(card.number)) seen.set(card.number, card);
    }
    rejected.push(...parsed.rejected);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of seen.values()) {
    const dest = path.join(staging, colekaUltraStagingFile(card));
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadColekaUltraImage(card.faceUrl);
    if (!buf) {
      fail += 1;
    } else {
      writeFileSync(dest, buf);
      ok += 1;
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    pages,
    cards: seen.size,
    ok,
    skip,
    fail,
    rejected,
  };
}

export type ColekaUltraInstall = {
  faces: number;
  missing: string[];
  /** Gabarits dont `art.coleka` a été retiré de l'index (dump conservé). */
  purgedPlaceholders: string[];
};

/** Retire `art.coleka*` des gabarits — le dump reste à côté, comme Ninja Ranks. */
function purgeColekaUltraPlaceholders(
  index: LocalPrintsIndex,
  lang: string,
  numbers: readonly string[],
): string[] {
  if (!numbers.length) return [];
  const dbPath = packCatalogDb(NARUTO_ULTRA_PACK_ID);
  if (!existsSync(dbPath)) return [];
  const purged: string[] = [];
  const db = new DatabaseSync(dbPath);
  try {
    const stmt = db.prepare(
      `UPDATE print_assets
       SET art = NULL
       WHERE print_key = ? AND lang = ? AND art LIKE 'art.coleka%'`,
    );
    for (const number of numbers) {
      const printKey = ultraChallengePrintKey(number);
      if (!printKey) continue;
      stmt.run(printKey, lang);
      purged.push(number);
    }
  } finally {
    db.close();
  }
  index.exportIndex();
  return purged;
}

export function installColekaUltraFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ColekaUltraInstall {
  const ledger = readColekaUltraFacesLedger();
  const staging = opts.stagingDir ?? colekaUltraFacesStagingDir();
  const lang = ledger.lang?.trim().toLowerCase() || COLEKA_ULTRA_LANG;
  const missing: string[] = [];
  const placeholderNumbers: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  if (!existsSync(staging)) {
    return { faces: 0, missing, purgedPlaceholders: [] };
  }

  for (const [i] of colekaUltraListingPageUrls().entries()) {
    const listing = path.join(staging, `listing-${i}.html`);
    if (!existsSync(listing)) continue;
    const parsed = parseColekaUltraListing(readFileSync(listing, "utf8"));
    for (const row of parsed.rejected) {
      if (!/gabarit/i.test(row.reason)) continue;
      const number = String(Number.parseInt(row.ref, 10)).padStart(4, "0");
      if (Number.parseInt(number, 10) >= 1) placeholderNumbers.push(number);
    }
    for (const card of parsed.cards) {
      const src = path.join(staging, colekaUltraStagingFile(card));
      if (!existsSync(src)) {
        missing.push(card.number);
        continue;
      }
      const printKey = ultraChallengePrintKey(card.number);
      if (!printKey) {
        missing.push(card.number);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_ULTRA_PACK_ID),
        NARUTO_ULTRA_SET_CODE,
        lang,
        card.number,
      );
      mkdirSync(destDir, { recursive: true });
      const ext = path.extname(src).toLowerCase() || ".webp";
      const art = `art.${ledger.sourceId}${ext}`;
      copyFileSync(src, path.join(destDir, art));
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl: card.faceUrl,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  const purgedPlaceholders = purgeColekaUltraPlaceholders(
    index,
    lang,
    [...new Set(placeholderNumbers)],
  );
  if (missing.length === 0 && assets.length > 0 && !opts.stagingDir) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_ULTRA_PACK_ID,
      artefactId: COLEKA_ULTRA_ARTEFACT,
      stagingRel: COLEKA_ULTRA_STAGING_FOLDER,
      contentHash: colekaUltraFacesContentHash(),
    });
  }
  return { faces: assets.length, missing, purgedPlaceholders };
}

// ─── Coleka album (sealed product art) ───────────────────────────────────

/**
 * Photo Coleka de l’album Ultra Challenge → produit scellé, pas des cartes.
 *
 * Recto seulement, URL imprimée www.paninigroup.com. Les 101 thumbs Coleka
 * n'ont pas de printKey attesté dans ce pack.
 */

export type ColekaAlbumLedger = {
  sourceId: string;
  lang: string;
  released: string;
  url: string;
  printedUrl: string;
  sku: {
    slug: string;
    kind: SealedKind;
    category: string;
    name: string;
    file: string;
    url: string;
    declaredCardCount: number | null;
  };
};

const COLEKA_ALBUM_LEDGER_FILE = "coleka-album.json";
const COLEKA_ALBUM_STAGING_FOLDER = "coleka";

export function colekaAlbumPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", COLEKA_ALBUM_LEDGER_FILE);
}

export function readColekaAlbumLedger(): ColekaAlbumLedger {
  return JSON.parse(
    readFileSync(colekaAlbumPath(), "utf8"),
  ) as ColekaAlbumLedger;
}

export function colekaAlbumStagingDir(): string {
  return path.join(
    packStagingDir(NARUTO_ULTRA_PACK_ID),
    COLEKA_ALBUM_STAGING_FOLDER,
  );
}

export async function harvestColekaAlbum(
  opts: { force?: boolean } = {},
): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = readColekaAlbumLedger();
  const contentHash = hashCatalogArtefactBytes(readFileSync(colekaAlbumPath()));
  if (
    narutoDigArtefactFresh({
      packId: NARUTO_ULTRA_PACK_ID,
      artefactId: "sealed:coleka-album",
      contentHash,
      force: opts.force,
    })
  ) {
    return { ok: 0, skip: 1, fail: 0 };
  }

  const destRoot = colekaAlbumStagingDir();
  mkdirSync(destRoot, { recursive: true });
  const dest = path.join(destRoot, ledger.sku.file);
  if (!opts.force && existsSync(dest)) {
    return { ok: 0, skip: 1, fail: 0 };
  }
  try {
    const res = await httpGet<ArrayBuffer>(ledger.sku.url, {
      headers: { "User-Agent": UA, Referer: ledger.url },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 100) {
      return { ok: 0, skip: 0, fail: 1 };
    }
    writeFileSync(dest, Buffer.from(data));
    return { ok: 1, skip: 0, fail: 0 };
  } catch {
    return { ok: 0, skip: 0, fail: 1 };
  }
}

export function ingestColekaAlbum(opts: { stagingDir?: string } = {}): {
  written: number;
  skipped: number;
  file: string;
} {
  const ledger = readColekaAlbumLedger();
  const staging = opts.stagingDir ?? colekaAlbumStagingDir();
  return writeLocalSealedProducts({
    packId: NARUTO_ULTRA_PACK_ID,
    source: ledger.sourceId,
    products: [
      {
        slug: ledger.sku.slug,
        kind: ledger.sku.kind,
        category: ledger.sku.category,
        name: ledger.sku.name,
        setCode: null,
        lang: ledger.lang,
        releaseDate: ledger.released,
        declaredCardCount: ledger.sku.declaredCardCount,
        path: ledger.url,
        artPath: path.join(staging, ledger.sku.file),
      },
    ],
    purgeStaging: {
      artefactId: "sealed:coleka-album",
      stagingPath: staging,
      contentHash: hashCatalogArtefactBytes(readFileSync(colekaAlbumPath())),
    },
  });
}
