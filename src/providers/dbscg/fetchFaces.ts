/**
 * Card faces → `data/dbs/cg/cards/{set}/fr/{card}/art.webp`.
 *
 * dbscards.fr first, at 400x560. Everything behind it serves Bandai's own
 * 260x363 — the official `cardimg/`, the Deckplanet mirror, and the Fandom
 * wiki alike (see `dbscardsFaces`), so the fallbacks are for coverage, not
 * quality.
 *
 * Deckplanet hosts are the Linode bucket used by
 * https://github.com/vitorjcorreia/Dragon-Ball-Masters-Arena and that repo’s
 * GitHub Pages copy. Bandai SAMPLE URLs stay in sqlite as `artUrl`. Leader
 * `_b.webp` is not the pack sleeve — skip it.
 */
import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir } from "@/lib/packPaths";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import { dbscardsFaceUrls } from "./dbscardsFaces";
import { DBS_CG_CARDLIST_ORIGIN } from "./parseCardlist";
import {
  DBS_CG_FACE_LANGS,
  DBS_CG_PACK_ID,
  dbsCgCardFolder,
  exportDbsCgCardsIndexJson,
  loadDbsCgIndex,
} from "./indexStore";
import { formatDbsCollectorNumber } from "./printIdentity";

export const DBS_MASTERS_DECKPLANET_BASE =
  "https://multi-deckplanet.us-southeast-1.linodeobjects.com/dbs_masters";
export const DBS_MASTERS_GITHUB_PAGES_BASE =
  "https://vitorjcorreia.github.io/Dragon-Ball-Masters-Arena/assets";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_FACE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 2;
/*
  Gentle on purpose. A pass at 6/40ms over 14k requests got dbscards to answer
  403 to everything, and the run still reported success — just with half the
  catalogue silently downgraded.
*/
const DEFAULT_DELAY_MS = 250;
const MIN_WEBP_BYTES = 100;

export type FetchDbsCgFacesOptions = {
  force?: boolean;
  /** Locales to sync. Each is filed under its own `cards/<set>/<lang>/`. */
  langs?: readonly string[];
  /** First N prints (debug). */
  limit?: number;
  delayMs?: number;
  concurrency?: number;
};

export type FetchDbsCgFacesResult = {
  ok: number;
  skip: number;
  miss: number;
  fail: number;
  /** Prints whose best source refused us — they got a worse face, not none. */
  throttled: number;
  total: number;
};

/**
 * Deckplanet mirrors the **English** printings only — verified on the pixels:
 * `BT22-004` there reads "Gamma 1 & Gamma 2, Arrival of Heroes" and its footer
 * is stamped `EN`, at every resolution it serves. So these are candidates for
 * an English print and for nothing else; using them to fill a French one put
 * English faces on a French shelf.
 */
export function dbsMastersFaceUrls(
  setCode: string,
  collector: string,
): string[] {
  const setDir = setCode.trim().toUpperCase();
  const id = collector.trim().toUpperCase();
  return [
    `${DBS_MASTERS_DECKPLANET_BASE}/${id}.webp`,
    `${DBS_MASTERS_GITHUB_PAGES_BASE}/${setDir}/${id}.webp`,
  ];
}

/** Bandai's own face for a locale — 260x363, but unmistakably that locale. */
export function bandaiFaceUrl(collector: string, lang: string): string {
  const region = lang.toLowerCase() === "en" ? "en" : "europe-fr";
  return `${DBS_CG_CARDLIST_ORIGIN}/${region}/images/cartes/cardimg/${collector.trim().toUpperCase()}.png`;
}

/**
 * Every face worth trying for one print, in the order they should win.
 *
 * The rule is the locale, not the pixel count: a print is shown in the
 * language it was printed in. dbscards leads because it is that locale at
 * 400x560; Bandai's own 260x363 follows, still that locale. Deckplanet's
 * 860x1205 is only reachable for English prints — it is worth a lot of pixels
 * and none of them are in French.
 */
export function dbsCgFaceUrls(input: {
  setCode: string;
  number: string;
  collector: string;
  lang: string;
  rarity?: string | null;
  fullName?: string | null;
  awakenedName?: string | null;
}): string[] {
  const lang = input.lang.toLowerCase();
  const urls: string[] = [];
  if (input.fullName) {
    urls.push(
      ...dbscardsFaceUrls({
        setCode: input.setCode,
        number: input.number,
        lang,
        rarity: input.rarity,
        fullName: input.fullName,
        awakenedName: input.awakenedName,
      }),
    );
  }
  urls.push(bandaiFaceUrl(input.collector, lang));
  if (lang === "en")
    urls.push(...dbsMastersFaceUrls(input.setCode, input.collector));
  return urls;
}

export function isWebpBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await worker(items[idx]!);
        if (delayMs > 0) await sleep(delayMs);
      }
    },
  );
  await Promise.all(runners);
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from(String(data));
}

export function isPngBuffer(buf: Buffer): boolean {
  return buf.length >= 8 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a";
}

/**
 * Bandai serves PNG where the pack stores WebP. Re-encoding rather than
 * refusing it is what lets a locale's own face be used at all: it is the only
 * source that covers a printing in its language when dbscards does not.
 */
