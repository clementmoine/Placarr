#!/usr/bin/env tsx
/**
 * Direct CDN scrape for Pokémon TCG Live UnityFS card bundles.
 *
 * Discovered 2026-08-02 via Frida memory capture on a live Card-Dex open:
 *
 *     https://cdn.studio-prod.pokemon.com/rainier/Content/Android/{version}/{dir}/{name}
 *
 *   tsx scripts/pokemon/cdn.ts scrape --names xy8_fr_012 me3_fr_015
 *   tsx scripts/pokemon/cdn.ts scrape --from-setnums data/pokemon/cdn-catalogue-setnum.txt --limit 50
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV } from "./languages";
import {
  DEFAULT_SOFTBAN_ABORT_COOLDOWN_MS,
  softbanRemainingMs,
  writeSoftbanState,
} from "./scrapePlan";

export const CDN_HOST = "https://cdn.studio-prod.pokemon.com";
export const DEFAULT_VERSION = "1.40.0";
export const DEFAULT_CONTENT_DIR = "10101_0000";
export const DEFAULT_UA =
  "UnityPlayer/6000.3.5f2 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)";
/** How far to walk content dirs when a bundle is missing on the preferred dir. */
export type DirProbeMode = "primary" | "all";

/**
 * Sequential CDN scrape (ptcgl.dev-style): one GET at a time, no artificial
 * delay — RTT + UnityFS size set the pace. Parallelism previously tripped
 * CloudFront soft-ban under go-hard (6×0.05s).
 *
 * Soft-ban HTML still pauses / aborts with persisted cooldown. Override with
 * ``--workers`` / ``--delay`` only for experiments.
 *
 * Dir probe default is ``primary``: multi-lang misses are almost always
 * AccessDenied on ``10101_0000``, not hiding on a dated dir. Use ``all`` for
 * rare set splits (e.g. mebsp cards across epochs).
 */
export const DEFAULT_WORKERS = 1;
/** No sleep between GETs by default (same as ptcgl.dev AssetDownloadService). */
export const DEFAULT_DELAY_S = 0;
export const DEFAULT_RETRIES = 2;
export const DEFAULT_DIR_PROBE: DirProbeMode = "primary";
export const SOFTBAN_STATUSES = new Set([403, 429, 503]);
/** Retry only transient edge errors — stable 403 = missing / forbidden path. */
export const RETRY_STATUSES = new Set([429, 503]);
export const SOFTBAN_STREAK_PAUSE = 6;
export const SOFTBAN_COOLDOWN_S = 90.0;
export const SOFTBAN_MAX_PAUSES = 3;
export const CANARY_NAME = "xy8_fr_012";
export const CANARY_TTL_S = 30.0;
/**
 * CloudFront WAF / rate-limit HTML (not a missing UnityFS object).
 * When this body appears, scrape must pause — do not treat as catalogue miss.
 */
export const CLOUDFRONT_REQUEST_BLOCKED_MARKERS = [
  "Request blocked.",
  "We can't connect to the server for this app or website at this time",
] as const;

/** S3/CloudFront object 403 — wrong path / unpublished bundle (not a soft-ban). */
export const CDN_PATH_ACCESS_DENIED_MARKERS = [
  "<Code>AccessDenied</Code>",
  "<Message>Access Denied</Message>",
] as const;

export type Cdn403Kind = "softban" | "missing" | "unknown";

export function isCloudFrontRequestBlocked(body: string): boolean {
  if (!body) return false;
  return CLOUDFRONT_REQUEST_BLOCKED_MARKERS.every((m) => body.includes(m));
}

export function isCdnPathAccessDenied(body: string): boolean {
  if (!body) return false;
  return CDN_PATH_ACCESS_DENIED_MARKERS.every((m) => body.includes(m));
}

/** Classify a 403 response body: pause vs honest miss vs ambiguous. */
export function classifyCdn403Body(body: string): Cdn403Kind {
  if (isCloudFrontRequestBlocked(body)) return "softban";
  if (isCdnPathAccessDenied(body)) return "missing";
  return "unknown";
}

const SETNUM_RE = /^([a-z0-9.-]+)_(\d+)$/i;
const BUNDLE_RE =
  /^([a-z0-9.-]+)_([a-z]{2,4})_(\d+)(_[a-z])?$/i;

/** longFormID: ``Name_set_num_<variant>_Rarity_Foil_Mask`` */
const LONG_FORM_SETNUM_RE =
  /_([A-Za-z0-9.-]+)_(\d+)_([a-z]+)_[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9]+_[A-Za-z0-9]+/g;

/** Compendium client ids: ``svalt_1``, ``svbsp_45``, ``ec_1_ph``. */
const COMPENDIUM_SETNUM_RE = /^([a-z0-9.-]+)_(\d+)(?:_[a-z]+)?$/i;

const CARD_DATABASE_STEM_RE = /^card-database-([a-z0-9.-]+)_\d+_/i;

const UNITYFS_MAGIC = Buffer.from("UnityFS");

export type BundleResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  status?: number | null;
  bytes?: number;
  path?: string;
  error?: string;
  softBan?: boolean;
  contentDir?: string | null;
  url?: string;
};

export type ScrapeReport = {
  requested: number;
  ok: number;
  skipped: number;
  failed: number;
  aborted: string | null;
  byStatus: Record<string, number>;
  outDir: string;
  version: string;
  contentDir: string;
  contentBase?: string;
  workers: number;
  delayS: number;
  results: BundleResult[];
};

export type SetNumPairKey = `${string}:${number}`;

export type ApkSetnumInventory = {
  pairs: Set<SetNumPairKey>;
  fromCompendium: Set<SetNumPairKey>;
  fromLongform: Set<SetNumPairKey>;
  compendiumStems: Set<string>;
  cardDatabaseStems: Set<string>;
  longformVariants: Record<string, number>;
};

function pairKey(set: string, num: number): SetNumPairKey {
  return `${set}:${num}`;
}

