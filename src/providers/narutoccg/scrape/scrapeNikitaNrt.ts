/**
 * Install nikita.jp JP Carddass scans into `cards/{family}/{ni0001}/ja/`.
 *
 * N/J/S/I are 忍/術/作/依 — never EN CCG `n/j`. Staging ledger only besides
 * the catalogue JPEGs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import { narutoCardAbsDir } from "../narutoCardDisk";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import {
  NIKITA_NRT_IMG_PATH,
  NIKITA_NRT_LANG,
  NIKITA_NRT_ORIGIN,
  nikitaNrtFaceUrl,
  parseNikitaNrtImgList,
  type NikitaNrtCard,
} from "../parse/parseNikitaNrt";

export const NARUTO_STAGING_NIKITA_NRT = path.join("staging", "nikita-nrt");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 120;
const DEFAULT_CONCURRENCY = 4;
const MIN_BYTES = 4_000;

export type ScrapeNikitaNrtOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  root?: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function nikitaNrtLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NIKITA_NRT,
    "cards.json",
  );
}

export function loadNikitaNrtLedger(packDir?: string): NikitaNrtCard[] {
  const file = nikitaNrtLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is NikitaNrtCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as NikitaNrtCard;
      return (
        typeof card.number === "string" && typeof card.imagePath === "string"
      );
    });
  } catch {
    return [];
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Accept-Language": "ja,en;q=0.8",
        Referer: `${NIKITA_NRT_ORIGIN}/explist/nrt/`,
      },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (html.length < 400) {
      console.warn(
        `── JA nikita : listing trop courte (${html.length} o, http ${res.status})`,
      );
      return null;
    }
    return html;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA nikita : listing HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        Referer: `${NIKITA_NRT_ORIGIN}${NIKITA_NRT_IMG_PATH}`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const n = Math.max(1, concurrency);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

export async function scrapeNikitaNrtCards(
  opts: ScrapeNikitaNrtOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_NIKITA_NRT);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  console.log("── JA nikita.jp Carddass → cards/{family}/{id}/ja/");
  const html = await fetchHtml(`${NIKITA_NRT_ORIGIN}${NIKITA_NRT_IMG_PATH}`);
  if (!html) {
    console.warn("── JA nikita : listing absente, on s'arrête là");
    return { listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  writeFileSync(path.join(staging, "listing-img.html"), html, "utf8");

  let cards = parseNikitaNrtImgList(html);
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${NIKITA_NRT_ORIGIN}${NIKITA_NRT_IMG_PATH}`,
        lang: NIKITA_NRT_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── JA nikita listing : ${cards.length} faces`);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  await mapPool(cards, concurrency, async (card) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, NIKITA_NRT_LANG) ??
      path.join(cardsDir, "ninja", card.number, NIKITA_NRT_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "nikita")) {
      skip += 1;
      if (card.setCode) {
        appearances.push({
          diskId: card.number,
          lang: NIKITA_NRT_LANG,
          appearanceSet: card.setCode,
        });
      }
      return;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await downloadBytes(nikitaNrtFaceUrl(card.imagePath));
    if (!buf) {
      fail += 1;
      console.log(`JA nikita ${card.number} FAIL`);
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "nikita",
      lang: NIKITA_NRT_LANG,
      force,
    });
    if (card.setCode) {
      appearances.push({
        diskId: card.number,
        lang: NIKITA_NRT_LANG,
        appearanceSet: card.setCode,
      });
    }
    if (saved === "skip") skip += 1;
    else ok += 1;
  });

  if (appearances.length) upsertNarutoAppearances(root, appearances);
  console.log(
    JSON.stringify({
      nikitaNrt: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: cards.length, downloaded: ok, skipped: skip, failed: fail };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeNikitaNrtCards().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