async function toWebp(buf: Buffer): Promise<Buffer | null> {
  if (isWebpBuffer(buf)) return buf;
  if (!isPngBuffer(buf)) return null;
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(buf).webp({ quality: 92 }).toBuffer();
  } catch {
    return null;
  }
}

/**
 * A refusal that means "slow down", not "no such file".
 *
 * Treating the two alike is what made a throttle invisible: a bulk pass got
 * 403s from dbscards, silently fell through to Bandai's 260x363 and reported
 * a clean run, so half the catalogue ended up at the smaller size with nothing
 * in the log to say why.
 */
function isThrottleStatus(status: number | undefined): boolean {
  return status === 403 || status === 429 || status === 503;
}

export type FaceDownload = { buf: Buffer | null; throttled: boolean };

async function downloadFace(urls: readonly string[]): Promise<FaceDownload> {
  let throttled = false;
  for (const url of urls) {
    try {
      const response = await httpGet<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_FACE_BYTES,
        noDedup: true,
        headers: {
          "User-Agent": UA,
          Accept: "image/webp,image/*,*/*;q=0.8",
        },
        validateStatus: (status) => status === 200,
      });
      const raw = toBuffer(response.data);
      if (raw.byteLength < MIN_WEBP_BYTES) continue;
      const webp = await toWebp(raw);
      if (webp) return { buf: webp, throttled };
    } catch (error) {
      const status = (error as { response?: { status?: number } } | undefined)
        ?.response?.status;
      if (isThrottleStatus(status)) throttled = true;
      /* next host */
    }
  }
  return { buf: null, throttled };
}

function writeAtomic(destPath: string, buf: Buffer): void {
  mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, destPath);
}

export async function fetchDbsCgFaces(
  opts: FetchDbsCgFacesOptions = {},
): Promise<FetchDbsCgFacesResult> {
  const loaded = loadDbsCgIndex();
  const empty: FetchDbsCgFacesResult = {
    ok: 0,
    skip: 0,
    miss: 0,
    fail: 0,
    throttled: 0,
    total: 0,
  };
  if (!loaded) {
    console.warn("── faces : pas de catalog.sqlite — scrape d’abord");
    return empty;
  }

  /*
    The slug needs the printed name and rarity, which live on the title row,
    not the print. FR only: that is the corpus this pack ships and the only
    locale whose slug we can build.
  */
  const titleByPrintKey = new Map(
    loaded.titles
      .filter((title) => title.lang === "fr")
      .map((title) => [title.printKey, title]),
  );

  let prints = loaded.prints;
  if (opts.limit && opts.limit > 0) {
    prints = prints.slice(0, opts.limit);
  }

  const langs = opts.langs?.length ? opts.langs : DBS_CG_FACE_LANGS;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const force = opts.force === true;
  console.log(
    `── faces [${langs.join(",")}] (${prints.length} tirages) concurrency=${concurrency} delayMs=${delayMs}${force ? " force" : ""}`,
  );

  const stats: FetchDbsCgFacesResult = {
    ok: 0,
    skip: 0,
    miss: 0,
    fail: 0,
    throttled: 0,
    total: prints.length,
  };

  const jobs = langs.flatMap((lang) =>
    prints.map((print) => ({ print, lang })),
  );
  stats.total = jobs.length;

  await runPool(jobs, concurrency, delayMs, async ({ print, lang }) => {
    const dest = path.join(
      packCardDir(DBS_CG_PACK_ID, {
        set: print.setCode,
        lang,
        card: dbsCgCardFolder(print),
      }),
      "art.webp",
    );
    if (!force && existsSync(dest)) {
      stats.skip += 1;
      return;
    }
    const collector = formatDbsCollectorNumber(
      print.setCode,
      print.number,
      print.grouping,
    );
    const title = titleByPrintKey.get(print.printKey);
    const { buf, throttled } = await downloadFace(
      dbsCgFaceUrls({
        setCode: print.setCode,
        number: print.number,
        collector,
        lang,
        rarity: title?.rarity,
        fullName: title?.fullName,
        awakenedName: title?.awakenedName,
      }),
    );
    if (throttled) stats.throttled += 1;
    if (!buf) {
      stats.miss += 1;
      return;
    }
    try {
      writeAtomic(dest, buf);
      stats.ok += 1;
    } catch {
      stats.fail += 1;
    }
  });

  const indexPath = dataPackPath(DBS_CG_PACK_ID, "cards-index.json");
  exportDbsCgCardsIndexJson(
    loaded.prints,
    loaded.titles,
    loaded.assets,
    indexPath,
  );
  console.log(
    `── faces ok=${stats.ok} skip=${stats.skip} miss=${stats.miss} fail=${stats.fail} → ${indexPath}`,
  );
  if (stats.throttled > 0) {
    console.warn(
      `── ATTENTION : ${stats.throttled} tirages ont reçu une face de repli parce que la source préférée nous a bridés (403/429).`,
    );
    console.warn(
      "   Relancer plus tard avec --force et une concurrence plus basse : ces cartes sont en basse définition, pas absentes.",
    );
  }
  return stats;
}