export function hasPair(
  pairs: Set<SetNumPairKey>,
  set: string,
  num: number,
): boolean {
  return pairs.has(pairKey(set, num));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simple async mutex for shared scrape pacing / soft-ban state. */
export class AsyncLock {
  #tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((r) => {
      release = r;
    });
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }
}

/**
 * Build a CDN object URL.
 *
 * Prefer ``contentBase`` from GameSettings ``android_contentpath`` (host can
 * migrate). When omitted, synthesize the historical Android layout.
 */
export function bundleUrl(
  name: string,
  opts: {
    version?: string;
    contentDir?: string;
    /** Trailing-slash content root, e.g. ``…/Content/Android/1.40.0/``. */
    contentBase?: string;
  } = {},
): string {
  const version = opts.version ?? DEFAULT_VERSION;
  const contentDir = opts.contentDir ?? DEFAULT_CONTENT_DIR;
  const base = (opts.contentBase?.trim()
    ? opts.contentBase.trim().endsWith("/")
      ? opts.contentBase.trim()
      : `${opts.contentBase.trim()}/`
    : `${CDN_HOST}/rainier/Content/Android/${version}/`);
  return `${base}${contentDir}/${name}`;
}

/** ``bw1_001`` → ``[bw1_fr_001, bw1_fr_001_t]`` (foil variant probe). */
export function setnumToBundleNames(
  setnum: string,
  lang = "fr",
): string[] {
  const trimmed = setnum.trim();
  const m = SETNUM_RE.exec(trimmed);
  if (!m) {
    if (BUNDLE_RE.test(trimmed)) return [trimmed];
    return [];
  }
  const setId = m[1]!.toLowerCase();
  const num = m[2]!;
  const base = `${setId}_${lang}_${num}`;
  return [base, `${base}_t`];
}

export function bundleSetId(name: string): string | null {
  const m = BUNDLE_RE.exec(name.trim());
  return m?.[1] ? m[1].toLowerCase() : null;
}

export function loadContentDirs(configCache: string | null): string[] {
  const dirs: string[] = [DEFAULT_CONTENT_DIR];
  if (!configCache) return dirs;
  const manifestPath = path.join(configCache, "asset-bundle-manifest_0.0.json");
  if (!existsSync(manifestPath)) return dirs;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      keys?: { manifest?: { contentString?: string } };
    };
    const inner = JSON.parse(raw.keys?.manifest?.contentString ?? "null") as {
      directories?: unknown[];
    } | null;
    for (const d of inner?.directories ?? []) {
      const s = String(d);
      if (!dirs.includes(s)) dirs.push(s);
    }
  } catch {
    return dirs;
  }
  const dated = dirs
    .filter((d) => d !== DEFAULT_CONTENT_DIR)
    .sort()
    .reverse();
  return [DEFAULT_CONTENT_DIR, ...dated];
}

export function orderDirsForSet(
  allDirs: string[],
  opts: { known?: string | null } = {},
): string[] {
  const out: string[] = [];
  const known = opts.known ?? null;
  if (known && allDirs.includes(known)) out.push(known);
  for (const d of allDirs) {
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** ``[status, contentLength, softBan?]`` — softBan when CloudFront block HTML. */
export type HeadBundleResult = [number, number, boolean?];

export async function headBundle(
  name: string,
  opts: {
    version?: string;
    contentDir?: string;
    contentBase?: string;
    timeoutS?: number;
  } = {},
): Promise<HeadBundleResult> {
  const version = opts.version ?? DEFAULT_VERSION;
  const contentDir = opts.contentDir ?? DEFAULT_CONTENT_DIR;
  const timeoutS = opts.timeoutS ?? 20;
  const url = bundleUrl(name, {
    version,
    contentDir,
    contentBase: opts.contentBase,
  });
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": DEFAULT_UA },
      signal: AbortSignal.timeout(timeoutS * 1000),
    });
    const length = Number.parseInt(res.headers.get("content-length") || "0", 10);
    const len = Number.isFinite(length) ? length : 0;
    if (res.status !== 403) return [res.status, len];

    // HEAD has no body — peek a few KB: HTML soft-ban vs XML AccessDenied miss.
    const peek = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA,
        Range: "bytes=0-4095",
      },
      signal: AbortSignal.timeout(timeoutS * 1000),
    });
    const text = Buffer.from(await peek.arrayBuffer()).toString("utf8");
    const kind = classifyCdn403Body(text);
    const softBan =
      kind === "softban" ? true : kind === "missing" ? false : undefined;
    return [peek.status || res.status, len, softBan];
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      typeof (err as { status: unknown }).status === "number"
    ) {
      return [(err as { status: number }).status, 0];
    }
    return [0, 0];
  }
}

