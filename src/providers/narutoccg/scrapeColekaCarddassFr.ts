/**
 * Install Coleka FR Carddass S1–S5 scans as `art.coleka.*` next to
 * `art.carddass`. Listing HTML from series leaves `_r4108`…`_r4112` only
 * (not parent `_r41705`, not umbrella `_r4102`). Faces from
 * `thumbs.coleka.com`.
 *
 * Staging: `data/naruto/carddass/staging/coleka-carddass-fr/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { fetchColekaListingHtml } from "./colekaListingFetch";
import { NARUTO_PACK_ID } from "./indexStore";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import {
  COLEKA_CARDDASS_FR_LANG,
  COLEKA_CARDDASS_FR_SERIES,
  colekaCarddassFrListingPageUrls,
  colekaCarddassFrParentUrl,
  parseColekaCarddassFrListing,
  type ColekaCarddassFrCard,
} from "./parseColekaCarddassFr";
import { COLEKA_ORIGIN } from "./parseColekaStorm3";

export const NARUTO_STAGING_COLEKA_CARDDASS_FR = path.join(
  "staging",
  "coleka-carddass-fr",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;

export type ScrapeColekaCarddassFrOptions = {
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
  return path.join(packDir, NARUTO_STAGING_COLEKA_CARDDASS_FR);
}

export function colekaCarddassFrLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_CARDDASS_FR,
    "cards.json",
  );
}

export function loadColekaCarddassFrLedger(
  packDir?: string,
): ColekaCarddassFrCard[] {
  const file = colekaCarddassFrLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is ColekaCarddassFrCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as ColekaCarddassFrCard;
      return (
        typeof card.number === "string" &&
        typeof card.colekaRef === "string" &&
        typeof card.set === "string" &&
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
  into: Map<string, ColekaCarddassFrCard>,
  cards: ColekaCarddassFrCard[],
): void {
  for (const card of cards) {
    if (!into.has(card.number)) into.set(card.number, card);
  }
}

export async function scrapeNarutoColekaCarddassFrCards(
  options: ScrapeColekaCarddassFrOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log("── Coleka FR Carddass S1–S5 → art.coleka");
  const byNumber = new Map<string, ColekaCarddassFrCard>();
  let waited = false;

  for (const series of COLEKA_CARDDASS_FR_SERIES) {
    let pageIdx = 0;
    for (const url of colekaCarddassFrListingPageUrls(
      series.path,
      series.listedCount,
    )) {
      if (delayMs > 0) {
        if (waited) await sleep(delayMs);
        else waited = true;
      }
      const html = await fetchColekaListingHtml(
        url,
        path.join(staging, `${series.set}-listing-${pageIdx}.html`),
        force,
      );
      pageIdx += 1;
      if (!html) {
        console.warn(
          `── Coleka FR ${series.set} : page ${pageIdx} absente ou mur, on continue`,
        );
        continue;
      }
      const parsed = parseColekaCarddassFrListing(html, series.set);
      if (parsed.length === 0) break;
      mergeByNumber(byNumber, parsed);
    }
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  const named = cards.filter((c) => c.name).length;
  const withFace = cards.filter((c) => c.faceUrl).length;
  console.log(
    `── Coleka FR listing : ${cards.length} singles (${named} nommées, ${withFace} photos)`,
  );

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: colekaCarddassFrParentUrl(),
        lang: COLEKA_CARDDASS_FR_LANG,
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
    const cardDir = narutoCardAbsDir(
      cardsDir,
      card.number,
      COLEKA_CARDDASS_FR_LANG,
    );
    if (!cardDir) {
      fail += 1;
      continue;
    }
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const buf = await downloadBytes(card.faceUrl, 8_000);
    if (!buf) {
      fail += 1;
      console.log(`Coleka FR ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`Coleka FR ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_CARDDASS_FR_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      colekaCarddassFr: true,
      listed: cards.length,
      named,
      downloaded: ok,
      skipped: skip,
      failed: fail,
      noFace,
    }),
  );
}
