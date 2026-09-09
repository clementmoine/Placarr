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
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../indexStore";
import { parseBandaicgAssetPath } from "../parse/parseBandaicgAsset";
import type { ScrapeNarutoOptions } from "./scrapeCards";
import {
  dedupeLatest,
  downloadMirrorHits,
  fetchCdxRows,
  stagingRelFromUrl,
  writeJson,
  type MirrorHit,
} from "../sources/waybackSiteMirror";

/** Broad site index — filtered to images + non-forum pages. */
const CDX_SITE =
  "https://web.archive.org/cdx/search/cdx?url=www.bandaicg.com/naruto/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=50000";

/** Dedicated images sweep (same cards tree, redundant-safe via dedupe). */
const CDX_IMAGES =
  "https://web.archive.org/cdx/search/cdx?url=www.bandaicg.com/naruto/images/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

export const NARUTO_STAGING_BANDAICG_EN = path.join("staging", "bandaicg-en");

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_DELAY_MS = 350;

/** vBulletin / forum noise — never mirror. */
const FORUM_PATH_RE =
  /\/naruto\/(?:showthread|showpost|misc|search|newreply|newthread|member|memberlist|forumdisplay|private|calendar|attachment|archive|sendmessage|external|image|ajax|postings|reputation|report|moderator|admincp|modcp|cron|printthread|tags|login|register|subscription|online|profile|editpost|threadrate|reputation)\.php/i;

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), NARUTO_PACK_ID);
}

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

function toMirrorHit(
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
    const hit = toMirrorHit(row.timestamp, row.original, row.mimetype);
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