export async function downloadBundle(
  name: string,
  dest: string,
  opts: {
    version?: string;
    contentDir?: string;
    contentBase?: string;
    timeoutS?: number;
    skipExisting?: boolean;
    retries?: number;
  } = {},
): Promise<BundleResult> {
  const version = opts.version ?? DEFAULT_VERSION;
  const contentDir = opts.contentDir ?? DEFAULT_CONTENT_DIR;
  const timeoutS = opts.timeoutS ?? 60;
  const skipExisting = opts.skipExisting ?? true;
  const retries = opts.retries ?? DEFAULT_RETRIES;

  await mkdir(path.dirname(dest), { recursive: true });
  if (skipExisting && existsSync(dest)) {
    const st = await stat(dest);
    if (st.size > 0) {
      return { name, ok: true, skipped: true, bytes: st.size };
    }
  }

  const url = bundleUrl(name, {
    version,
    contentDir,
    contentBase: opts.contentBase,
  });
  let last: BundleResult = { name, ok: false, error: "no attempt" };
  const maxAttempts = Math.max(1, retries);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": DEFAULT_UA },
        signal: AbortSignal.timeout(timeoutS * 1000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        const kind =
          res.status === 403 ? classifyCdn403Body(errBody) : "unknown";
        const softBan =
          kind === "softban" ? true : kind === "missing" ? false : undefined;
        last = {
          name,
          ok: false,
          status: res.status,
          error:
            kind === "softban"
              ? "cloudfront-request-blocked"
              : kind === "missing"
                ? "cdn-forbidden-or-missing"
                : res.statusText || `HTTP ${res.status}`,
          softBan,
          bytes: errBody.length || undefined,
        };
        if (RETRY_STATUSES.has(res.status) && attempt + 1 < maxAttempts) {
          await sleep(2000 * 2 ** attempt);
          continue;
        }
        return last;
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (!data.subarray(0, UNITYFS_MAGIC.length).equals(UNITYFS_MAGIC)) {
        const text = data.toString("utf8");
        const kind = classifyCdn403Body(text);
        if (kind === "softban") {
          return {
            name,
            ok: false,
            status: res.status,
            error: "cloudfront-request-blocked",
            softBan: true,
            bytes: data.length,
          };
        }
        if (kind === "missing") {
          return {
            name,
            ok: false,
            status: res.status,
            error: "cdn-forbidden-or-missing",
            softBan: false,
            bytes: data.length,
          };
        }
        return {
          name,
          ok: false,
          status: res.status,
          error: "not UnityFS",
          bytes: data.length,
        };
      }
      await writeFile(dest, data);
      return {
        name,
        ok: true,
        skipped: false,
        status: res.status,
        bytes: data.length,
        path: dest,
      };
    } catch (err) {
      last = { name, ok: false, error: String(err) };
      if (attempt + 1 < maxAttempts) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return last;
    }
  }
  return last;
}

/**
 * Test seam — resolveContentDir / scrape call through this so unit tests can
 * stub HEAD without network.
 */
export const httpDeps = {
  headBundle: headBundle as typeof headBundle,
  downloadBundle: downloadBundle as typeof downloadBundle,
};

/**
 * Return the content_dir that HEADs 200 for ``name``.
 *
 * ``setDirCache`` is only a **hint** (last successful dir for the set), not a
 * hard pin: some sets publish cards across several dated dirs.
 *
 * CloudFront soft-ban HTML short-circuits the dir walk (no N× HEAD storm).
 */
export async function resolveContentDir(
  name: string,
  opts: {
    version: string;
    dirs: string[];
    setDirCache: Map<string, string>;
    cacheLock: AsyncLock;
    contentBase?: string;
  },
): Promise<{ contentDir: string | null; softBan: boolean }> {
  const setId = bundleSetId(name);
  const known = setId
    ? await opts.cacheLock.run(() => opts.setDirCache.get(setId) ?? null)
    : null;

  for (const d of orderDirsForSet(opts.dirs, { known })) {
    const [st, , softBan] = await httpDeps.headBundle(name, {
      version: opts.version,
      contentDir: d,
      contentBase: opts.contentBase,
      timeoutS: 15,
    });
    if (softBan) {
      console.log(`  [dir] bundle=${name} → cloudfront soft-ban`);
      return { contentDir: null, softBan: true };
    }
    if (st === 200) {
      if (setId) {
        await opts.cacheLock.run(() => {
          const prev = opts.setDirCache.get(setId);
          opts.setDirCache.set(setId, d);
          if (prev !== d) {
            const was = prev ? ` (was ${prev})` : "";
            console.log(`  [dir] set=${setId} → ${d}${was}`);
          }
        });
      }
      return { contentDir: d, softBan: false };
    }
  }
  console.log(
    `  [dir] bundle=${name} → none (${opts.dirs.length <= 1 ? "primary miss" : "all dirs miss"})`,
  );
  return { contentDir: null, softBan: false };
}

export async function downloadBundleResolved(
  name: string,
  dest: string,
  opts: {
    version: string;
    dirs: string[];
    setDirCache: Map<string, string>;
    cacheLock: AsyncLock;
    skipExisting?: boolean;
    contentBase?: string;
  },
): Promise<BundleResult> {
  const skipExisting = opts.skipExisting ?? true;
  if (skipExisting && existsSync(dest)) {
    const st = await stat(dest);
    if (st.size > 0) {
      return { name, ok: true, skipped: true, bytes: st.size };
    }
  }

  const tried = new Set<string>();
  let last: BundleResult = {
    name,
    ok: false,
    status: 403,
    error: "cdn-forbidden-or-missing",
    softBan: false,
    contentDir: null,
  };

  const maxRounds = Math.max(1, opts.dirs.length);
  for (let round = 0; round < maxRounds; round++) {
    const remaining = opts.dirs.filter((d) => !tried.has(d));
    const resolved = await resolveContentDir(name, {
      version: opts.version,
      dirs: remaining.length ? remaining : opts.dirs,
      setDirCache: opts.setDirCache,
      cacheLock: opts.cacheLock,
      contentBase: opts.contentBase,
    });
    if (resolved.softBan) {
      return {
        name,
        ok: false,
        status: 403,
        error: "cloudfront-request-blocked",
        softBan: true,
        contentDir: null,
      };
    }
    const contentDir = resolved.contentDir;
    if (!contentDir || tried.has(contentDir)) break;
    tried.add(contentDir);
    const res = await httpDeps.downloadBundle(name, dest, {
      version: opts.version,
      contentDir,
      contentBase: opts.contentBase,
      skipExisting: false,
    });
    res.contentDir = contentDir;
    if (res.ok) return res;
    last = res;
    if (res.softBan === true) return res;
    if (
      (res.status === 403 || res.status === 404) &&
      res.softBan !== true
    ) {
      const setId = bundleSetId(name);
      if (setId) {
        await opts.cacheLock.run(() => {
          if (opts.setDirCache.get(setId) === contentDir) {
            opts.setDirCache.delete(setId);
          }
        });
      }
      continue;
    }
    break;
  }
  return last;
}

