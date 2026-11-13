/**
 * Fusion World faces → `data/dragonball/fw/cards/{set}/{lang}/{card}/art.<source>.webp`.
 *
 * dbscards (`fw.dbscards.fr`) leads when the tile lists the print — larger scan,
 * front + back. Bandai's cardlist SAMPLE URL (already in `print_assets`) fills
 * the rest: Energy Markers and any print dbscards never indexed. No invented
 * URL — only the remote the scrape already stored.
 *
 * Two locales, each filed under its own folder because they are different
 * printings: `en` for the English one, `ja` for the Japanese one — read from
 * Bandai's `asia-en` catalogue so it reads "Son Goten" rather than 孫悟天.
 * There is no French; Bandai never published one.
 *
 * Sequential like every other pass here — this host bans by the hour when a
 * pass goes parallel.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir } from "@/lib/packPaths";
import {
  buildDbscardsIndex,
  lookupDbscardsEntry,
  type DbscardsIndex,
  type DbscardsIndexEntry,
} from "@/providers/shared/tcgcards/list";
import { dbscardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";
import {
  clearSoftbanState,
  isSoftbanStatus,
  recordSoftbanFailure,
  softbanRemainingMs,
} from "@/providers/shared/softban";
import { dataPackPath } from "@/providers/shared/catalogCorpus";
import { promoteResolvedFace } from "@/providers/shared/cardFaces";

import {
  dbsFwFaceFileOf,
  dbsFwFaceFilename,
  dbsFwFaceSourceOf,
  pickBestFwFace,
  recordFwFaceDecision,
  type DbsFwFaceRole,
  type DbsFwFaceSource,
  type DbsFwStoredFace,
} from "./faceChoice";
import {
  DBS_FW_PACK_ID,
  dbsFwCardFolder,
  loadDbsFwIndex,
  type DbsFwAssetRow,
} from "../indexStore";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/** Sixty, as for Masters: this host tarpits, and a short budget silently loses. */
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_FACE_BYTES = 2 * 1024 * 1024;
const MIN_WEBP_BYTES = 100;
const SOFTBAN_LEDGER = "faces";
const PROGRESS_EVERY_MS = 10_000;

/**
 * The locales this pack files faces under — one per *printing*.
 *
 * `ja` is the Japanese card whatever names it: dbscards lists it as `ja`,
 * Bandai serves its images from `/card/jp/` and its catalogue from four paths
 * at once. One printing, one folder, whichever source filled it — which is why
 * no name translation is needed here.
 */
export const DBS_FW_FACE_LANGS = ["en", "ja"] as const;

export type FetchDbsFwFacesOptions = {
  force?: boolean;
  langs?: readonly string[];
  /** Restrict to these set codes (e.g. `e` for Energy Markers). */
  setCodes?: readonly string[];
  limit?: number;
  delayMs?: number;
};

export type FetchDbsFwFacesResult = {
  ok: number;
  skip: number;
  miss: number;
  fail: number;
  throttled: number;
  total: number;
};

const indexCache = new Map<string, DbscardsIndex>();

/**
 * The crawled Fusion World list, or an empty index when it was never scraped.
 *
 * Absence is not an error — the pass simply has nothing to fetch and says so,
 * rather than inventing URLs. Fusion World has no slug-construction fallback
 * because it never had a faces pass to grow one.
 */
function fwIndex(lang: string): DbscardsIndex {
  const key = lang.toLowerCase();
  const cached = indexCache.get(key);
  if (cached) return cached;
  let index: DbscardsIndex;
  try {
    index = buildDbscardsIndex(
      JSON.parse(
        readFileSync(dbscardsIndexPath(DBS_FW_PACK_ID, key), "utf8"),
      ) as DbscardsIndexEntry[],
    );
  } catch {
    index = new Map();
  }
  indexCache.set(key, index);
  return index;
}

/** @internal test hook */
export function resetDbsFwIndexCache(): void {
  indexCache.clear();
}

/** Their listed URL for one side, when the tile carries it. */
export function fwListedUrl(
  entry: DbscardsIndexEntry,
  role: DbsFwFaceRole,
): string | null {
  return (role === "back" ? entry.imageBack : entry.imageFront) ?? null;
}

/**
 * Bandai SAMPLE URL already indexed on the cardlist scrape — never invented.
 * Key = `printKey\\0lang` (see {@link buildFwAssetUrlMap}).
 */
