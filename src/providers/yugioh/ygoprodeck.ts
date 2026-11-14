/**
 * YGOPRODeck API v7 — EN/FR titles + card images for Yu-Gi-Oh! TCG prints.
 *
 * Konami Neuron / db.yugioh-card.com has no public API; YGOPRODeck is the
 * community mirror (passcode + konami_id via misc). French `language=fr`
 * returns FR *names*; EN set codes (LOB-EN001…) stay EN printings — do not
 * mint `print_titles.lang=fr` for them. ScanFlip FR codes (LDD-F000) remain
 * separate printKeys with real FR faces.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { retry } from "@/lib/http/retry";
import { packCardDir, packLogsDir, packStagingDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

import { YUGIOH_PACK_ID } from "./pack";
import {
  formatYugiohReference,
  isYugiohFrRegionalNumber,
  parseYugiohPrintedCode,
  yugiohPrintKey,
} from "./printKey";

export const YGOPRODECK_CARDINFO =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php";

const UA =
  "Mozilla/5.0 (compatible; Placarr/1.0; +https://github.com/placarr)";

export type YgoprodeckCardSet = {
  set_name?: string;
  set_code: string;
  set_rarity?: string;
  set_rarity_code?: string;
};

export type YgoprodeckCardImage = {
  id: number;
  image_url?: string;
  image_url_small?: string;
};

export type YgoprodeckCard = {
  id: number;
  name: string;
  type?: string;
  race?: string;
  card_sets?: YgoprodeckCardSet[];
  card_images?: YgoprodeckCardImage[];
};

export type YgoprodeckLedger = {
  source: string;
  observed: string;
  format: string;
  enCount: number;
  frCount: number;
  /** passcode → EN name */
  enNames: Record<string, string>;
  /** passcode → FR name */
  frNames: Record<string, string>;
  /** passcode → primary image URL */
  images: Record<string, string>;
  /** Expanded TCG printings from EN harvest */
  prints: {
    passcode: number;
    setCode: string;
    number: string;
    printed: string;
    rarity: string | null;
  }[];
};

export function ygoprodeckLedgerPath(): string {
  return path.join(packLogsDir(YUGIOH_PACK_ID), "ygoprodeck", "cards-tcg.json");
}

/** Legacy staging path (pre–promote→ledger). */
function legacyYgoprodeckLedgerPath(): string {
  return path.join(
    packStagingDir(YUGIOH_PACK_ID),
    "ygoprodeck",
    "cards-tcg.json",
  );
}

type PageMeta = {
  rows_remaining?: number;
  next_page_offset?: number;
  total_rows?: number;
};

async function fetchCardinfoPage(opts: {
  language?: string;
  offset: number;
  num: number;
  format?: string;
}): Promise<{ data: YgoprodeckCard[]; meta?: PageMeta }> {
  const params = new URLSearchParams();
  params.set("num", String(opts.num));
  params.set("offset", String(opts.offset));
  if (opts.format) params.set("format", opts.format);
  if (opts.language) params.set("language", opts.language);
  const url = `${YGOPRODECK_CARDINFO}?${params.toString()}`;
  const res = await retry(
    () =>
      httpGet<{ data?: YgoprodeckCard[]; meta?: PageMeta }>(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        timeout: 120_000,
        noDedup: true,
        validateStatus: (s) => s === 200,
      }),
    4,
    800,
  );
  return {
    data: res.data?.data ?? [],
    meta: res.data?.meta,
  };
}

