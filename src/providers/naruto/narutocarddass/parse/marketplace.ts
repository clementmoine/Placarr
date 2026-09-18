/**
 * Naruto Carddass marketplace parsers.
 */

import universe from "../curated/sources/cardcheckbox-jp.json";
import { mintNarutoPrintKey, narutoDiskCardId } from "../identity";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── shared helpers ─────────────────────────────────────────────────────

const ITEM_RE =
  /data-rat-itemid="(\d+)\/(\d+)"[^>]*data-rat-item_name="([^"]*)"[^>]*data-rat-price="(\d+)"/g;
const IMG_RE =
  /data-original="(https:\/\/img\.fril\.jp\/img\/(\d+)\/[a-z]\/[^"]+)"/g;

// ─── parseAvalonShop ──────────────────────────────────────────────────────────

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
const avalonShop_TITLE_RE = /^([忍術作依騎])-(\d+)\s*(.*)$/;

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
    const title = avalonShop_TITLE_RE.exec(rawTitle.replace(/\s+/g, " ").trim());
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

// ─── parseChitoroshop ──────────────────────────────────────────────────────────

/**
 * Identifier une carte de chitoroshop, dont la fiche ne dit pas sa famille.
 *
 * La boutique vend des cartes japonaises à l'unité, avec des scans à plat en
 * 1414×2000 — exactement ce qui manque au catalogue japonais. Mais son titre
 * ne porte que le nom et le numéro : « Baki 130 ». Or le numéro seul ne tranche
 * rien, chacun existant dans six ou sept familles du catalogue.
 *
 * **Deux signaux indépendants**, et c'est leur indépendance qui fait la valeur :
 *
 * 1. Le **nom anglais**. La boutique écrit en anglais, et le catalogue tient
 *    4 261 titres anglais du CCG américain. Une correspondance exacte sur le
 *    couple (nom, numéro) donne la famille — américaine, qu'on traduit ensuite
 *    en famille japonaise, `n`→`ni`, `j`→`te`, `m`→`ta`.
 * 2. Le **volume**. La fiche dit « Vol.6 », et les plages de numéros de chaque
 *    sortie japonaise sont connues. Si une seule famille du volume couvre ce
 *    numéro, elle est désignée.
 *
 * Mesuré le 2026-08-21 sur les 227 produits : les deux signaux se prononcent
 * ensemble 15 fois et **ne se contredisent jamais**. C'est cette absence de
 * désaccord qui autorise à faire confiance aux 52 cas où un seul parle.
 *
 * Ce module ne fait que l'identification, sans réseau : il se teste sur des
 * chaînes.
 */

/** Famille américaine → famille japonaise. Même carte, deux numérotations. */
const JAPANESE_FAMILY: Readonly<Record<string, string>> = {
  n: "ni",
  ni: "ni",
  j: "te",
  ju: "te",
  te: "te",
  m: "ta",
  mi: "ta",
  st: "ta",
  ta: "ta",
  c: "cl",
  cl: "cl",
  ki: "ki",
};

export function japaneseFamilyOf(family: string): string | null {
  return JAPANESE_FAMILY[family.trim().toLowerCase()] ?? null;
}

/** Accents retirés, ponctuation aplatie : « Kidōmaru » et « Kidomaru ». */
export function normalizeShopName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ChitoroTitle = { name: string; number: number };

/**
 * « Baki 130 | Naruto Card Game » → `{ name: "baki", number: 130 }`.
 *
 * Rend `null` dès que le titre ne finit pas par un numéro : la collection tient
 * aussi des autocollants et de la Data Carddass, qui ne sont pas des cartes de
 * ce jeu.
 */
export function parseChitoroTitle(title: string): ChitoroTitle | null {
  const head = String(title).split("|")[0]?.trim() ?? "";
  const match = /^(.*?)\s+(\d{1,3})$/.exec(head);
  if (!match) return null;
  const name = normalizeShopName(match[1]);
  if (!name) return null;
  return { name, number: Number(match[2]) };
}

/**
 * Couple (nom boutique, numéro) → famille japonaise unique.
 *
 * Exact d'abord. Sinon, le **plus long** nom catalogue qui est un préfixe du
 * titre boutique — « Tsunade Hime UR 354 » rejoint « Tsunade » / 354 → `ni`,
 * sans inventer de liste de raretés. Un préfixe trop court (< 4) est refusé :
 * « Gaara of the desert » ne doit pas retomber sur un « Ga » ambigu.
 */
