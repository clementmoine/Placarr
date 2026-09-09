/**
 * Fill vol.1 JA holes via Suruga-ya search + gap product IDs (Byparr).
 * Search HTML is Cloudflare-blocked without FLARESOLVERR_URL.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { dataRoot } from "@/lib/runtimeData";

import { carddasJpCardlistCards } from "./parse/parseCarddasJpCardlist";
import { NARUTO_PACK_ID } from "./packs";
import {
  loadSurugaCarddassCuratedListings,
  parseSurugaProductDetailHtml,
  surugaPrintedToDiskId,
  type SurugaCarddassListing,
} from "./parse/parseSurugaCarddass";
import {
  loadSurugaVol1ProbeListings,
  surugaVol1ProbesTsvPath,
} from "./probeSurugaVol1Listings";

const DEFAULT_DELAY_MS = 450;
const CARDGAME_RE = /カードゲーム|card game|carddass|carddas|巻ノ/i;

export type ProbeSurugaMissingVol1Options = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  /** Probe these printed refs only (e.g. ["忍-3"]). */
  printed?: readonly string[];
  /** Also walk GL636801–816 gap IDs. */
  gapIds?: boolean;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function jaFaceMissing(packDir: string, diskId: string): boolean {
  const cardsDir = path.join(packDir, "cards");
  for (const family of ["ninja", "jutsu", "mission", "client"] as const) {
    const dir = path.join(cardsDir, family, diskId, "ja");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith("art.")) return false;
    }
  }
  return true;
}

function vol1MissingPrinted(packDir: string): string[] {
  const byPrinted = new Map<string, string>();
  for (const row of carddasJpCardlistCards()) {
    if (row.setCode !== "maki1") continue;
    byPrinted.set(row.printed, row.number);
  }
  const out: string[] = [];
  for (const [printed, number] of byPrinted) {
    if (jaFaceMissing(packDir, number)) out.push(printed);
  }
  return out.sort((a, b) => a.localeCompare(b, "ja"));
}

function isCarddassListing(htmlSlice: string, printed: string): boolean {
  if (!CARDGAME_RE.test(htmlSlice)) return false;
  if (/コレクションシール|データカードダス|NM-|DN-/i.test(htmlSlice))
    return false;
  return htmlSlice.includes(printed);
}

function searchUrl(printed: string): string {
  const q = encodeURIComponent(`NARUTO カードゲーム ${printed}`);
  return `https://www.suruga-ya.jp/search?category=5&search_word=${q}&search_box=1`;
}

function pickSearchHit(
  html: string,
  printed: string,
): SurugaCarddassListing | null {
  const target = printed.trim();
  const seen = new Set<string>();
  const hrefRe =
    /href="https:\/\/www\.suruga-ya\.jp\/product\/detail\/([A-Za-z0-9]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) {
    const id = m[1]!.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const slice = html.slice(m.index, m.index + 3000);
    if (!isCarddassListing(slice, target)) continue;
    const parsed = parseSurugaProductDetailHtml(slice, id);
    if (parsed?.printed === target) return parsed;
  }
  return null;
}

async function probeProductId(
  productId: string,
  delayMs: number,
): Promise<SurugaCarddassListing | null> {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  const html = await fetchTextWithFlareFallback(
    `https://www.suruga-ya.jp/product/detail/${productId}`,
    { flareMaxTimeoutMs: 45_000 },
  );
  if (!html) return null;
  return parseSurugaProductDetailHtml(html, productId);
}

function appendProbeRows(
  packDir: string,
  added: SurugaCarddassListing[],
  force: boolean,
): number {
  const outFile = surugaVol1ProbesTsvPath(packDir);
  mkdirSync(path.dirname(outFile), { recursive: true });
  const existing = loadSurugaVol1ProbeListings(packDir);
  const known = new Set([
    ...loadSurugaCarddassCuratedListings().map((r) => r.id.toUpperCase()),
    ...existing.map((r) => r.id.toUpperCase()),
  ]);
  const lines = existing.length
    ? existing.map((r) => `${r.id}\t${r.printed}`)
    : ["# id\tprinted (search/gap probe — merged at scrape time)"];
  let n = 0;
  for (const row of added) {
    const id = row.id.toUpperCase();
    if (known.has(id)) continue;
    known.add(id);
    lines.push(`${id}\t${row.printed}`);
    n += 1;
  }
  if (n > 0 || force || !existsSync(outFile)) {
    writeFileSync(outFile, `${lines.join("\n")}\n`);
  }
  return n;
}

export async function probeSurugaMissingVol1(
  opts: ProbeSurugaMissingVol1Options = {},
): Promise<{
  searched: number;
  gapProbed: number;
  added: number;
  found: SurugaCarddassListing[];
}> {
  const packDir = packRoot(opts.root);
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const force = opts.force === true;
  const found: SurugaCarddassListing[] = [];
  const seenId = new Set<string>();

  const printedList = opts.printed?.length
    ? [...opts.printed]
    : vol1MissingPrinted(packDir);

  console.log(
    `── Suruga vol.1 search probe (${printedList.length} missing printed refs)`,
  );

  for (const printed of printedList) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const html = await fetchTextWithFlareFallback(searchUrl(printed), {
      flareMaxTimeoutMs: 45_000,
    });
    if (!html) {
      console.log(`Suruga search ${printed} FAIL`);
      continue;
    }
    const hit = pickSearchHit(html, printed);
    if (!hit || seenId.has(hit.id)) continue;
    seenId.add(hit.id);
    found.push(hit);
    console.log(`Suruga search ${printed} → ${hit.id}`);
  }

  let gapProbed = 0;
  if (opts.gapIds !== false) {
    console.log("── Suruga vol.1 gap IDs GL636801–816");
    for (let n = 801; n <= 816; n += 1) {
      const id = `GL636${n}`;
      gapProbed += 1;
      const row = await probeProductId(id, delayMs);
      if (!row || seenId.has(row.id)) continue;
      const disk = surugaPrintedToDiskId(row.printed);
      if (!disk?.startsWith("ni") || Number.parseInt(disk.slice(2), 10) > 70) {
        continue;
      }
      seenId.add(row.id);
      found.push(row);
      console.log(`Suruga gap ${id} → ${row.printed}`);
    }
  }

  const added = appendProbeRows(packDir, found, force);
  console.log(
    JSON.stringify({
      surugaMissingVol1: true,
      searched: printedList.length,
      gapProbed,
      added,
      found: found.map((r) => `${r.id}:${r.printed}`),
    }),
  );
  return { searched: printedList.length, gapProbed, added, found };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const printed = process.argv.includes("--printed")
    ? process.argv.slice(process.argv.indexOf("--printed") + 1)
    : undefined;
  probeSurugaMissingVol1({
    printed: printed?.length ? printed : undefined,
    gapIds: !process.argv.includes("--no-gap"),
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
