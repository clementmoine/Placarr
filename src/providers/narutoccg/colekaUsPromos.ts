/**
 * Install Coleka EN scans for Bandai USA CCG promotional cards (`_r38199`).
 *
 * Listing HTML comes from that branch only (not the 7000-card umbrella).
 * Faces are pulled from `thumbs.coleka.com`. Staging:
 * `data/naruto/carddass/staging/coleka-us-promos/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { fetchColekaListingHtml } from "./colekaListingFetch";
import {
  mintNarutoPrintKey,
  narutoDiskCardId,
  narutoNumbersEqual,
} from "./collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { NARUTO_PACK_ID } from "./packs";
import { upsertNarutoAppearances } from "./migrateCardLayout";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { COLEKA_ORIGIN } from "./parseColekaStorm3";
import {
  COLEKA_US_PROMO_LANG,
  COLEKA_US_PROMO_LISTING_PATH,
  COLEKA_US_PROMO_SET,
  colekaUsPromoListingPageUrls,
  parseColekaUsPromoListing,
  type ColekaUsPromoCard,
} from "./parseColekaUsPromos";
import ledger from "./curated/sources/coleka-us-promos.json";

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

export function loadColekaUsPromoLedger(packDir?: string): ColekaUsPromoCard[] {
  const file = colekaUsPromoLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is ColekaUsPromoCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as ColekaUsPromoCard;
      return (
        typeof card.number === "string" &&
        typeof card.colekaRef === "string" &&
        typeof card.name === "string" &&
        typeof card.faceUrl === "string"
      );
    });
  } catch {
    return [];
  }
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