export function resolveChitoroNameFamily(
  nameIndex: Map<string, Set<string>>,
  shopName: string,
  number: number,
): string | null {
  const exact = nameIndex.get(`${shopName}|${number}`);
  if (exact?.size === 1) return [...exact][0]!;
  if (exact && exact.size > 1) return null;

  let best: { family: string; length: number } | null = null;
  const suffix = `|${number}`;
  for (const [key, families] of nameIndex) {
    if (!key.endsWith(suffix) || families.size !== 1) continue;
    const catalog = key.slice(0, -suffix.length);
    if (catalog.length < 4) continue;
    if (shopName !== catalog && !shopName.startsWith(`${catalog} `)) continue;
    if (!best || catalog.length > best.length) {
      best = { family: [...families][0]!, length: catalog.length };
    }
  }
  return best?.family ?? null;
}

/** « Naruto Card Game Vol.6 (2004) » → `maki6`. */
export function chitoroVolumeSetCode(text: string): string | null {
  const match = /Vol\.?\s*(\d{1,2})\b/i.exec(text);
  return match ? `maki${Number(match[1])}` : null;
}

export type ChitoroIdentity = {
  family: string;
  number: number;
  /** Ce qui a tranché — les deux, ou l'un des deux. */
  by: "both" | "name" | "volume";
};

/**
 * Croise les deux signaux.
 *
 * Un **désaccord** ne se tranche pas : on rend `null` plutôt que de choisir. Il
 * ne s'en est présenté aucun sur les 227 produits, et le jour où il s'en
 * présentera un, c'est qu'une des deux tables est fausse — pas qu'il faut
 * départager au hasard.
 */
export function resolveChitoroIdentity(input: {
  number: number;
  byName: string | null;
  byVolume: string | null;
}): ChitoroIdentity | null {
  const { number, byName, byVolume } = input;
  if (byName && byVolume) {
    if (byName !== byVolume) return null;
    return { family: byName, number, by: "both" };
  }
  if (byName) return { family: byName, number, by: "name" };
  if (byVolume) return { family: byVolume, number, by: "volume" };
  return null;
}

// ─── parseFrilListing ──────────────────────────────────────────────────────────

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

// ─── parseStorm3Shop ──────────────────────────────────────────────────────────

/**
 * Bandai USA CCG Series 28 — Ultimate Ninja Storm 3.
 *
 * Official site (bandaicg.com) was already dead when this set shipped (May
 * 2013), so Wayback has no `cards_s28`. The closed checklist + shop scans
 * come from stop2shop's Series 28 singles list (Yahoo store). EN numbering
 * continues the CCG (`N-1621`, `J-1002`, `M-976`) — not FR `NI/TE/TA`.
 *
 * Set code `s28` does not collide with FR Carddass (s1–s6 / promo / ns).
 */
export const STORM3_SET = "s28";
export const STORM3_LANG = "en";
export const STORM3_LISTING_PATH = "/naruto-28-uns3.html";

export type Storm3Rarity = "common" | "uncommon" | "rare" | "super rare";

export type Storm3Card = {
  /** Collector id as on the card, lowercased: `n1621`, `j1002`. */
  number: string;
  cardType: "n" | "j" | "m" | "c";
  name: string;
  rarity: Storm3Rarity;
  /** Shop path `/j1002.html`. */
  productPath: string;
};

const storm3Shop_TITLE_RE =
  /\b([NJMC])(\d{3,4})\s+(.+?)\s+(?:Ulitmate|Ultimate) Ninja Storm 3 Naruto Series 28\s+(Common|Uncommon|Rare|Gold Foil Super Rare)\s+Card/gi;

function rarityFromShop(raw: string): Storm3Rarity {
  const t = raw.toLowerCase();
  if (t.includes("super rare")) return "super rare";
  if (t.includes("uncommon")) return "uncommon";
  if (t.includes("rare")) return "rare";
  return "common";
}

