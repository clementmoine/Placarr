/**
 * ColleX (collexstash.com) → faces candidates Leclerc `art.collex.webp`.
 *
 * Pages collection publiques déclarées par opération ; la Sync relit chaque
 * page (flux RSC = toute la collection), écrit le ledger
 * `data/leclerc/sources/collex-<set>-faces.json` (URL d'image par objet),
 * copie les images en staging puis les pose en face candidate (citation =
 * la page collection, une image nue n'étant pas une citation ouvrable) — le moteur de
 * priorité choisit l'affichage. Cartes : par numéro imprimé ; Fixeez (sans
 * numéro ColleX) : par nom, seulement quand un seul Fixeez du catalogue porte
 * ce nom.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { pickBestCatalogueFace } from "@/core/enrich/media/catalogueFaceRank";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { parseCollexCollectionItems } from "@/providers/shared/collexstash/parseCollection";

import { leclercSourcePath, leclercSyncedSourcePath } from "./curatedPaths";
import { leclercOpForSetCode } from "./pack";
import { leclercPrintKey } from "./printKey";

export const COLLEX_LECLERC_SOURCE_ID = "collex";
const LANG = "fr";
const BASE = "https://www.collexstash.com/fr/collections";

/** Pages ColleX par opération (vides tant que ColleX n'a pas les visuels). */
export const COLLEX_LECLERC_COLLECTIONS: Readonly<
  Record<string, readonly string[]>
> = {
  marvel21: [`${BASE}/cards/cartes-marvel-leclerc-2021`],
  marvel22: [`${BASE}/cards/cartes-marvel-leclerc-2022`],
  marvel23: [
    `${BASE}/cards/cartes-marvel-leclerc-2023`,
    `${BASE}/figures/fixeez-marvel-leclerc-2023`,
  ],
  marvel24: [
    `${BASE}/cards/cartes-marvel-leclerc-2024`,
    `${BASE}/figures/fixeez-marvel-leclerc-2024`,
  ],
  disney25: [
    `${BASE}/cards/cartes-disney-leclerc-2025`,
    `${BASE}/figures/fixeez-disney-leclerc-2025`,
  ],
  disney26: [
    `${BASE}/cards/cartes-disney-leclerc-2026`,
    `${BASE}/figures/fixeez-disney-leclerc-2026`,
  ],
};

export type CollexLeclercLedgerItem = {
  collectionUrl: string;
  slug: string;
  number: string | null;
  name: string;
  imageUrl: string;
};

export type CollexLeclercLedger = {
  source: string;
  observed: string;
  setCode: string;
  items: CollexLeclercLedgerItem[];
};

function ledgerFileName(setCode: string): string {
  return `collex-${setCode}-faces.json`;
}

function stagingDirFor(setCode: string): string | null {
  const op = leclercOpForSetCode(setCode);
  return op ? path.join(packStagingDir(op.packId), "collex-faces") : null;
}

function stagingFile(item: { slug: string; imageUrl: string }): string {
  const ext =
    path.extname(new URL(item.imageUrl).pathname).toLowerCase() || ".webp";
  return `${item.slug}${ext}`;
}

/** Comparaison de noms : sans accents, casse, ponctuation ni « Fixeez — ». */
function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^fixeez\s*[—–-]\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Numéro catalogue Leclerc pour un objet ColleX, ou `null` (pas de devinette). */
export function matchCollexLeclercNumber(
  item: { number: string | null; name: string },
  rows: readonly { number: string; fullName: string | null }[],
): string | null {
  if (item.number) {
    const n = Number(item.number);
    if (!Number.isInteger(n) || n <= 0) return null;
    const padded = String(n).padStart(3, "0");
    return rows.some((r) => r.number === padded) ? padded : null;
  }
  const key = nameKey(item.name);
  if (!key) return null;
  const hits = rows.filter(
    (r) => /^f\d+$/i.test(r.number) && nameKey(r.fullName ?? "") === key,
  );
  return hits.length === 1 ? hits[0]!.number : null;
}

async function defaultFetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      responseType: "text",
      timeout: 30_000,
      validateStatus: (s) => s === 200,
    });
    return String(res.data);
  } catch {
    return null;
  }
}

