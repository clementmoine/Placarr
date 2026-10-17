/**
 * Harvest distinct card backs for any TCG Cards host.
 *
 * 1. Fetch `/cards` (+ langue lists) → observe lazyload sleeve URLs.
 * 2. Probe CDN for each type-filter label (covers DON!! / Stage absent from
 *    the default page) + always try `cards/original/back.webp`.
 * 3. Install via `discoverDistinctBacks` (skip hashes == pack default).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir } from "@/lib/packPaths";
import {
  installDistinctBacks,
  type DistinctBackCandidate,
} from "@/providers/shared/cardCatalogue/discoverDistinctBacks";

import {
  localBackSlugFromCdnSegment,
  parseTcgCardsBackUrls,
  parseTcgCardsTypeFilterLabels,
  pickDefaultBackObservation,
  tcgCardsCardListPaths,
  tcgCardsOriginalBackUrl,
  tcgCardsProbeUrlsForTypeLabel,
  tcgCardsStaticOrigin,
  type ObservedTcgCardsBack,
} from "./parseCommonBacks";
import {
  tcgCardsSite,
  type TcgCardsSite,
  type TcgCardsSiteId,
} from "./sites";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type HarvestTcgCardsBacksResult = {
  siteId: string;
  packId: string | null;
  pagesFetched: number;
  observed: ObservedTcgCardsBack[];
  probed: number;
  installed: string[];
  skippedDefault: string[];
  missing: string[];
  defaultSlug: string | null;
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 30_000,
    });
    const html = String((res as { data?: unknown }).data ?? "");
    return html.length > 200 ? html : null;
  } catch {
    return null;
  }
}

async function downloadWebp(url: string): Promise<Buffer | null> {
  try {
    const response = await httpGet(url, {
      headers: { "User-Agent": UA, Accept: "image/webp,*/*" },
      responseType: "arraybuffer",
      timeout: 30_000,
    });
    const data = (response as { data?: ArrayBuffer }).data;
    if (!data) return null;
    const buf = Buffer.from(data);
    if (buf.length < 100 || buf[0] !== 0x52) return null; // RIFF…
    return buf;
  } catch {
    return null;
  }
}

function mergeObserved(
  into: Map<string, ObservedTcgCardsBack>,
  rows: readonly ObservedTcgCardsBack[],
): void {
  for (const row of rows) into.set(row.url, row);
}

/**
 * Discover + install backs for one TCG Cards site into pack card dirs.
 */
