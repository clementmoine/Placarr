/**
 * Install Italian CACG Series 6 (Rivalità Eterna) into `cards/s6/it/`.
 *
 * Listing: Coleka `_r41388` only. Faces from `thumbs.coleka.com` (not the
 * HTML verify wall). Nameless / photoless rows stay in the ledger so the
 * index can list them honestly. FR pre-prod under `cards/s6/fr/` is untouched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { fetchColekaListingHtml } from "./colekaListingFetch";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { NARUTO_PACK_ID } from "./indexStore";
import {
  mintNarutoPrintKey,
  narutoDiskCardId,
  narutoNumbersEqual,
} from "./collectorIdentity";
import { upsertNarutoAppearances } from "./migrateCardLayout";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import {
  COLEKA_S6_IT_LANG,
  COLEKA_S6_IT_LISTING_PATH,
  COLEKA_S6_IT_SET,
  colekaS6ItListingPageUrls,
  parseColekaS6ItListing,
  type ColekaS6ItCard,
} from "./parseColekaS6It";
import { COLEKA_ORIGIN } from "./parseColekaStorm3";

export const NARUTO_STAGING_COLEKA_S6_IT = path.join("staging", "coleka-s6-it");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;

export type ScrapeColekaS6ItOptions = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  delayMs?: number;
  root?: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingDir(packDir: string): string {
  return path.join(packDir, NARUTO_STAGING_COLEKA_S6_IT);
}

export function colekaS6ItLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_S6_IT,
    "cards.json",
  );
}

export function loadColekaS6ItLedger(packDir?: string): ColekaS6ItCard[] {
  const file = colekaS6ItLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is ColekaS6ItCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as ColekaS6ItCard;
      return (
        typeof card.number === "string" &&
        typeof card.colekaRef === "string" &&
        (card.name === null || typeof card.name === "string")
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
  into: Map<string, ColekaS6ItCard>,
  cards: ColekaS6ItCard[],
): void {
  for (const card of cards) {
    if (!into.has(card.number)) into.set(card.number, card);
  }
}

/**
 * Add s6 prints + Italian titles from the Coleka ledger.
 * Does not invent FR names or overwrite `cards/s6/fr/`.
 */
export function mergeColekaS6ItIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  root: string;
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const cards = loadColekaS6ItLedger(input.root);
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const titleKeys = new Set(
    titles.map((t) => `${t.printKey}\0${t.lang.toLowerCase()}`),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const card of cards) {
    const existing = prints.find((p) =>
      narutoNumbersEqual(p.number, card.number),
    );
    const printKey = existing?.printKey ?? mintNarutoPrintKey(card.number);
    if (!printKey) continue;
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: COLEKA_S6_IT_SET,
        number: narutoDiskCardId(card.number) ?? card.number,
        cardType: cardTypeFromCollectorNumber(card.number),
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    if (!card.name) continue;
    const key = `${printKey}\0${COLEKA_S6_IT_LANG}`;
    if (titleKeys.has(key)) continue;
    titles.push({
      printKey,
      lang: COLEKA_S6_IT_LANG,
      fullName: card.name,
      rarity: null,
    });
    titleKeys.add(key);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

export async function scrapeNarutoColekaS6ItCards(
  options: ScrapeColekaS6ItOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log("── S6 IT (Coleka Rivalità Eterna) → cards/s6/it/");
  const byNumber = new Map<string, ColekaS6ItCard>();
  let pageIdx = 0;
  let waited = false;
  for (const url of colekaS6ItListingPageUrls()) {
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
        `── S6 IT : listing page ${pageIdx} absente ou mur Coleka, on continue`,
      );
      continue;
    }
    mergeByNumber(byNumber, parseColekaS6ItListing(html));
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  const named = cards.filter((c) => c.name).length;
  const withFace = cards.filter((c) => c.faceUrl).length;
  console.log(
    `── S6 IT listing : ${cards.length} singles (${named} nommées, ${withFace} photos)`,
  );

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${COLEKA_ORIGIN}${COLEKA_S6_IT_LISTING_PATH}`,
        set: COLEKA_S6_IT_SET,
        lang: COLEKA_S6_IT_LANG,
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
  let noFace = 0;
  waited = false;
  for (const card of cards) {
    if (!card.faceUrl) {
      noFace += 1;
      continue;
    }
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, COLEKA_S6_IT_LANG) ??
      path.join(cardsDir, COLEKA_S6_IT_SET, COLEKA_S6_IT_LANG, card.number);
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId: narutoDiskCardId(card.number) ?? card.number,
          lang: COLEKA_S6_IT_LANG,
          appearanceSet: COLEKA_S6_IT_SET,
        },
      ]);
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const buf = await downloadBytes(card.faceUrl, 8_000);
    if (!buf) {
      fail += 1;
      console.log(`S6 IT ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`S6 IT ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_S6_IT_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId: narutoDiskCardId(card.number) ?? card.number,
        lang: COLEKA_S6_IT_LANG,
        appearanceSet: COLEKA_S6_IT_SET,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      colekaS6It: true,
      listed: cards.length,
      named,
      downloaded: ok,
      skipped: skip,
      failed: fail,
      noFace,
    }),
  );
}
