/**
 * Dump Naruto CCG EN faces from Wayback (bandaicg.com) into staging.
 * Not the FR CACG catalogue — do **not** write under `cards/`.
 *
 *   data/naruto/ccg/staging/bandaicg-en/images/cards_s{N|pr}/…
 *
 *   pnpm naruto:cards -- --locale en
 *   pnpm naruto:cards -- --locale en --cdx-only
 *   pnpm naruto:cards -- --locale en --force
 *
 * Honest empty: Wayback only archived a partial `cards_*` tree (mostly `_t` thumbs).
 * Promote to `cards/{set}/en/` only when that product line is first-class.
 */
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./indexStore";
import { parseBandaicgAssetPath } from "./parseBandaicgAsset";
import { waybackRawUrl } from "./parseCarddassAsset";
import { downloadRaw, runPool, type ScrapeNarutoOptions } from "./scrapeCards";

const CDX_URL =
  "https://web.archive.org/cdx/search/cdx?url=www.bandaicg.com/naruto/images/cards*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

/** Raw official mirror — same role as `staging/carddass-fr/images/`. */
export const NARUTO_STAGING_BANDAICG_EN = path.join("staging", "bandaicg-en");

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DELAY_MS = 500;

const IMAGE_MIME =
  /^(image\/(jpeg|jpg|png|gif|webp)|application\/octet-stream)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

type CdxHit = {
  timestamp: string;
  original: string;
  /** Path under `staging/bandaicg-en/` (e.g. images/cards_s1/n001.jpg). */
  relPath: string;
  printKey: string;
  role: "art" | "thumb";
  set: string;
};

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingEnDir(root: string): string {
  return path.join(root, NARUTO_STAGING_BANDAICG_EN);
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

/** `…/naruto/images/cards_s1/n001.jpg` → `images/cards_s1/n001.jpg` */
function relPathFromOriginal(original: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(original).pathname).replace(
      /\\/g,
      "/",
    );
    const m = pathname.match(/\/naruto\/(images\/cards_[^/]+\/[^/]+)$/i);
    return m?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function fetchCdxHits(): Promise<{
  hits: CdxHit[];
  cdxRows: number;
  imageRows: number;
}> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const started = Date.now();
    console.log(
      `CDX EN fetch attempt ${attempt}/5 (bandaicg cards_* — often 20–90s)…`,
    );
    try {
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

      const byRole = new Map<string, CdxHit>();
      for (const { timestamp, original } of byCanon.values()) {
        const parsed = parseBandaicgAssetPath(original);
        const relPath = relPathFromOriginal(original);
        if (!parsed || !relPath) continue;
        const roleKey = `${parsed.printKey}:${parsed.role}`;
        const existing = byRole.get(roleKey);
        if (!existing || timestamp > existing.timestamp) {
          byRole.set(roleKey, {
            timestamp,
            original,
            relPath,
            printKey: parsed.printKey,
            role: parsed.role,
            set: parsed.set,
          });
        }
      }
      const hits = [...byRole.values()].sort((a, b) =>
        a.printKey.localeCompare(b.printKey),
      );
      console.log(
        `CDX EN done in ${Math.round((Date.now() - started) / 1000)}s → assets=${hits.length} images=${byCanon.size}`,
      );
      return { hits, cdxRows, imageRows: byCanon.size };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = attempt * 3_000;
      console.warn(
        `CDX EN attempt ${attempt}/5 failed: ${lastError.message} — retry in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw lastError ?? new Error("CDX EN failed");
}

export async function scrapeNarutoEnCards(
  options: ScrapeNarutoOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const stagingDir = stagingEnDir(root);
  const logsDir = path.join(root, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log("── CDX Wayback bandaicg.com/naruto/images/cards* → staging");
  const sweep = await fetchCdxHits();
  let hits = sweep.hits;
  console.log(
    `CDX rows=${sweep.cdxRows} images=${sweep.imageRows} assets=${hits.length}`,
  );

  if (options.limit && options.limit > 0) {
    hits = hits.slice(0, options.limit);
    console.log(`limited assets=${hits.length}`);
  }

  const bySet: Record<string, { art: number; thumb: number }> = {};
  for (const h of hits) {
    const bucket = (bySet[h.set] ??= { art: 0, thumb: 0 });
    if (h.role === "thumb") bucket.thumb += 1;
    else bucket.art += 1;
  }

  fs.writeFileSync(
    path.join(logsDir, "cdx-hits-en.json"),
    `${JSON.stringify(
      {
        source: "wayback:bandaicg.com",
        layout: `${NARUTO_STAGING_BANDAICG_EN}/images/cards_*/`,
        assets: hits.map((h) => ({
          printKey: h.printKey,
          relPath: h.relPath,
          original: h.original,
          timestamp: h.timestamp,
          role: h.role,
        })),
        bySet,
        cdxRows: sweep.cdxRows,
        imageRows: sweep.imageRows,
        note: "Staging only (US CCG ≠ FR CACG). Partial archive — mostly thumbs (_t). Not written under cards/.",
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
          staging: NARUTO_STAGING_BANDAICG_EN,
          assets: hits.length,
          bySet,
          cdxRows: sweep.cdxRows,
          imageRows: sweep.imageRows,
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

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let doneHits = 0;
  const totalHits = hits.length;
  const progressEvery = Math.max(10, Math.floor(totalHits / 50) || 1);

  await runPool(hits, concurrency, delayMs, async (hit) => {
    const dest = path.join(stagingDir, hit.relPath);
    const url = waybackRawUrl(hit.timestamp, hit.original);
    const result = await downloadRaw(url, dest, !force);
    if (result === "ok") ok += 1;
    else if (result === "skip") skip += 1;
    else fail += 1;

    doneHits += 1;
    if (
      doneHits === 1 ||
      doneHits === totalHits ||
      doneHits % progressEvery === 0 ||
      result === "fail"
    ) {
      console.log(
        `en ${doneHits}/${totalHits} (ok=${ok} skip=${skip} fail=${fail}) · ${hit.printKey}${result === "fail" ? " FAIL" : ""}`,
      );
    }
  });

  const summary = {
    staging: NARUTO_STAGING_BANDAICG_EN,
    layout: `${NARUTO_STAGING_BANDAICG_EN}/images/cards_*/`,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    bySet,
    coverage: {
      cdxRows: sweep.cdxRows,
      imageRows: sweep.imageRows,
      assets: hits.length,
      note: "US CCG corpus in staging — promote to cards/{set}/en/ when first-class.",
    },
    stagingDir,
  };
  fs.writeFileSync(
    path.join(logsDir, "last-run-en.json"),
    `${JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}
