/**
 * Install Vintage Naruto / CCG Trader 750×1050 EN faces into
 * `cards/{family}/{n0001}/en/` as `art.vintage.*`. Keep Goat (and every
 * other dump) beside them — skip only if this source is already on disk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "./collectorIdentity";
import { bandaicgEnCardlistCards } from "./parseBandaicgCardlist";
import { narutoCardsCaHintBelongsOnDisk } from "./parseNarutoCardsCa";
import { NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import { upsertNarutoAppearances } from "./migrateCardLayout";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import {
  assignVintageNarutoDiskIds,
  parseVintageNarutoCcgBundle,
  VINTAGE_NARUTO_BROWSE_URL,
  VINTAGE_NARUTO_CCG_LANG,
  type VintageNarutoCcgCard,
  type VintageNarutoTitleHint,
} from "./parseVintageNarutoCcg";
import { loadGoatEnCcgLedger } from "./scrapeGoatEnCcg";
import { loadNarutoCardsCaLedger } from "./scrapeNarutoCardsCa";

export const NARUTO_STAGING_VINTAGE_NARUTO = path.join(
  "staging",
  "vintage-naruto-ccg",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 80;
const DEFAULT_CONCURRENCY = 6;
const MIN_BYTES = 8_000;

export type ScrapeVintageNarutoOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  root?: string;
  bundleJs?: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function vintageNarutoLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_VINTAGE_NARUTO,
    "cards.json",
  );
}

export function vintageNarutoTitleHints(
  packDir?: string,
): VintageNarutoTitleHint[] {
  const goat = loadGoatEnCcgLedger(packDir);
  const bandai = bandaicgEnCardlistCards();
  const attested = new Set<string>();
  for (const row of [...goat, ...bandai]) {
    attested.add((narutoDiskCardId(row.number) ?? row.number).toLowerCase());
  }
  const out: VintageNarutoTitleHint[] = [];
  for (const row of loadNarutoCardsCaLedger(packDir)) {
    if (!narutoCardsCaHintBelongsOnDisk(row, attested)) continue;
    out.push({ number: row.number, setCode: row.setCode, name: row.name });
  }
  for (const row of goat) {
    out.push({ number: row.number, setCode: row.setCode, name: row.name });
  }
  for (const row of bandai) {
    out.push({ number: row.number, setCode: row.setCode, name: row.name });
  }
  return out;
}

async function fetchText(
  url: string,
  referer?: string,
): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(referer ? { Referer: referer } : {}),
      },
      responseType: "text",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 200 ? html : null;
  } catch {
    return null;
  }
}

export function vintageNarutoBundleSrc(html: string): string | null {
  const hit = /src="(\/assets\/index-[^"]+\.js)"/.exec(html);
  return hit ? `https://vintagenaruto.com${hit[1]}` : null;
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://vintagenaruto.com/",
        Origin: "https://vintagenaruto.com",
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
    Array.from({ length: Math.min(n, items.length || 1) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

function writeLedger(dest: string, cards: VintageNarutoCcgCard[]): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: "vintagenaruto.com + api.ccgtrader.co.uk",
        generatedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
}

async function installFaces(
  cards: readonly VintageNarutoCcgCard[],
  opts: ScrapeVintageNarutoOptions,
): Promise<{
  downloaded: number;
  skipped: number;
  failed: number;
  unmapped: number;
}> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const mapped = cards.filter((c) => c.number && c.faceUrl);
  const work =
    opts.limit && opts.limit > 0 ? mapped.slice(0, opts.limit) : mapped;

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  await mapPool(work, concurrency, async (card) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number!, VINTAGE_NARUTO_CCG_LANG) ??
      path.join(cardsDir, "ninja", card.number!, VINTAGE_NARUTO_CCG_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "vintage")) {
      skipped += 1;
      appearances.push({
        diskId: card.number!,
        lang: VINTAGE_NARUTO_CCG_LANG,
        appearanceSet: card.setCode,
      });
      return;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await downloadBytes(card.faceUrl);
    if (!buf) {
      failed += 1;
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "vintage",
      lang: VINTAGE_NARUTO_CCG_LANG,
      force,
    });
    appearances.push({
      diskId: card.number!,
      lang: VINTAGE_NARUTO_CCG_LANG,
      appearanceSet: card.setCode,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
  });

  if (appearances.length) upsertNarutoAppearances(root, appearances);
  return {
    downloaded,
    skipped,
    failed,
    unmapped: cards.length - mapped.length,
  };
}

export async function scrapeVintageNarutoCcgFaces(
  opts: ScrapeVintageNarutoOptions = {},
): Promise<{ written: number; downloaded: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = vintageNarutoLedgerPath(packDir);
  let js = opts.bundleJs ?? null;
  if (!js && existsSync(dest) && opts.force !== true) {
    try {
      const raw = JSON.parse(readFileSync(dest, "utf8")) as {
        cards?: VintageNarutoCcgCard[];
      };
      if (Array.isArray(raw.cards) && raw.cards.length > 100) {
        const faces = await installFaces(raw.cards, opts);
        console.log(JSON.stringify({ vintageNarutoFaces: true, ...faces }));
        return { written: raw.cards.length, downloaded: faces.downloaded };
      }
    } catch {
      /* scrape fresh */
    }
  }
  if (!js) {
    const html = await fetchText(VINTAGE_NARUTO_BROWSE_URL);
    const src = html ? vintageNarutoBundleSrc(html) : null;
    js = src ? await fetchText(src, VINTAGE_NARUTO_BROWSE_URL) : null;
  }
  if (!js) {
    throw new Error("Vintage Naruto bundle introuvable");
  }
  const parsed = parseVintageNarutoCcgBundle(js);
  const cards = assignVintageNarutoDiskIds(
    parsed,
    vintageNarutoTitleHints(packDir),
  );
  writeLedger(dest, cards);
  console.log(
    `── vintage EN faces : ${cards.length} listées, ${cards.filter((c) => c.number).length} mappées`,
  );
  const faces = await installFaces(cards, opts);
  console.log(JSON.stringify({ vintageNarutoFaces: true, ...faces }));
  return { written: cards.length, downloaded: faces.downloaded };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeVintageNarutoCcgFaces().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