export function parseStorm3Listing(html: string): Storm3Card[] {
  const byNumber = new Map<string, Storm3Card>();
  for (const match of html.matchAll(storm3Shop_TITLE_RE)) {
    const letter = match[1]!.toLowerCase() as Storm3Card["cardType"];
    const digits = match[2]!;
    const number = `${letter}${digits}`;
    if (byNumber.has(number)) continue;
    byNumber.set(number, {
      number,
      cardType: letter,
      name: match[3]!.replace(/\s+/g, " ").trim(),
      rarity: rarityFromShop(match[4]!),
      productPath: `/${number}.html`,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

/**
 * Fancybox href on `#itemMainImage` is the scan (often a JPEG served as
 * `.gif`). The `<img src>` next to it is a 350² display crop — skip it.
 */
export function parseStorm3ProductFaceUrl(html: string): string | null {
  const block = html.match(
    /id=["']?itemMainImage["']?[\s\S]{0,1200}?href=["'](https:\/\/s\.turbifycdn\.com\/aah\/my1stop2shop\/[^"']+)["']/i,
  );
  const url = block?.[1]?.trim();
  return url || null;
}

export function storm3PrintKey(number: string): string {
  return (
    mintNarutoPrintKey(number) ?? `naruto:${STORM3_SET}-${number.toLowerCase()}`
  );
}

// ─── parseSurugaCarddass ──────────────────────────────────────────────────────────

/**
 * Suruga-ya used listings for JP Carddass tabletop (巻ノ… 忍/術/作/依/騎).
 *
 * Search HTML is behind Cloudflare; CDN JPEGs are not:
 *   https://cdn.suruga-ya.jp/database/pics/game/{id.lower()}.jpg
 * Never Data Carddass DN/NM. Never EN CCG n/j.
 */
export const SURUGA_CARDDASS_ORIGIN = "https://www.suruga-ya.jp";
export const SURUGA_CARDDASS_CDN =
  "https://cdn.suruga-ya.jp/database/pics/game";
export const SURUGA_CARDDASS_LANG = "ja";
export const SURUGA_CARDDASS_SEARCH =
  "https://www.suruga-ya.jp/search?category=5&search_word=NARUTO-%E3%83%8A%E3%83%AB%E3%83%88-%20%E3%82%AB%E3%83%BC%E3%83%89%E3%82%B2%E3%83%BC%E3%83%A0%20%E5%B7%BB%E3%83%8E";

const LISTINGS_TSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-carddass-listings.tsv",
);

const PRODUCT_HREF =
  /href="https:\/\/www\.suruga-ya\.jp\/product\/detail\/([A-Za-z0-9]+)"/gi;

const PRINTED_RE =
  /(PR[-]?忍|PR[-]?術|PR[-]?作|PR[-]?依|PR[-]?騎|OP忍|[忍術作依騎])-(\d{1,4})(?:-([A-Za-z0-9]+))?/;

const DATA_CARDDASS_RE = /データカードダス|\bDN-|\bNM-/i;

export type SurugaCarddassListing = {
  id: string;
  printed: string;
};

export type SurugaCarddassCard = {
  number: string;
  printed: string;
  productIds: string[];
  faceUrl: string;
};

export function surugaCarddassFaceUrl(productId: string): string {
  return `${SURUGA_CARDDASS_CDN}/${productId.toLowerCase()}.jpg`;
}

export function surugaCarddassProductUrl(productId: string): string {
  return `${SURUGA_CARDDASS_ORIGIN}/product/detail/${productId}`;
}

export function parseSurugaCarddassPrinted(raw: string): string | null {
  const m = PRINTED_RE.exec(raw.replace(/\s+/g, ""));
  if (!m) return null;
  return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
}

function decodeSurugaHtmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

/**
 * Character name from a Suruga product title. Shop boilerplate stays out.
 * `忍-390[ノーマル]：マイト・ガイ（アニメ・ゲーム）` → `マイト・ガイ`.
 */
export function parseSurugaCarddassCharacterName(raw: string): string | null {
  const text = decodeSurugaHtmlEntities(raw).replace(/\s+/g, " ").trim();
  const printed = parseSurugaCarddassPrinted(text);
  if (!printed) return null;
  const compact = text.replace(/\s+/g, "");
  const pin = printed.replace(/\s+/g, "");
  const at = compact.indexOf(pin);
  if (at < 0) return null;
  let rest = compact.slice(at + pin.length);
  rest = rest.replace(/^\[[^\]]*\]/, "");
  rest = rest.replace(/^[：:]/, "");
  rest = rest.replace(/（アニメ・ゲーム）.*/, "");
  rest = rest.replace(/[（(]パック版[）)]/g, "");
  const name = rest.trim();
  if (!name || name.length > 48) return null;
  if (/^巻[ノの]/.test(name)) return null;
  if (/^NARUTO/i.test(name)) return null;
  return name;
}

export function surugaJaNamesFromResolvedRows(
  rows: ReadonlyArray<{ title?: string | null; printed?: string | null }>,
): Array<{ diskHint: string; name: string }> {
  const out: Array<{ diskHint: string; name: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const title = row.title?.trim();
    if (!title) continue;
    const printed =
      parseSurugaCarddassPrinted(row.printed ?? "") ??
      parseSurugaCarddassPrinted(title);
    if (!printed) continue;
    const diskHint = surugaPrintedToDiskId(printed);
    if (!diskHint || seen.has(diskHint)) continue;
    if (/^(nm|dn)/i.test(diskHint)) continue;
    const name = parseSurugaCarddassCharacterName(title);
    if (!name) continue;
    seen.add(diskHint);
    out.push({ diskHint, name });
  }
  return out;
}

/** `忍-85` → `ni0085`. Null for Data Carddass / unrecognised. */
export function surugaPrintedToDiskId(printed: string): string | null {
  const folded = parseSurugaCarddassPrinted(printed) ?? printed.trim();
  return narutoDiskCardId(folded);
}

const DOM_ITEM_RE =
  /<a[^>]*href="[^"]*\/product\/detail\/([A-Za-z0-9]+)[^"]*"[^>]*>[\s\S]*?<h3 class="product-name">([^<]+)<\/h3>/gi;

const surugaCarddass_ITEM_RE =
  /item_id:\s*(?:common\.htmlDecode\(\s*)?['"]([A-Za-z0-9]+)['"]\s*\)?\s*,\s*item_name:\s*(?:common\.htmlDecode\(\s*)?['"]([^'"]+)['"]/gi;

export function parseSurugaCarddassSearchHtml(
  html: string,
): SurugaCarddassListing[] {
  const seen = new Set<string>();
  const out: SurugaCarddassListing[] = [];

  DOM_ITEM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DOM_ITEM_RE.exec(html))) {
    const id = m[1]!.toUpperCase();
    if (seen.has(id)) continue;
    const title = decodeSurugaHtmlEntities(m[2]!);
    const printed = parseSurugaCarddassPrinted(title);
    if (!printed || DATA_CARDDASS_RE.test(title)) continue;
    seen.add(id);
    out.push({ id, printed });
  }

  surugaCarddass_ITEM_RE.lastIndex = 0;
  while ((m = surugaCarddass_ITEM_RE.exec(html))) {
    const id = m[1]!.toUpperCase();
    if (seen.has(id)) continue;
    const title = decodeSurugaHtmlEntities(m[2]!);
    const printed = parseSurugaCarddassPrinted(title);
    if (!printed || DATA_CARDDASS_RE.test(title)) continue;
    seen.add(id);
    out.push({ id, printed });
  }

  PRODUCT_HREF.lastIndex = 0;
  while ((m = PRODUCT_HREF.exec(html))) {
    const id = m[1]!.toUpperCase();
    if (seen.has(id)) continue;
    const slice = html.slice(m.index, m.index + 2500);
    const printed = parseSurugaCarddassPrinted(slice);
    if (isDataCarddassSlice(slice, printed) || !printed) continue;
    seen.add(id);
    out.push({ id, printed });
  }
  return out;
}

function isDataCarddassSlice(slice: string, printed: string | null): boolean {
  if (!DATA_CARDDASS_RE.test(slice)) return false;
  return !printed;
}

/** Single product page — same printed rules as search slices. */
export function parseSurugaProductDetailHtml(
  html: string,
  productId: string,
): SurugaCarddassListing | null {
  const printed = parseSurugaCarddassPrinted(html);
  if (!printed) return null;
  if (isDataCarddassSlice(html, printed)) return null;
  if (/^NM-|^DN-/i.test(printed)) return null;
  return { id: productId.toUpperCase(), printed };
}

export function mergeSurugaCarddassListings(
  ...groups: readonly (readonly SurugaCarddassListing[])[]
): SurugaCarddassListing[] {
  const seen = new Set<string>();
  const out: SurugaCarddassListing[] = [];
  for (const group of groups) {
    for (const row of group) {
      const id = row.id.toUpperCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, printed: row.printed });
    }
  }
  return out;
}

export function parseSurugaCarddassListingsTsv(
  tsv: string,
): SurugaCarddassListing[] {
  const out: SurugaCarddassListing[] = [];
  const seen = new Set<string>();
  for (const line of tsv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tab = trimmed.indexOf("\t");
    if (tab < 0) continue;
    const id = trimmed.slice(0, tab).trim().toUpperCase();
    const printed = parseSurugaCarddassPrinted(trimmed.slice(tab + 1));
    if (!id || !printed || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, printed });
  }
  return out;
}

export function formatSurugaCarddassListingsTsv(
  listings: readonly SurugaCarddassListing[],
): string {
  const sorted = [...listings].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((row) => `${row.id}\t${row.printed}`).join("\n") + "\n";
}

export function loadSurugaCarddassCuratedListings(): SurugaCarddassListing[] {
  return parseSurugaCarddassListingsTsv(readFileSync(LISTINGS_TSV, "utf8"));
}

export function foldSurugaCarddassListings(
  listings: readonly SurugaCarddassListing[],
): SurugaCarddassCard[] {
  const byNumber = new Map<string, SurugaCarddassCard>();
  for (const row of listings) {
    const number = surugaPrintedToDiskId(row.printed);
    if (!number) continue;
    const prev = byNumber.get(number);
    if (!prev) {
      byNumber.set(number, {
        number,
        printed: row.printed,
        productIds: [row.id],
        faceUrl: surugaCarddassFaceUrl(row.id),
      });
      continue;
    }
    if (!prev.productIds.includes(row.id)) prev.productIds.push(row.id);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}
