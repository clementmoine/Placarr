/**
 * Scrape inventory: union of everything we know exists, then availability log.
 *
 * Sources (merged, not either/or):
 *   1. Malie databases — exact ``{set}_{lang}_{num}`` stems (preferred)
 *   2. APK / config-cache — exact stems from card-database identities
 *   3. setnum × langs expansion — **only when Malie stems are absent**
 *      (cartesian product creates phantoms Malie correctly omits)
 *
 * Retrieval order for UnityFS is always Rainier CDN (Malie does not host
 * bundles). Malie status = catalogue membership after bootstrap: if APK knows
 * a stem Malie did not list → ``malie: unavailable`` (still try CDN).
 * CDN miss → ``cdn: unavailable`` and continue; logs teach the next scrape.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { setnumToBundleNames, type BundleResult } from "./cdn";
import { MALIE_CDN_BASE } from "./malie";

function writeJsonGzip(filePath: string, data: unknown): string {
  const gzPath = filePath.endsWith(".gz") ? filePath : `${filePath}.gz`;
  const plain = gzPath.endsWith(".json.gz")
    ? gzPath.slice(0, -".gz".length)
    : filePath;
  writeFileSync(
    gzPath,
    gzipSync(Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8"), {
      level: 9,
    }),
  );
  if (plain !== gzPath && existsSync(plain)) {
    try {
      unlinkSync(plain);
    } catch {
      /* ignore */
    }
  }
  return gzPath;
}

/** Read ``.json`` or ``.json.gz`` (for tests / tooling). */
export function readJsonGzipFile(filePath: string): unknown {
  const candidates = filePath.endsWith(".gz")
    ? [filePath]
    : [`${filePath}.gz`, filePath];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p);
    const text = p.endsWith(".gz")
      ? gunzipSync(raw).toString("utf8")
      : raw.toString("utf8");
    return JSON.parse(text) as unknown;
  }
  throw new Error(`missing json: ${filePath}`);
}

export type StemInventorySource = "apk" | "malie" | "setnum-expand";

export type MalieAvailability = "catalogued" | "unavailable";

export type CdnAvailability =
  | "pending"
  | "ok"
  | "skipped"
  | "unavailable"
  | "softban"
  | "aborted";

export type StemInventoryEntry = {
  stem: string;
  sources: StemInventorySource[];
  malie: MalieAvailability;
  /** Soft art URL on Malie CDN (probe/learning; not UnityFS). */
  malieArtUrl: string | null;
  cdn: CdnAvailability;
  cdnStatus?: number | null;
  cdnError?: string | null;
};

export type ScrapeInventoryReport = {
  langs: string[];
  stemCount: number;
  bySource: {
    apk: number;
    malie: number;
    setnumExpand: number;
    apkOnly: number;
    malieOnly: number;
    both: number;
  };
  malieUnavailable: number;
  cdnUnavailable: number;
  cdnOk: number;
  stemsPath: string;
  reportPath: string;
  availabilityPath: string;
  malieUnavailablePath: string;
  cdnUnavailablePath: string;
};

export type ScrapeInventory = {
  entries: StemInventoryEntry[];
  stems: string[];
  report: ScrapeInventoryReport;
};

const STEM_RE = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z])?$/i;

/** ``me1_fr_001`` → Malie soft tex URL (std variant). */
export function malieCardTexUrl(
  stem: string,
  variant = "std",
): string | null {
  const m = STEM_RE.exec(stem.trim());
  if (!m) return null;
  const set = m[1]!.toLowerCase();
  const lang = m[2]!.toLowerCase();
  const num = m[3]!;
  const base = `${set}_${lang}_${num}`;
  return `${MALIE_CDN_BASE}/cards/tex/${lang}/${set}/${base}_${variant}.png`;
}

function addSource(
  map: Map<string, StemInventoryEntry>,
  stem: string,
  source: StemInventorySource,
): void {
  const key = stem.trim();
  if (!key || key.endsWith("_t")) return;
  const existing = map.get(key);
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }
  map.set(key, {
    stem: key,
    sources: [source],
    malie: "unavailable",
    malieArtUrl: malieCardTexUrl(key),
    cdn: "pending",
  });
}

