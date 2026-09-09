/**
 * ArcadeGameCards — Narutimate Ninja Fight (Data Carddass singles).
 * SKU boutique `DNI1-08` → ref imprimée `DN-008`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";

import { NARUTO_DATA_CARDDASS_PACK_ID } from "./pack";
import {
  dataCarddassPrintKey,
  parseDataCarddassPrinted,
} from "./printKey";

export const ARCADE_DCD_CATEGORY =
  "https://www.arcadegamecards.com/product-category/naruto-narutimate-ninja-fight/";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type ArcadeDcdRow = {
  sku: string;
  printed: string;
  title: string;
  href: string;
  imageUrl: string | null;
};

/** `DNI1-08` → `DN-008` ; promos `DNI2-P01` → null pour l’instant. */
export function arcadeDniSkuToPrinted(sku: string): string | null {
  const m = /^DNI(\d+)-(\d+)$/i.exec(sku.trim());
  if (!m) return null;
  const num = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(num)) return null;
  return `DN-${String(num).padStart(3, "0")}`;
}

export function parseArcadeDcdListing(html: string): ArcadeDcdRow[] {
  const rows: ArcadeDcdRow[] = [];
  const seen = new Set<string>();
  const re =
    /<li[^>]*class="[^"]*product[^"]*"[\s\S]*?<a href="([^"]+)"[\s\S]*?(?:<img[^>]+src="([^"]+)"[^>]*>)?[\s\S]*?<h2[^>]*>([^<]*DNI\d+-[A-Z0-9]+[^<]*)<\/h2>/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1]!;
    const imageUrl = match[2] ?? null;
    const title = match[3]!.replace(/\s+/g, " ").trim();
    const skuM = /\b(DNI\d+-[A-Z0-9]+)\b/i.exec(title);
    if (!skuM) continue;
    const sku = skuM[1]!.toUpperCase();
    if (seen.has(sku)) continue;
    seen.add(sku);
    const printed = arcadeDniSkuToPrinted(sku);
    if (!printed) continue;
    rows.push({ sku, printed, title, href, imageUrl });
  }
  return rows;
}

export async function harvestArcadeDataCarddass(opts?: {
  force?: boolean;
}): Promise<{ cards: number; ok: number; skip: number; fail: number }> {
  const html =
    (await fetchTextWithFlareFallback(ARCADE_DCD_CATEGORY, {
      headers: { "User-Agent": UA },
    })) ?? "";
  const rows = parseArcadeDcdListing(html);
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "arcadegamecards",
  );
  mkdirSync(staging, { recursive: true });
  writeFileSync(
    path.join(staging, "listing.json"),
    `${JSON.stringify(
      {
        source: ARCADE_DCD_CATEGORY,
        observed: new Date().toISOString().slice(0, 10),
        rows,
      },
      null,
      2,
    )}\n`,
  );
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseDataCarddassPrinted(row.printed);
    if (!parsed) {
      fail += 1;
      continue;
    }
    const dest = path.join(staging, `${parsed.set}-${parsed.number}.jpg`);
    if (!opts?.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    if (!row.imageUrl) {
      fail += 1;
      continue;
    }
    try {
      const res = await httpGet(row.imageUrl, {
        headers: { "User-Agent": UA, Referer: ARCADE_DCD_CATEGORY },
        responseType: "arraybuffer",
        timeout: 40_000,
      });
      const data = (res as { data?: ArrayBuffer }).data;
      if (!data || data.byteLength < 500) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, Buffer.from(data));
      ok += 1;
    } catch {
      fail += 1;
    }
  }
  return { cards: rows.length, ok, skip, fail };
}

export function installArcadeDataCarddassFaces(): {
  faces: number;
  missing: string[];
} {
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "arcadegamecards",
  );
  const listingPath = path.join(staging, "listing.json");
  if (!existsSync(listingPath)) return { faces: 0, missing: [] };
  const listing = JSON.parse(readFileSync(listingPath, "utf8")) as {
    rows: ArcadeDcdRow[];
  };
  const missing: string[] = [];
  let faces = 0;
  for (const row of listing.rows ?? []) {
    const parsed = parseDataCarddassPrinted(row.printed);
    if (!parsed) continue;
    const src = path.join(staging, `${parsed.set}-${parsed.number}.jpg`);
    if (!existsSync(src)) {
      missing.push(row.printed);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) continue;
    const destDir = path.join(
      packCardsDir(NARUTO_DATA_CARDDASS_PACK_ID),
      parsed.set,
      "ja",
      parsed.number,
    );
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, path.join(destDir, "art.arcadegamecards.jpg"));
    faces += 1;
  }
  return { faces, missing };
}
