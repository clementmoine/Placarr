/**
 * Offline visual index for sealed packshots (camera / photo → productKey).
 *
 * Full-frame dHash/aHash/color — **never** CARD_ART_BAND (borders and logos
 * are signal on sealed SKUs). Match is top‑k + user confirm — never auto-accept.
 *
 * Disk layout: `products/{slug}/{lang}/art.*` (ranked by catalogue criteria).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  dHashFromBuffer,
  hammingDistance,
} from "@/core/enrich/media/imageAssets";
import { catalogueFaceRankScore } from "@/core/enrich/media/catalogueFaceRank";
import { resolveFaceArtMetaForDig } from "@/core/enrich/media/faceArtMeta";
import { extractCardVisualSignals } from "@/core/identify/cardVisualSignals";
import { faceFingerprint } from "@/core/identify/cardVisualIndex";
import { packDataDir, packSealedProductsDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

export type ProductVisualIndexEntry = {
  /** `${packId}::${slug}` */
  productKey: string;
  lang: string;
  slug: string;
  /** Relative path under the pack data dir. */
  artRel: string;
  /** Full-frame dHash (64-bit binary string). */
  hash: string;
  aHash?: string;
  color?: string;
  fp?: string;
};

export type ProductVisualIndexFile = {
  version: 1;
  packId: string;
  lang: string;
  builtAt: string;
  entries: ProductVisualIndexEntry[];
};

export const PRODUCT_VISUAL_INDEX_VERSION = 1 as const;

const INDEX_NAME = "product-visual-index.json";
const LANG_SEGMENT = /^[a-z]{2}([a-z]{2})?$/i;

const FACE_LANGS = new Set([
  "fr",
  "en",
  "ja",
  "it",
  "de",
  "es",
  "pt",
  "ko",
  "zh",
  "nl",
  "pl",
  "ru",
]);

function isFaceLang(name: string): boolean {
  const code = name.trim().toLowerCase();
  return FACE_LANGS.has(code) && LANG_SEGMENT.test(code);
}

export function makeProductKey(packId: string, slug: string): string {
  return `${packId.trim()}::${slug.trim()}`;
}

export function parseProductKey(
  productKey: string,
): { packId: string; slug: string } | null {
  const key = productKey.trim();
  const sep = key.indexOf("::");
  if (sep <= 0 || sep === key.length - 2) return null;
  const packId = key.slice(0, sep).trim();
  const slug = key.slice(sep + 2).trim();
  if (!packId || !slug) return null;
  return { packId, slug };
}

/** Reuse key for a product face row. */
export function productVisualEntryKey(
  productKey: string,
  lang: string,
  artRel?: string,
): string {
  return artRel
    ? `${productKey}\0${lang}\0${artRel}`
    : `${productKey}\0${lang}`;
}

export { faceFingerprint, dHashFromBuffer };

export function canReuseProductVisualEntry(
  prior: ProductVisualIndexEntry | undefined,
  artRel: string,
  fp: string | null,
): prior is ProductVisualIndexEntry {
  return Boolean(
    prior &&
      prior.artRel === artRel &&
      fp &&
      prior.fp === fp &&
      prior.aHash &&
      prior.color,
  );
}

export function productVisualIndexEntriesEqual(
  a: readonly ProductVisualIndexEntry[],
  b: readonly ProductVisualIndexEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.productKey !== y.productKey ||
      x.lang !== y.lang ||
      x.slug !== y.slug ||
      x.artRel !== y.artRel ||
      x.hash !== y.hash ||
      x.aHash !== y.aHash ||
      x.color !== y.color ||
      x.fp !== y.fp
    ) {
      return false;
    }
  }
  return true;
}

export function productVisualIndexPath(packId: string): string {
  return path.join(packDataDir(packId), INDEX_NAME);
}

export function productVisualIndexCountPath(packId: string): string {
  return `${productVisualIndexPath(packId)}.count`;
}

const indexCache = new Map<
  string,
  { mtimeMs: number; file: ProductVisualIndexFile }
>();

export function loadProductVisualIndex(
  packId: string,
): ProductVisualIndexFile | null {
  const filePath = productVisualIndexPath(packId);
  if (!existsSync(filePath)) {
    indexCache.delete(packId);
    return null;
  }
  try {
    const mtimeMs = statSync(filePath).mtimeMs;
    const cached = indexCache.get(packId);
    if (cached && cached.mtimeMs === mtimeMs) return cached.file;
    const parsed = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as ProductVisualIndexFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return null;
    }
    indexCache.set(packId, { mtimeMs, file: parsed });
    return parsed;
  } catch {
    indexCache.delete(packId);
    return null;
  }
}