export async function loadNames(opts: {
  names?: string[] | null;
  fromSetnums?: string | null;
  langs: string[];
  includeFoilT: boolean;
  limit: number;
  extras?: string[] | null;
}): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (n: string) => {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };

  for (const n of opts.extras ?? []) add(n.trim());
  for (const n of opts.names ?? []) add(n.trim());

  if (opts.fromSetnums && existsSync(opts.fromSetnums)) {
    const text = await readFile(opts.fromSetnums, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      for (const lang of opts.langs) {
        for (const cand of setnumToBundleNames(line, lang)) {
          if (!opts.includeFoilT && cand.endsWith("_t")) continue;
          add(cand);
          if (opts.limit && out.length >= opts.limit) {
            return out.slice(0, opts.limit);
          }
        }
      }
    }
  }
  if (opts.limit) return out.slice(0, opts.limit);
  return out;
}

function decodeContentBinary(raw: unknown): Buffer | null {
  const stack: unknown[] = [raw];
  while (stack.length) {
    const obj = stack.pop();
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const rec = obj as Record<string, unknown>;
      const cb = rec.contentBinary;
      if (typeof cb === "string") {
        try {
          return Buffer.from(cb, "base64");
        } catch {
          return null;
        }
      }
      for (const v of Object.values(rec)) stack.push(v);
    } else if (Array.isArray(obj)) {
      for (const v of obj) stack.push(v);
    }
  }
  return null;
}

/** Inventory printable ``(set, num)`` pairs from an APK config-cache pull. */
export function collectApkSetnumPairs(configCache: string): ApkSetnumInventory {
  const fromCompendium = new Set<SetNumPairKey>();
  const fromLongform = new Set<SetNumPairKey>();
  const longformVariants: Record<string, number> = {};
  const compendiumStems = new Set<string>();
  const cardDatabaseStems = new Set<string>();

  let entries: string[] = [];
  try {
    entries = readdirSync(configCache).sort();
  } catch {
    entries = [];
  }

  for (const name of entries) {
    if (!name.endsWith("-compendium_0.0.json")) continue;
    const stem = name.slice(0, -"-compendium_0.0.json".length).toLowerCase();
    if (!stem) continue;
    compendiumStems.add(stem);
    try {
      const raw = JSON.parse(
        readFileSync(path.join(configCache, name), "utf8"),
      ) as {
        keys?: { compendium?: { contentString?: string } };
      };
      const keys = JSON.parse(
        raw.keys?.compendium?.contentString ?? "null",
      ) as Record<string, unknown> | null;
      if (!keys || typeof keys !== "object") continue;
      for (const clientId of Object.keys(keys)) {
        const m = COMPENDIUM_SETNUM_RE.exec(String(clientId));
        if (!m) continue;
        fromCompendium.add(pairKey(m[1]!.toLowerCase(), Number.parseInt(m[2]!, 10)));
      }
    } catch {
      /* skip bad file */
    }
  }

  for (const name of entries) {
    if (!name.startsWith("card-database-") || !name.endsWith(".json")) continue;
    const mstem = CARD_DATABASE_STEM_RE.exec(name);
    if (mstem) cardDatabaseStems.add(mstem[1]!.toLowerCase());
    try {
      const raw = JSON.parse(
        readFileSync(path.join(configCache, name), "utf8"),
      ) as unknown;
      const blob = decodeContentBinary(raw);
      if (!blob) continue;
      const text = blob.toString("latin1");
      LONG_FORM_SETNUM_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LONG_FORM_SETNUM_RE.exec(text))) {
        const setId = m[1]!.toLowerCase();
        const num = Number.parseInt(m[2]!, 10);
        const variant = m[3]!.toLowerCase();
        fromLongform.add(pairKey(setId, num));
        longformVariants[variant] = (longformVariants[variant] ?? 0) + 1;
      }
    } catch {
      /* skip */
    }
  }

  const pairs = new Set<SetNumPairKey>([...fromCompendium, ...fromLongform]);
  return {
    pairs,
    fromCompendium,
    fromLongform,
    compendiumStems,
    cardDatabaseStems,
    longformVariants,
  };
}

/** Unique ``set_NNN`` ids from APK ``config-cache`` (compendium-first). */
export function catalogueSetnumsFromConfig(configCache: string): string[] {
  const inv = collectApkSetnumPairs(configCache);
  const lines: string[] = [];
  for (const key of inv.pairs) {
    const colon = key.lastIndexOf(":");
    const s = key.slice(0, colon);
    const n = Number.parseInt(key.slice(colon + 1), 10);
    lines.push(`${s}_${String(n).padStart(3, "0")}`);
  }
  return lines.sort();
}

async function runPool<T, R>(
  items: readonly T[],
  workers: number,
  worker: (item: T) => Promise<R>,
  onResult: (res: R, done: number) => void,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let done = 0;
  const n = Math.max(1, workers);

  async function runner() {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      const res = await worker(items[idx]!);
      results.push(res);
      done += 1;
      onResult(res, done);
    }
  }

  await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, () => runner()));
  return results;
}