/**
 * Build the scrape list = APK/config knowledge ∪ Malie stems.
 * Malie catalogue hits flip ``malie`` to ``catalogued``; APK-only stay
 * ``unavailable`` (still scraped from Pokémon CDN).
 */
export function buildScrapeInventory(opts: {
  langs: readonly string[];
  /** Exact stems from config-cache card-database identities. */
  apkStems?: readonly string[];
  /** ``set_NNN`` lines → expanded with ``langs``. */
  apkSetnums?: readonly string[];
  /** Exact stems from Malie bootstrap. */
  malieStems?: readonly string[];
  includeFoilT?: boolean;
  outDir: string;
}): ScrapeInventory {
  const langs = opts.langs.map((l) => l.trim().toLowerCase()).filter(Boolean);
  const map = new Map<string, StemInventoryEntry>();

  for (const stem of opts.apkStems ?? []) {
    const s = stem.trim();
    if (!s) continue;
    const langMatch = /^[a-z0-9.-]+_([a-z]{2,4})_\d{3}/i.exec(s);
    if (langs.length && langMatch && !langs.includes(langMatch[1]!.toLowerCase())) {
      continue;
    }
    addSource(map, s, "apk");
  }

  for (const setnum of opts.apkSetnums ?? []) {
    for (const lang of langs) {
      for (const cand of setnumToBundleNames(setnum, lang)) {
        if (!opts.includeFoilT && cand.endsWith("_t")) continue;
        addSource(map, cand, "setnum-expand");
      }
    }
  }

  for (const stem of opts.malieStems ?? []) {
    const s = stem.trim();
    if (!s) continue;
    const langMatch = /^[a-z0-9.-]+_([a-z]{2,4})_\d{3}/i.exec(s);
    if (langs.length && langMatch && !langs.includes(langMatch[1]!.toLowerCase())) {
      continue;
    }
    addSource(map, s, "malie");
  }

  for (const entry of map.values()) {
    if (entry.sources.includes("malie")) entry.malie = "catalogued";
    else entry.malie = "unavailable";
  }

  const entries = [...map.values()].sort((a, b) =>
    a.stem.localeCompare(b.stem),
  );
  const stems = entries.map((e) => e.stem);

  let apk = 0;
  let malie = 0;
  let setnumExpand = 0;
  let apkOnly = 0;
  let malieOnly = 0;
  let both = 0;
  let malieUnavailable = 0;
  for (const e of entries) {
    if (e.sources.includes("apk") || e.sources.includes("setnum-expand")) apk += 1;
    if (e.sources.includes("malie")) malie += 1;
    if (e.sources.includes("setnum-expand")) setnumExpand += 1;
    const fromApk =
      e.sources.includes("apk") || e.sources.includes("setnum-expand");
    const fromMalie = e.sources.includes("malie");
    if (fromApk && fromMalie) both += 1;
    else if (fromApk) apkOnly += 1;
    else if (fromMalie) malieOnly += 1;
    if (e.malie === "unavailable") malieUnavailable += 1;
  }

  const logsDir = path.join(opts.outDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  const stemsPath = path.join(opts.outDir, "scrape-inventory.txt");
  const reportPath = path.join(opts.outDir, "scrape-inventory.json.gz");
  const availabilityPath = path.join(logsDir, "scrape-availability.json.gz");
  const malieUnavailablePath = path.join(logsDir, "malie-unavailable-stems.txt");
  const cdnUnavailablePath = path.join(logsDir, "cdn-unavailable-stems.txt");

  const report: ScrapeInventoryReport = {
    langs: [...langs],
    stemCount: stems.length,
    bySource: { apk, malie, setnumExpand, apkOnly, malieOnly, both },
    malieUnavailable,
    cdnUnavailable: 0,
    cdnOk: 0,
    stemsPath,
    reportPath,
    availabilityPath,
    malieUnavailablePath,
    cdnUnavailablePath,
  };

  writeFileSync(stemsPath, `${stems.join("\n")}${stems.length ? "\n" : ""}`, "utf8");
  writeJsonGzip(reportPath, { report, entries });
  writeMalieUnavailableList(malieUnavailablePath, entries);

  return { entries, stems, report };
}

function writeMalieUnavailableList(
  dest: string,
  entries: readonly StemInventoryEntry[],
): void {
  const lines = entries
    .filter((e) => e.malie === "unavailable")
    .map((e) => e.stem);
  writeFileSync(dest, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
}

export function cdnStatusFromBundleResult(
  res: BundleResult,
): Pick<StemInventoryEntry, "cdn" | "cdnStatus" | "cdnError"> {
  if (res.ok) {
    return {
      cdn: res.skipped ? "skipped" : "ok",
      cdnStatus: res.status ?? 200,
      cdnError: null,
    };
  }
  if (res.error === "aborted" || res.error === "cloudfront-softban") {
    return { cdn: "aborted", cdnStatus: res.status ?? null, cdnError: res.error };
  }
  if (res.softBan === true || res.error === "cloudfront-request-blocked") {
    return {
      cdn: "softban",
      cdnStatus: res.status ?? null,
      cdnError: res.error ?? "cloudfront-request-blocked",
    };
  }
  return {
    cdn: "unavailable",
    cdnStatus: res.status ?? null,
    cdnError: res.error ?? "cdn-miss",
  };
}

/** Attach CDN scrape results; rewrite availability logs for learning. */
export function mergeCdnResultsIntoInventory(
  inventory: ScrapeInventory,
  results: readonly BundleResult[],
): ScrapeInventory {
  const byName = new Map(results.map((r) => [r.name, r]));
  let cdnOk = 0;
  let cdnUnavailable = 0;
  for (const entry of inventory.entries) {
    const res = byName.get(entry.stem);
    if (!res) continue;
    const patch = cdnStatusFromBundleResult(res);
    entry.cdn = patch.cdn;
    entry.cdnStatus = patch.cdnStatus;
    entry.cdnError = patch.cdnError;
    if (patch.cdn === "ok" || patch.cdn === "skipped") cdnOk += 1;
    if (patch.cdn === "unavailable") cdnUnavailable += 1;
  }
  inventory.report.cdnOk = cdnOk;
  inventory.report.cdnUnavailable = cdnUnavailable;

  writeJsonGzip(inventory.report.reportPath, {
    report: inventory.report,
    entries: inventory.entries,
  });
  writeJsonGzip(inventory.report.availabilityPath, {
        report: inventory.report,
        malieUnavailable: inventory.entries
          .filter((e) => e.malie === "unavailable")
          .map((e) => e.stem),
        cdnUnavailable: inventory.entries
          .filter((e) => e.cdn === "unavailable")
          .map((e) => ({
            stem: e.stem,
            sources: e.sources,
            malie: e.malie,
            status: e.cdnStatus,
            error: e.cdnError,
            malieArtUrl: e.malieArtUrl,
          })),
        cdnSoftban: inventory.entries
          .filter((e) => e.cdn === "softban" || e.cdn === "aborted")
          .map((e) => ({
            stem: e.stem,
            cdn: e.cdn,
            status: e.cdnStatus,
            error: e.cdnError,
          })),
  });
  const cdnMiss = inventory.entries
    .filter((e) => e.cdn === "unavailable")
    .map((e) => e.stem);
  writeFileSync(
    inventory.report.cdnUnavailablePath,
    `${cdnMiss.join("\n")}${cdnMiss.length ? "\n" : ""}`,
    "utf8",
  );
  return inventory;
}

export function loadScrapeInventoryStems(outDir: string): string[] {
  const p = path.join(outDir, "scrape-inventory.txt");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Merge identity rows by ``long_form_id`` (Malie wins on field clash). */
export function mergeLiveIdentities<T extends { long_form_id: string }>(
  primary: readonly T[],
  secondary: readonly T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of secondary) map.set(row.long_form_id, row);
  for (const row of primary) map.set(row.long_form_id, row);
  return [...map.values()];
}