export function writeProductVisualIndexIfChanged(
  file: ProductVisualIndexFile,
  prior: ProductVisualIndexFile | null,
): { file: ProductVisualIndexFile; written: boolean } {
  if (
    prior &&
    prior.version === file.version &&
    prior.lang === file.lang &&
    productVisualIndexEntriesEqual(prior.entries, file.entries)
  ) {
    return { file: prior, written: false };
  }
  return { file: writeProductVisualIndex(file), written: true };
}

export function writeProductVisualIndex(
  file: ProductVisualIndexFile,
): ProductVisualIndexFile {
  const dest = productVisualIndexPath(file.packId);
  writeFileSync(dest, JSON.stringify(file));
  try {
    writeFileSync(
      productVisualIndexCountPath(file.packId),
      String(file.entries.length),
      "utf8",
    );
  } catch {
    /* count sidecar is best-effort */
  }
  try {
    indexCache.set(file.packId, {
      mtimeMs: statSync(dest).mtimeMs,
      file,
    });
  } catch {
    indexCache.delete(file.packId);
  }
  return file;
}

/** Pack ids that already have a product visual index on disk. */
export function listProductVisualIndexPackIds(): string[] {
  const root = dataRoot();
  if (!existsSync(root)) return [];
  const found: string[] = [];

  const walk = (rel: string, depth: number) => {
    if (depth > 3) return;
    const abs = rel ? path.join(root, rel) : root;
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      if (ent.isFile() && ent.name === INDEX_NAME && rel) {
        found.push(rel.split(path.sep).join("/"));
        continue;
      }
      if (ent.isDirectory()) {
        walk(rel ? path.join(rel, ent.name) : ent.name, depth + 1);
      }
    }
  };

  walk("", 0);
  return found.sort();
}

async function signalsFromFile(
  filePath: string,
): Promise<{ hash: string; aHash: string; color: string } | null> {
  if (!existsSync(filePath)) return null;
  // Full-frame — sealed packshots must never use CARD_ART_BAND.
  const signals = await extractCardVisualSignals(readFileSync(filePath), {
    artBand: false,
  });
  if (!signals) return null;
  return {
    hash: signals.dHash,
    aHash: signals.aHash,
    color: signals.color,
  };
}

function listArtFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(
      (name) =>
        /^art(\.|$)/i.test(name) &&
        /\.(webp|jpg|jpeg|png|gif)$/i.test(name),
    )
    .sort((a, b) => {
      const metaA = resolveFaceArtMetaForDig({ artFile: a });
      const metaB = resolveFaceArtMetaForDig({ artFile: b });
      return (
        catalogueFaceRankScore({
          artFile: b,
          artKind: metaB.artKind,
          watermarked: metaB.watermarked,
        }) -
          catalogueFaceRankScore({
            artFile: a,
            artKind: metaA.artKind,
            watermarked: metaA.watermarked,
          }) || a.localeCompare(b)
      );
    });
}

/**
 * Ranked `art.*` siblings (catalogue criteria). Always full-frame files —
 * never a card-band crop. `face.json` is not SSOT.
 */
