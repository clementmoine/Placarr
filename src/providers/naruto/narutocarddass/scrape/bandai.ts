/**
 * Naruto Carddass bandai scrapers.
 */

import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "@/lib/runtimeData";
import { NARUTO_PACK_ID } from "../indexStore";
import { parseBandaicgAssetPath, parseCarddasJpAssetPath } from "../parse/bandai";
import { ScrapeNarutoOptions } from "./scrapeCards";
import {
  dedupeLatest,
  downloadMirrorHits,
  fetchCdxRows,
  stagingRelFromUrl,
  writeJson,
  type MirrorHit,
} from "../sources/titles";

// ─── shared helpers ─────────────────────────────────────────────────────

const DEFAULT_DELAY_MS = 350;

const DEFAULT_CONCURRENCY = 3;

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), NARUTO_PACK_ID);
}

// ─── scrapeBandaicgCards ──────────────────────────────────────────────────────────

/**
 * Dump official EN Naruto CCG site from Wayback (bandaicg.com) into staging.
 * Not the FR CACG catalogue — do **not** write under `cards/`.
 *
 *   data/naruto/carddass/staging/bandaicg-en/
 *     images/…     ← /naruto/images/* (cards_* + chrome)
 *     pages/…      ← home, cardlists, FAQ… (forum PHP excluded)
 *     cdx.json
 *
 *   Catalogue Sync --locale en
 *   Catalogue Sync --locale en --cdx-only
 *   Catalogue Sync --locale en --force
 *
 * Honest empty: Wayback card arts are partial (thumbs dominate). Forums are
 * skipped on purpose (~40k threads). Promote to `cards/{set}/en/` later.
 */
/** Broad site index — filtered to images + non-forum pages. */
const CDX_SITE =
  "https://web.archive.org/cdx/search/cdx?url=www.bandaicg.com/naruto/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=50000";

/** Dedicated images sweep (same cards tree, redundant-safe via dedupe). */
const CDX_IMAGES =
  "https://web.archive.org/cdx/search/cdx?url=www.bandaicg.com/naruto/images/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

export const NARUTO_STAGING_BANDAICG_EN = path.join("staging", "bandaicg-en");

/** vBulletin / forum noise — never mirror. */
const FORUM_PATH_RE =
  /\/naruto\/(?:showthread|showpost|misc|search|newreply|newthread|member|memberlist|forumdisplay|private|calendar|attachment|archive|sendmessage|external|image|ajax|postings|reputation|report|moderator|admincp|modcp|cron|printthread|tags|login|register|subscription|online|profile|editpost|threadrate|reputation)\.php/i;

function stagingEnDir(root: string): string {
  return path.join(root, NARUTO_STAGING_BANDAICG_EN);
}

