/**
 * Card faces → `data/dbs/cg/cards/{set}/{lang}/{card}/art.webp`.
 *
 * One face per printing *in its own language*, filed per locale. dbscards
 * leads at 400x560, Bandai's own 260x363 stands in. English Deckplanet faces
 * are cloned from TCG Arena (`installArena`) then ranked here; HTTP is only
 * a gap-filler. Bandai SAMPLE URLs stay in sqlite as `artUrl`. Leader
 * `_b.webp` is not the pack sleeve.
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

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir } from "@/lib/packPaths";
import { foilPackDataDir } from "@/lib/runtimeData";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import {
  clearSoftbanState,
  isSoftbanStatus,
  softbanRemainingMs,
  writeSoftbanState,
} from "@/providers/shared/softban";

import {
  loadAttemptOrder,
  rankAttempts,
  recordAttempt,
  saveAttemptOrder,
  type AttemptOrderLedger,
} from "@/providers/shared/attemptOrder";

import {
  dbscardsFaceUrls,
  dbscardsPoolOf,
  dbscardsRarityCode,
} from "./dbscardsFaces";
import {
  buildDbscardsIndex,
  dbscardsFrontFromBack,
  dbscardsIsBackImage,
  lookupDbscardsEntry,
  type DbscardsIndex,
  type DbscardsIndexEntry,
} from "./dbscardsIndex";
import { dbscardsIndexPath } from "./scrapeDbscardsIndex";
import {
  dbsFaceFilename,
  dbsFaceSourceOf,
  pickBestFace,
  recordFaceDecision,
  type DbsFaceRole,
  type DbsFaceSource,
  type StoredFace,
} from "./faceChoice";
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
/*
  Sixty, not twenty. dbscards tarpits intermittently — measured at 28s on a
  file that then served fine — so a twenty-second budget expired on the good
  source and quietly took Bandai's smaller one instead. The pass looked
  healthy and could never produce a single 400x560.
*/
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** Extra attempts when the host says nothing at all. Pokémon uses 2 as well. */
const DOWNLOAD_RETRIES = 2;
/** Grows per attempt: a host that is gasping is not helped by hurrying it. */
const RETRY_BACKOFF_MS = 3_000;
const MAX_FACE_BYTES = 2 * 1024 * 1024;
/*
  Sequential, like the Pokémon CDN scrape — and for the reason written there:
  parallelism tripped a soft-ban under `6×0.05s`. This pack made the same bet
  at 6×40ms over 14k requests and dbscards started answering 403 to
  everything. RTT sets the pace instead.
*/
const DEFAULT_CONCURRENCY = 1;
/** No artificial sleep: one request at a time is the throttle. */
const DEFAULT_DELAY_MS = 0;

/** Where the cooldown is written, next to the pack's other logs. */
const SOFTBAN_LEDGER = "faces";
/** Long enough to be a real pause: this host bans by the hour, not the minute. */
const SOFTBAN_COOLDOWN_MS = 60 * 60 * 1000;
const PREFERRED_HOST = "static.dbscards.fr";
const ATTEMPT_ORDER_LEDGER = "faces";
const MIN_WEBP_BYTES = 100;

