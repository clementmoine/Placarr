/**
 * ArcadeGameCards — Narutimate Ninja Fight (Data Carddass singles).
 * SKU boutique `DNI1-08` → ref imprimée `DN-008T`.
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

/**
 * `DNI1-08` → `DN-008T` (cabinet ナルティメットカードバトル).
 * Promos `DNI2-P01` / `DNI2-CP09` → null pour l’instant.
 */
export function arcadeDniSkuToPrinted(sku: string): string | null {
  const m = /^DNI(\d+)-(\d+)$/i.exec(sku.trim());
  if (!m) return null;
  const num = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(num)) return null;
  return `DN-${String(num).padStart(3, "0")}T`;
}

/** Prefer full-size upload URL (strip Jetpack `?fit=` size variants). */
export function arcadeNormalizeFaceUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const decoded = raw.replace(/&amp;/g, "&").replace(/&#038;/g, "&").trim();
  const m =
    /^(https?:\/\/(?:i\d+\.wp\.com\/)?www\.arcadegamecards\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/narutimate[^?]+\.(?:jpe?g|png|webp))/i.exec(
      decoded,
    );
  if (!m) return null;
  return m[1]!.replace(/^http:\/\//i, "https://");
}

export function parseArcadeDcdListing(html: string): ArcadeDcdRow[] {
  const rows: ArcadeDcdRow[] = [];
  const seen = new Set<string>();
  for (const blockMatch of html.matchAll(
    /<li[^>]*class="[^"]*product[^"]*"[\s\S]*?<\/li>/gi,
  )) {
    const block = blockMatch[0]!;
    const href =
      /href="(https?:\/\/www\.arcadegamecards\.com\/product\/[^"]+|\/product\/[^"]+)"/i.exec(
        block,
      )?.[1] ?? null;
    if (!href) continue;
    const title =
      /<h2[^>]*class="[^"]*woocommerce-loop-product__title[^"]*"[^>]*>([^<]*)<\/h2>/i.exec(
        block,
      )?.[1] ??
      /<h2[^>]*>([^<]*DNI?\d+-[A-Z0-9]+[^<]*)<\/h2>/i.exec(block)?.[1] ??
      "";
    const skuM = /\b(DNI\d+-[A-Z0-9]+)\b/i.exec(`${title} ${href}`);
    if (!skuM) continue;
    const sku = skuM[1]!.toUpperCase();
    if (seen.has(sku)) continue;
    seen.add(sku);
    const printed = arcadeDniSkuToPrinted(sku);
    if (!printed) continue;
    const imgRaw =
      /(?:data-src|data-large_image|src)="(https?:\/\/[^"]*narutimate[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i.exec(
        block,
      )?.[1] ?? null;
    rows.push({
      sku,
      printed,
      title: title.replace(/\s+/g, " ").trim() || sku,
      href,
      imageUrl: arcadeNormalizeFaceUrl(imgRaw),
    });
  }
  return rows;
}

/**
 * WP uploads directory listing — full-size `narutimatedni1-08.jpg` only
 * (skip `-300x450` thumbs).
 */
export function parseArcadeUploadsListing(
  html: string,
  uploadsBase = "https://www.arcadegamecards.com/wp-content/uploads/2021/03/",
): ArcadeDcdRow[] {
  const rows: ArcadeDcdRow[] = [];
  const seen = new Set<string>();
  const base = uploadsBase.endsWith("/") ? uploadsBase : `${uploadsBase}/`;
  for (const match of html.matchAll(
    /href="(narutimatedni(\d+)-(\d+)\.(?:jpe?g|png|webp))"/gi,
  )) {
    const file = match[1]!;
    const sku = `DNI${match[2]!}-${match[3]!}`.toUpperCase();
    if (seen.has(sku)) continue;
    seen.add(sku);
    const printed = arcadeDniSkuToPrinted(sku);
    if (!printed) continue;
    rows.push({
      sku,
      printed,
      title: sku,
      href: ARCADE_DCD_CATEGORY,
      imageUrl: `${base}${file}`,
    });
  }
  return rows;
}

function mergeArcadeRows(
  ...groups: readonly (readonly ArcadeDcdRow[])[]
): ArcadeDcdRow[] {
  const bySku = new Map<string, ArcadeDcdRow>();
  for (const group of groups) {
    for (const row of group) {
      const prev = bySku.get(row.sku);
      if (!prev) {
        bySku.set(row.sku, row);
        continue;
      }
      if (!prev.imageUrl && row.imageUrl) bySku.set(row.sku, row);
    }
  }
  return [...bySku.values()];
}

export async function harvestArcadeDataCarddass(opts?: {
  force?: boolean;
}): Promise<{ cards: number; ok: number; skip: number; fail: number }> {
  const html =
    (await fetchTextWithFlareFallback(ARCADE_DCD_CATEGORY, {
      headers: { "User-Agent": UA },
    })) ?? "";
  let uploadsHtml = "";
  try {
    const res = await httpGet(
      "https://www.arcadegamecards.com/wp-content/uploads/2021/03/",
      { headers: { "User-Agent": UA }, responseType: "text", timeout: 60_000 },
    );
    uploadsHtml = String((res as { data?: string }).data ?? "");
  } catch {
    uploadsHtml = "";
  }
  const rows = mergeArcadeRows(
    parseArcadeDcdListing(html),
    parseArcadeUploadsListing(uploadsHtml),
  );
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
    const imageUrl = arcadeNormalizeFaceUrl(row.imageUrl) ?? row.imageUrl;
    try {
      const res = await httpGet(imageUrl, {
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

/**
 * Les cartes arcadegamecards.com appartiennent à l'édition américaine
 * "Naruto: Narutimate Ninja Fight" (DNI1 / DNI2 en anglais), dont la
 * numérotation ne correspond pas aux cartes japonaises (ex: DNI1-45 = Guy,
 * alors que DN-045T = Kankuro).
 * Pour respecter la règle d'or « pas de faux positif confiant », ces visuels
 * ne sont pas installés sous `cards/dn/ja/`.
 */
export function installArcadeDataCarddassFaces(): {
  faces: number;
  missing: string[];
} {
  return { faces: 0, missing: [] };
}
