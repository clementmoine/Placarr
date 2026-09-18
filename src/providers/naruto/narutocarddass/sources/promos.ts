/**
 * Naruto Carddass promo sources — attested promos, tournament checklist,
 * Coleka US promos, S1 FR prerelease, attested pairs.
 */

import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import {
  parseNarutoCollector,
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  narutoNumbersEqual,
} from "../identity";
import type { NarutoCollectorId } from "../identity";
import ledger from "../curated/sources/coleka-us-promos.json";
import { narutoCuratedSourcesDir } from "../install/curated";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { upsertNarutoAppearances } from "../pipeline";
import { narutoCardAbsDir } from "../disk";
import { existingNarutoArtForSource, extFromMagic, saveNarutoFace } from "../disk";
import { NARUTO_PACK_ID } from "../identity";
import { cardTypeFromCollectorNumber } from "../parse/bandai";
import { COLEKA_ORIGIN } from "../parse/coleka";
import {
  COLEKA_US_PROMO_LANG,
  COLEKA_US_PROMO_LISTING_PATH,
  COLEKA_US_PROMO_SET,
  colekaUsPromoListingPageUrls,
  parseColekaUsPromoListing,
} from "../parse/coleka";
import type { ColekaUsPromoCard } from "../parse/coleka";
import { fetchColekaListingHtml } from "./faces";

/**
 * Promo checklist = dedicated `PR-…` / `OP忍` **or** the FR tournament
 * reprints Collection Naruto enumerated (YT 7r7 shuriken / CdF lists).
 *
 * Inserts S6 manga/DVD share retail numbers (`NI-232`) — they are not promo
 * reprints and must not mint `ni0232-promo` twins.
 */


type DigFile = {
  promos?: {
    lists?: {
      "1"?: readonly string[];
      "2"?: readonly string[];
      "3"?: readonly string[];
    };
  };
};

let cached: Set<string> | null = null;

/** Dig form: `ni023`, `te001`, `ta067`. */
export function digCollectorForm(raw: string): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  if (id.family === "promo") return null;
  const prefix =
    id.family === "ninja"
      ? "ni"
      : id.family === "jutsu"
        ? "te"
        : id.family === "mission"
          ? "ta"
          : id.printedPrefix.toLowerCase();
  if (prefix !== "ni" && prefix !== "te" && prefix !== "ta") return null;
  return `${prefix}${String(id.number).padStart(3, "0")}`;
}

function loadDigTournamentNumbers(): Set<string> {
  if (cached) return cached;
  const filePath = path.join(
    narutoCuratedSourcesDir(),
    "collection-naruto-youtube-2026-08-29.json",
  );
  try {
    const dig = JSON.parse(readFileSync(filePath, "utf8")) as DigFile;
    const lists = dig.promos?.lists;
    cached = new Set(
      [...(lists?.["1"] ?? []), ...(lists?.["2"] ?? []), ...(lists?.["3"] ?? [])]
        .map((entry) => digCollectorForm(entry) ?? entry.trim().toLowerCase())
        .filter(Boolean),
    );
  } catch {
    cached = new Set();
  }
  return cached;
}

/** Reset between tests that stub the dig file. */
export function resetConfirmedCarddassTournamentPromosCache(): void {
  cached = null;
}

function isTourneyReprint(id: NarutoCollectorId): boolean {
  const grouping = id.grouping?.toLowerCase();
  return grouping === "promo" || grouping === "cdf";
}

/**
 * Whether a print belongs on the Promo (hors série) checklist.
 * `PR-011` yes; `NI-023 · promo` if in 7r7 lists; `NI-232 · promo` no.
 */
export function belongsOnNarutoPromoChecklist(raw: string): boolean {
  const id = parseNarutoCollector(raw);
  if (!id) return false;
  if (id.family === "promo") return true;
  if (id.grouping?.toLowerCase() === "ps") return true;
  if (!isTourneyReprint(id)) return false;
  const form = digCollectorForm(raw);
  if (!form) return false;
  return loadDigTournamentNumbers().has(form);
}

