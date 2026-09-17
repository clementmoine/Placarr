/**
 * Goat sealed-box packshots for EN CCG displays.
 * Source of truth: `curated/sources/goat-en-ccg.json` (3970).
 *
 * Faces: shop 350×490 into `cards/{family}/{n0001}/en/` (s1–s27).
 * Packshots: **tous** les display-box avec photo CDN → `art.goat.*`.
 * Mint SKU: seulement les trous Coleka (s16, s19, s21–s23, s27) — les
 * autres displays existent déjà ; productChoice choisit l'affichage.
 */
import ledger from "../curated/sources/goat-en-ccg.json";

const GOAT_COLEKA_GAPS = ["s16", "s19", "s21", "s22", "s23", "s27"] as const;

const GOAT_GAP_TITLES: Record<(typeof GOAT_COLEKA_GAPS)[number], string> = {
  s16: "Broken Promises",
  s19: "Path of Pain",
  s21: "Shattered Truth",
  s22: "Weapons of War",
  s23: "Invasion",
  s27: "Hero's Ascension",
};

type GoatLedgerProduct =
  (typeof ledger.sealed.boosterBoxes.products)[number];

export type GoatDisplayPackshot = {
  slug: string;
  staging: string;
  url: string;
  setCode: string;
  title: string;
};

/** @deprecated Prefer {@link GoatDisplayPackshot}. */
export type GoatGapPackshot = GoatDisplayPackshot;

export function goatPackshotLedger() {
  return ledger;
}

/** Shop listing thumbs insert `/medium/`; the catalogue wants the original. */
export function goatCdnOriginal(url: string): string {
  return url.replace(/\/medium\//, "/");
}

function goatStagingExt(row: GoatLedgerProduct): string {
  if ("bytes" in row && row.bytes === "gif89a") return "gif";
  const img = typeof row.img === "string" ? row.img : "";
  const match = /\.(jpe?g|png|gif|webp)$/i.exec(img);
  if (!match) return "jpg";
  const ext = match[1]!.toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function goatDisplayTitle(row: GoatLedgerProduct, setCode: string): string {
  const gapTitle =
    GOAT_GAP_TITLES[setCode as (typeof GOAT_COLEKA_GAPS)[number]];
  if (gapTitle) return gapTitle;
  const raw = typeof row.title === "string" ? row.title : "";
  return raw.replace(/\s+Booster Box$/i, "").trim() || setCode;
}

/** Tous les display-box Goat avec photo CDN — dump `art.goat`, moteur choisit. */
export function goatIngestPackshots(): GoatDisplayPackshot[] {
  const rows: GoatDisplayPackshot[] = [];
  const seen = new Set<string>();
  for (const row of ledger.sealed.boosterBoxes.products) {
    if (row.kind !== "display-box") continue;
    if (row.photo !== "cdn") continue;
    const setCode = row.setCode;
    if (!setCode || typeof setCode !== "string") continue;
    if (typeof row.img !== "string" || !row.img.trim()) continue;
    if (seen.has(setCode)) continue;
    seen.add(setCode);
    const ext = goatStagingExt(row);
    rows.push({
      slug: `display-${setCode}`,
      staging: `staging/goat-en-boxes/${setCode}.${ext}`,
      url: row.img,
      setCode,
      title: goatDisplayTitle(row, setCode),
    });
  }
  return rows.sort((a, b) =>
    a.setCode.localeCompare(b.setCode, undefined, { numeric: true }),
  );
}

/** SKU display à minter faute de cover Coleka — pas un filtre d'archive. */
export function goatMintDisplayPackshots(): GoatDisplayPackshot[] {
  const gaps = new Set<string>(GOAT_COLEKA_GAPS);
  return goatIngestPackshots().filter((row) => gaps.has(row.setCode));
}
