/**
 * Dump official JP NARUTOカードゲーム site from Wayback into staging.
 * Not the FR CACG catalogue — do **not** write under `cards/`.
 *
 * Hosts (same product line, overlapping archives):
 *   www.carddas.com/naruto/*   (primary — richer)
 *   www.carddass.com/naruto/*  (alias / leftovers)
 *
 *   data/naruto/carddass/staging/carddas-jp/
 *     www.carddas.com/naruto/…
 *     www.carddass.com/naruto/…   (paths not already on carddas.com)
 *     cdx.json
 *
 *   pnpm naruto:cards -- --locale ja
 *   pnpm naruto:cards -- --locale ja --cdx-only
 *
 * Official face dump is sparse (specials + product chrome). Full 巻ノ…
 * cardlists HTML are the valuable part of this mirror.
 */
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";
import { parseCarddasJpAssetPath } from "./parseCarddasJpAsset";
import type { ScrapeNarutoOptions } from "./scrapeCards";
import {
  dedupeLatest,
  downloadMirrorHits,
  fetchCdxRows,
  stagingRelFromUrl,
  writeJson,
  type MirrorHit,
} from "./waybackSiteMirror";

const CDX_CARDDAS =
  "https://web.archive.org/cdx/search/cdx?url=www.carddas.com/naruto/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

const CDX_CARDDASS =
  "https://web.archive.org/cdx/search/cdx?url=www.carddass.com/naruto/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

export const NARUTO_STAGING_CARDDAS_JP = path.join("staging", "carddas-jp");

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_DELAY_MS = 350;

/** Skip tiny chrome / tracking junk by mime when path has no useful ext. */
const KEEP_MIME =
  /^(text\/html|text\/css|text\/plain|application\/(pdf|javascript|x-javascript|xhtml)|image\/|application\/octet-stream)/i;

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingJpDir(root: string): string {
  return path.join(root, NARUTO_STAGING_CARDDAS_JP);
}

function toMirrorHit(
  timestamp: string,
  original: string,
  mimetype: string,
): MirrorHit | null {
  if (mimetype && !KEEP_MIME.test(mimetype)) {
    if (!/\.(html?|shtml|php|jpe?g|png|gif|webp|pdf|css|js)$/i.test(original)) {
      return null;
    }
  }
  const relPath = stagingRelFromUrl(original, {
    stripPathPrefix: "/naruto/",
    includeHost: true,
  });
  if (!relPath) return null;
  const host = relPath.split("/")[0] ?? "www.carddas.com";
  const rest = relPath.slice(host.length + 1);
  const withNaruto = rest.startsWith("naruto/")
    ? relPath
    : path.posix.join(host, "naruto", rest);
  return {
    timestamp,
    original,
    mimetype,
    relPath: withNaruto.toLowerCase(),
  };
}

/** Path under /naruto/ without host — for cross-host dedupe. */
function narutoPathKey(original: string): string | null {
  try {
    const u = new URL(original);
    const p = decodeURIComponent(u.pathname).toLowerCase();
    const idx = p.indexOf("/naruto/");
    if (idx < 0) return null;
    return `${p.slice(idx)}${u.search.toLowerCase()}`;
  } catch {
    return null;
  }
}

