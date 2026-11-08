/**
 * On-wire product embedding meta entries — compact form drops the
 * `products/{slug}/{lang}/` prefix from `artRel` when the path is standard.
 */

export type ProductEmbeddingIndexEntry = {
  productKey: string;
  lang: string;
  slug: string;
  artRel: string;
  /** Row index into the Float32 matrix. */
  row: number;
  fp?: string;
};

/** Disk / wire shape — `art` basename XOR full `artRel` for odd paths. */
export type ProductEmbeddingIndexEntryWire = {
  productKey: string;
  lang: string;
  slug: string;
  row: number;
  art?: string;
  artRel?: string;
  fp?: string;
};

export function standardProductArtRel(
  slug: string,
  lang: string,
  artFile: string,
): string {
  return `products/${slug}/${lang}/${artFile}`;
}

export function expandProductEmbeddingEntry(
  raw: ProductEmbeddingIndexEntryWire | ProductEmbeddingIndexEntry,
): ProductEmbeddingIndexEntry | null {
  const productKey =
    typeof raw.productKey === "string" ? raw.productKey.trim() : "";
  const lang = typeof raw.lang === "string" ? raw.lang.trim() : "";
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  if (!productKey || !lang || !slug) return null;
  if (typeof raw.row !== "number" || !Number.isFinite(raw.row) || raw.row < 0) {
    return null;
  }

  const wire = raw as ProductEmbeddingIndexEntryWire;
  let artRel =
    typeof wire.artRel === "string" && wire.artRel.trim()
      ? wire.artRel.trim().replace(/\\/g, "/")
      : "";
  if (!artRel) {
    const art =
      typeof wire.art === "string" ? wire.art.trim().replace(/\\/g, "/") : "";
    if (!art || art.includes("/")) return null;
    artRel = standardProductArtRel(slug, lang, art);
  }

  const entry: ProductEmbeddingIndexEntry = {
    productKey,
    lang,
    slug,
    artRel,
    row: Math.floor(raw.row),
  };
  if (typeof wire.fp === "string" && wire.fp.trim()) {
    entry.fp = wire.fp.trim();
  }
  return entry;
}

export function compactProductEmbeddingEntry(
  entry: ProductEmbeddingIndexEntry,
): ProductEmbeddingIndexEntryWire {
  const artFile = entry.artRel.split(/[/\\]/).pop() ?? "";
  const standard = standardProductArtRel(entry.slug, entry.lang, artFile);
  const normalized = entry.artRel.replace(/\\/g, "/");
  const wire: ProductEmbeddingIndexEntryWire = {
    productKey: entry.productKey,
    lang: entry.lang,
    slug: entry.slug,
    row: entry.row,
  };
  if (artFile && normalized === standard) {
    wire.art = artFile;
  } else {
    wire.artRel = entry.artRel;
  }
  if (entry.fp) wire.fp = entry.fp;
  return wire;
}

export function expandProductEmbeddingEntries(
  raw: readonly (
    | ProductEmbeddingIndexEntryWire
    | ProductEmbeddingIndexEntry
  )[],
): ProductEmbeddingIndexEntry[] {
  const out: ProductEmbeddingIndexEntry[] = [];
  for (const row of raw) {
    const expanded = expandProductEmbeddingEntry(row);
    if (expanded) out.push(expanded);
  }
  return out;
}
