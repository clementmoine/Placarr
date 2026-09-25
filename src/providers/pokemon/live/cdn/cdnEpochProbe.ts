/**
 * Probe Rainier dated content dirs that the APK config-cache may not list yet.
 *
 * New Live drops (e.g. 30th Celebration / me5-5) often land only under
 * ``YYYYMMDD_1700`` epochs while ``10101_0000`` stays the long-lived primary.
 * Without probing, AssetManifest dumps miss those buckets and scrape invents
 * nothing even when CDN version discovery is correct.
 */

import { DEFAULT_CONTENT_DIR, DEFAULT_UA } from ".";
import { normalizeContentBase } from "../gameSettings";
import { httpGet } from "@/lib/http/httpClient";

/** Live dated epochs observed as ``YYYYMMDD_1700``. */
export const DATED_EPOCH_SUFFIX = "1700";

export function candidateDatedContentDirs(
  now: Date = new Date(),
  lookbackDays = 60,
): string[] {
  const days = Math.max(0, Math.floor(lookbackDays));
  const out: string[] = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    d.setUTCDate(d.getUTCDate() - i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}${m}${day}_${DATED_EPOCH_SUFFIX}`);
  }
  return out;
}

export function mergeContentDirLists(
  ...lists: readonly (readonly string[])[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (dir: string) => {
    const d = dir.trim();
    if (!d || seen.has(d)) return;
    seen.add(d);
    out.push(d);
  };
  push(DEFAULT_CONTENT_DIR);
  for (const list of lists) {
    for (const dir of list) push(dir);
  }
  return out;
}

export type ProbeLiveContentDirsOpts = {
  contentBase: string;
  knownDirs?: readonly string[];
  lookbackDays?: number;
  /** Freeze the calendar for tests (defaults to `new Date()`). */
  now?: Date;
  /** Locale used for the cheap manifest HEAD probe (EN is always published). */
  probeLocale?: string;
  headStatus?: (url: string) => Promise<number>;
};

export type ProbeLiveContentDirsResult = {
  dirs: string[];
  probedOk: string[];
  probedMiss: number;
};

function manifestProbeUrl(
  contentBase: string,
  bucket: string,
  locale: string,
): string {
  const base = normalizeContentBase(contentBase);
  return `${base}${bucket}/manifest_${locale}_${bucket}`;
}

async function defaultHeadStatus(url: string): Promise<number> {
  const res = await httpGet<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15_000,
    headers: { "User-Agent": DEFAULT_UA },
    validateStatus: () => true,
    noDedup: true,
  });
  return res.status;
}

/**
 * HEAD recent dated manifests and union with APK/config known dirs.
 */
export async function probeLiveContentDirs(
  opts: ProbeLiveContentDirsOpts,
): Promise<ProbeLiveContentDirsResult> {
  const locale = (opts.probeLocale ?? "en").trim().toLowerCase() || "en";
  const head = opts.headStatus ?? defaultHeadStatus;
  const candidates = candidateDatedContentDirs(
    opts.now ?? new Date(),
    opts.lookbackDays ?? 60,
  );
  const known = new Set(
    (opts.knownDirs ?? []).map((d) => d.trim()).filter(Boolean),
  );
  const probedOk: string[] = [];
  let probedMiss = 0;
  for (const dir of candidates) {
    if (known.has(dir) || dir === DEFAULT_CONTENT_DIR) continue;
    const status = await head(manifestProbeUrl(opts.contentBase, dir, locale));
    if (status === 200) probedOk.push(dir);
    else probedMiss += 1;
  }
  return {
    dirs: mergeContentDirLists(opts.knownDirs ?? [], probedOk),
    probedOk,
    probedMiss,
  };
}
