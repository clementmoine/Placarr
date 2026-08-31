/**
 * Goat CrystalCommerce — the catalogue data behind the faces.
 *
 * We already take names and 350×490 scans from this shop. Each product also
 * carries a `data-name` on its add-to-cart form, and that string holds more
 * than a name:
 *
 *   `8 Trigram Divination Seal Spell Fomula - J-006 - Common - 1st Edition - Wavy Foil`
 *    └ nom ────────────────────────────────┘ └ ref ┘ └ rareté ┘ └ édition ──┘ └ finish ┘
 *
 * Three axes the catalogue does not hold for EN today:
 *   - **rareté** (3 062 des 4 437 tirages EN n'en ont aucune) ;
 *   - **édition** — 1st Edition vs Unlimited, deux tirages du même numéro ;
 *   - **finish** — Diamond Foil / Wavy Foil, qui sont des vernis distincts.
 *
 * The string is written by shop staff, so the parser reads it defensively:
 * the ref anchors everything, what precedes is the name, what follows is
 * classified by vocabulary rather than by position. A segment it cannot place
 * is kept in `extra` instead of being guessed at — `1st Edition on top left` is
 * a real printing quirk, not noise to drop.
 */
export type GoatCatalogueRow = {
  /** Printed ref as the shop writes it: `J-006`, `N-1646`, `M-US043`. */
  printedRef: string;
  name: string;
  rarity: string | null;
  edition: string | null;
  finish: string | null;
  /** Segments the vocabulary did not recognise, kept verbatim. */
  extra: string[];
  raw: string;
};

const DATA_NAME_RE = /data-name="([^"]+)"/g;
const REF_RE = /^((?:N|J|M|C|PR)-(?:US-?)?\d{1,4})$/i;

const RARITY = new Set([
  "common",
  "uncommon",
  "rare",
  "super rare",
  "ultra rare",
  "secret rare",
  "promo",
  "starter deck",
  "fixed",
]);

const EDITION = new Set(["1st edition", "unlimited edition", "unlimited"]);

/** Finishes the shop names — distinct varnishes, not a rarity. */
const FINISH = new Set([
  "foil",
  "diamond foil",
  "wavy foil",
  "holo",
  "holo foil",
]);

/**
 * Shop staff type the same value several ways — `PROMO` / `Promo`, `COMMON` /
 * `Common`, `Unlimited` / `Unlimited Edition`, `FOIL` / `Foil`. Same fact, so
 * it must land under one label; the shop's wording is kept, only its typing is
 * settled.
 */
export function normalizeGoatValue(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const canon: Record<string, string> = {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    "super rare": "Super Rare",
    "ultra rare": "Ultra Rare",
    "secret rare": "Secret Rare",
    promo: "Promo",
    "starter deck": "Starter Deck",
    fixed: "Fixed",
    "1st edition": "1st Edition",
    unlimited: "Unlimited Edition",
    "unlimited edition": "Unlimited Edition",
    foil: "Foil",
    "diamond foil": "Diamond Foil",
    "wavy foil": "Wavy Foil",
    holo: "Holo",
    "holo foil": "Holo Foil",
  };
  return canon[key] ?? trimmed;
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseGoatProductName(raw: string): GoatCatalogueRow | null {
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  const parts = text.split(" - ").map((p) => p.trim());
  const refAt = parts.findIndex((p) => REF_RE.test(p));
  if (refAt <= 0) return null;

  const row: GoatCatalogueRow = {
    printedRef: parts[refAt]!.toUpperCase(),
    name: parts.slice(0, refAt).join(" - "),
    rarity: null,
    edition: null,
    finish: null,
    extra: [],
    raw: text,
  };
  for (const part of parts.slice(refAt + 1)) {
    const key = part.toLowerCase();
    if (!row.rarity && RARITY.has(key)) row.rarity = part;
    else if (!row.edition && EDITION.has(key)) row.edition = part;
    else if (!row.finish && FINISH.has(key)) row.finish = part;
    else row.extra.push(part);
  }
  row.rarity = normalizeGoatValue(row.rarity);
  row.edition = normalizeGoatValue(row.edition);
  row.finish = normalizeGoatValue(row.finish);
  return row;
}

export function parseGoatCataloguePage(html: string): GoatCatalogueRow[] {
  const seen = new Set<string>();
  const rows: GoatCatalogueRow[] = [];
  DATA_NAME_RE.lastIndex = 0;
  for (const m of html.matchAll(DATA_NAME_RE)) {
    const raw = m[1] ?? "";
    if (seen.has(raw)) continue;
    seen.add(raw);
    const row = parseGoatProductName(raw);
    if (row) rows.push(row);
  }
  return rows;
}

/** Last page number the pager exposes for a catalogue id. */
export function goatLastPage(html: string, catalogId: number | string): number {
  const pages = [
    ...html.matchAll(new RegExp(`href="[^"]*${catalogId}\\?page=(\\d+)`, "g")),
  ].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}
