/**
 * Shared Wayback CDX → staging mirror helpers for official Naruto sites.
 * Staging only — never writes under `cards/`.
 */
import fs from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { waybackRawUrl } from "../parse/parseCarddassAsset";
import { downloadRaw, runPool } from "../scrape/scrapeCards";

export const WAYBACK_UA = "PlacarrNarutoScrape/1.0 (local collection)";

export type CdxRow = {
  timestamp: string;
  original: string;
  mimetype: string;
  statuscode: string;
};

export type MirrorHit = {
  timestamp: string;
  original: string;
  mimetype: string;
  /** Path under the staging root (posix-ish, lowercased). */
  relPath: string;
};

export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.port === "80" || u.port === "443") u.port = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Filesystem-safe relative path from an archived URL.
 * Query strings become `__k=v_k2=v2` before the extension (or + `.html`).
 */
export function stagingRelFromUrl(
  original: string,
  opts: {
    /** Keep only the path after this prefix (e.g. `/naruto/`). */
    stripPathPrefix?: string;
    /** Prepend host folder (`www.carddas.com/…`). */
    includeHost?: boolean;
  } = {},
): string | null {
  let u: URL;
  try {
    u = new URL(original);
  } catch {
    return null;
  }
  let pathname = decodeURIComponent(u.pathname).replace(/\\/g, "/");
  if (pathname.includes("%7c") || /archive-url=/i.test(pathname)) return null;

  const strip = opts.stripPathPrefix;
  if (strip) {
    const lower = pathname.toLowerCase();
    const needle = strip.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx < 0) return null;
    pathname = pathname.slice(idx + strip.length);
  }
  pathname = pathname.replace(/^\/+/, "");
  if (!pathname) pathname = "index.html";

  if (u.search && u.search.length > 1) {
    const q = u.search
      .slice(1)
      .replace(/[^a-zA-Z0-9._=-]+/g, "_")
      .slice(0, 180);
    const ext = path.posix.extname(pathname);
    if (ext) {
      pathname = `${pathname.slice(0, -ext.length)}__${q}${ext}`;
    } else {
      pathname = `${pathname}__${q}.html`;
    }
  }

  const host = normalizeArchiveHost(u.hostname);
  const rel = opts.includeHost ? path.posix.join(host, pathname) : pathname;
  return rel.toLowerCase();
}

/** Prefer `www.` so carddas.com / www.carddas.com do not fork the mirror. */
export function normalizeArchiveHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/:\d+$/, "");
  if (h === "carddas.com" || h === "www.carddas.com") return "www.carddas.com";
  if (h === "carddass.com" || h === "www.carddass.com")
    return "www.carddass.com";
  if (h === "bandaicg.com" || h === "www.bandaicg.com")
    return "www.bandaicg.com";
  return h.startsWith("www.") ? h : h;
}

export async function fetchCdxRows(
  cdxUrl: string,
  label: string,
): Promise<CdxRow[]> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const started = Date.now();
    console.log(`CDX ${label} attempt ${attempt}/5…`);
    try {
      const response = await httpGet<string[][]>(cdxUrl, {
        headers: { "user-agent": WAYBACK_UA },
        // Le CDX Wayback met souvent 20–90s à répondre.
        timeout: 180_000,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`CDX HTTP ${response.status}`);
      }
      const raw = response.data;
      const rows: CdxRow[] = [];
      for (const row of raw) {
        if (!row[0] || row[0] === "timestamp") continue;
        rows.push({
          timestamp: row[0]!,
          original: row[1]!,
          mimetype: (row[2] || "").toLowerCase(),
          statuscode: row[3] || "",
        });
      }
      console.log(
        `CDX ${label} done in ${Math.round((Date.now() - started) / 1000)}s → rows=${rows.length}`,
      );
      return rows;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = attempt * 3_000;
      console.warn(
        `CDX ${label} attempt ${attempt}/5 failed: ${lastError.message} — retry in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastError ?? new Error(`CDX ${label} failed`);
}

/** Latest capture per canonical URL. */
export function dedupeLatest(rows: readonly CdxRow[]): CdxRow[] {
  const byCanon = new Map<string, CdxRow>();
  for (const row of rows) {
    if (!row.original) continue;
    const canon = canonicalizeUrl(row.original);
    const prev = byCanon.get(canon);
    if (!prev || row.timestamp > prev.timestamp) byCanon.set(canon, row);
  }
  return [...byCanon.values()];
}

export async function downloadMirrorHits(
  hits: readonly MirrorHit[],
  stagingDir: string,
  opts: {
    concurrency: number;
    delayMs: number;
    force: boolean;
    label: string;
  },
): Promise<{ ok: number; skip: number; fail: number }> {
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let done = 0;
  const total = hits.length;
  const progressEvery = Math.max(10, Math.floor(total / 50) || 1);

  await runPool(hits, opts.concurrency, opts.delayMs, async (hit) => {
    const dest = path.join(stagingDir, hit.relPath);
    const url = waybackRawUrl(hit.timestamp, hit.original);
    const result = await downloadRaw(url, dest, !opts.force);
    if (result === "ok") ok += 1;
    else if (result === "skip") skip += 1;
    else fail += 1;
    done += 1;
    if (
      done === 1 ||
      done === total ||
      done % progressEvery === 0 ||
      result === "fail"
    ) {
      console.log(
        `${opts.label} ${done}/${total} (ok=${ok} skip=${skip} fail=${fail}) · ${hit.relPath}${result === "fail" ? " FAIL" : ""}`,
      );
    }
  });

  return { ok, skip, fail };
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
