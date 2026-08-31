/**
 * Kayou sealed SKUs from kayouofficial.com series pages → products-index.json.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import {
  readKayouOfficialCatalog,
  type KayouOfficialCatalog,
  type KayouOfficialCatalogSeries,
} from "./kayouOfficialCrawl";
import {
  parseKayouOfficialSeriesDetail,
} from "./kayouOfficialParse";
import { NARUTO_KAYOU_PACK_ID, narutoKayouCuratedDir } from "./pack";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Official series id → checklist set code when known. */
const CATALOGUE_SET_BY_SERIES: Readonly<Record<string, string>> = {
  "series-0nyket49": "ninjaagebox",
  "series-5zdty4vj": "smritiheavenscrolls1",
};

export function kayouOfficialModelSlug(model: string): string {
  return model.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseKayouPackagingCounts(
  packaging: string | null | undefined,
): { cardsPerPack: number | null; packsContained: number | null } {
  const text = packaging?.trim() ?? "";
  if (!text) return { cardsPerPack: null, packsContained: null };
  const cardsPerPack = Number(
    text.match(/(\d+)\s*cards?\s*(?:\/|per\s+)pack/i)?.[1] ??
      text.match(/1\/Pack\s*=\s*(\d+)\/Card/i)?.[1],
  );
  const packsContained = Number(
    text.match(/(\d+)\s*packs?\s*(?:\/|per\s+)box/i)?.[1] ??
      text.match(/1\/Box\s*=\s*(\d+)\/Pack/i)?.[1],
  );
  return {
    cardsPerPack: Number.isFinite(cardsPerPack) ? cardsPerPack : null,
    packsContained: Number.isFinite(packsContained) ? packsContained : null,
  };
}

export function kayouOfficialSealedKind(
  series: Pick<KayouOfficialCatalogSeries, "productName" | "productSpecs">,
): SealedKind {
  const label = `${series.productName ?? ""} ${series.productSpecs["Packaging Specs"] ?? ""}`.toLowerCase();
  if (/collector box|premium collector/.test(label)) return "coffret";
  if (/packs?\s*(?:\/|per)\s*box|packs per box|1\/box\s*=/.test(label)) {
    return "display";
  }
  return "booster";
}

export function kayouOfficialSealedDisplayName(
  series: KayouOfficialCatalogSeries,
): string {
  const title = series.sectionTitle || series.seriesTypeName;
  const model = series.model?.trim();
  return model ? `${title} (${model})` : title;
}

async function downloadImage(url: string, referer: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
      responseType: "arraybuffer",
      timeout: 60_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data);
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

async function fetchSeriesHtml(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: { "User-Agent": UA },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (status) => status === 200,
  });
  return res.data;
}

async function resolveHeroBoxImage(
  series: KayouOfficialCatalogSeries,
): Promise<string | null> {
  if (series.heroBoxImage?.trim()) return series.heroBoxImage.trim();
  const html = await fetchSeriesHtml(series.url);
  return parseKayouOfficialSeriesDetail(html, series.seriesId).heroBoxImage ?? null;
}

function stagingPath(slug: string): string {
  return path.join(
    narutoKayouCuratedDir(),
    "products",
    slug,
    "en",
    "art.kayouofficial.png",
  );
}

export async function ingestKayouOfficialSealedProducts(
  opts: { catalog?: KayouOfficialCatalog | null; force?: boolean } = {},
): Promise<{ written: number; skipped: number; file: string }> {
  const catalog = opts.catalog ?? readKayouOfficialCatalog();
  if (!catalog?.series.length) {
    return { written: 0, skipped: 0, file: "" };
  }

  const products = [];
  let skipped = 0;

  for (const series of catalog.series) {
    const model = series.model?.trim();
    if (!model) {
      skipped += 1;
      continue;
    }
    const slug = kayouOfficialModelSlug(model);
    const dest = stagingPath(slug);
    if (!opts.force && existsSync(dest)) {
      // reuse cached packshot
    } else {
      const heroBoxImage = await resolveHeroBoxImage(series);
      if (!heroBoxImage) {
        skipped += 1;
        continue;
      }
      const buf = await downloadImage(heroBoxImage, series.url);
      if (!buf) {
        skipped += 1;
        continue;
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
    }

    const packaging = parseKayouPackagingCounts(
      series.productSpecs["Packaging Specs"],
    );
    const kind = kayouOfficialSealedKind(series);
    products.push({
      slug,
      kind,
      category: series.seriesTypeDescription || "Kayou Smriti",
      name: kayouOfficialSealedDisplayName(series),
      setCode: model,
      catalogueSetId: CATALOGUE_SET_BY_SERIES[series.seriesId] ?? null,
      lang: "en",
      releaseDate: series.productSpecs["Release Date"] ?? null,
      declaredCardCount: series.cards.length,
      cardsPerPack: packaging.cardsPerPack,
      packsContained: packaging.packsContained,
      path: series.url,
      artPath: dest,
    });
  }

  if (!products.length) {
    return { written: 0, skipped, file: "" };
  }

  const result = writeLocalSealedProducts({
    packId: NARUTO_KAYOU_PACK_ID,
    source: "kayouofficial",
    products,
  });
  return { written: result.written, skipped: skipped + result.skipped, file: result.file };
}
