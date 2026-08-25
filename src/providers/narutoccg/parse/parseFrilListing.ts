/**
 * Fril / ラクマ search results — JP singles addressed by their printed ref.
 *
 * The JA hole is the catalogue's biggest and every archive host is exhausted.
 * Fril is the deepest live marketplace where the ref sits **in the title**
 * (`NARUTO ナルト カードゲーム 忍-106 赤胴ヨロイ BANDAI 2005`), so a listing can
 * be joined without guessing from the photo.
 *
 * Each result carries its own data attributes — id, clean title, price — and a
 * lazy image on `data-original`. We read those, never the surrounding markup.
 *
 * What this parser refuses is the point:
 *   - **lots** (`5枚セット`, `忍-25～27`, `まとめ売り`): a photo of several cards
 *     is the face of none of them;
 *   - the **疾風伝 / 忍伝 / 術伝** line, Data Carddass, Miracle Battle, wafer
 *     cards, Kayou, ROAD TO NINJA — other products that share the franchise;
 *   - anything carrying more than one ref.
 *
 * Names are deliberately not read from titles: sellers write them freely, and
 * the official cardlist already names every card. A listing is only a face.
 *
 * A ref the catalogue does not hold yet still installs — several numbers only
 * ever surfaced here — but only inside the numbering cardcheckbox published
 * (`cardcheckbox-jp.json`). A seller typo like 忍-9999 mints nothing.
 */
import universe from "../curated/sources/cardcheckbox-jp.json";
const ITEM_RE =
  /data-rat-itemid="(\d+)\/(\d+)"[^>]*data-rat-item_name="([^"]*)"[^>]*data-rat-price="(\d+)"/g;
const IMG_RE =
  /data-original="(https:\/\/img\.fril\.jp\/img\/(\d+)\/[a-z]\/[^"]+)"/g;
const HREF_RE = /href="(https:\/\/item\.fril\.jp\/[0-9a-f]{32})"/g;
const TOTAL_RE = /data-rat-cp-totalresults="(\d+)"/;

/** `忍-106`, `忍ー257` (katakana long mark), `PR忍-4`, `騎-7`. */
const REF_RE = /(PR忍|PR術|PR作|PR依|OP忍|忍|術|作|依|騎)[-ー－‐−]?(\d{1,4})/g;

/** Product lines that share the franchise but not this catalogue. */
const OTHER_LINE =
  /疾風伝|忍伝|術伝|データカードダス|ミラクルバトル|ウエハース|カヨウ|KAYOU|ROAD TO NINJA|ナルティメット|ボルト|BORUTO/i;

/**
 * A listing that shows several cards at once.
 *
 * `1枚` means "one card" and is a *single* — only 2 and up is a lot. `＆` is
 * deliberately not a signal: 忍-264 is printed 奈良シカマル&テマリ, one card with
 * two characters on it.
 */
const LOT =
  /まとめ|セット|(?:[2-9]|\d{2,})\s*枚|～|〜|~|、\s*\d|コンプ|一括|詰め合わせ/;

export const FRIL_ORIGIN = "https://fril.jp";
export const FRIL_SEARCH_PATH = "/s";

export type FrilListing = {
  listingId: string;
  sellerId: string;
  itemUrl: string | null;
  title: string;
  priceYen: number;
  /** Large photo — `/m/` in the grid, `/l/` on the item page. */
  imageUrl: string;
  printedRef: string;
};