/**
 * Inject attested FR tournament / tin / CdF promos into the catalogue even
 * when no face JPEG exists yet (same honesty rule as cancelled S6: keep the
 * number + name, seek art later).
 *
 * Source: `curated/sources/attested-promos.json` (editorial ledger).
 * On-disk faces under `cards/promo/fr/` still win via `buildIndexFromDisk`.
 */



export type AttestedPromoSource = {
  id: string;
  url?: string;
  path?: string;
  note?: string;
};

export type AttestedPromoRow = {
  number: string;
  name: string;
  confidence?: string;
  channel?: string;
  shuriken?: number | null;
  /** On-disk folder under `cards/promo/fr/` when art already exists. */
  diskCardId?: string;
  notes?: string;
  /** Evidence (forum / marketplace / archived site pages). */
  sources?: AttestedPromoSource[];
};

type AttestedPromosFile = {
  promos?: AttestedPromoRow[];
};

export function attestedPromosPath(): string {
  return path.join(narutoCuratedSourcesDir(), "attested-promos.json");
}

export function loadAttestedPromos(
  filePath = attestedPromosPath(),
): AttestedPromoRow[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as AttestedPromosFile;
    const rows = raw.promos ?? [];
    return rows.filter(
      (row) =>
        typeof row?.number === "string" &&
        row.number.trim() &&
        typeof row?.name === "string" &&
        row.name.trim(),
    );
  } catch {
    return [];
  }
}

/** `te030` + diskCardId `te030-cdf` → grouping `cdf`. */
export function groupingFromDiskCardId(
  number: string,
  diskCardId: string | undefined,
): string | null {
  if (!diskCardId) return null;
  const id = diskCardId.trim().toLowerCase();
  const num = number.trim().toLowerCase();
  if (id === num) return null;
  if (id.startsWith(`${num}-`)) return id.slice(num.length + 1) || null;
  return null;
}

export function attestedPromoPrintKey(row: AttestedPromoRow): string | null {
  return mintNarutoPrintKey(row.diskCardId?.trim() || row.number, "promo");
}

/**
 * Ensure every attested promo has a `promo` print + FR title.
 * Does not invent assets — art arrives later under `cards/promo/fr/`.
 */
export function mergeAttestedPromos(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  promos?: AttestedPromoRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const promos = input.promos ?? loadAttestedPromos();
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const printByCanonical = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleByKey = new Map(
    titles
      .filter((t) => t.lang.toLowerCase() === "fr")
      .map((t) => [canonicalizeNarutoPrintKey(t.printKey), t]),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of promos) {
    const printKey = attestedPromoPrintKey(row);
    if (!printKey) continue;
    const raw = row.diskCardId?.trim() || row.number.trim();
    const number = narutoDiskCardId(raw, "promo") ?? raw.toLowerCase();
    // Refuse S6 insert twins and other non-checklist minting.
    if (!belongsOnNarutoPromoChecklist(number) && !belongsOnNarutoPromoChecklist(raw)) {
      continue;
    }
    const grouping =
      groupingFromDiskCardId(row.number.trim().toLowerCase(), row.diskCardId) ??
      parseNarutoCollector(number)?.grouping ??
      null;

    if (!printByKey.has(printKey) && !printByCanonical.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: "promo",
        number,
        cardType: cardTypeFromCollectorNumber(number),
        family: parseNarutoCollector(number)?.family ?? null,
        grouping,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      printByCanonical.set(printKey, print);
      addedPrints.push(printKey);
    }

    const existing = titleByKey.get(printKey);
    if (!existing) {
      const title: NarutoTitleRow = {
        printKey,
        lang: "fr",
        fullName: row.name.trim(),
        rarity: "promo",
      };
      titles.push(title);
      titleByKey.set(printKey, title);
      titled.push(printKey);
    } else {
      if (!existing.fullName.trim() && row.name.trim()) {
        existing.fullName = row.name.trim();
        titled.push(printKey);
      }
      // Attested promo row → keep rarity honest even if checklist said « commune ».
      if (existing.rarity !== "promo") {
        existing.rarity = "promo";
        titled.push(printKey);
      }
    }
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  return { prints, titles, addedPrints, titled };
}

/**
 * Inject the 10 S1 FR manga prerelease variants as distinct printKeys
 * (`naruto:ni-0019-prerelease`, …) even without art yet.
 *
 * Source: `curated/sources/s1-fr-prerelease.json`.
 */


export type S1FrPrereleaseRow = {
  number: string;
  name: string;
  notes?: string;
};

type S1FrPrereleaseFile = {
  setCode?: string;
  grouping?: string;
  cards?: S1FrPrereleaseRow[];
};

const GROUPING = "prerelease";
/** Catalogue series of its own — not Série 1 retail, not `promo`. */
const SET_CODE = "prerelease";

export function s1FrPrereleasePath(): string {
  return path.join(narutoCuratedSourcesDir(), "s1-fr-prerelease.json");
}

export function loadS1FrPrerelease(
  filePath = s1FrPrereleasePath(),
): S1FrPrereleaseRow[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as S1FrPrereleaseFile;
    return (raw.cards ?? []).filter(
      (row) =>
        typeof row?.number === "string" &&
        row.number.trim() &&
        typeof row?.name === "string" &&
        row.name.trim(),
    );
  } catch {
    return [];
  }
}

