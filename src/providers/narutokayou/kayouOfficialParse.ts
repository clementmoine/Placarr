/**
 * Pure parsers for kayouofficial.com RSC payloads (IP index + series pages).
 */

/** Naruto on the US storefront. */
export const KAYOU_NARUTO_IP_ID = "ip-rtqgm0xa";

export const KAYOU_OFFICIAL_IP_COLLECTIONS =
  "https://www.kayouofficial.com/en-US/ip-collections";

export const KAYOU_OFFICIAL_SERIES_URL = (seriesId: string) =>
  `https://www.kayouofficial.com/en-US/series/${seriesId}`;

export type KayouOfficialSeriesIndexEntry = {
  ipId: string;
  seriesId: string;
  sectionEyebrow: string;
  sectionTitle: string;
};

export type KayouOfficialCard = {
  idCode: string;
  name: string;
  rarity: string;
  rarityFull?: string;
  frontImage: string;
  frontWidth?: number;
  frontHeight?: number;
  backImage: string;
  sortOrder?: number;
};

export type KayouOfficialSeriesDetail = {
  seriesId: string;
  seriesTypeName: string;
  seriesTypeDescription: string;
  productSpecs: Record<string, string>;
  productName?: string;
  model?: string;
  heroBoxImage?: string;
  cards: KayouOfficialCard[];
};

function narutoIpBlock(html: string, ipId: string): string {
  const marker = ipId;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  let block = html.slice(start);
  const nextIp = block.slice(marker.length).search(/ip-[a-z0-9]{8,}/);
  if (nextIp >= 0) block = block.slice(0, marker.length + nextIp);
  return block;
}

/** Series ids under one IP block on ip-collections. */
export function parseKayouOfficialSeriesIds(
  ipCollectionsHtml: string,
  ipId: string = KAYOU_NARUTO_IP_ID,
): string[] {
  const block = narutoIpBlock(ipCollectionsHtml, ipId);
  if (!block) return [];
  const ids = new Set<string>();
  for (const m of block.matchAll(/seriesId\\":\\"(series-[a-z0-9]+)/g)) {
    ids.add(m[1]!);
  }
  if (!ids.size) {
    for (const m of block.matchAll(/\\"id\\":\\"(series-[a-z0-9]+)/g)) {
      ids.add(m[1]!);
    }
  }
  return [...ids].sort();
}

/** @deprecated use {@link parseKayouOfficialSeriesIds} */
export function parseNarutoKayouSeriesIds(ipCollectionsHtml: string): string[] {
  return parseKayouOfficialSeriesIds(ipCollectionsHtml, KAYOU_NARUTO_IP_ID);
}

/** IP → section eyebrow/title → series id (SKU family index). */
export function parseKayouOfficialIpSeriesIndex(
  ipCollectionsHtml: string,
  ipId: string = KAYOU_NARUTO_IP_ID,
): KayouOfficialSeriesIndexEntry[] {
  const block = narutoIpBlock(ipCollectionsHtml, ipId);
  if (!block) return [];

  const out: KayouOfficialSeriesIndexEntry[] = [];
  let sectionEyebrow = "";
  let sectionTitle = "";
  for (const m of block.matchAll(/\\"(eyebrow|title|seriesId)\\":\\"([^\\]+)/g)) {
    const kind = m[1]!;
    const value = m[2]!;
    if (kind === "eyebrow") sectionEyebrow = value;
    else if (kind === "title" && !value.startsWith("series-")) sectionTitle = value;
    else if (kind === "seriesId") {
      out.push({ ipId, seriesId: value, sectionEyebrow, sectionTitle });
    }
  }
  return out;
}

const PRODUCT_SPEC_LABELS = new Set([
  "Product Name",
  "Model",
  "Packaging Specs",
  "Package Dimension",
  "Release Date",
  "Version Code",
]);

export function parseKayouOfficialProductSpecs(
  seriesHtml: string,
): Record<string, string> {
  const block = seriesHtml.match(
    /productSpecs\\":\[(.*?)\],\\"probabilities/s,
  )?.[1];
  if (!block) return {};
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/\\"label\\":\\"([^\\]+)\\",\\"value\\":\\"([^\\]+)/g)) {
    if (PRODUCT_SPEC_LABELS.has(m[1]!)) out[m[1]!] = m[2]!;
  }
  return out;
}

function parseKayouOfficialCardChunk(chunk: string): KayouOfficialCard | null {
  const idCode =
    chunk.match(/idCode\\":\\"([^\\]+)/)?.[1] ??
    chunk.match(/^([^\\]+)/)?.[1];
  const rarity = chunk.match(/rarity\\":\\"([^\\]+)/)?.[1];
  const backImage = chunk.match(/backImage\\":\\"([^\\]+)/)?.[1];
  if (!idCode || !rarity || !backImage) return null;

  const rawName = chunk.match(/name\\":\\"([^\\]*)/)?.[1];
  const image = chunk.match(/\\"image\\":\\"([^\\]+)/)?.[1];
  const rarityFull = chunk.match(/rarityFull\\":\\"([^\\]*)/)?.[1];
  const sortOrder = Number(chunk.match(/sortOrder\\":(\d+)/)?.[1]);
  const frontWidth = Number(chunk.match(/imageWidth\\":(\d+)/)?.[1]);
  const frontHeight = Number(chunk.match(/imageHeight\\":(\d+)/)?.[1]);

  return {
    idCode,
    name: rawName?.replace(/\\n/g, "\n").trim() ?? idCode,
    rarity,
    ...(rarityFull ? { rarityFull } : {}),
    frontImage: image ?? "",
    ...(Number.isFinite(frontWidth) ? { frontWidth } : {}),
    ...(Number.isFinite(frontHeight) ? { frontHeight } : {}),
    backImage,
    ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
  };
}

/** Featured gallery on a series (SKU) page — face + back + idCode. */
export function parseKayouOfficialSeriesCards(
  seriesHtml: string,
): KayouOfficialCard[] {
  const byCode = new Map<string, KayouOfficialCard>();
  const chunks = seriesHtml.includes('\\"cards\\":[')
    ? seriesHtml.split('\\"id\\":\\"merch-').slice(1)
    : seriesHtml.split('idCode\\":\\"').slice(1);

  for (const chunk of chunks) {
    const card = parseKayouOfficialCardChunk(chunk);
    if (card?.idCode) byCode.set(card.idCode, card);
  }
  return [...byCode.values()].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

export function parseKayouOfficialHeroBoxImage(
  seriesHtml: string,
): string | null {
  return seriesHtml.match(/heroBoxImage\\":\\"([^\\]+)/)?.[1]?.trim() ?? null;
}

export function parseKayouOfficialSeriesDetail(
  seriesHtml: string,
  seriesId: string,
): KayouOfficialSeriesDetail {
  const productSpecs = parseKayouOfficialProductSpecs(seriesHtml);
  return {
    seriesId,
    seriesTypeName:
      seriesHtml.match(/seriesTypeName\\":\\"([^\\]+)/)?.[1]?.trim() ?? "",
    seriesTypeDescription:
      seriesHtml.match(/seriesTypeDescription\\":\\"([^\\]+)/)?.[1]?.trim() ??
      "",
    productSpecs,
    productName: productSpecs["Product Name"],
    model: productSpecs.Model,
    heroBoxImage: parseKayouOfficialHeroBoxImage(seriesHtml) ?? undefined,
    cards: parseKayouOfficialSeriesCards(seriesHtml),
  };
}
