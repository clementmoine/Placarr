/**
 * Dump sparse JP official specials from Wayback carddas.com into staging.
 * Not the FR CACG catalogue — do **not** write under `cards/`.
 *
 *   data/naruto/ccg/staging/carddas-jp/cardlist/card_img/…
 *
 *   pnpm naruto:cards -- --locale ja
 *
 * Not a full 巻ノ catalogue — CDX only has ~dozen `*_spc2.gif` under card_img/.
 */
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";
import { parseCarddasJpAssetPath } from "./parseCarddasJpAsset";
import { waybackRawUrl } from "./parseCarddassAsset";
import { downloadRaw, runPool, type ScrapeNarutoOptions } from "./scrapeCards";

const CDX_URL =
  "https://web.archive.org/cdx/search/cdx?url=www.carddas.com/naruto/cardlist/card_img/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=5000";

/** Raw official mirror — same role as `staging/carddass-fr/images/`. */
export const NARUTO_STAGING_CARDDAS_JP = path.join("staging", "carddas-jp");

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DELAY_MS = 500;

const IMAGE_MIME =
  /^(image\/(jpeg|jpg|png|gif|webp)|application\/octet-stream)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

type CdxHit = {
  timestamp: string;
  original: string;
  /** Path under `staging/carddas-jp/` (e.g. cardlist/card_img/jutsu-027_spc2.gif). */
  relPath: string;
  printKey: string;
  stem: string;
  kind: string;
};

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingJpDir(root: string): string {
  return path.join(root, NARUTO_STAGING_CARDDAS_JP);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.port === "80" || u.port === "443") u.port = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** `…/naruto/cardlist/card_img/x.gif` → `cardlist/card_img/x.gif` */
function relPathFromOriginal(original: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(original).pathname).replace(
      /\\/g,
      "/",
    );
    const m = pathname.match(/\/naruto\/(cardlist\/card_img\/[^/]+)$/i);
    return m?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function fetchCdxHits(): Promise<{
  hits: CdxHit[];
  cdxRows: number;
}> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`CDX JP fetch attempt ${attempt}/5…`);
      const response = await fetch(CDX_URL, {
        headers: { "user-agent": "PlacarrNarutoScrape/1.0 (local collection)" },
      });
      if (!response.ok) throw new Error(`CDX HTTP ${response.status}`);
      const raw = (await response.json()) as string[][];
      const byCanon = new Map<
        string,
        { timestamp: string; original: string }
      >();
      let cdxRows = 0;
      for (const row of raw) {
        if (!row[0] || row[0] === "timestamp") continue;
        cdxRows += 1;
        const timestamp = row[0]!;
        const original = row[1]!;
        const mimetype = (row[2] || "").toLowerCase();
        if (!original) continue;
        const looksImage =
          IMAGE_MIME.test(mimetype) ||
          IMAGE_EXT.test(original.split("?")[0] ?? "");
        if (!looksImage) continue;
        const canon = canonicalizeUrl(original);
        const prev = byCanon.get(canon);
        if (!prev || timestamp > prev.timestamp) {
          byCanon.set(canon, { timestamp, original });
        }
      }
      const hits: CdxHit[] = [];
      for (const { timestamp, original } of byCanon.values()) {
        const parsed = parseCarddasJpAssetPath(original);
        const relPath = relPathFromOriginal(original);
        if (!parsed || !relPath) continue;
        hits.push({
          timestamp,
          original,
          relPath,
          printKey: parsed.printKey,
          stem: parsed.stem,
          kind: parsed.kind,
        });
      }
      hits.sort((a, b) => a.stem.localeCompare(b.stem));
      return { hits, cdxRows };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(attempt * 3_000);
    }
  }
  throw lastError ?? new Error("CDX JP failed");
}

export async function scrapeNarutoJpCards(
  options: ScrapeNarutoOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const stagingDir = stagingJpDir(root);
  const logsDir = path.join(root, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log("── CDX Wayback carddas.com/naruto/cardlist/card_img → staging");
  const sweep = await fetchCdxHits();
  let hits = sweep.hits;
  console.log(`CDX rows=${sweep.cdxRows} specials=${hits.length}`);

  if (options.limit && options.limit > 0) {
    hits = hits.slice(0, options.limit);
  }

  fs.writeFileSync(
    path.join(logsDir, "cdx-hits-ja.json"),
    `${JSON.stringify(
      {
        source: "wayback:carddas.com",
        layout: `${NARUTO_STAGING_CARDDAS_JP}/cardlist/card_img/`,
        specials: hits.map((h) => ({
          printKey: h.printKey,
          stem: h.stem,
          kind: h.kind,
          relPath: h.relPath,
          original: h.original,
          timestamp: h.timestamp,
        })),
        note: "Staging only (JP specials ≠ FR CACG). Sparse archive; no full 巻ノ dump. Not written under cards/.",
      },
      null,
      2,
    )}\n`,
  );

  if (options.cdxOnly) {
    console.log(
      JSON.stringify(
        {
          cdxOnly: true,
          staging: NARUTO_STAGING_CARDDAS_JP,
          specials: hits.length,
          layout: `${NARUTO_STAGING_CARDDAS_JP}/cardlist/card_img/`,
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

  let ok = 0;
  let skip = 0;
  let fail = 0;
  await runPool(hits, concurrency, delayMs, async (hit) => {
    const dest = path.join(stagingDir, hit.relPath);
    const url = waybackRawUrl(hit.timestamp, hit.original);
    const result = await downloadRaw(url, dest, !force);
    if (result === "ok") ok += 1;
    else if (result === "skip") skip += 1;
    else fail += 1;
  });

  const summary = {
    staging: NARUTO_STAGING_CARDDAS_JP,
    layout: `${NARUTO_STAGING_CARDDAS_JP}/cardlist/card_img/`,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    specials: hits.length,
    stagingDir,
    note: "Sparse JP specials in staging — promote to cards/{set}/jap/ when first-class.",
  };
  fs.writeFileSync(
    path.join(logsDir, "last-run-ja.json"),
    `${JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}

/** @deprecated alias */
export const scrapeNarutoJpStaging = scrapeNarutoJpCards;
