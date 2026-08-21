/**
 * Goat sealed-box packshots for Coleka EN CCG display gaps.
 * Source of truth: `curated/sources/goat-en-ccg.json` (3970).
 *
 * Faces: shop 350×490 into `cards/{family}/{n0001}/en/` (s1–s27).
 * Packshots: only the six Coleka-missing displays
 * (s16, s19, s21–s23, s27). Never mint display-s1…s6.
 */
import ledger from "./curated/sources/goat-en-ccg.json";

const GOAT_COLEKA_GAPS = ["s16", "s19", "s21", "s22", "s23", "s27"] as const;

const GOAT_GAP_TITLES: Record<(typeof GOAT_COLEKA_GAPS)[number], string> = {
  s16: "Broken Promises",
  s19: "Path of Pain",
  s21: "Shattered Truth",
  s22: "Weapons of War",
  s23: "Invasion",
  s27: "Hero's Ascension",
};

export type GoatGapPackshot = {
  slug: string;
  staging: string;
  url: string;
  setCode: (typeof GOAT_COLEKA_GAPS)[number];
  title: string;
};

export function goatPackshotLedger() {
  return ledger;
}

/** Shop listing thumbs insert `/medium/`; the catalogue wants the original. */
export function goatCdnOriginal(url: string): string {
  return url.replace(/\/medium\//, "/");
}

export function goatIngestPackshots(): GoatGapPackshot[] {
  const gaps = new Set<string>(GOAT_COLEKA_GAPS);
  const rows: GoatGapPackshot[] = [];
  for (const row of ledger.sealed.boosterBoxes.products) {
    if (!row.ingestPackshot) continue;
    const setCode = row.setCode;
    if (!setCode || !gaps.has(setCode)) continue;
    if (!row.sku || !row.staging || !row.img) continue;
    const code = setCode as (typeof GOAT_COLEKA_GAPS)[number];
    rows.push({
      slug: row.sku,
      staging: row.staging,
      url: row.img,
      setCode: code,
      title: GOAT_GAP_TITLES[code],
    });
  }
  return rows.sort((a, b) =>
    a.setCode.localeCompare(b.setCode, undefined, { numeric: true }),
  );
}
