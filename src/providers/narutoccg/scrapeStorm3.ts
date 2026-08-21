/**
 * Install Bandai USA CCG Series 28 (Ultimate Ninja Storm 3) into the Naruto
 * pack: `cards/s28/en/{n1621}/art.stop2shop.*`.
 *
 * Staging: `data/naruto/carddass/staging/stop2shop-uns3/` (listing + product HTML +
 * ledger). Shop host is not the TCG Cards tarpit — still sequential.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_EN_PACK_ID, NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import { upsertNarutoAppearances } from "./migrateCardLayout";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import {
  parseStorm3Listing,
  parseStorm3ProductFaceUrl,
  STORM3_LANG,
  STORM3_LISTING_PATH,
  STORM3_SET,
  type Storm3Card,
} from "./parseStorm3Shop";

const ORIGIN = "https://stop2shop.com";
export const NARUTO_STAGING_STORM3 = path.join("staging", "stop2shop-uns3");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;

export type ScrapeStorm3Options = {
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
  return path.join(packDir, NARUTO_STAGING_STORM3);
}

/**
 * Ledger path. `packDir` is the pack root (`…/naruto/carddass`), the same value
 * `scrapeCards` already resolved — do not wrap it in `naruto/carddass` again.
 */
export function storm3LedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_STORM3, "cards.json");
}

export function loadStorm3Ledger(packDir?: string): Storm3Card[] {
  const files = packDir
    ? [storm3LedgerPath(packDir)]
    : [
        storm3LedgerPath(path.join(dataRoot(), NARUTO_PACK_ID)),
        storm3LedgerPath(path.join(dataRoot(), NARUTO_EN_PACK_ID)),
      ];
  for (const file of files) {
    const cards = readStorm3LedgerFile(file);
    if (cards.length) return cards;
  }
  return [];
}

function readStorm3LedgerFile(file: string): Storm3Card[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter(
      (row): row is Storm3Card =>
        !!row &&
        typeof row === "object" &&
        typeof (row as Storm3Card).number === "string" &&
        typeof (row as Storm3Card).name === "string",
    );
  } catch {
    return [];
  }
}

async function fetchHtml(
  url: string,
  dest: string,
  force: boolean,
): Promise<string | null> {
  if (!force && existsSync(dest) && readFileSync(dest, "utf8").length > 400) {
    return readFileSync(dest, "utf8");
  }
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (html.length < 400) return null;
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, html, "utf8");
    return html;
  } catch {
    return null;
  }
}

async function downloadFace(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeNarutoStorm3Cards(
  options: ScrapeStorm3Options = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log(
    "── Storm 3 (CCG Bandai USA s28) stop2shop → cards/ninja|jutsu|mission/{n|j|m}####/en/",
  );
  const listingHtml = await fetchHtml(
    `${ORIGIN}${STORM3_LISTING_PATH}`,
    path.join(staging, "listing.html"),
    force,
  );
  if (!listingHtml) {
    console.warn("── Storm 3 : listing absent, on continue");
    return;
  }
  let cards = parseStorm3Listing(listingHtml);
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  console.log(`── Storm 3 listing : ${cards.length} singles`);

  mkdirSync(path.join(staging, "pages"), { recursive: true });
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${ORIGIN}${STORM3_LISTING_PATH}`,
        set: STORM3_SET,
        lang: STORM3_LANG,
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
  let waited = false;
  for (const card of cards) {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, STORM3_LANG) ??
      path.join(cardsDir, STORM3_SET, STORM3_LANG, card.number);
    if (!force && existingNarutoArtForSource(cardDir, "stop2shop")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId: card.number,
          lang: STORM3_LANG,
          appearanceSet: STORM3_SET,
        },
      ]);
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const pageHtml = await fetchHtml(
      `${ORIGIN}${card.productPath}`,
      path.join(staging, "pages", `${card.number}.html`),
      force,
    );
    const faceUrl = pageHtml ? parseStorm3ProductFaceUrl(pageHtml) : null;
    if (!faceUrl) {
      fail += 1;
      console.log(`Storm 3 ${card.number} FAIL (pas de scan)`);
      continue;
    }
    const buf = await downloadFace(faceUrl);
    if (!buf) {
      fail += 1;
      console.log(`Storm 3 ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`Storm 3 ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "stop2shop",
      lang: STORM3_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId: card.number,
        lang: STORM3_LANG,
        appearanceSet: STORM3_SET,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      storm3: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
}