export async function scrape(
  names: string[],
  outDir: string,
  opts: {
    version?: string;
    contentDir?: string;
    contentBase?: string;
    contentDirs?: string[] | null;
    configCache?: string | null;
    /** ``primary`` = preferred dir only (default); ``all`` = manifest dated dirs. */
    dirProbe?: DirProbeMode;
    workers?: number;
    delayS?: number;
    dryRun?: boolean;
    signal?: AbortSignal;
    /**
     * Pokemon cache root (``data/pokemon``) for soft-ban ledger.
     * Defaults to parent of ``outDir`` when ``outDir`` ends with ``cdn-bundles``.
     */
    cacheRoot?: string | null;
  } = {},
): Promise<ScrapeReport> {
  const version = opts.version ?? DEFAULT_VERSION;
  const contentDir = opts.contentDir ?? DEFAULT_CONTENT_DIR;
  const contentBase = opts.contentBase;
  const workers = opts.workers ?? DEFAULT_WORKERS;
  const delayS = opts.delayS ?? DEFAULT_DELAY_S;
  const dirProbe = opts.dirProbe ?? DEFAULT_DIR_PROBE;
  const dryRun = opts.dryRun ?? false;
  const signal = opts.signal;
  const cacheRoot =
    opts.cacheRoot ??
    (path.basename(outDir) === "cdn-bundles" ? path.dirname(outDir) : null);

  mkdirSync(outDir, { recursive: true });
  let results: BundleResult[] = [];
  let aborted: string | null = null;

  if (cacheRoot && !dryRun) {
    const remaining = softbanRemainingMs(cacheRoot);
    if (remaining > 0) {
      const waitS = Math.ceil(remaining / 1000);
      console.log(
        `  [soft-ban] cooldown ${waitS}s remaining — abort scrape (resume later; skip-existing keeps progress)`,
      );
      return {
        requested: names.length,
        ok: 0,
        skipped: 0,
        failed: names.length,
        aborted: "softban-cooldown",
        byStatus: {},
        outDir,
        version,
        contentDir,
        contentBase,
        workers: 0,
        delayS,
        results: names.map((name) => ({
          name,
          ok: false,
          error: "softban-cooldown",
          status: null,
        })),
      };
    }
  }

  let dirs: string[];
  if (dirProbe === "primary") {
    dirs = [contentDir];
  } else if (opts.contentDirs?.length) {
    dirs = [...opts.contentDirs];
    if (contentDir && !dirs.includes(contentDir)) {
      dirs = [contentDir, ...dirs];
    } else if (contentDir) {
      dirs = [contentDir, ...dirs.filter((d) => d !== contentDir)];
    }
  } else {
    dirs = loadContentDirs(opts.configCache ?? null);
    if (contentDir && !dirs.includes(contentDir)) {
      dirs = [contentDir, ...dirs];
    } else if (contentDir) {
      dirs = [contentDir, ...dirs.filter((d) => d !== contentDir)];
    }
  }
  console.log(
    `  dirProbe=${dirProbe} dirs=${dirs.length}` +
      (dirs.length === 1 ? ` (${dirs[0]})` : ""),
  );

  if (dryRun) {
    const setDirCache = new Map<string, string>();
    const cacheLock = new AsyncLock();
    for (const name of names) {
      const resolved = await resolveContentDir(name, {
        version,
        dirs,
        setDirCache,
        cacheLock,
        contentBase,
      });
      if (resolved.softBan) {
        results.push({
          name,
          ok: false,
          status: 403,
          bytes: 0,
          contentDir: null,
          softBan: true,
          error: "cloudfront-request-blocked",
        });
        continue;
      }
      if (!resolved.contentDir) {
        results.push({
          name,
          ok: false,
          status: 403,
          bytes: 0,
          contentDir: null,
        });
        continue;
      }
      const d = resolved.contentDir;
      const [st, length] = await httpDeps.headBundle(name, {
        version,
        contentDir: d,
        contentBase,
      });
      results.push({
        name,
        ok: st === 200,
        status: st,
        bytes: length,
        contentDir: d,
        url: bundleUrl(name, { version, contentDir: d, contentBase }),
      });
    }
  } else {
    // Sequential by default (workers=1): one in-flight GET, optional delayS.
    const paceLock = new AsyncLock();
    let nextSlot = 0;
    let softbanStreak = 0;
    let softbanPauses = 0;
    let canaryCache: { ts: number; status: number; softBan: boolean } = {
      ts: 0,
      status: 200,
      softBan: false,
    };
    const setDirCache = new Map<string, string>();
    const cacheLock = new AsyncLock();
    let stop = false;
    let missLogged = 0;
    const workerCount = Math.max(1, Math.trunc(workers));
    console.log(
      `  content dirs (${dirs.length}): ${dirs.slice(0, 6).join(", ")}…` +
        ` sequential workers=${workerCount}` +
        (delayS > 0 ? ` delay=${delayS}s` : " delay=0 (RTT-paced)"),
    );

    async function canaryStatus(): Promise<{
      status: number;
      softBan: boolean;
    }> {
      const now = performance.now() / 1000;
      if (now - canaryCache.ts < CANARY_TTL_S) {
        return { status: canaryCache.status, softBan: canaryCache.softBan };
      }
      const [st, , softBan] = await httpDeps.headBundle(CANARY_NAME, {
        version,
        contentDir: DEFAULT_CONTENT_DIR,
        contentBase,
        timeoutS: 15,
      });
      canaryCache = {
        ts: performance.now() / 1000,
        status: st,
        softBan: Boolean(softBan),
      };
      return { status: st, softBan: Boolean(softBan) };
    }

    function persistSoftbanAbort(reason: string): void {
      if (!cacheRoot) return;
      writeSoftbanState(cacheRoot, {
        until: new Date(Date.now() + DEFAULT_SOFTBAN_ABORT_COOLDOWN_MS),
        reason,
      });
      console.log(
        `  [soft-ban] wrote cooldown → ${path.join(cacheRoot, "logs/cdn-softban-until.json")}`,
      );
    }

    async function pacedDownload(name: string): Promise<BundleResult> {
      if (stop || signal?.aborted) {
        stop = true;
        return { name, ok: false, error: "aborted", status: null };
      }
      const dest = path.join(outDir, name);
      if (existsSync(dest)) {
        const st = statSync(dest);
        if (st.size > 0) {
          return { name, ok: true, skipped: true, bytes: st.size };
        }
      }

      if (delayS > 0) {
        await paceLock.run(async () => {
          if (stop || signal?.aborted) {
            stop = true;
            return;
          }
          const now = performance.now() / 1000;
          const wait = nextSlot - now;
          if (wait > 0) await sleep(wait * 1000);
          nextSlot = performance.now() / 1000 + delayS;
        });
      }

      if (stop || signal?.aborted) {
        stop = true;
        return { name, ok: false, error: "aborted", status: null };
      }

      let res = await downloadBundleResolved(name, dest, {
        version,
        dirs,
        setDirCache,
        cacheLock,
        skipExisting: false,
        contentBase,
      });

      const status = res.status;
      const skipped = Boolean(res.skipped);
      await paceLock.run(async () => {
        if (skipped || res.ok) {
          softbanStreak = 0;
          return;
        }

        const blocked =
          res.softBan === true ||
          res.error === "cloudfront-request-blocked";

        if (blocked) {
          softbanStreak += 1;
          if (softbanStreak >= SOFTBAN_STREAK_PAUSE) {
            softbanPauses += 1;
            if (softbanPauses > SOFTBAN_MAX_PAUSES) {
              stop = true;
              persistSoftbanAbort("cloudfront-softban-max-pauses");
            } else {
              console.log(
                `  [soft-ban] cloudfront-request-blocked ` +
                  `streak=${softbanStreak} ` +
                  `→ cooldown ${SOFTBAN_COOLDOWN_S.toFixed(0)}s ` +
                  `(pause ${softbanPauses}/${SOFTBAN_MAX_PAUSES})`,
              );
              await sleep(SOFTBAN_COOLDOWN_S * 1000);
              softbanStreak = 0;
              canaryCache = { ts: 0, status: 0, softBan: true };
            }
          }
          return;
        }

        if (res.softBan === false) {
          softbanStreak = 0;
          return;
        }

        if (status != null && SOFTBAN_STATUSES.has(status)) {
          const canary = await canaryStatus();
          if (canary.softBan || canary.status !== 200) {
            softbanStreak += 1;
            if (softbanStreak >= SOFTBAN_STREAK_PAUSE) {
              softbanPauses += 1;
              if (softbanPauses > SOFTBAN_MAX_PAUSES) {
                stop = true;
                persistSoftbanAbort("cloudfront-softban-canary");
              } else {
                console.log(
                  `  [soft-ban] canary=${canary.status}` +
                    `${canary.softBan ? "+blocked" : ""} ` +
                    `streak=${softbanStreak} ` +
                    `→ cooldown ${SOFTBAN_COOLDOWN_S.toFixed(0)}s ` +
                    `(pause ${softbanPauses}/${SOFTBAN_MAX_PAUSES})`,
                );
                await sleep(SOFTBAN_COOLDOWN_S * 1000);
                softbanStreak = 0;
                canaryCache = {
                  ts: 0,
                  status: canary.status,
                  softBan: canary.softBan,
                };
              }
            }
          } else {
            softbanStreak = 0;
            res = {
              ...res,
              error: "cdn-forbidden-or-missing",
              softBan: false,
            };
          }
          return;
        }

        softbanStreak = 0;
      });
      return res;
    }

    results = await runPool(names, workerCount, pacedDownload, (res, done) => {
      const ok = Boolean(res.ok);
      const status = res.status;
      let logFail = false;
      if (!ok) {
        if (
          (status === 403 || status === 404) &&
          res.softBan === false
        ) {
          missLogged += 1;
          logFail = missLogged <= 3 || missLogged % 100 === 0;
        } else {
          logFail = true;
        }
      }
      if (ok && (done <= 5 || done % 200 === 0 || done === names.length)) {
        console.log(
          `  [ok] ${done}/${names.length} ${res.name} ` +
            `bytes=${res.bytes} skipped=${res.skipped}`,
        );
      } else if (logFail || done === names.length) {
        console.log(
          `  [FAIL] ${done}/${names.length} ${res.name} ` +
            `status=${status} error=${JSON.stringify(res.error)}`,
        );
      }
      if (stop && res.error === "aborted") {
        aborted = "cloudfront-softban";
      }
    });

    if (stop && aborted == null) {
      aborted = "cloudfront-softban";
      console.log(
        "  [abort] too many CloudFront soft-ban responses — " +
          "resume later (skip_existing keeps progress)",
      );
    }
  }

  const ok = results.reduce((n, r) => n + (r.ok ? 1 : 0), 0);
  const skipped = results.reduce((n, r) => n + (r.skipped ? 1 : 0), 0);
  const byStatus: Record<string, number> = {};
  for (const r of results) {
    if (r.status != null) {
      const k = String(r.status);
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
  }
  const sortedByStatus = Object.fromEntries(
    Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b)),
  );

  return {
    requested: names.length,
    ok,
    skipped,
    failed: names.length - ok,
    aborted,
    byStatus: sortedByStatus,
    outDir,
    version,
    contentDir,
    contentBase,
    workers: dryRun ? 0 : workers,
    delayS: dryRun ? 0 : delayS,
    results,
  };
}