export type FrilParse = {
  total: number | null;
  items: FrilListing[];
  rejected: { title: string; reason: string }[];
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function frilLargeImage(url: string): string {
  return url.replace(/\/img\/(\d+)\/[a-z]\//, "/img/$1/l/");
}

/** The single ref a title carries, or a reason it cannot be used. */
export function frilRefFromTitle(
  raw: string,
): { ref: string } | { reason: string } {
  const title = decodeEntities(raw).trim();
  if (OTHER_LINE.test(title)) return { reason: "other-line" };
  REF_RE.lastIndex = 0;
  const refs = [...title.matchAll(REF_RE)].map(
    (m) => `${m[1]}-${Number(m[2])}`,
  );
  const distinct = [...new Set(refs)];
  if (!distinct.length) return { reason: "no-ref" };
  if (distinct.length > 1) return { reason: "several-refs" };
  if (LOT.test(title)) return { reason: "lot" };
  const clash = frilFamilyClash(title, distinct[0]!);
  if (clash) return { reason: clash };
  /*
    `忍-220 221 222` carries one ref and two bare numbers — the seller stopped
    repeating the prefix. Without this, a three-card photo would land on 忍-220.
  */
  REF_RE.lastIndex = 0;
  const first = REF_RE.exec(title);
  if (first) {
    const tail = title.slice(first.index + first[0].length);
    if (/^[\s　,、･・]*\d{1,4}(?:\D|$)/.test(tail)) return { reason: "lot" };
  }
  return { ref: distinct[0]! };
}

/**
 * Le nom de famille écrit en toutes lettres, et **seulement** sous une forme
 * qui ne peut pas être autre chose.
 *
 * Mesuré avant de figer la liste : un garde qui reconnaissait `忍` et `術`
 * seuls rejetait cinq bonnes annonces sur six — `作-50 忍という名の道具`,
 * `忍法 風蜘蛛 術-271`, `擬獣忍法・四脚の術 術-28`… Le 忍 y est dans le **nom
 * de la carte**, pas une déclaration de famille. Restent trois mots que rien
 * d'autre n'emploie.
 */
const FAMILY_WORD: ReadonlyArray<readonly [RegExp, string]> = [
  [/依頼人/, "依"],
  [/作戦カード|作戦札/, "作"],
  [/騎士カード/, "騎"],
];

/**
 * Un titre qui se contredit ne donne pas une carte.
 *
 * Relevé sur `依頼人　風花小雪　文字泊　忍-25` : le vendeur nomme la famille
 * 依頼人 et le personnage 風花小雪, puis écrit `忍-25`. La carte est 依-25 —
 * la photo l'atteste, elle porte 依-25 en bas à gauche. Prendre le numéro au
 * mot a collé le visage de Koyuki sur 忍-25.
 *
 * Quand le mot et le numéro désignent deux familles, on refuse. Deviner
 * laquelle a raison serait exactement le genre d'erreur qu'on ne veut pas :
 * silencieuse et confiante.
 */
export function frilFamilyClash(title: string, ref: string): string | null {
  const refFamily = /^(PR)?([忍術作依騎])/.exec(ref)?.[2];
  if (!refFamily) return null;
  for (const [pattern, family] of FAMILY_WORD) {
    if (!pattern.test(title)) continue;
    if (family !== refFamily) return `family-clash:${family}!=${refFamily}`;
    return null;
  }
  return null;
}

export function parseFrilSearch(html: string): FrilParse {
  const hrefs: string[] = [];
  HREF_RE.lastIndex = 0;
  for (const m of html.matchAll(HREF_RE)) hrefs.push(m[1]!);

  const images = new Map<string, string>();
  IMG_RE.lastIndex = 0;
  for (const m of html.matchAll(IMG_RE)) {
    if (!images.has(m[2]!)) images.set(m[2]!, m[1]!);
  }

  const items: FrilListing[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const seen = new Set<string>();
  let index = 0;
  ITEM_RE.lastIndex = 0;
  for (const m of html.matchAll(ITEM_RE)) {
    const [, sellerId, listingId, rawTitle, price] = m;
    if (!listingId || seen.has(listingId)) continue;
    seen.add(listingId);
    const title = decodeEntities(rawTitle ?? "").trim();
    const itemUrl = hrefs[index] ?? null;
    index += 1;
    const image = images.get(listingId);
    const verdict = frilRefFromTitle(title);
    if ("reason" in verdict) {
      rejected.push({ title, reason: verdict.reason });
      continue;
    }
    if (!image) {
      rejected.push({ title, reason: "no-image" });
      continue;
    }
    items.push({
      listingId,
      sellerId: sellerId!,
      itemUrl,
      title,
      priceYen: Number(price),
      imageUrl: frilLargeImage(image),
      printedRef: verdict.ref,
    });
  }

  const total = TOTAL_RE.exec(html);
  return { total: total ? Number(total[1]) : null, items, rejected };
}

/** Printed prefix → the highest number Bandai published for that family. */
const PUBLISHED_MAX: Readonly<Record<string, number>> = {
  忍: universe.universe.ni.max,
  術: universe.universe.te.max,
  作: universe.universe.ta.max,
  依: universe.universe.cl.max,
  騎: universe.universe.ki.max,
};

/**
 * True when the ref sits inside the published numbering. Promo sequences
 * (`PR忍`, `OP忍`) have no published maximum and are let through — they are
 * their own family and cannot collide with a booster number.
 */
export function frilRefWithinPublishedRange(ref: string): boolean {
  const m = /^(PR忍|PR術|PR作|PR依|OP忍|忍|術|作|依|騎)-(\d{1,4})$/.exec(ref);
  if (!m) return false;
  const max = PUBLISHED_MAX[m[1]!];
  if (max === undefined) return true;
  const n = Number(m[2]);
  return n >= 1 && n <= max;
}

export function frilSearchUrl(query: string, page = 1): string {
  const params = new URLSearchParams({ query });
  if (page > 1) params.set("page", String(page));
  return `${FRIL_ORIGIN}${FRIL_SEARCH_PATH}?${params.toString()}`;
}
