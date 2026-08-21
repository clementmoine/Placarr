/**
 * Live Suruga-ya product probe for GL6368xx SKUs missing from the curated TSV.
 * CDN JPEGs exist for many vol.1 holes; product HTML yields the 忍/術/作/依 code.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./packs";
import {
  loadSurugaCarddassCuratedListings,
  parseSurugaCarddassListingsTsv,
  parseSurugaProductDetailHtml,
  SURUGA_CARDDASS_ORIGIN,
  type SurugaCarddassListing,
} from "./parseSurugaCarddass";
import { NARUTO_STAGING_SURUGA_CARDDASS } from "./scrapeSurugaCarddass";

const DEFAULT_DELAY_MS = 400;
const PROBE_START = 636_800;
const PROBE_END = 636_850;
const PROBE_PREFIX = "GL";

export type ProbeSurugaVol1ListingsOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  start?: number;
  end?: number;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

/** `packDir` is already `data/naruto/carddass` when passed from scrape. */
export function surugaVol1ProbesTsvPath(packDir?: string): string {
  const base = packDir ?? packRoot();
  return path.join(base, NARUTO_STAGING_SURUGA_CARDDASS, "vol1-probes.tsv");
}

export function loadSurugaVol1ProbeListings(
  root?: string,
): SurugaCarddassListing[] {
  const file = surugaVol1ProbesTsvPath(root);
  if (!existsSync(file)) return [];
  return parseSurugaCarddassListingsTsv(readFileSync(file, "utf8"));
}

function listingKey(row: SurugaCarddassListing): string {
  return `${row.id}\t${row.printed}`;
}

export async function probeSurugaVol1Listings(
  opts: ProbeSurugaVol1ListingsOptions = {},
): Promise<{ probed: number; added: number; skipped: number; failed: number }> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_SURUGA_CARDDASS);
  mkdirSync(staging, { recursive: true });
  const outFile = surugaVol1ProbesTsvPath(root);
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const start = opts.start ?? PROBE_START;
  const end = opts.end ?? PROBE_END;

  const known = new Set(
    loadSurugaCarddassCuratedListings().map((r) => r.id.toUpperCase()),
  );
  const existing = loadSurugaVol1ProbeListings(root);
  const seen = new Set(existing.map((r) => r.id.toUpperCase()));
  for (const id of known) seen.add(id);

  const lines = existing.length
    ? existing.map((r) => `${r.id}\t${r.printed}`)
    : ["# id\tprinted (live probe GL6368xx — merged at scrape time)"];

  let probed = 0;
  let added = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `── Suruga vol.1 probe GL${start}…GL${end} → ${path.basename(outFile)}`,
  );

  for (let n = start; n <= end; n += 1) {
    const id = `${PROBE_PREFIX}${n}`;
    if (seen.has(id)) {
      skipped += 1;
      continue;
    }
    probed += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const html = await fetchTextWithFlareFallback(
        `${SURUGA_CARDDASS_ORIGIN}/product/detail/${id}`,
        {
          headers: { Accept: "text/html,*/*" },
          timeout: 25_000,
          flareMaxTimeoutMs: 45_000,
        },
      );
      if (!html) {
        failed += 1;
        continue;
      }
      const row = parseSurugaProductDetailHtml(html, id);
      if (!row) {
        failed += 1;
        continue;
      }
      const key = listingKey(row);
      if (lines.some((line) => line === key)) {
        skipped += 1;
        seen.add(id);
        continue;
      }
      lines.push(key);
      seen.add(id);
      added += 1;
      console.log(`Suruga probe ${id} → ${row.printed}`);
    } catch {
      failed += 1;
    }
  }

  if (added > 0 || force || !existsSync(outFile)) {
    writeFileSync(outFile, `${lines.join("\n")}\n`);
  }

  console.log(
    JSON.stringify({
      surugaVol1Probe: true,
      probed,
      added,
      skipped,
      failed,
      outFile: path.relative(root, outFile),
    }),
  );
  return { probed, added, skipped, failed };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  probeSurugaVol1Listings().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
