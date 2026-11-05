/**
 * Download CardNexus product `imageUrl` → on-disk `art.cardnexus.*`.
 *
 * Multi-TCG: callers supply print targets + a disk writer. Pokémon wires this
 * through faceChoice; other catalogues can reuse the same fetch/download.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { cardnexusApiKey } from "./client";
import {
  fetchCardnexusProductForPrintKey,
  type FetchCardnexusOpts,
} from "./match";
import { productSourceUrl } from "./prices";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type CardnexusFaceFillReport = {
  prints: number;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  unmapped: number;
  /** printKey → public product fiche (never the site homepage). */
  productUrlsByPrintKey: Record<string, string>;
};

export type CardnexusFaceTarget = {
  printKey: string;
  /** Disk folder that should receive `art.cardnexus.<ext>`. */
  cardDir: string;
  language?: string | null;
};

function extFromUrl(url: string): "jpg" | "png" | "webp" {
  // Prefer the catalogue stem (`….jpg/p1200.png` → jpg), not the ImageKit suffix.
  const stem = cardnexusImageDownloadUrl(url).toLowerCase();
  if (stem.endsWith(".webp")) return "webp";
  if (stem.endsWith(".png")) return "png";
  return "jpg";
}

/** Prefer the full-resolution stem when CardNexus serves `/p1200.png` variants. */
export function cardnexusImageDownloadUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  // `….jpg/p1200.png` → keep the jpg stem (ImageKit-style).
  const m = /^(https?:\/\/img\.cardnexus\.com\/.+?\.(jpe?g|png|webp))\/p\d+\.png$/i.exec(
    trimmed,
  );
  return m?.[1] ?? trimmed;
}

export async function downloadCardnexusImage(
  imageUrl: string,
): Promise<Buffer | null> {
  const url = cardnexusImageDownloadUrl(imageUrl);
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/avif,image/webp,image/*,*/*",
        Referer: "https://cardnexus.com/",
      },
      responseType: "arraybuffer",
      timeout: 20_000,
      minIntervalMs: 0,
      noDedup: true,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 800) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

function existingCardnexusArt(cardDir: string): string | null {
  for (const ext of ["webp", "png", "jpg", "jpeg"] as const) {
    const name = `art.cardnexus.${ext}`;
    if (existsSync(path.join(cardDir, name))) return name;
  }
  return null;
}

/**
 * For each target: resolve CardNexus product → download face when missing.
 * Honours API key presence; skips silently when unconfigured.
 */
export async function fillCardnexusFaces(
  targets: readonly CardnexusFaceTarget[],
  opts?: {
    force?: boolean;
    /**
     * True when the print already has *any* preferred face — skip CardNexus
     * (fill only honest gaps). Default: skip only when `art.cardnexus.*` exists.
     */
    alreadyHasFace?: (cardDir: string, language?: string | null) => boolean;
    fetchProduct?: (
      printKey: string,
      opts?: FetchCardnexusOpts,
    ) => ReturnType<typeof fetchCardnexusProductForPrintKey>;
    downloadImage?: (url: string) => Promise<Buffer | null>;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<CardnexusFaceFillReport> {
  const report: CardnexusFaceFillReport = {
    prints: targets.length,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    unmapped: 0,
    productUrlsByPrintKey: {},
  };
  if (!cardnexusApiKey() || targets.length === 0) return report;

  const fetchProduct = opts?.fetchProduct ?? fetchCardnexusProductForPrintKey;
  const downloadImage = opts?.downloadImage ?? downloadCardnexusImage;

  let done = 0;
  for (const target of targets) {
    if (!opts?.force) {
      if (existingCardnexusArt(target.cardDir)) {
        report.skipped += 1;
        done += 1;
        opts?.onProgress?.(done, targets.length);
        continue;
      }
      if (opts?.alreadyHasFace?.(target.cardDir, target.language)) {
        report.skipped += 1;
        done += 1;
        opts?.onProgress?.(done, targets.length);
        continue;
      }
    }

    report.tried += 1;
    const product = await fetchProduct(target.printKey, {
      language: target.language,
      requirePrices: false,
    });
    const imageUrl = product?.imageUrl?.trim();
    if (!imageUrl) {
      report.unmapped += 1;
      done += 1;
      opts?.onProgress?.(done, targets.length);
      continue;
    }

    const buf = await downloadImage(imageUrl);
    if (!buf) {
      report.failed += 1;
      done += 1;
      opts?.onProgress?.(done, targets.length);
      continue;
    }

    mkdirSync(target.cardDir, { recursive: true });
    const ext = extFromUrl(imageUrl);
    writeFileSync(path.join(target.cardDir, `art.cardnexus.${ext}`), buf);
    report.written += 1;
    if (product?.id != null) {
      report.productUrlsByPrintKey[target.printKey] = productSourceUrl(
        product.id,
      );
    }
    done += 1;
    opts?.onProgress?.(done, targets.length);
  }

  return report;
}