export function fwBandaiAssetUrl(
  assetsByKeyLang: ReadonlyMap<string, string>,
  printKey: string,
  lang: string,
): string | null {
  const raw =
    assetsByKeyLang.get(`${printKey}\0${lang.trim().toLowerCase()}`)?.trim() ||
    "";
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw;
}

export function buildFwAssetUrlMap(
  assets: readonly DbsFwAssetRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of assets) {
    const url = (asset.art ?? asset.imageUrl)?.trim();
    if (!url) continue;
    map.set(`${asset.printKey}\0${asset.lang.trim().toLowerCase()}`, url);
  }
  return map;
}

/** On-disk face for one source/role, any extension the host served. */
function storedFaceFile(
  cardDir: string,
  source: DbsFwFaceSource,
  role: DbsFwFaceRole = "art",
): string | null {
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return null;
  }
  for (const name of names) {
    const parsed = dbsFwFaceFileOf(name);
    if (parsed?.source === source && parsed.role === role) return name;
  }
  return null;
}

function hasArtOnDisk(cardDir: string): boolean {
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return false;
  }
  return names.some((name) => dbsFwFaceFileOf(name)?.role === "art");
}

function writeAtomic(destPath: string, buf: Buffer): void {
  mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, destPath);
}

type Download = { buf: Buffer | null; throttled: boolean };

async function downloadFace(url: string): Promise<Download> {
  let last: Download = { buf: null, throttled: false };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await httpGet<Buffer>(url, {
        headers: { "User-Agent": UA },
        responseType: "arraybuffer",
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_FACE_BYTES,
        noDedup: true,
      });
      const buf = res.data;
      // A body too small to be an image is an error page wearing a `.webp` name.
      if (!buf || buf.byteLength < MIN_WEBP_BYTES)
        return { buf: null, throttled: false };
      return { buf: Buffer.from(buf), throttled: false };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      last = { buf: null, throttled: isSoftbanStatus(status) };
      // Soft-ban: stop hammering. Other transient errors: retry.
      if (last.throttled || attempt >= 3) return last;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return last;
}

/**
 * Every face this card holds, whatever format its source served.
 *
 * The directory is scanned rather than probed name by name: a source is free to
 * answer in PNG or JPEG, and `art.bandai.png` is as much a face as
 * `art.dbscards.webp`.
 */