export async function harvestTcgCardsDistinctBacks(
  siteOrId: TcgCardsSite | TcgCardsSiteId,
  opts?: {
    force?: boolean;
    curatedCardsDir?: string;
    dataCardsDir?: string;
    /** When set, write pack default here even if curated already has back.webp. */
    writeDefault?: boolean;
  },
): Promise<HarvestTcgCardsBacksResult> {
  const site = typeof siteOrId === "string" ? tcgCardsSite(siteOrId) : siteOrId;
  const staticOrigin = tcgCardsStaticOrigin(site.origin);
  const byUrl = new Map<string, ObservedTcgCardsBack>();
  const typeLabels = new Set<string>();
  let pagesFetched = 0;

  for (const listPath of tcgCardsCardListPaths(site)) {
    const html = await fetchHtml(`${site.origin.replace(/\/$/, "")}${listPath}`);
    if (!html) continue;
    pagesFetched += 1;
    mergeObserved(byUrl, parseTcgCardsBackUrls(html));
    for (const label of parseTcgCardsTypeFilterLabels(html)) {
      typeLabels.add(label);
    }
  }

  const probeUrls = new Set<string>();
  probeUrls.add(tcgCardsOriginalBackUrl(staticOrigin));
  for (const label of typeLabels) {
    for (const url of tcgCardsProbeUrlsForTypeLabel(staticOrigin, label)) {
      probeUrls.add(url);
    }
  }
  // Also probe every already-observed common URL (re-download for install).
  for (const row of byUrl.values()) {
    probeUrls.add(row.url);
  }

  const downloaded = new Map<string, Buffer>();
  const missing: string[] = [];
  const observedBeforeProbe = new Set(byUrl.keys());
  for (const url of probeUrls) {
    const buf = await downloadWebp(url);
    if (!buf) {
      // Only flag URLs we already saw in HTML — type-label probes often 404.
      if (observedBeforeProbe.has(url)) {
        const seg =
          url.match(/\/back-([^/]+)\.webp$/i)?.[1] ??
          (url.includes("/original/back.webp") ? "original" : url);
        missing.push(decodeURIComponent(seg));
      }
      continue;
    }
    downloaded.set(url, buf);
    if (!byUrl.has(url)) {
      if (url.includes("/cards/original/back.webp")) {
        byUrl.set(url, { url, kind: "original", segment: null });
      } else {
        const seg = url.match(/\/back-([^/]+)\.webp$/i)?.[1];
        if (seg) {
          byUrl.set(url, {
            url,
            kind: "common",
            segment: decodeURIComponent(seg),
          });
        }
      }
    }
  }

  const observed = [...byUrl.values()];
  const defaultObs = pickDefaultBackObservation(
    observed.filter((o) => downloaded.has(o.url)),
  );
  const defaultBytes = defaultObs ? downloaded.get(defaultObs.url) ?? null : null;
  const defaultSlug =
    defaultObs?.kind === "original"
      ? "original"
      : defaultObs?.segment
        ? localBackSlugFromCdnSegment(defaultObs.segment)
        : null;

  const curatedDir = opts?.curatedCardsDir;
  const dataDir =
    opts?.dataCardsDir ??
    (site.packId ? packCardsDir(site.packId) : null);

  if (defaultBytes && curatedDir) {
    mkdirSync(curatedDir, { recursive: true });
    const dest = path.join(curatedDir, "back.webp");
    if (opts?.force || opts?.writeDefault || !existsSync(dest)) {
      writeFileSync(dest, defaultBytes);
    }
  }
  if (defaultBytes && dataDir) {
    mkdirSync(dataDir, { recursive: true });
    const dest = path.join(dataDir, "back.webp");
    if (opts?.force || opts?.writeDefault || !existsSync(dest)) {
      writeFileSync(dest, defaultBytes);
    }
  }

  const candidates: DistinctBackCandidate[] = [];
  const seenLocal = new Set<string>();
  for (const row of observed) {
    if (row.kind !== "common" || !row.segment) continue;
    const local = localBackSlugFromCdnSegment(row.segment);
    if (!local || local === defaultSlug) continue;
    if (defaultObs && row.url === defaultObs.url) continue;
    const bytes = downloaded.get(row.url);
    if (!bytes) continue;
    if (seenLocal.has(local)) continue;
    seenLocal.add(local);
    candidates.push({
      slug: local,
      bytes,
      aliasKeys:
        local !== row.segment.toLowerCase()
          ? [row.segment.toLowerCase()]
          : undefined,
    });
  }

  const packDefaultBytes =
    defaultBytes ??
    (curatedDir && existsSync(path.join(curatedDir, "back.webp"))
      ? readFileSync(path.join(curatedDir, "back.webp"))
      : dataDir && existsSync(path.join(dataDir, "back.webp"))
        ? readFileSync(path.join(dataDir, "back.webp"))
        : null);

  const installed: string[] = [];
  const skippedDefault: string[] = [];
  for (const dir of [curatedDir, dataDir]) {
    if (!dir) continue;
    const result = installDistinctBacks(candidates, {
      cardsDir: dir,
      defaultBytes: packDefaultBytes,
      ext: "webp",
      force: opts?.force,
      pruneDefaultDuplicates: true,
    });
    installed.push(...result.installed);
    skippedDefault.push(...result.skippedDefault);
  }

  return {
    siteId: site.id,
    packId: site.packId,
    pagesFetched,
    observed,
    probed: probeUrls.size,
    installed: [...new Set(installed)],
    skippedDefault: [...new Set(skippedDefault)],
    missing: [...new Set(missing)],
    defaultSlug,
  };
}