type CliArgs = {
  cmd: "scrape" | "catalogue" | "url";
  repo: string;
  names: string[];
  fromSetnums: string | null;
  fromCatalogue: boolean;
  langs: string;
  lang: string | null;
  noFoilT: boolean;
  withShared: boolean;
  limit: number;
  version: string;
  contentDir: string;
  contentBase: string | null;
  dirProbe: DirProbeMode;
  workers: number;
  delay: number;
  dryRun: boolean;
  out: string | null;
  configCache: string | null;
  urlName: string | null;
};

class HelpRequested extends Error {
  constructor() {
    super("help");
    this.name = "HelpRequested";
  }
}

const HELP_TEXT = `Direct CDN scrape for Pokémon TCG Live UnityFS card bundles.

Usage:
  tsx scripts/pokemon/cdn.ts scrape [options]
  tsx scripts/pokemon/cdn.ts catalogue [--config-cache DIR] [--out FILE]
  tsx scripts/pokemon/cdn.ts url <name> [--version V] [--content-dir D] [--content-base URL]

scrape options:
  --names NAME [NAME ...]   Bundle ids to download
  --from-setnums FILE       Text file of set_num lines
  --from-catalogue          Build setnums from config-cache
  --langs ${POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV}   Comma-separated langs (default: fr; then --langs en)
  --lang LANGS              Back-compat alias for --langs
  --no-foil-t               Do not probe *_t foil variants
  --with-shared             Also fetch shadersbundle + attack_* probes
  --limit N                 Cap expanded name list (0 = no limit)
  --version V               CDN version (default: ${DEFAULT_VERSION})
  --content-dir D           Preferred content dir (default: ${DEFAULT_CONTENT_DIR})
  --content-base URL        GameSettings contentpath root (…/Content/Android/V/)
  --probe-all-dirs          Also try dated dirs from asset-bundle-manifest (default: primary only)
  --workers N               Concurrent downloads (default: ${DEFAULT_WORKERS} = sequential)
  --delay S                 Optional sleep between request starts (default: ${DEFAULT_DELAY_S})
  --dry-run                 HEAD only, no downloads
  --out DIR                 Output dir (default: <repo>/data/pokemon/cdn-bundles)
  --repo DIR                Repo root
`;