/** `ni019` → `naruto:ni-0019-prerelease`. */
export function s1FrPrereleasePrintKey(number: string): string | null {
  const bare = number.trim().toLowerCase().replace(/-prerelease$/i, "");
  return mintNarutoPrintKey(`${bare}-${GROUPING}`, SET_CODE);
}

/**
 * Ensure every attested manga prerelease has a `prerelease` print + FR title.
 * Art can arrive later under `cards/ninja|…/{id}-prerelease/fr/`.
 */
export function mergeS1FrPrerelease(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards?: S1FrPrereleaseRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const cards = input.cards ?? loadS1FrPrerelease();
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const printByCanonical = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleByKey = new Map(
    titles
      .filter((t) => t.lang.toLowerCase() === "fr")
      .map((t) => [canonicalizeNarutoPrintKey(t.printKey), t]),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of cards) {
    const printKey = s1FrPrereleasePrintKey(row.number);
    if (!printKey) continue;
    const bare = row.number.trim().toLowerCase().replace(/-prerelease$/i, "");
    const disk =
      narutoDiskCardId(`${bare}-${GROUPING}`, SET_CODE) ??
      `${bare}-${GROUPING}`;
    const number = disk;
    const grouping =
      parseNarutoCollector(number)?.grouping?.toLowerCase() ?? GROUPING;

    const existingPrint =
      printByKey.get(printKey) ?? printByCanonical.get(printKey);
    if (existingPrint) {
      if (existingPrint.setCode !== SET_CODE) {
        existingPrint.setCode = SET_CODE;
      }
      if (existingPrint.grouping !== grouping) {
        existingPrint.grouping = grouping;
      }
    } else {
      const print: NarutoPrintRow = {
        printKey,
        setCode: SET_CODE,
        number,
        cardType: cardTypeFromCollectorNumber(bare),
        family: parseNarutoCollector(bare)?.family ?? null,
        grouping,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      printByCanonical.set(printKey, print);
      addedPrints.push(printKey);
    }

    const existing = titleByKey.get(printKey);
    if (!existing) {
      const title: NarutoTitleRow = {
        printKey,
        lang: "fr",
        fullName: row.name.trim(),
        rarity: GROUPING,
      };
      titles.push(title);
      titleByKey.set(printKey, title);
      titled.push(printKey);
    } else {
      if (!existing.fullName.trim() && row.name.trim()) {
        existing.fullName = row.name.trim();
        titled.push(printKey);
      }
      if (existing.rarity !== GROUPING) {
        existing.rarity = GROUPING;
        titled.push(printKey);
      }
      // Prefer the ledger name when it differs (e.g. TA-005 Kyubi).
      if (row.name.trim() && existing.fullName !== row.name.trim()) {
        existing.fullName = row.name.trim();
        titled.push(printKey);
      }
    }
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  return { prints, titles, addedPrints, titled };
}

/**
 * Install Coleka EN scans for Bandai USA CCG promotional cards (`_r38199`).
 *
 * Listing HTML comes from that branch only (not the 7000-card umbrella).
 * Faces are pulled from `thumbs.coleka.com`. Staging:
 * `data/naruto/carddass/staging/coleka-us-promos/`.
 */



export const NARUTO_STAGING_COLEKA_US_PROMOS = path.join(
  "staging",
  "coleka-us-promos",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;

export type ScrapeColekaUsPromosOptions = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  delayMs?: number;
  root?: string;
};

export function colekaUsPromoLedger() {
  return ledger;
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function colekaUsPromoLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_US_PROMOS,
    "cards.json",
  );
}

function isColekaUsPromoCard(row: unknown): row is ColekaUsPromoCard {
  if (!row || typeof row !== "object") return false;
  const card = row as ColekaUsPromoCard;
  return (
    typeof card.number === "string" &&
    typeof card.colekaRef === "string" &&
    typeof card.name === "string" &&
    typeof card.faceUrl === "string"
  );
}

function mergeColekaUsPromoCards(
  byNumber: Map<string, ColekaUsPromoCard>,
  cards: readonly ColekaUsPromoCard[],
): void {
  for (const card of cards) {
    if (!byNumber.has(card.number)) byNumber.set(card.number, card);
  }
}

/** Reparse cached listing HTML when `cards.json` is empty (Coleka verify shell). */
export function parseColekaUsPromoLedgerFromStaging(
  packDir?: string,
): ColekaUsPromoCard[] {
  const staging = path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_US_PROMOS,
  );
  const byNumber = new Map<string, ColekaUsPromoCard>();
  for (let pageIdx = 0; pageIdx < 3; pageIdx += 1) {
    const file = path.join(staging, `listing-${pageIdx}.html`);
    if (!existsSync(file)) continue;
    try {
      mergeColekaUsPromoCards(
        byNumber,
        parseColekaUsPromoListing(readFileSync(file, "utf8")),
      );
    } catch {
      /* ignore malformed cache */
    }
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

function readColekaUsPromoLedgerJson(
  packDir?: string,
): ColekaUsPromoCard[] {
  const file = colekaUsPromoLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter(isColekaUsPromoCard);
  } catch {
    return [];
  }
}

export function loadColekaUsPromoLedger(packDir?: string): ColekaUsPromoCard[] {
  const fromJson = readColekaUsPromoLedgerJson(packDir);
  if (fromJson.length > 0) return fromJson;
  const fromHtml = parseColekaUsPromoLedgerFromStaging(packDir);
  if (fromHtml.length > 0) syncColekaUsPromoLedger(packDir, fromHtml);
  return fromHtml;
}

function syncColekaUsPromoLedger(
  packDir: string | undefined,
  cards: readonly ColekaUsPromoCard[],
): void {
  const root = packDir ?? packRoot();
  mkdirSync(path.join(root, NARUTO_STAGING_COLEKA_US_PROMOS), {
    recursive: true,
  });
  writeFileSync(
    colekaUsPromoLedgerPath(root),
    `${JSON.stringify(
      {
        source: `${COLEKA_ORIGIN}${COLEKA_US_PROMO_LISTING_PATH}`,
        set: COLEKA_US_PROMO_SET,
        lang: COLEKA_US_PROMO_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function downloadBytes(
  url: string,
  minBytes: number,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${COLEKA_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    const ext = extFromMagic(buf);
    if (/\.webp(?:\?|$)/i.test(url) && ext !== ".webp") return null;
    return buf.byteLength >= minBytes ? buf : null;
  } catch {
    return null;
  }
}

function mergeByNumber(
  into: Map<string, ColekaUsPromoCard>,
  cards: ColekaUsPromoCard[],
): void {
  for (const card of cards) {
    if (!into.has(card.number)) into.set(card.number, card);
  }
}

function titleLangKey(printKey: string, lang: string): string {
  return printKey + "|" + lang.toLowerCase();
}

/**
 * Add promo prints + English titles from the Coleka `_r38199` ledger.
 * Does not invent FR names or overwrite French promo folders.
 */
export function mergeColekaUsPromosIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  root: string;
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const cards = loadColekaUsPromoLedger(input.root);
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const titleKeys = new Set(
    titles.map((t) => titleLangKey(t.printKey, t.lang)),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const card of cards) {
    const existing = prints.find((p) =>
      narutoNumbersEqual(p.number, card.number),
    );
    const printKey =
      existing?.printKey ??
      mintNarutoPrintKey(card.number, COLEKA_US_PROMO_SET);
    if (!printKey) continue;
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: COLEKA_US_PROMO_SET,
        number: narutoDiskCardId(card.number) ?? card.number,
        cardType: cardTypeFromCollectorNumber(card.number),
        family: "promo",
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const name = card.name?.trim();
    if (!name) continue;
    const key = titleLangKey(printKey, COLEKA_US_PROMO_LANG);
    if (titleKeys.has(key)) continue;
    titles.push({
      printKey,
      lang: COLEKA_US_PROMO_LANG,
      fullName: name,
    });
    titleKeys.add(key);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

export async function scrapeNarutoColekaUsPromoCards(
  options: ScrapeColekaUsPromosOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = path.join(root, NARUTO_STAGING_COLEKA_US_PROMOS);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log("── Coleka US promos → cards/promo/pr0nnn/en/");
  const byNumber = new Map<string, ColekaUsPromoCard>();
  let pageIdx = 0;
  let waited = false;
  for (const url of colekaUsPromoListingPageUrls()) {
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const html = await fetchColekaListingHtml(
      url,
      path.join(staging, `listing-${pageIdx}.html`),
      force,
    );
    pageIdx += 1;
    if (!html) {
      console.warn(
        `── Coleka US promos : listing page ${pageIdx} absente ou mur Coleka, on continue`,
      );
      continue;
    }
    mergeByNumber(byNumber, parseColekaUsPromoListing(html));
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (cards.length === 0) {
    cards = parseColekaUsPromoLedgerFromStaging(root);
  }
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  console.log(`── Coleka US promos listing : ${cards.length} singles`);

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${COLEKA_ORIGIN}${COLEKA_US_PROMO_LISTING_PATH}`,
        set: COLEKA_US_PROMO_SET,
        lang: COLEKA_US_PROMO_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (options.cdxOnly) return;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  waited = false;
  for (const card of cards) {
    const diskId = narutoDiskCardId(card.number) ?? card.number;
    const cardDir =
      narutoCardAbsDir(
        cardsDir,
        card.number,
        COLEKA_US_PROMO_LANG,
        COLEKA_US_PROMO_SET,
      ) ?? path.join(cardsDir, "promo", diskId, COLEKA_US_PROMO_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId,
          lang: COLEKA_US_PROMO_LANG,
          appearanceSet: COLEKA_US_PROMO_SET,
        },
      ]);
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const buf = await downloadBytes(card.faceUrl, 4_000);
    if (!buf) {
      fail += 1;
      console.log(`Coleka US promo ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`Coleka US promo ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_US_PROMO_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId,
        lang: COLEKA_US_PROMO_LANG,
        appearanceSet: COLEKA_US_PROMO_SET,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      colekaUsPromos: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
}



export type NarutoAttestedPair = {
  a: string;
  b: string;
  names?: string[];
  source?: string;
  note?: string;
};

type PairsFile = { pairs?: NarutoAttestedPair[] };

let cache: Map<string, string> | null = null;

function diskId(raw: string): string | null {
  return narutoDiskCardId(raw) ?? (raw.trim().toLowerCase() || null);
}

function loadPairs(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>();
  try {
    const file = JSON.parse(
      readFileSync(
        path.join(narutoCuratedSourcesDir(), "attested-pairs.json"),
        "utf8",
      ),
    ) as PairsFile;
    for (const row of file.pairs ?? []) {
      const a = diskId(row.a);
      const b = diskId(row.b);
      if (!a || !b || a === b) continue;
      map.set(a, b);
      map.set(b, a);
    }
  } catch {
    /* missing ledger */
  }
  cache = map;
  return map;
}

export function resetNarutoAttestedPairsCache(): void {
  cache = null;
}

/** Other disk id when a named source attested the pair; never inferred. */
export function narutoAttestedPairOf(raw: string): string | null {
  const id = diskId(raw);
  if (!id) return null;
  return loadPairs().get(id) ?? null;
}

export function narutoIsAttestedPair(a: string, b: string): boolean {
  const left = diskId(a);
  const right = diskId(b);
  if (!left || !right) return false;
  return loadPairs().get(left) === right;
}
