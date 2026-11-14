/**
 * On-wire embedding meta entries — compact form drops the redundant
 * `cards/{lang}/{set}/{card}/` prefix from `artRel` (largest JSON field).
 * Loaders expand back to a full `artRel` before matching / face URLs.
 */

export type CardEmbeddingIndexEntry = {
  printKey: string;
  lang: string;
  set: string;
  card: string;
  artRel: string;
  /** Row index into the Float32 matrix. */
  row: number;
  /** Face file fingerprint the vector was computed from (see visual index). */
  fp?: string;
};

/** Disk / wire shape — `art` basename XOR full `artRel` for odd paths. */
export type CardEmbeddingIndexEntryWire = {
  printKey: string;
  lang: string;
  set: string;
  card: string;
  row: number;
  art?: string;
  artRel?: string;
  fp?: string;
};

export function standardArtRel(
  lang: string,
  set: string,
  card: string,
  artFile: string,
): string {
  return `cards/${lang}/${set}/${card}/${artFile}`;
}

/** Expand a wire/disk entry to the in-memory shape (full `artRel`). */
export function expandEmbeddingEntry(
  raw: CardEmbeddingIndexEntryWire | CardEmbeddingIndexEntry,
): CardEmbeddingIndexEntry | null {
  const printKey = typeof raw.printKey === "string" ? raw.printKey.trim() : "";
  const lang = typeof raw.lang === "string" ? raw.lang.trim() : "";
  const set = typeof raw.set === "string" ? raw.set.trim() : "";
  const card = typeof raw.card === "string" ? raw.card.trim() : "";
  if (!printKey || !lang || !set || !card) return null;
  if (typeof raw.row !== "number" || !Number.isFinite(raw.row) || raw.row < 0) {
    return null;
  }

  const wire = raw as CardEmbeddingIndexEntryWire;
  let artRel =
    typeof wire.artRel === "string" && wire.artRel.trim()
      ? wire.artRel.trim().replace(/\\/g, "/")
      : "";
  if (!artRel) {
    const art =
      typeof wire.art === "string" ? wire.art.trim().replace(/\\/g, "/") : "";
    if (!art || art.includes("/")) return null;
    artRel = standardArtRel(lang, set, card, art);
  }

  const entry: CardEmbeddingIndexEntry = {
    printKey,
    lang,
    set,
    card,
    artRel,
    row: Math.floor(raw.row),
  };
  if (typeof wire.fp === "string" && wire.fp.trim()) {
    entry.fp = wire.fp.trim();
  }
  return entry;
}

/** Compact for disk/wire: prefer short `art` when the path is standard. */
export function compactEmbeddingEntry(
  entry: CardEmbeddingIndexEntry,
): CardEmbeddingIndexEntryWire {
  const artFile = entry.artRel.split(/[/\\]/).pop() ?? "";
  const standard = standardArtRel(entry.lang, entry.set, entry.card, artFile);
  const normalized = entry.artRel.replace(/\\/g, "/");
  const wire: CardEmbeddingIndexEntryWire = {
    printKey: entry.printKey,
    lang: entry.lang,
    set: entry.set,
    card: entry.card,
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

export function expandEmbeddingEntries(
  raw: readonly (CardEmbeddingIndexEntryWire | CardEmbeddingIndexEntry)[],
): CardEmbeddingIndexEntry[] {
  const out: CardEmbeddingIndexEntry[] = [];
  for (const row of raw) {
    const expanded = expandEmbeddingEntry(row);
    if (expanded) out.push(expanded);
  }
  return out;
}