function takeValue(argv: string[], i: number, flag: string): [string, number] {
  const cur = argv[i]!;
  if (cur.includes("=")) {
    return [cur.slice(cur.indexOf("=") + 1), i];
  }
  const next = argv[i + 1];
  if (next == null || next.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return [next, i + 1];
}

function parseCli(argv: string[]): CliArgs {
  const args: CliArgs = {
    cmd: "scrape",
    repo: path.resolve(dataRoot(), ".."),
    names: [],
    fromSetnums: null,
    fromCatalogue: false,
    langs: POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV,
    lang: null,
    noFoilT: false,
    withShared: false,
    limit: 0,
    version: DEFAULT_VERSION,
    contentDir: DEFAULT_CONTENT_DIR,
    contentBase: null,
    dirProbe: DEFAULT_DIR_PROBE,
    workers: DEFAULT_WORKERS,
    delay: DEFAULT_DELAY_S,
    dryRun: false,
    out: null,
    configCache: null,
    urlName: null,
  };

  const filtered = argv.filter((a) => a !== "--");
  if (filtered.includes("--help") || filtered.includes("-h")) {
    throw new HelpRequested();
  }
  if (filtered.length === 0) {
    throw new Error("Missing command (scrape|catalogue|url)");
  }

  let i = 0;
  // Global --repo before or after subcommand
  while (i < filtered.length) {
    const a = filtered[i]!;
    if (a === "--repo" || a.startsWith("--repo=")) {
      const [v, ni] = takeValue(filtered, i, "--repo");
      args.repo = path.resolve(v);
      i = ni + 1;
      continue;
    }
    break;
  }

  const cmd = filtered[i];
  if (cmd !== "scrape" && cmd !== "catalogue" && cmd !== "url") {
    throw new Error(`Unknown command: ${cmd}`);
  }
  args.cmd = cmd;
  i += 1;

  if (cmd === "url") {
    const name = filtered[i];
    if (!name || name.startsWith("-")) {
      throw new Error("url requires a bundle name");
    }
    args.urlName = name;
    i += 1;
  }

  while (i < filtered.length) {
    const a = filtered[i]!;
    if (a === "--repo" || a.startsWith("--repo=")) {
      const [v, ni] = takeValue(filtered, i, "--repo");
      args.repo = path.resolve(v);
      i = ni + 1;
    } else if (a === "--names" || a.startsWith("--names=")) {
      if (a.startsWith("--names=") && a.length > "--names=".length) {
        args.names.push(...a.slice("--names=".length).split(/\s+/).filter(Boolean));
        i += 1;
      } else {
        i += 1;
        while (i < filtered.length && !filtered[i]!.startsWith("-")) {
          args.names.push(filtered[i]!);
          i += 1;
        }
      }
    } else if (a === "--from-setnums" || a.startsWith("--from-setnums=")) {
      const [v, ni] = takeValue(filtered, i, "--from-setnums");
      args.fromSetnums = path.resolve(v);
      i = ni + 1;
    } else if (a === "--from-catalogue") {
      args.fromCatalogue = true;
      i += 1;
    } else if (a === "--langs" || a.startsWith("--langs=")) {
      const [v, ni] = takeValue(filtered, i, "--langs");
      args.langs = v;
      i = ni + 1;
    } else if (a === "--lang" || a.startsWith("--lang=")) {
      const [v, ni] = takeValue(filtered, i, "--lang");
      args.lang = v;
      i = ni + 1;
    } else if (a === "--no-foil-t") {
      args.noFoilT = true;
      i += 1;
    } else if (a === "--with-shared") {
      args.withShared = true;
      i += 1;
    } else if (a === "--limit" || a.startsWith("--limit=")) {
      const [v, ni] = takeValue(filtered, i, "--limit");
      args.limit = Number.parseInt(v, 10) || 0;
      i = ni + 1;
    } else if (a === "--version" || a.startsWith("--version=")) {
      const [v, ni] = takeValue(filtered, i, "--version");
      args.version = v;
      i = ni + 1;
    } else if (a === "--content-dir" || a.startsWith("--content-dir=")) {
      const [v, ni] = takeValue(filtered, i, "--content-dir");
      args.contentDir = v;
      i = ni + 1;
    } else if (a === "--content-base" || a.startsWith("--content-base=")) {
      const [v, ni] = takeValue(filtered, i, "--content-base");
      args.contentBase = v;
      i = ni + 1;
    } else if (a === "--probe-all-dirs") {
      args.dirProbe = "all";
      i += 1;
    } else if (a === "--workers" || a.startsWith("--workers=")) {
      const [v, ni] = takeValue(filtered, i, "--workers");
      args.workers = Number.parseInt(v, 10) || DEFAULT_WORKERS;
      i = ni + 1;
    } else if (a === "--delay" || a.startsWith("--delay=")) {
      const [v, ni] = takeValue(filtered, i, "--delay");
      args.delay = Number.parseFloat(v);
      if (!Number.isFinite(args.delay)) args.delay = DEFAULT_DELAY_S;
      i = ni + 1;
    } else if (a === "--dry-run") {
      args.dryRun = true;
      i += 1;
    } else if (a === "--out" || a.startsWith("--out=")) {
      const [v, ni] = takeValue(filtered, i, "--out");
      args.out = path.resolve(v);
      i = ni + 1;
    } else if (a === "--config-cache" || a.startsWith("--config-cache=")) {
      const [v, ni] = takeValue(filtered, i, "--config-cache");
      args.configCache = path.resolve(v);
      i = ni + 1;
    } else if (!a.startsWith("-") && cmd === "scrape") {
      // positional names after flags (argparse nargs=* style leftovers)
      args.names.push(a);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  return args;
}

export async function main(argv: string[] | null = null): Promise<number> {
  let args: CliArgs;
  try {
    args = parseCli(argv ?? process.argv.slice(2));
  } catch (err) {
    if (err instanceof HelpRequested) {
      console.log(HELP_TEXT);
      return 0;
    }
    console.error(String(err));
    return 2;
  }

  const repo = path.resolve(args.repo);

  if (args.cmd === "url") {
    console.log(
      bundleUrl(args.urlName!, {
        version: args.version,
        contentDir: args.contentDir,
        contentBase: args.contentBase,
      }),
    );
    return 0;
  }

  if (args.cmd === "catalogue") {
    const cfg = args.configCache
      ? path.resolve(args.configCache)
      : path.join(repo, "data", "pokemon", "config-cache");
    const out = args.out
      ? path.resolve(args.out)
      : path.join(path.dirname(cfg), "cdn-catalogue-setnum.txt");
    const lines = catalogueSetnumsFromConfig(cfg);
    writeFileSync(out, `${lines.join("\n")}\n`, "utf8");
    console.log(JSON.stringify({ count: lines.length, out }, null, 2));
    return 0;
  }

  // scrape
  const out = args.out
    ? path.resolve(args.out)
    : path.join(repo, "data", "pokemon", "cdn-bundles");
  const langsRaw = args.lang || args.langs;
  const langs = langsRaw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  let setnumsPath = args.fromSetnums;
  if (args.fromCatalogue) {
    const cfg = path.join(repo, "data", "pokemon", "config-cache");
    const cat = path.join(repo, "data", "pokemon", "cdn-catalogue-setnum.txt");
    const lines = catalogueSetnumsFromConfig(cfg);
    writeFileSync(cat, `${lines.join("\n")}\n`, "utf8");
    setnumsPath = cat;
    console.log(`Catalogue: ${lines.length} setnums → ${cat}`);
  }

  const extras: string[] = [];
  if (args.withShared) {
    extras.push(
      "shadersbundle",
      "attack_fire",
      "attack_water",
      "attack_grass",
      "attack_lightning",
      "attack_psychic",
      "attack_fighting",
      "attack_dark",
      "attack_metal",
      "attack_dragon",
      "attack_fairy",
      "attack_colorless",
    );
  }

  const names = await loadNames({
    names: args.names,
    fromSetnums: setnumsPath,
    langs,
    includeFoilT: !args.noFoilT,
    limit: args.limit,
    extras,
  });

  if (!names.length) {
    console.error("No bundle names to scrape.");
    return 2;
  }
  console.log(`Scraping ${names.length} bundle(s) langs=${langs.join(",")} → ${out}`);

  /*
    Resolve the content root before the first GET, unless the caller pinned one.

    `{platform}_contentpath` is not stable: Live moved from
    `cdn.studio-prod.pokemon.com` to `cdn.studio-preprod.pokemon.biz` between
    clients 1.38 and 1.39 (`docs/pokemon_live_rainier.md` §3). `sources` already
    reads GameSettings at runtime; scrape did not, and fell back to the host
    baked into `CDN_HOST`.

    That fallback fails in the worst possible way. Every GET against a dead host
    answers 403 with S3 `AccessDenied`, which the classifier correctly reads as
    "object missing" — so a whole catalogue would be reported as unpublished,
    with no hint that we were simply knocking on the wrong door.

    Unreachable GameSettings still falls back to the historical host, which is
    the same behaviour as before; this only removes the silent-wrong-host case.
  */
  let contentBase = args.contentBase ?? undefined;
  if (!contentBase) {
    try {
      // Imported here, not at the top: `gameSettings` imports `CDN_HOST` from
      // this module, so a static import would close the cycle.
      const { fetchContentBase } = await import("./gameSettings");
      const resolved = await fetchContentBase({ version: args.version });
      contentBase = resolved.contentBase;
      console.log(`  content base (${resolved.source}): ${contentBase}`);
    } catch (err) {
      console.warn(
        `  GameSettings unreachable (${(err as Error).message}) — ` +
          `falling back to ${CDN_HOST}`,
      );
    }
  }

  const cfg = path.join(repo, "data", "pokemon", "config-cache");
  const report = await scrape(names, out, {
    version: args.version,
    contentDir: args.contentDir,
    contentBase,
    dirProbe: args.dirProbe,
    configCache: existsSync(cfg) && statSync(cfg).isDirectory() ? cfg : null,
    workers: args.workers,
    delayS: args.delay,
    dryRun: args.dryRun,
  });

  const summary = {
    requested: report.requested,
    ok: report.ok,
    skipped: report.skipped,
    failed: report.failed,
    aborted: report.aborted,
    byStatus: report.byStatus,
    outDir: report.outDir,
    version: report.version,
    contentDir: report.contentDir,
    contentBase: report.contentBase,
    workers: report.workers,
    delayS: report.delayS,
  };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(
    path.join(out, "last-scrape.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  if (report.aborted) return 2;
  if (report.ok > 0) return 0;
  return report.failed ? 1 : 0;
}