export async function harvestCollexLeclercFaces(
  setCode: string,
  opts: {
    collections?: readonly string[];
    ledgerPath?: string;
    stagingDir?: string;
    fetchHtml?: (url: string) => Promise<string | null>;
    fetchImage?: (url: string) => Promise<Buffer | null>;
  } = {},
): Promise<{
  items: number;
  downloaded: number;
  skipped: number;
  failed: number;
} | null> {
  const collections = opts.collections ?? COLLEX_LECLERC_COLLECTIONS[setCode];
  const staging = opts.stagingDir ?? stagingDirFor(setCode);
  if (!collections?.length || !staging) return null;
  const fetchHtml = opts.fetchHtml ?? defaultFetchHtml;
  const fetchImage =
    opts.fetchImage ??
    ((url: string) =>
      downloadCardFaceBytes(url, { referer: `${BASE}/`, minBytes: 1_000 }));

  const items: CollexLeclercLedgerItem[] = [];
  for (const collectionUrl of collections) {
    const html = await fetchHtml(collectionUrl);
    if (!html) continue;
    for (const item of parseCollexCollectionItems(html)) {
      items.push({ collectionUrl, ...item });
    }
  }
  if (!items.length) return { items: 0, downloaded: 0, skipped: 0, failed: 0 };

  const ledger: CollexLeclercLedger = {
    source: "collexstash.com — pages collection publiques (flux RSC)",
    observed: new Date().toISOString(),
    setCode,
    items,
  };
  const ledgerPath =
    opts.ledgerPath ?? leclercSyncedSourcePath(ledgerFileName(setCode));
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  mkdirSync(staging, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of items) {
    const dest = path.join(staging, stagingFile(item));
    if (existsSync(dest)) {
      skipped += 1;
      continue;
    }
    const buf = await fetchImage(item.imageUrl);
    if (!buf?.length) {
      failed += 1;
      continue;
    }
    writeFileSync(dest, buf);
    downloaded += 1;
  }
  return { items: items.length, downloaded, skipped, failed };
}

/**
 * Provenance déclarée des faces Leclerc par source : annonces eBay et
 * visuels ColleX (photos de collectionneurs, ~400 px) sont des photos ; les
 * autres sources des visuels catalogue. À provenance égale, le moteur
 * tranche sur la qualité — la photo la plus nette s'affiche, les autres
 * restent candidates (étagère, reconnaissance d'image).
 */
const LECLERC_PHOTO_SOURCES: ReadonlySet<string> = new Set([
  "ebay",
  COLLEX_LECLERC_SOURCE_ID,
]);

function leclercFaceProvenance(source: string): string {
  return LECLERC_PHOTO_SOURCES.has(source) ? "listing_photo" : "catalog";
}

/** Face `art.*` gagnante du dossier selon le moteur de priorité. */
async function bestArtFile(dir: string): Promise<string | null> {
  const files = readdirSync(dir).filter((f) =>
    /^art\.[a-z0-9-]+\.[a-z0-9]+$/i.test(f),
  );
  const candidates = [];
  for (const file of files) {
    try {
      const meta = await sharp(path.join(dir, file)).metadata();
      candidates.push({
        id: file,
        artFile: file,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        coverProvenance: leclercFaceProvenance(file.split(".")[1] ?? ""),
      });
    } catch {
      /* fichier illisible : pas candidat */
    }
  }
  return pickBestCatalogueFace(candidates)?.id ?? null;
}

export async function installCollexLeclercFaces(
  index: {
    listRowsForLanguage: (
      lang?: string,
    ) => readonly { number: string; fullName: string | null }[];
    writeAssets: LocalPrintsIndex["writeAssets"];
  },
  setCode: string,
  opts: {
    ledgerPath?: string;
    stagingDir?: string;
    cardDir?: (number: string) => string;
  } = {},
): Promise<{ faces: number; kept: number; unmatched: string[] }> {
  const ledgerPath =
    opts.ledgerPath ?? leclercSourcePath(ledgerFileName(setCode));
  const staging = opts.stagingDir ?? stagingDirFor(setCode);
  const op = leclercOpForSetCode(setCode);
  if (!existsSync(ledgerPath) || !staging) {
    return { faces: 0, kept: 0, unmatched: [] };
  }
  const ledger = JSON.parse(
    readFileSync(ledgerPath, "utf8"),
  ) as CollexLeclercLedger;
  const rows = index.listRowsForLanguage(LANG);
  const cardDir =
    opts.cardDir ??
    ((number: string) =>
      packCardDir(op?.packId ?? `leclerc/${setCode}`, {
        set: setCode,
        lang: LANG,
        card: number,
      }));

  const unmatched: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];
  let kept = 0;
  for (const item of ledger.items) {
    const number = matchCollexLeclercNumber(item, rows);
    const printKey = number ? leclercPrintKey(setCode, number) : null;
    const src = path.join(staging, stagingFile(item));
    if (!number || !printKey || !existsSync(src)) {
      unmatched.push(item.slug);
      continue;
    }
    const dir = cardDir(number);
    const art = `art.${COLLEX_LECLERC_SOURCE_ID}${path.extname(src).toLowerCase()}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, art), readFileSync(src));
    // Candidate gardée sur disque ; l'index ne pointe dessus que si elle gagne.
    if ((await bestArtFile(dir)) === art) {
      assets.push({ printKey, lang: LANG, art, sourceUrl: item.collectionUrl });
    } else {
      kept += 1;
    }
  }
  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, kept, unmatched };
}