async function readStoredFaces(cardDir: string): Promise<DbsFwStoredFace[]> {
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return [];
  }
  const out: DbsFwStoredFace[] = [];
  for (const name of names) {
    const source = dbsFwFaceSourceOf(name);
    if (!source) continue;
    try {
      const meta = await sharp(path.join(cardDir, name)).metadata();
      out.push({
        source,
        file: name,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    } catch {
      /* unreadable file — not a candidate */
    }
  }
  return out;
}

/**
 * Rank what this card holds and record the winner.
 *
 * Run for every card the pass walks, downloaded or not, so a change of ranking
 * policy costs one pass and no re-download.
 */
export async function promoteBestFwFace(
  cardDir: string,
  lang = "en",
): Promise<DbsFwFaceSource | null> {
  const stored = await readStoredFaces(cardDir);
  const best = pickBestFwFace(stored, lang);
  if (!best) return null;
  // The file as stored, not a name rebuilt from the source: the extension is
  // whatever the source served.
  const winner = stored.find((face) => face.source === best);
  promoteResolvedFace({
    cardDir,
    filename: winner?.file ?? dbsFwFaceFilename(best),
  });
  return best;
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function fetchDbsFwFaces(
  opts: FetchDbsFwFacesOptions = {},
): Promise<FetchDbsFwFacesResult> {
  const empty: FetchDbsFwFacesResult = {
    ok: 0,
    skip: 0,
    miss: 0,
    fail: 0,
    throttled: 0,
    total: 0,
  };
  const loaded = loadDbsFwIndex();
  if (!loaded) {
    console.warn("── fw faces : pas de catalogue, rien à faire");
    return empty;
  }

  const cacheRoot = dataPackPath(DBS_FW_PACK_ID, "");
  const remaining = softbanRemainingMs(cacheRoot, Date.now(), SOFTBAN_LEDGER);
  if (remaining > 0) {
    console.warn(
      `── fw faces : refroidissement en cours, encore ${Math.ceil(remaining / 60000)} min`,
    );
    return empty;
  }

  const langs = (opts.langs?.length ? opts.langs : DBS_FW_FACE_LANGS).map((l) =>
    l.toLowerCase(),
  );
  const setFilter = new Set(
    (opts.setCodes ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const delayMs = opts.delayMs ?? 0;
  const stats = { ...empty };
  let throttledStreak = 0;
  const assetUrls = buildFwAssetUrlMap(loaded.assets);

  const noteThrottle = (host: string): boolean => {
    throttledStreak += 1;
    stats.throttled += 1;
    if (throttledStreak < 20) return false;
    recordSoftbanFailure(cacheRoot, {
      reason: `${host} a refusé 20 requêtes d'affilée`,
      name: SOFTBAN_LEDGER,
    });
    console.warn("── fw faces : hôte fermé, arrêt et refroidissement");
    return true;
  };

  for (const lang of langs) {
    const index = fwIndex(lang);
    if (index.size === 0) {
      console.warn(
        `── fw faces [${lang}] : liste dbscards absente — Bandai cardlist seulement`,
      );
    }
    const scoped = setFilter.size
      ? loaded.prints.filter((p) =>
          setFilter.has(p.setCode.trim().toLowerCase()),
        )
      : loaded.prints;
    const prints = opts.limit ? scoped.slice(0, opts.limit) : scoped;
    stats.total += prints.length;
    let done = 0;
    let lastProgressAt = Date.now();
    console.log(`── fw faces [${lang}] (${prints.length} tirages)`);

    for (const print of prints) {
      done += 1;
      const listed =
        index.size > 0
          ? lookupDbscardsEntry(
              index,
              `${print.setCode}-${print.number}`.toLowerCase(),
            )
          : undefined;
      const cardDir = packCardDir(DBS_FW_PACK_ID, {
        set: print.setCode,
        lang,
        card: dbsFwCardFolder(print),
      });

      let fetched = 0;
      if (listed) {
        for (const role of ["art", "back"] as const) {
          const url = fwListedUrl(listed, role);
          if (!url) continue;
          const dest = path.join(cardDir, dbsFwFaceFilename("dbscards", role));
          if (!opts.force && existsSync(dest)) continue;
          const { buf, throttled } = await downloadFace(url);
          if (throttled) {
            if (noteThrottle("fw.dbscards.fr")) return stats;
            continue;
          }
          throttledStreak = 0;
          if (!buf) continue;
          try {
            writeAtomic(dest, buf);
            fetched += 1;
            if (role === "back") {
              recordFwFaceDecision(
                cardDir,
                "back",
                dbsFwFaceFilename("dbscards", "back"),
              );
            }
          } catch {
            stats.fail += 1;
          }
          if (delayMs > 0) await sleep(delayMs);
        }
      }

      /*
        Gap-fill from the Bandai URL already in sqlite — Energy Markers and
        any print dbscards skipped. Skip when disk already has an art face
        (dbscards / prior Bandai / CardNexus) unless --force.
      */
      if (opts.force || !hasArtOnDisk(cardDir)) {
        const bandaiUrl = fwBandaiAssetUrl(assetUrls, print.printKey, lang);
        if (bandaiUrl) {
          const dest = path.join(cardDir, dbsFwFaceFilename("bandai", "art"));
          if (opts.force || !storedFaceFile(cardDir, "bandai", "art")) {
            const { buf, throttled } = await downloadFace(bandaiUrl);
            if (throttled) {
              if (noteThrottle("dbs-cardgame.com")) return stats;
            } else {
              throttledStreak = 0;
              if (buf) {
                try {
                  writeAtomic(dest, buf);
                  fetched += 1;
                } catch {
                  stats.fail += 1;
                }
              }
            }
            if (delayMs > 0) await sleep(delayMs);
          }
        }
      }

      try {
        const best = await promoteBestFwFace(cardDir, lang);
        if (!best) stats.miss += 1;
        else if (fetched > 0) stats.ok += 1;
        else stats.skip += 1;
      } catch {
        stats.fail += 1;
      }

      const now = Date.now();
      if (now - lastProgressAt >= PROGRESS_EVERY_MS || done === prints.length) {
        lastProgressAt = now;
        const pct = Math.round((done / prints.length) * 100);
        console.log(
          `   ${done}/${prints.length} (${pct}%) ok=${stats.ok} skip=${stats.skip} miss=${stats.miss} bridé=${stats.throttled}`,
        );
      }
    }
  }

  if (stats.throttled === 0) clearSoftbanState(cacheRoot, SOFTBAN_LEDGER);

  return stats;
}