async function sweepJp(): Promise<{
  hits: MirrorHit[];
  cdxRows: number;
  specials: number;
  byHost: Record<string, number>;
}> {
  const [carddasRows, carddassRows] = await Promise.all([
    fetchCdxRows(CDX_CARDDAS, "JP carddas.com"),
    fetchCdxRows(CDX_CARDDASS, "JP carddass.com"),
  ]);

  const primary = dedupeLatest(carddasRows);
  const alias = dedupeLatest(carddassRows);

  const primaryKeys = new Set<string>();
  const byRel = new Map<string, MirrorHit>();

  for (const row of primary) {
    const key = narutoPathKey(row.original);
    if (key) primaryKeys.add(key);
    const hit = toMirrorHit(row.timestamp, row.original, row.mimetype);
    if (!hit) continue;
    const prev = byRel.get(hit.relPath);
    if (!prev || hit.timestamp > prev.timestamp) byRel.set(hit.relPath, hit);
  }

  let aliasExtra = 0;
  for (const row of alias) {
    const key = narutoPathKey(row.original);
    if (key && primaryKeys.has(key)) continue;
    const hit = toMirrorHit(row.timestamp, row.original, row.mimetype);
    if (!hit) continue;
    aliasExtra += 1;
    const prev = byRel.get(hit.relPath);
    if (!prev || hit.timestamp > prev.timestamp) byRel.set(hit.relPath, hit);
  }

  const hits = [...byRel.values()].sort((a, b) =>
    a.relPath.localeCompare(b.relPath),
  );

  let specials = 0;
  const byHost: Record<string, number> = {};
  for (const hit of hits) {
    const host = hit.relPath.split("/")[0] ?? "?";
    byHost[host] = (byHost[host] ?? 0) + 1;
    if (parseCarddasJpAssetPath(hit.original)) specials += 1;
  }

  console.log(`JP alias extras from carddass.com (unique paths)=${aliasExtra}`);

  return {
    hits,
    cdxRows: carddasRows.length + carddassRows.length,
    specials,
    byHost,
  };
}

export async function scrapeNarutoJpCards(
  options: ScrapeNarutoOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const stagingDir = stagingJpDir(root);
  const logsDir = path.join(root, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log(
    "── CDX Wayback carddas.com + carddass.com /naruto → staging (full site mirror)",
  );
  const sweep = await sweepJp();
  let hits = sweep.hits;
  console.log(
    `mirror=${hits.length} specials=${sweep.specials} cdxRows=${sweep.cdxRows}`,
  );

  if (options.limit && options.limit > 0) {
    hits = hits.slice(0, options.limit);
    console.log(`limited assets=${hits.length}`);
  }

  const inventory = {
    source: "wayback:carddas.com+carddass.com",
    layout: `${NARUTO_STAGING_CARDDAS_JP}/{host}/naruto/…`,
    note: "Official JP Carddass CG site mirror. Sparse face GIFs; cardlist HTML is the main corpus. Staging only.",
    totals: {
      mirror: hits.length,
      specials: sweep.specials,
      cdxRows: sweep.cdxRows,
      byHost: sweep.byHost,
    },
    hits: hits.map((h) => ({
      relPath: h.relPath,
      original: h.original,
      timestamp: h.timestamp,
      mimetype: h.mimetype,
    })),
  };
  writeJson(path.join(stagingDir, "cdx.json"), inventory);
  writeJson(path.join(logsDir, "cdx-hits-ja.json"), {
    source: inventory.source,
    layout: inventory.layout,
    note: inventory.note,
    totals: inventory.totals,
    sample: hits.slice(0, 30).map((h) => h.relPath),
  });

  if (options.cdxOnly) {
    console.log(
      JSON.stringify(
        {
          cdxOnly: true,
          staging: NARUTO_STAGING_CARDDAS_JP,
          ...inventory.totals,
        },
        null,
        2,
      ),
    );
    return;
  }

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const force = options.force ?? false;

  console.log(
    `── download JP → ${NARUTO_STAGING_CARDDAS_JP}/ (${hits.length}) concurrency=${concurrency} delayMs=${delayMs}${force ? " force" : ""}`,
  );

  const { ok, skip, fail } = await downloadMirrorHits(hits, stagingDir, {
    concurrency,
    delayMs,
    force,
    label: "ja",
  });

  const summary = {
    staging: NARUTO_STAGING_CARDDAS_JP,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    mirror: hits.length,
    specials: sweep.specials,
    byHost: sweep.byHost,
    stagingDir,
  };
  writeJson(path.join(logsDir, "last-run-ja.json"), {
    ...summary,
    at: new Date().toISOString(),
  });
  console.log(JSON.stringify(summary, null, 2));
}

/** @deprecated alias */
export const scrapeNarutoJpStaging = scrapeNarutoJpCards;