function isForumUrl(original: string): boolean {
  try {
    const p = new URL(original).pathname;
    if (FORUM_PATH_RE.test(p)) return true;
    if (/\/naruto\/archive\//i.test(p)) return true;
    return false;
  } catch {
    return true;
  }
}

function classifyEnRel(pathname: string): "images" | "pages" | null {
  const p = pathname.toLowerCase();
  if (!p.includes("/naruto/")) return null;
  if (isForumUrl(`http://www.bandaicg.com${pathname}`)) return null;
  if (p.includes("/naruto/images/")) return "images";
  // Keep cardlists, home, faq, static html/php product pages.
  if (
    /\/naruto\/(?:home|faq|cardlists|news|products?|rule|howto|downloads?)/i.test(
      p,
    ) ||
    /\/naruto\/[^/]+\.(?:html?|php|shtml)$/i.test(p) ||
    /\/naruto\/cardlists/i.test(p)
  ) {
    return "pages";
  }
  return null;
}

function bandaicgCards_toMirrorHit(
  timestamp: string,
  original: string,
  mimetype: string,
): MirrorHit | null {
  let pathname: string;
  try {
    pathname = new URL(original).pathname;
  } catch {
    return null;
  }
  const kind = classifyEnRel(pathname);
  if (!kind) return null;

  const stripped = stagingRelFromUrl(original, {
    stripPathPrefix: "/naruto/",
  });
  if (!stripped) return null;

  // images/* stay under images/; everything else under pages/
  const relPath =
    kind === "images"
      ? stripped.startsWith("images/")
        ? stripped
        : path.posix.join("images", stripped)
      : path.posix.join("pages", stripped.replace(/^pages\//, ""));

  return { timestamp, original, mimetype, relPath };
}

async function sweepEn(): Promise<{
  hits: MirrorHit[];
  cdxRows: number;
  cardAssets: number;
  bySet: Record<string, { art: number; thumb: number }>;
}> {
  const [siteRows, imageRows] = await Promise.all([
    fetchCdxRows(CDX_SITE, "EN site"),
    fetchCdxRows(CDX_IMAGES, "EN images"),
  ]);
  const merged = dedupeLatest([...siteRows, ...imageRows]);
  const byRel = new Map<string, MirrorHit>();
  for (const row of merged) {
    const hit = bandaicgCards_toMirrorHit(row.timestamp, row.original, row.mimetype);
    if (!hit) continue;
    const prev = byRel.get(hit.relPath);
    if (!prev || hit.timestamp > prev.timestamp) byRel.set(hit.relPath, hit);
  }
  const hits = [...byRel.values()].sort((a, b) =>
    a.relPath.localeCompare(b.relPath),
  );

  const bySet: Record<string, { art: number; thumb: number }> = {};
  let cardAssets = 0;
  for (const hit of hits) {
    const parsed = parseBandaicgAssetPath(hit.original);
    if (!parsed) continue;
    cardAssets += 1;
    const bucket = (bySet[parsed.set] ??= { art: 0, thumb: 0 });
    if (parsed.role === "thumb") bucket.thumb += 1;
    else bucket.art += 1;
  }

  return {
    hits,
    cdxRows: siteRows.length + imageRows.length,
    cardAssets,
    bySet,
  };
}

export async function scrapeNarutoEnCards(
  options: ScrapeNarutoOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const stagingDir = stagingEnDir(root);
  const logsDir = path.join(root, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log(
    "── CDX Wayback bandaicg.com/naruto → staging (images + pages, no forum)",
  );
  const sweep = await sweepEn();
  let hits = sweep.hits;
  console.log(
    `mirror=${hits.length} cardAssets=${sweep.cardAssets} cdxRows=${sweep.cdxRows}`,
  );

  if (options.limit && options.limit > 0) {
    hits = hits.slice(0, options.limit);
    console.log(`limited assets=${hits.length}`);
  }

  const inventory = {
    source: "wayback:bandaicg.com",
    layout: {
      images: `${NARUTO_STAGING_BANDAICG_EN}/images/`,
      pages: `${NARUTO_STAGING_BANDAICG_EN}/pages/`,
    },
    note: "Official US CCG mirror. Forums excluded. Staging only — not under cards/.",
    totals: {
      mirror: hits.length,
      cardAssets: sweep.cardAssets,
      cdxRows: sweep.cdxRows,
    },
    bySet: sweep.bySet,
    hits: hits.map((h) => ({
      relPath: h.relPath,
      original: h.original,
      timestamp: h.timestamp,
      mimetype: h.mimetype,
    })),
  };
  writeJson(path.join(stagingDir, "cdx.json"), inventory);
  writeJson(path.join(logsDir, "cdx-hits-en.json"), {
    source: inventory.source,
    layout: inventory.layout,
    note: inventory.note,
    totals: inventory.totals,
    bySet: sweep.bySet,
    // Compact log (paths only) — full list lives in staging/cdx.json
    sample: hits.slice(0, 20).map((h) => h.relPath),
  });

  if (options.cdxOnly) {
    console.log(
      JSON.stringify(
        {
          cdxOnly: true,
          staging: NARUTO_STAGING_BANDAICG_EN,
          ...inventory.totals,
          bySet: sweep.bySet,
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
    `── download EN → ${NARUTO_STAGING_BANDAICG_EN}/ (${hits.length}) concurrency=${concurrency} delayMs=${delayMs}${force ? " force" : ""}`,
  );

  const { ok, skip, fail } = await downloadMirrorHits(hits, stagingDir, {
    concurrency,
    delayMs,
    force,
    label: "en",
  });

  const summary = {
    staging: NARUTO_STAGING_BANDAICG_EN,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    mirror: hits.length,
    cardAssets: sweep.cardAssets,
    bySet: sweep.bySet,
    stagingDir,
  };
  writeJson(path.join(logsDir, "last-run-en.json"), {
    ...summary,
    at: new Date().toISOString(),
  });
  console.log(JSON.stringify(summary, null, 2));
}

// ─── scrapeCarddasJp ──────────────────────────────────────────────────────────

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
 *   Catalogue Sync --locale ja
 *   Catalogue Sync --locale ja --cdx-only
 *
 * Official face dump is sparse (specials + product chrome). Full 巻ノ…
 * cardlists HTML are the valuable part of this mirror.
 */
const CDX_CARDDAS =
  "https://web.archive.org/cdx/search/cdx?url=www.carddas.com/naruto/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

const CDX_CARDDASS =
  "https://web.archive.org/cdx/search/cdx?url=www.carddass.com/naruto/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

export const NARUTO_STAGING_CARDDAS_JP = path.join("staging", "carddas-jp");

/** Skip tiny chrome / tracking junk by mime when path has no useful ext. */
const KEEP_MIME =
  /^(text\/html|text\/css|text\/plain|application\/(pdf|javascript|x-javascript|xhtml)|image\/|application\/octet-stream)/i;

function stagingJpDir(root: string): string {
  return path.join(root, NARUTO_STAGING_CARDDAS_JP);
}

function carddasJp_toMirrorHit(
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
    const hit = carddasJp_toMirrorHit(row.timestamp, row.original, row.mimetype);
    if (!hit) continue;
    const prev = byRel.get(hit.relPath);
    if (!prev || hit.timestamp > prev.timestamp) byRel.set(hit.relPath, hit);
  }

  let aliasExtra = 0;
  for (const row of alias) {
    const key = narutoPathKey(row.original);
    if (key && primaryKeys.has(key)) continue;
    const hit = carddasJp_toMirrorHit(row.timestamp, row.original, row.mimetype);
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