export type FetchDbsCgFacesOptions = {
  force?: boolean;
  /** Locales to sync. Each is filed under its own `cards/<set>/<lang>/`. */
  langs?: readonly string[];
  /** First N prints (debug). */
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  /** Pause before asking a silent host again. 0 in tests. */
  retryBackoffMs?: number;
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

/**
 * Bandai's own face for a locale — 260x363, but unmistakably that locale.
 *
 * EN lives at the site root (`/images/cardlist/…`), not `/en/` or `/us-en/`.
 * Those two 404; the US cardlist HTML points at `../../images/cardlist/cardimg/`.
 */
export function bandaiFaceUrl(collector: string, lang: string): string {
  const id = collector.trim().toUpperCase();
  if (lang.toLowerCase() === "en") {
    return `${DBS_CG_CARDLIST_ORIGIN}/images/cardlist/cardimg/${id}.png`;
  }
  return `${DBS_CG_CARDLIST_ORIGIN}/europe-fr/images/cartes/cardimg/${id}.png`;
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
export type FaceCandidate = { source: DbsFaceSource; urls: string[] };

const dbscardsIndexCache = new Map<string, DbscardsIndex>();

/**
 * The crawled list, or an empty index when it has never been scraped.
 *
 * Absence is not an error: without it the pass builds URLs the way it always
 * did. With it, no URL is guessed at all for the 53% of French prints the list
 * covers.
 */
function dbscardsIndex(lang: string): DbscardsIndex {
  const key = lang.toLowerCase();
  const cached = dbscardsIndexCache.get(key);
  if (cached) return cached;
  let index: DbscardsIndex;
  try {
    index = buildDbscardsIndex(
      JSON.parse(
        readFileSync(dbscardsIndexPath(key), "utf8"),
      ) as DbscardsIndexEntry[],
    );
  } catch {
    index = new Map();
  }
  dbscardsIndexCache.set(key, index);
  return index;
}

/** @internal test hook */
export function resetDbscardsIndexCache(): void {
  dbscardsIndexCache.clear();
}

/**
 * Their own URL for this print, both sides, when the list carries it.
 *
 * The tile names the sides outright — `item-image-recto` and `-verso` — so
 * that is what we read. The `-back.webp` suffix rule below is the older way,
 * kept for entries crawled before the tiles were parsed: a Leader's `image`
 * points at its awakened side and the front is the same path without the
 * suffix, while a plain card's `image` is its front and has no back at all.
 */
function dbscardsListedUrls(
  entry: DbscardsIndexEntry,
  role: DbsFaceRole,
): string[] {
  if (entry.imageFront ?? entry.imageBack) {
    const side = role === "back" ? entry.imageBack : entry.imageFront;
    return side ? [side] : [];
  }
  if (!entry.image) return [];
  const isBack = dbscardsIsBackImage(entry.image);
  if (role === "back") return isBack ? [entry.image] : [];
  return [isBack ? dbscardsFrontFromBack(entry.image) : entry.image];
}

export function dbsCgFaceCandidates(input: {
  setCode: string;
  number: string;
  collector: string;
  lang: string;
  rarity?: string | null;
  fullName?: string | null;
  awakenedName?: string | null;
}): FaceCandidate[] {
  const lang = input.lang.toLowerCase();
  const out: FaceCandidate[] = [];

  /*
    Their own URL first, when their list carries this print — no slug rule, no
    layout probe, no wasted request. Construction stays behind it for the ~47%
    of French prints the list does not cover.
  */
  const listed = lookupDbscardsEntry(
    dbscardsIndex(lang),
    `${input.setCode}-${input.number}`.toLowerCase(),
    dbscardsRarityCode(input.rarity),
  );

  if (listed) {
    out.push({ source: "dbscards", urls: dbscardsListedUrls(listed, "art") });
  } else if (input.fullName) {
    out.push({
      source: "dbscards",
      urls: dbscardsFaceUrls({
        setCode: input.setCode,
        number: input.number,
        lang,
        rarity: input.rarity,
        fullName: input.fullName,
        awakenedName: input.awakenedName,
      }),
    });
  }
  out.push({ source: "bandai", urls: [bandaiFaceUrl(input.collector, lang)] });
  // English only — Deckplanet mirrors no French printing.
  if (lang === "en") {
    out.push({
      source: "deckplanet",
      urls: dbsMastersFaceUrls(input.setCode, input.collector),
    });
  }
  return out;
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

export type FaceDownload = { buf: Buffer | null; throttled: boolean };

/** Hosts that told us to go away, for the rest of this run. */
type BannedHosts = Set<string>;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function downloadFace(
  urls: readonly string[],
  banned: BannedHosts,
  retryBackoffMs = RETRY_BACKOFF_MS,
  /** Called for answers only — a 200 or a 404, never a silence. */
  onAnswer?: (url: string, hit: boolean) => void,
): Promise<FaceDownload> {
  let throttled = false;
  for (const url of urls) {
    /*
      Once a host has refused us, every further request to it is both useless
      and rude — and it is thousands of them. Skipping keeps the run honest
      (the print still counts as throttled) without leaning on the ban.
    */
    if (banned.has(hostOf(url))) {
      throttled = true;
      continue;
    }
    /*
      Retry a timeout, do not retry a 404.

      The slow host answers erratically: the same URL times out, then serves
      fine minutes later. Measured — three cards written off as missing all
      returned 200 on a second look. One attempt therefore loses cards *and*
      lies about why, since a timeout is indistinguishable from an absence in
      the result. A 404 is an answer and is taken at its word.
    */
    let attempt = 0;
    for (;;) {
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
        if (raw.byteLength < MIN_WEBP_BYTES) break;
        const webp = await toWebp(raw);
        if (webp) {
          onAnswer?.(url, true);
          return { buf: webp, throttled };
        }
        break;
      } catch (error) {
        const status = (error as { response?: { status?: number } } | undefined)
          ?.response?.status;
        if (isSoftbanStatus(status)) {
          throttled = true;
          banned.add(hostOf(url));
          break;
        }
        // A status at all means the host answered; only silence is worth
        // asking again.
        if (status != null) {
          onAnswer?.(url, false);
          break;
        }
        if (attempt >= DOWNLOAD_RETRIES) break;
        attempt += 1;
        if (retryBackoffMs > 0) await sleep(retryBackoffMs * attempt);
      }
    }
  }
  return { buf: null, throttled };
}

/** What this card already holds, with the sizes the ranking needs. */
async function readStoredFaces(cardDir: string): Promise<StoredFace[]> {
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return [];
  }
  const { default: sharp } = await import("sharp");
  const out: StoredFace[] = [];
  for (const name of names) {
    const source = dbsFaceSourceOf(name);
    if (!source) continue;
    try {
      const meta = await sharp(path.join(cardDir, name)).metadata();
      out.push({
        source,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    } catch {
      /* unreadable file — not a candidate */
    }
  }
  return out;
}

function writeAtomic(destPath: string, buf: Buffer): void {
  mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, destPath);
}

/**
 * Rank what this card holds and record the winner.
 *
 * `lang` because the tie-break is per locale — Deckplanet is an English source
 * and has no business breaking a tie on a French card.
 */
export async function promoteBestFace(
  cardDir: string,
  lang = "fr",
): Promise<DbsFaceSource | null> {
  const stored = await readStoredFaces(cardDir);
  const best = pickBestFace(stored, lang);
  if (!best) return null;
  // Record the winner; never copy it. See `DBS_FACE_DECISION_FILE`.
  recordFaceDecision(cardDir, "art", dbsFaceFilename(best));
  return best;
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
    dbscards slugs need the printed name. Prefer the job's own locale, then
    FR — EN names on a French host 404, but the collector still has a French
    slug that might hit.
  */
  const titlesByPrint = new Map<
    string,
    Map<string, (typeof loaded.titles)[number]>
  >();
  for (const title of loaded.titles) {
    const lang = title.lang.toLowerCase();
    let inner = titlesByPrint.get(title.printKey);
    if (!inner) {
      inner = new Map();
      titlesByPrint.set(title.printKey, inner);
    }
    inner.set(lang, title);
  }

  let prints = loaded.prints;
  if (opts.limit && opts.limit > 0) {
    prints = prints.slice(0, opts.limit);
  }

  const langs = opts.langs?.length ? opts.langs : DBS_CG_FACE_LANGS;
  const retryBackoffMs = opts.retryBackoffMs ?? RETRY_BACKOFF_MS;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const force = opts.force === true;
  console.log(
    `── faces [${langs.join(",")}] (${prints.length} tirages) concurrency=${concurrency} delayMs=${delayMs}${force ? " force" : ""}`,
  );

  /** Shared across the pool so one refusal stops the whole run pestering. */
  const banned: BannedHosts = new Set();

  /** Which URL shape has been answering, per source and set. Survives runs. */
  const order: AttemptOrderLedger = loadAttemptOrder(
    foilPackDataDir(DBS_CG_PACK_ID),
    ATTEMPT_ORDER_LEDGER,
  );

  /*
    A cooldown outlives the process on purpose. An in-memory flag protects only
    the run that got banned; the next one starts innocent, hammers the same
    host and extends the block. Same ledger the Pokémon CDN scrape keeps.
  */
  const cacheRoot = foilPackDataDir(DBS_CG_PACK_ID);
  const remainingMs = softbanRemainingMs(cacheRoot, Date.now(), SOFTBAN_LEDGER);
  if (remainingMs > 0) {
    const waitS = Math.ceil(remainingMs / 1000);
    console.warn(
      `── refroidissement actif : ${waitS}s restantes avant de réinterroger la source préférée.`,
    );
    console.warn(
      "   La passe continue avec les sources de repli — relancer --force après ce délai pour la haute définition.",
    );
    banned.add(PREFERRED_HOST);
  }

  const stats: FetchDbsCgFacesResult = {
    ok: 0,
    skip: 0,
    miss: 0,
    fail: 0,
    throttled: 0,
    total: prints.length,
  };

  /*
    Only prints that exist in that language. 1193 of the 8434 have no French
    title — English-only releases (DRAFT BOX, EXPANSION SET 09-18…) that came
    in with the English scrape. Asking Bandai's French CDN for them was 1193
    guaranteed 404s, and it made a quarter of the run look like failures.
  */
  const titledIn = new Map<string, Set<string>>();
  for (const title of loaded.titles) {
    const lang = title.lang.toLowerCase();
    if (!titledIn.has(lang)) titledIn.set(lang, new Set());
    titledIn.get(lang)!.add(title.printKey);
  }
  const jobs = langs.flatMap((lang) => {
    const known = titledIn.get(lang.toLowerCase());
    return prints
      .filter((print) => known?.has(print.printKey))
      .map((print) => ({ print, lang }));
  });
  stats.total = jobs.length;

  /*
    Progress on a clock, not on a count.
    
    Per-job cost spans three orders of magnitude here — a held source is a
    stat() while a throttled dbscards answers in fifteen seconds — so any
    fixed number of jobs is wrong for one half of the pass. Counting made the
    first line land after ~1h45 of the French leg, just before the admin's
    two-hour timeout: a run that reported nothing until it was killed, which is
    the failure this logging exists to prevent.
  */
  let done = 0;
  const PROGRESS_EVERY_MS = 30_000;
  let lastProgressAt = Date.now();

  await runPool(jobs, concurrency, delayMs, async ({ print, lang }) => {
    const cardDir = packCardDir(DBS_CG_PACK_ID, {
      set: print.setCode,
      lang,
      card: dbsCgCardFolder(print),
    });
    const collector = formatDbsCollectorNumber(
      print.setCode,
      print.number,
      print.grouping,
    );
    const titlesFor = titlesByPrint.get(print.printKey);
    const title = titlesFor?.get(lang) ?? titlesFor?.get("fr");
    const candidates = dbsCgFaceCandidates({
      setCode: print.setCode,
      number: print.number,
      collector,
      lang,
      rarity: title?.rarity,
      fullName: title?.fullName,
      awakenedName: title?.awakenedName,
    });

    let fetched = 0;
    let throttledHere = false;
    for (const candidate of candidates) {
      const file = path.join(cardDir, dbsFaceFilename(candidate.source));
      /*
        Skip is per *source*, not per card. That is what lets a later pass fill
        in only what is missing — a card already holding Bandai's face still
        gets asked for the dbscards one, so a run interrupted by a ban is
        repaired by simply running again, no `--force` needed.
      */
      if (!force && existsSync(file)) continue;
      /*
        Try the pool that has been answering for this set first.

        A set lives entirely in one of dbscards' two pools — measured, three
        sets sampled were homogeneous — but which one is not derivable. So one
        card's answer settles the rest of its set, turning a wasted request per
        card into one per set.
      */
      const orderKey = `${candidate.source}:${lang}:${print.setCode}`;
      const urls =
        candidate.source === "dbscards"
          ? rankAttempts(order, orderKey, candidate.urls, dbscardsPoolOf)
          : candidate.urls;
      const { buf, throttled } = await downloadFace(
        urls,
        banned,
        retryBackoffMs,
        candidate.source === "dbscards"
          ? (url, hit) =>
              recordAttempt(order, orderKey, dbscardsPoolOf(url), hit)
          : undefined,
      );
      if (throttled) throttledHere = true;
      if (!buf) continue;
      try {
        writeAtomic(file, buf);
        fetched += 1;
      } catch {
        stats.fail += 1;
      }
    }
    /*
      The awakened verso, for the Leaders that have one.

      `dbscardsFaceUrls({ face: "back" })` was written with the front URLs and
      then never called, so French held zero versos against 503 prints that
      name an awakened side — the English ones exist only because `arena`
      copies them out of the local clone. Same filename `arena` uses, so both
      routes land on one name.
    */
    const awakenedDest = path.join(
      cardDir,
      dbsFaceFilename("dbscards", "back"),
    );
    if (title?.awakenedName && (force || !existsSync(awakenedDest))) {
      // Their listed `-back` when we have it, constructed otherwise.
      const listedBack = lookupDbscardsEntry(
        dbscardsIndex(lang),
        `${print.setCode}-${print.number}`.toLowerCase(),
        dbscardsRarityCode(title.rarity),
      );
      /*
        Their listed verso when we have it, constructed otherwise — including
        when the tile carries a front but no verso. Our catalogue is what says
        this print has an awakened side, so a tile without one is a gap in
        their markup, not evidence the side does not exist.
      */
      const listedBackUrls = listedBack
        ? dbscardsListedUrls(listedBack, "back")
        : [];
      const backUrls = listedBackUrls.length
        ? listedBackUrls
        : dbscardsFaceUrls(
            {
              setCode: print.setCode,
              number: print.number,
              lang,
              rarity: title.rarity,
              fullName: title.fullName,
              awakenedName: title.awakenedName,
            },
            { face: "back" },
          );
      const back = await downloadFace(backUrls, banned, retryBackoffMs);
      if (back.throttled) throttledHere = true;
      // A Leader without a published verso is ordinary, not a failure: it is
      // not counted as a miss.
      if (back.buf) {
        try {
          writeAtomic(awakenedDest, back.buf);
          // Same convention as the front: role + source, then a recorded
          // winner. A fixed single name had no room for a second source
          // and would have been silently overwritten by whichever ran last.
          recordFaceDecision(
            cardDir,
            "back",
            dbsFaceFilename("dbscards", "back"),
          );
        } catch {
          stats.fail += 1;
        }
      }
    }

    if (throttledHere) stats.throttled += 1;
    done += 1;
    const now = Date.now();
    if (now - lastProgressAt >= PROGRESS_EVERY_MS || done === jobs.length) {
      lastProgressAt = now;
      const pct = Math.round((done / jobs.length) * 100);
      console.log(
        `   ${done}/${jobs.length} (${pct}%) ok=${stats.ok} skip=${stats.skip} miss=${stats.miss} bridé=${stats.throttled}`,
      );
    }

    try {
      const best = await promoteBestFace(cardDir, lang);
      if (!best) {
        stats.miss += 1;
        return;
      }
      if (fetched > 0) stats.ok += 1;
      else stats.skip += 1;
    } catch {
      stats.fail += 1;
    }
  });

  saveAttemptOrder(
    foilPackDataDir(DBS_CG_PACK_ID),
    ATTEMPT_ORDER_LEDGER,
    order,
  );

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
  if (banned.has(PREFERRED_HOST) && remainingMs === 0) {
    writeSoftbanState(cacheRoot, {
      until: new Date(Date.now() + SOFTBAN_COOLDOWN_MS),
      reason: `${PREFERRED_HOST} a refusé pendant la passe faces`,
      name: SOFTBAN_LEDGER,
    });
  } else if (stats.throttled === 0 && remainingMs === 0) {
    clearSoftbanState(cacheRoot, SOFTBAN_LEDGER);
  }
  if (stats.throttled > 0) {
    console.warn(
      `── ATTENTION : ${stats.throttled} tirages ont reçu une face de repli parce que la source préférée nous a bridés (403/429).`,
    );
    console.warn(`   Hôtes ayant refusé : ${[...banned].join(", ") || "—"}`);
    console.warn(
      "   Relancer --force plus tard : ces cartes sont en basse définition, pas absentes.",
    );
  }
  return stats;
}