async function harvestLanguage(opts: {
  language?: string;
  format?: string;
  maxCards?: number;
  pageSize?: number;
  delayMs?: number;
}): Promise<YgoprodeckCard[]> {
  const pageSize = Math.min(opts.pageSize ?? 100, 100);
  const delayMs = opts.delayMs ?? 120;
  const maxCards = opts.maxCards ?? Infinity;
  const out: YgoprodeckCard[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchCardinfoPage({
      language: opts.language,
      offset,
      num: pageSize,
      format: opts.format ?? "tcg",
    });
    out.push(...page.data);
    if (out.length >= maxCards) return out.slice(0, maxCards);
    const remaining = page.meta?.rows_remaining ?? 0;
    if (!page.data.length || remaining <= 0) break;
    offset = page.meta?.next_page_offset ?? offset + page.data.length;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}

/** Expand one API card into print rows (pure). */
export function expandYgoprodeckCardPrints(card: YgoprodeckCard): {
  passcode: number;
  setCode: string;
  number: string;
  printed: string;
  rarity: string | null;
  printKey: string;
}[] {
  const rows = [];
  for (const set of card.card_sets ?? []) {
    const parsed = parseYugiohPrintedCode(set.set_code);
    if (!parsed) continue;
    const printKey = yugiohPrintKey(parsed.set, parsed.number);
    if (!printKey) continue;
    rows.push({
      passcode: card.id,
      setCode: parsed.set,
      number: parsed.number,
      printed: parsed.printed,
      rarity: set.set_rarity?.trim() || set.set_rarity_code?.trim() || null,
      printKey,
    });
  }
  return rows;
}

export function primaryYgoprodeckImageUrl(
  card: YgoprodeckCard,
): string | null {
  const img = card.card_images?.[0];
  return img?.image_url?.trim() || null;
}

export async function harvestYugiohYgoprodeck(opts: {
  maxCards?: number;
  skipFr?: boolean;
} = {}): Promise<{ path: string; en: number; fr: number; prints: number }> {
  const enCards = await harvestLanguage({
    format: "tcg",
    maxCards: opts.maxCards,
  });
  const frCards = opts.skipFr
    ? []
    : await harvestLanguage({
        language: "fr",
        format: "tcg",
        maxCards: opts.maxCards,
      });

  const enNames: Record<string, string> = {};
  const frNames: Record<string, string> = {};
  const images: Record<string, string> = {};
  const prints: YgoprodeckLedger["prints"] = [];
  const seenPrint = new Set<string>();

  for (const card of enCards) {
    const id = String(card.id);
    if (card.name?.trim()) enNames[id] = card.name.trim();
    const img = primaryYgoprodeckImageUrl(card);
    if (img) images[id] = img;
    for (const row of expandYgoprodeckCardPrints(card)) {
      if (seenPrint.has(row.printKey)) continue;
      seenPrint.add(row.printKey);
      prints.push({
        passcode: row.passcode,
        setCode: row.setCode,
        number: row.number,
        printed: row.printed,
        rarity: row.rarity,
      });
    }
  }
  for (const card of frCards) {
    const id = String(card.id);
    if (card.name?.trim()) frNames[id] = card.name.trim();
    if (!images[id]) {
      const img = primaryYgoprodeckImageUrl(card);
      if (img) images[id] = img;
    }
  }

  const ledger: YgoprodeckLedger = {
    source: YGOPRODECK_CARDINFO,
    observed: new Date().toISOString().slice(0, 10),
    format: "tcg",
    enCount: enCards.length,
    frCount: frCards.length,
    enNames,
    frNames,
    images,
    prints,
  };

  const out = ygoprodeckLedgerPath();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(ledger)}\n`, "utf8");
  const contentHash = hashCatalogArtefactBytes(readFileSync(out));
  recordCatalogPromoteAndPurgeStaging({
    ledgerPath: packCatalogIngestLedgerPath(YUGIOH_PACK_ID),
    artefactId: "yugioh:ygoprodeck-tcg",
    contentHash,
    stagingPath: path.join(packStagingDir(YUGIOH_PACK_ID), "ygoprodeck"),
  });
  return {
    path: out,
    en: enCards.length,
    fr: frCards.length,
    prints: prints.length,
  };
}

export function loadYgoprodeckLedger(): YgoprodeckLedger | null {
  for (const p of [ygoprodeckLedgerPath(), legacyYgoprodeckLedgerPath()]) {
    if (!existsSync(p)) continue;
    try {
      const ledger = JSON.parse(readFileSync(p, "utf8")) as YgoprodeckLedger;
      if (p === legacyYgoprodeckLedgerPath()) {
        mkdirSync(path.dirname(ygoprodeckLedgerPath()), { recursive: true });
        writeFileSync(
          ygoprodeckLedgerPath(),
          `${JSON.stringify(ledger)}\n`,
          "utf8",
        );
      }
      return ledger;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function installYugiohYgoprodeck(
  index: LocalPrintsIndex,
  opts: {
    downloadFaces?: boolean;
    limit?: number;
    /** Prefer EN as catalogue original; FR titles when attested. */
    languages?: ("en" | "fr")[];
  } = {},
): Promise<{ prints: number; titles: number; faces: number }> {
  const ledger = loadYgoprodeckLedger();
  if (!ledger) return { prints: 0, titles: 0, faces: 0 };

  const langs = opts.languages ?? ["en", "fr"];
  let printsList = ledger.prints;
  if (opts.limit && opts.limit > 0) printsList = printsList.slice(0, opts.limit);

  const printRows: LocalPrintWrite[] = [];
  const assets: LocalPrintAssetWrite[] = [];
  let faces = 0;
  const downloadedPasscodes = new Map<string, Buffer>();

  for (const row of printsList) {
    const printKey = yugiohPrintKey(row.setCode, row.number);
    if (!printKey) continue;
    const id = String(row.passcode);
    const titles: { lang: string; fullName: string; rarity?: string | null }[] =
      [];
    if (langs.includes("en") && ledger.enNames[id]) {
      titles.push({
        lang: "en",
        fullName: ledger.enNames[id]!,
        rarity: row.rarity,
      });
    }
    /*
      FR name from YGOPRODeck is a translation, not a FR printing. Only attach
      `lang=fr` when the collector is itself a French regional code.
    */
    if (
      langs.includes("fr") &&
      ledger.frNames[id] &&
      isYugiohFrRegionalNumber(row.number)
    ) {
      titles.push({
        lang: "fr",
        fullName: ledger.frNames[id]!,
        rarity: row.rarity,
      });
    }
    if (!titles.length) {
      titles.push({
        lang: "en",
        fullName: formatYugiohReference(row.setCode, row.number),
        rarity: row.rarity,
      });
    }

    printRows.push({
      printKey,
      setCode: row.setCode,
      number: row.number,
      cardType: row.setCode,
      sourceUrl: `https://ygoprodeck.com/card/?search=${row.passcode}`,
      titles,
    });

    if (opts.downloadFaces === false) continue;
    const faceUrl = ledger.images[id];
    if (!faceUrl) continue;

    const destDir = packCardDir(YUGIOH_PACK_ID, {
      set: row.setCode,
      lang: "en",
      card: row.number,
    });
    const artName = "art.ygoprodeck.webp";
    const installed = await installCardFace({
      destDir,
      artName,
      url: faceUrl,
      webpQuality: 85,
      referer: "https://ygoprodeck.com/",
      fetchImage: async (url) => {
        let buf = downloadedPasscodes.get(id) ?? null;
        if (!buf) {
          buf = await downloadCardFaceBytes(url, {
            referer: "https://ygoprodeck.com/",
            timeoutMs: 40_000,
          });
          if (buf) downloadedPasscodes.set(id, buf);
        }
        return buf;
      },
    });
    if (!installed) continue;
    if (installed.downloaded) faces += 1;
    assets.push({
      printKey,
      lang: "en",
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

  // Drop FR title rows previously minted on EN/PT collectors (translations ≠ FR prints).
  purgeYgoprodeckFrTitlesOnNonFrPrints(index);

  // OTS PT / FR regional rows often lack ScanFlip CDN; mirror EN sibling art.
  const mirrored = mirrorYgoprodeckEnFacesOntoLocaleSiblings(index);
  faces += mirrored;

  return { prints, titles, faces };
}

/**
 * Remove `print_titles.lang=fr` on collectors that are not French regional
 * printings (`en001`, `pt028`…). Keeps ScanFlip / ygocards FR codes.
 */
export function purgeYgoprodeckFrTitlesOnNonFrPrints(
  index: LocalPrintsIndex,
): number {
  const db = index.openForWrite();
  const result = db
    .prepare(
      `DELETE FROM print_titles
        WHERE lang = 'fr'
          AND print_key IN (
            SELECT print_key FROM prints p
             WHERE lower(p.number) NOT LIKE 'fr%'
               AND lower(p.number) NOT GLOB 'f[0-9]*'
          )`,
    )
    .run() as { changes?: number };
  return Number(result.changes ?? 0);
}

/**
 * `OP07-EN028` shares art with `OP07-PT028` / `OP07-FR027`. ScanFlip may seed
 * the locale print with a title but no CDN — copy the EN ygoprodeck face.
 */
export function mirrorYgoprodeckEnFacesOntoLocaleSiblings(
  index: LocalPrintsIndex,
): number {
  const db = index.ensure();
  if (!db) return 0;
  const cardsRoot = path.join(dataRoot(), YUGIOH_PACK_ID, "cards");
  if (!existsSync(cardsRoot)) return 0;

  const rows = db
    .prepare(
      `SELECT t.print_key AS printKey, p.set_code AS setCode, p.number AS number
         FROM print_titles t
         JOIN prints p ON p.print_key = t.print_key
        WHERE t.lang = 'fr'
          AND (lower(p.number) LIKE 'pt%' OR lower(p.number) LIKE 'fr%')
          AND NOT EXISTS (
                SELECT 1 FROM print_assets a
                 WHERE a.print_key = t.print_key AND a.lang = 'fr'
                   AND a.art IS NOT NULL AND trim(a.art) != ''
              )`,
    )
    .all() as Array<{ printKey: string; setCode: string; number: string }>;

  const assets: LocalPrintAssetWrite[] = [];
  let mirrored = 0;
  for (const row of rows) {
    const setCode = row.setCode.trim().toLowerCase();
    const localeNum = row.number.trim().toLowerCase();
    const prefix = localeNum.startsWith("pt")
      ? "pt"
      : localeNum.startsWith("fr")
        ? "fr"
        : null;
    if (!prefix) continue;
    const enNum = `en${localeNum.slice(prefix.length)}`;
    const enDir = packCardDir(YUGIOH_PACK_ID, {
      set: setCode,
      lang: "en",
      card: enNum,
    });
    // Legacy layout leftover: cards/{set}/en/{num}/
    const legacyEnDir = path.join(cardsRoot, setCode, "en", enNum);
    const enArt =
      resolveYgoprodeckArtFile(enDir) ?? resolveYgoprodeckArtFile(legacyEnDir);
    if (!enArt) continue;
    const destDir = packCardDir(YUGIOH_PACK_ID, {
      set: setCode,
      lang: "fr",
      card: localeNum,
    });
    mkdirSync(destDir, { recursive: true });
    const artName = path.basename(enArt);
    copyFileSync(enArt, path.join(destDir, artName));
    assets.push({
      printKey: row.printKey,
      lang: "fr",
      art: artName,
      sourceUrl: enArt,
    });
    mirrored += 1;
  }
  if (assets.length) index.writeAssets(assets);
  return mirrored;
}

/** @deprecated Prefer {@link mirrorYgoprodeckEnFacesOntoLocaleSiblings}. */
export function mirrorYgoprodeckEnFacesOntoPtSiblings(
  index: LocalPrintsIndex,
): number {
  return mirrorYgoprodeckEnFacesOntoLocaleSiblings(index);
}

function resolveYgoprodeckArtFile(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  const preferred = path.join(cardDir, "art.ygoprodeck.webp");
  if (existsSync(preferred)) return preferred;
  try {
    const hit = readdirSync(cardDir)
      .filter(
        (name) =>
          /^art(\.|$)/i.test(name) &&
          !name.endsWith(".json") &&
          !name.startsWith("."),
      )
      .sort()[0];
    return hit ? path.join(cardDir, hit) : null;
  } catch {
    return null;
  }
}