export function listProductArtFaces(dir: string): string[] {
  return listArtFiles(dir);
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

export function productIndexEntriesByKey(
  entries: readonly ProductVisualIndexEntry[] | null | undefined,
): Map<string, ProductVisualIndexEntry> | null {
  if (!entries?.length) return null;
  const map = new Map<string, ProductVisualIndexEntry>();
  for (const entry of entries) {
    map.set(
      productVisualEntryKey(entry.productKey, entry.lang, entry.artRel),
      entry,
    );
    map.set(productVisualEntryKey(entry.productKey, entry.lang), entry);
  }
  return map;
}

/**
 * Walk `products/{slug}/{lang}/art.*` and write (or return) the index.
 * Signals are always full-frame (`artBand: false`).
 */
export async function buildProductVisualIndex(opts: {
  packId: string;
  lang?: string;
  limit?: number;
  write?: boolean;
  prior?: readonly ProductVisualIndexEntry[] | null;
}): Promise<ProductVisualIndexFile> {
  const packId = opts.packId.trim();
  if (!packId) {
    throw new Error("buildProductVisualIndex: packId is required");
  }
  const preferredLang = opts.lang?.trim().toLowerCase() || null;
  const productsRoot = packSealedProductsDir(packId);
  const entries: ProductVisualIndexEntry[] = [];
  const seen = new Set<string>();
  const onDisk =
    opts.prior === null ? null : loadProductVisualIndex(packId);
  const prior = productIndexEntriesByKey(
    opts.prior === undefined ? onDisk?.entries : opts.prior,
  );
  const atLimit = () => opts.limit != null && entries.length >= opts.limit;

  for (const slug of listSubdirs(productsRoot)) {
    if (atLimit()) break;
    const slugDir = path.join(productsRoot, slug);
    for (const locale of listSubdirs(slugDir)) {
      if (atLimit()) break;
      if (!isFaceLang(locale)) continue;
      const lang = locale.toLowerCase();
      if (preferredLang && lang !== preferredLang) continue;
      const langDir = path.join(slugDir, lang);
      const productKey = makeProductKey(packId, slug);
      for (const artName of listProductArtFaces(langDir)) {
        if (atLimit()) break;
        const artRel = ["products", slug, lang, artName].join("/");
        const faceKey = productVisualEntryKey(productKey, lang, artRel);
        if (seen.has(faceKey)) continue;
        const abs = path.join(langDir, artName);
        const fp = faceFingerprint(abs);
        const prev =
          prior?.get(faceKey) ??
          prior?.get(productVisualEntryKey(productKey, lang));
        if (canReuseProductVisualEntry(prev, artRel, fp)) {
          seen.add(faceKey);
          entries.push({ ...prev, slug });
          continue;
        }
        const signals = await signalsFromFile(abs);
        if (!signals) continue;
        seen.add(faceKey);
        entries.push({
          productKey,
          lang,
          slug,
          artRel,
          hash: signals.hash,
          aHash: signals.aHash,
          color: signals.color,
          ...(fp ? { fp } : {}),
        });
      }
    }
  }

  const langCounts = new Map<string, number>();
  for (const entry of entries) {
    langCounts.set(entry.lang, (langCounts.get(entry.lang) ?? 0) + 1);
  }
  const ranked = [...langCounts.entries()].sort(
    (a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!),
  );
  const file: ProductVisualIndexFile = {
    version: PRODUCT_VISUAL_INDEX_VERSION,
    packId,
    lang: preferredLang ?? ranked[0]?.[0] ?? "multi",
    builtAt: new Date().toISOString(),
    entries,
  };
  if (opts.write === false) return file;
  return writeProductVisualIndexIfChanged(file, onDisk).file;
}

export type ProductVisualMatch = {
  productKey: string;
  lang: string;
  slug: string;
  distance: number;
  artRel: string;
  packId?: string;
  ambiguous?: boolean;
};

/** Top‑k nearest dHash neighbours. Caller must confirm — never auto-accept. */
export function matchProductVisualHash(
  hash: string,
  index: ProductVisualIndexFile,
  opts?: { limit?: number; maxDistance?: number; minMargin?: number },
): ProductVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 10;
  const minMargin = opts?.minMargin ?? 2;
  const scored: ProductVisualMatch[] = [];
  for (const entry of index.entries) {
    const distance = hammingDistance(hash, entry.hash);
    if (distance > maxDistance) continue;
    scored.push({
      productKey: entry.productKey,
      lang: entry.lang,
      slug: entry.slug,
      distance,
      artRel: entry.artRel,
      packId: index.packId,
    });
  }
  scored.sort(
    (a, b) =>
      a.distance - b.distance || a.productKey.localeCompare(b.productKey),
  );
  const top = scored.slice(0, limit);
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top;
}

export function matchProductVisualHashAcrossPacks(
  hash: string,
  opts?: {
    limit?: number;
    maxDistance?: number;
    minMargin?: number;
    packIds?: string[];
  },
): ProductVisualMatch[] {
  const packIds = opts?.packIds ?? listProductVisualIndexPackIds();
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 10;
  const scored: ProductVisualMatch[] = [];
  for (const packId of packIds) {
    const index = loadProductVisualIndex(packId);
    if (!index?.entries.length) continue;
    scored.push(
      ...matchProductVisualHash(hash, index, {
        limit: Math.max(limit, 12),
        maxDistance,
        minMargin: 0,
      }),
    );
  }
  scored.sort(
    (a, b) =>
      a.distance - b.distance || a.productKey.localeCompare(b.productKey),
  );
  const top = scored.slice(0, limit);
  const minMargin = opts?.minMargin ?? 2;
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
}
