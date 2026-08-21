/**
 * カードショップ アヴァロン — JP 巻ノ singles listed one product per card.
 *
 * The only live host found that addresses Carddass cards by their printed ref:
 * each product title is `忍-165 パックン（若干傷み）` — ref, JP name, then a
 * condition note in full-width parens. Ledger: `curated/sources/avalon-shop-jp.json`.
 *
 * Two traps this parser exists to avoid:
 *   - the page is **EUC-JP**; decode before matching or every title is mojibake;
 *   - the same HTML carries a site-wide sidebar of other games (遊戯王, ONE
 *     PIECE…). Only titles opening on a 忍/術/作/依/騎 ref are this game, which
 *     also keeps out the shop's ナルティメット category and Data Carddass.
 */
const PRODUCT_RE =
  /<a href="\?pid=(\d+)">\s*<img src="([^"]+)"\s*\/>\s*([^<]+?)\s*<\/a>/g;

/** `忍-165 パックン（若干傷み）` — ref, name, then an optional condition note. */
const TITLE_RE = /^([忍術作依騎])-(\d+)\s*(.*)$/;

/**
 * Grades, not part of the card name. Only a trailing full-width parenthetical
 * carrying one of these is dropped — a name that happens to use parens keeps them.
 */
const CONDITION_RE =
  /（[^）]*(?:傷|キズ|折れ|汚れ|難|美品|よれ|ヨレ|白かけ|欠け)[^）]*）\s*$/;

export const AVALON_ORIGIN = "https://dp00013984.shop-pro.jp";
export const AVALON_IMAGE_ORIGIN = "https://img08.shop-pro.jp/PA01034/747";
export const AVALON_NARUTO_PATH = "/?mode=cate&cbid=1910612&csid=24";
export const AVALON_LANG = "ja";
/** Same shop, different product line (ナルティメット) — never this catalogue. */
export const AVALON_NARUTIMATE_PATH = "/?mode=cate&cbid=1910612&csid=133";

export type AvalonCard = {
  pid: string;
  /** As printed on the card: `忍-165`. */
  printedRef: string;
  title: string | null;
  thumbUrl: string;
};

/** Shop photo, full size. `_th` is the 1/3-scale thumbnail; `_O1` is a 403. */
export function avalonFullImageUrl(pid: string): string {
  return `${AVALON_IMAGE_ORIGIN}/product/${pid}.jpg`;
}

export function avalonListingUrl(): string {
  return `${AVALON_ORIGIN}${AVALON_NARUTO_PATH}`;
}

export function avalonProductUrl(pid: string): string {
  return `${AVALON_ORIGIN}/?pid=${pid}`;
}

/** Decode the EUC-JP body the shop serves. */
export function decodeAvalonHtml(bytes: Uint8Array): string {
  return new TextDecoder("euc-jp").decode(bytes);
}

export function cleanAvalonTitle(raw: string): string | null {
  const name = raw.replace(CONDITION_RE, "").trim();
  return name || null;
}

export function parseAvalonNarutoListing(html: string): AvalonCard[] {
  const seen = new Set<string>();
  const rows: AvalonCard[] = [];
  for (const m of html.matchAll(PRODUCT_RE)) {
    const [, pid, thumbUrl, rawTitle] = m;
    if (!pid || !thumbUrl || !rawTitle) continue;
    const title = TITLE_RE.exec(rawTitle.replace(/\s+/g, " ").trim());
    if (!title) continue;
    const printedRef = `${title[1]}-${Number(title[2])}`;
    if (seen.has(pid)) continue;
    seen.add(pid);
    rows.push({
      pid,
      printedRef,
      title: cleanAvalonTitle(title[3] ?? ""),
      thumbUrl,
    });
  }
  return rows;
}
