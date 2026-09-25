/**
 * Naruto Carddass catalogues parsers.
 */

import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
  canonicalNarutoDiskPrefix,
} from "../identity";
import { goatCdnOriginal } from "../sources/packshots";
import { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber, parseEnCcgPrintedRef, carddasJpVolumeSetCode } from "./bandai";
import { colekaCarddassPrefixToCollector } from "./coleka";
import curated from "../curated/sources/cardgameclub-it-cardlist.json";
import ledger from "../curated/sources/narutocards-ca.json";
import { decodeNarutoHtmlEntities } from "../pipeline";
import vintageNarutoCcg from "../curated/sources/vintage-naruto-ccg.json";
import fansetEnTitles from "../curated/sources/fanset-en-titles.json";
import tcdbLedger from "../curated/sources/tcdb-en-ccg.json";
import path from "node:path";
import driveLedger from "../curated/sources/naruto-ccg-drive.json";
export const NARUTO_STAGING_DRIVE = path.join("staging", "naruto-ccg-drive");


// ─── shared helpers ─────────────────────────────────────────────────────

const FILE_RE = /^(PRN|PRS|N|J|S|I|K)-(\d+)(?:_(\d+))?\.jpg$/i;

const TP_BY_SET: Record<string, string> = {
  "17.5": "tp1",
  "19.5": "tp2",
  "21.5": "tp3",
  "23.5": "tp4",
};

// ─── parseGoatCatalogue ──────────────────────────────────────────────────────────

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

const goatCatalogue_DATA_NAME_RE = /data-name="([^"]+)"/g;
const goatCatalogue_REF_RE = /^((?:N|J|M|C|PR)-(?:US-?)?\d{1,4})$/i;

const goatCatalogue_RARITY = new Set([
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
  const refAt = parts.findIndex((p) => goatCatalogue_REF_RE.test(p));
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
    if (!row.rarity && goatCatalogue_RARITY.has(key)) row.rarity = part;
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
  goatCatalogue_DATA_NAME_RE.lastIndex = 0;
  for (const m of html.matchAll(goatCatalogue_DATA_NAME_RE)) {
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

// ─── parseGoatEnCcg ──────────────────────────────────────────────────────────

/**
 * Goat CrystalCommerce singles for Bandai USA CCG.
 * Titles as the shop printed them. Faces are the 350×490 CDN JPEG the shop
 * actually serves (same pixels as Storm 3 stop2shop) — drop `/medium/`.
 */
export type GoatEnCcgVariant = {
  edition: string | null;
  finish: string | null;
  /** Segments the shop wrote that no vocabulary covers (`1st Edition on top left`). */
  extra?: string[];
};

export type GoatEnCcgCard = {
  number: string;
  cardType: "n" | "j" | "m" | "c";
  name: string;
  setCode: string;
  faceUrl?: string | null;
  /** Common / Uncommon / Rare / Starter Deck… — the shop's own word. */
  rarity?: string | null;
  /**
   * One entry per product the shop sells for this number: 1st vs Unlimited
   * edition, plain vs Diamond Foil vs Wavy Foil. Same card, different printings
   * — the catalogue had no record of either axis before.
   */
  variants?: GoatEnCcgVariant[];
};

function sameVariant(a: GoatEnCcgVariant, b: GoatEnCcgVariant): boolean {
  return (
    a.edition === b.edition &&
    a.finish === b.finish &&
    (a.extra ?? []).join("|") === (b.extra ?? []).join("|")
  );
}

const goatEnCcg_TITLE_RE = />([^<]{1,80}?)\s*-\s*([NJMC])-(\d{1,4})\s*-/g;
const ALT_RE = /^([^<]{1,80}?)\s*-\s*([NJMC])-(\d{1,4})\s*-/i;

function remember(
  byNumber: Map<string, GoatEnCcgCard>,
  row: GoatEnCcgCard,
): void {
  const prev = byNumber.get(row.number);
  if (!prev) {
    byNumber.set(row.number, row);
    return;
  }
  if (!prev.faceUrl && row.faceUrl) prev.faceUrl = row.faceUrl;
  if (!prev.rarity && row.rarity) prev.rarity = row.rarity;
  for (const variant of row.variants ?? []) {
    prev.variants ??= [];
    if (!prev.variants.some((held) => sameVariant(held, variant))) {
      prev.variants.push(variant);
    }
  }
}

function cardFromTitle(
  name: string,
  type: string,
  digits: string,
  setCode: string,
  faceUrl?: string,
): GoatEnCcgCard | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.includes("<") || /^(img|src|alt)$/i.test(trimmed)) {
    return null;
  }
  const printed = parseEnCcgPrintedRef(`${type}-${digits}`);
  if (!printed?.number || printed.usExclusive) return null;
  if (
    printed.cardType !== "n" &&
    printed.cardType !== "j" &&
    printed.cardType !== "m" &&
    printed.cardType !== "c"
  ) {
    return null;
  }
  return {
    number: printed.number,
    cardType: printed.cardType,
    name: trimmed,
    setCode,
    ...(faceUrl ? { faceUrl } : {}),
  };
}

export function parseGoatEnCcgListing(
  html: string,
  setCode: string,
): GoatEnCcgCard[] {
  const byNumber = new Map<string, GoatEnCcgCard>();
  for (const match of html.matchAll(goatEnCcg_TITLE_RE)) {
    const row = cardFromTitle(match[1]!, match[2]!, match[3]!, setCode);
    if (row) remember(byNumber, row);
  }
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /src="(https:\/\/crystalcommerce-assets[^"]+)"/i.exec(tag[0]);
    const alt = /alt="([^"]+)"/i.exec(tag[0]);
    if (!src || !alt) continue;
    const title = ALT_RE.exec(alt[1]!);
    if (!title) continue;
    const row = cardFromTitle(
      title[1]!,
      title[2]!,
      title[3]!,
      setCode,
      goatCdnOriginal(src[1]!),
    );
    if (row) remember(byNumber, row);
  }
  /*
    The add-to-cart forms carry `name - ref - rarity - edition - finish`, which
    is strictly richer than the link titles read above. Same numbers, extra
    columns — merged onto whatever the title pass already found.
  */
  for (const product of parseGoatCataloguePage(html)) {
    const ref = /^([NJMC])-(?:US-?)?(\d{1,4})$/i.exec(product.printedRef);
    if (!ref) continue;
    const row = cardFromTitle(product.name, ref[1]!, ref[2]!, setCode);
    if (!row) continue;
    row.rarity = product.rarity;
    row.variants = [
      {
        edition: product.edition,
        finish: product.finish,
        ...(product.extra.length ? { extra: product.extra } : {}),
      },
    ];
    remember(byNumber, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function mergeGoatEnCcgCardsIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly GoatEnCcgCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
  /** Prints that gained a rarity from the shop — EN had none anywhere else. */
  rarityFilled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  /*
    Indexed once, not searched per card: the shop ledger carries 3 348 rows and
    a linear `find` inside the loop turned this merge quadratic — it timed the
    suite out at 15 s before this map existed.
  */
  const titleByKey = new Map<string, NarutoTitleRow>();
  for (const t of titles) {
    titleByKey.set(
      `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
      t,
    );
  }
  const titleKeys = new Set(titleByKey.keys());
  const addedPrints: string[] = [];
  const titled: string[] = [];
  const rarityFilled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) {
      /*
        The name was already known — but the rarity may not be. The shop is the
        only EN source that states it, so fill the hole instead of skipping the
        row whole.
      */
      if (row.rarity) {
        const held = titleByKey.get(titleKey);
        if (held && !held.rarity) {
          held.rarity = normalizeGoatValue(row.rarity);
          rarityFilled.push(printKey);
        }
      }
      continue;
    }
    const name = row.name.trim();
    if (!name) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: name,
      ...(row.rarity ? { rarity: normalizeGoatValue(row.rarity) } : {}),
    });
    if (row.rarity) rarityFilled.push(printKey);
    titleKeys.add(titleKey);
    titleByKey.set(titleKey, titles[titles.length - 1]!);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  rarityFilled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled, rarityFilled };
}

// ─── parseHinokunian ──────────────────────────────────────────────────────────

/**
 * 火の国庵 — le relevé japonais des cartes NARUTO, page par sortie.
 *
 * Source de vérité : `curated/sources/hinokunian-jp.json` (53 pages).
 *
 * Ce que le site donne et que le catalogue japonais n'avait pas : le **nom
 * japonais** de chaque carte, sa rareté, et pour la ligne arcade la technique
 * imprimée. Corroboration mesurée : la page 巻ノ壱 rend 70 références, et
 * `cardcheckbox-jp.json` annonce « 70+P » pour cette sortie — deux relevés
 * indépendants d'accord au chiffre près.
 *
 * Ce qu'il ne donne pas : des scans. Les vignettes font 43×64.
 *
 * **La forme change d'une page à l'autre**, donc la lecture s'ancre sur la
 * référence et classe le reste par vocabulaire, jamais par numéro de colonne :
 *
 *   - volumes — trois colonnes, `忍-1 | うずまきナルト | R` ;
 *   - `cardbattle2-4` — six, `DN-002T | うずまきナルト | 忍術　連弾 | 新イラスト
 *     | 50円 | SR` ;
 *   - `cardbattle1` — rien en table : tout tient dans l'`alt` des vignettes,
 *     `DN-001T うずまきナルト -影分身の術-【ノーマル】`.
 *
 * Les pages sont en **SHIFT_JIS**. Les lire en UTF-8 ne rate pas bruyamment :
 * les références ASCII passent et les noms sortent en mojibake, ce qui donne un
 * relevé qui a l'air correct et ne l'est pas.
 */

/**
 * Référence imprimée, telle que la page l'écrit.
 *
 * `DT` et `CAN` sont venus du relevé lui-même, pas d'une liste devinée : la
 * quatrième vague arcade numérote `DT-002T` là où les trois premières écrivent
 * `DN-`, et le porte-cartes 木ノ葉絵巻 numérote `CAN-1`. Ce dernier corrobore
 * `cardcheckbox-jp.json`, qui annonçait déjà « CAN-1〜CAN-6 ».
 */
const hinokunian_REF_RE =
  /^(?:(?:PR[-－]?)?[忍術作依騎]|DN|DT|NM|CAN|N|J|M|C)[-－]?[0-9０-９]{1,4}[A-Za-zＴ]?$/;

/** Raretés relevées sur les 53 pages. Une case vide veut dire « normale ». */
const hinokunian_RARITY = new Set([
  "ノーマル",
  "N",
  "U",
  "R",
  "SR",
  "SSR",
  "激レア",
  "爆レア",
  "キラ",
]);

/** Mentions d'édition que le site pose à côté du nom. */
const EDITION_NOTE = /再録|新イラスト|新規|同柄/;

export type HinokunianCard = {
  /** Référence imprimée normalisée : `忍-1`, `DN-002T`. */
  printed: string;
  /** Personnage ou titre principal. */
  name: string | null;
  /** Technique / sous-titre, quand la page en donne un. */
  subtitle: string | null;
  rarity: string | null;
  /** `再録`, `新イラスト`… — l'état d'édition écrit par le site. */
  editionNote: string | null;
  /** Segments que le vocabulaire n'a pas placés, gardés tels quels. */
  extra: string[];
};

/** Le corps SHIFT_JIS que le site sert. */
export function decodeHinokunianHtml(bytes: Uint8Array): string {
  return new TextDecoder("shift_jis").decode(bytes);
}

/** `ＤＮ－００２Ｔ` → `DN-002T`. Le site mêle les deux chasses. */
export function toHalfWidth(value: string): string {
  return value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[－ー−]/g, "-");
}

function cellText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[　\s]+/g, " ")
    .trim();
}

function place(card: HinokunianCard, cell: string): void {
  if (!cell || cell === "-") return;
  if (!card.rarity && hinokunian_RARITY.has(cell)) {
    card.rarity = cell;
    return;
  }
  if (!card.editionNote && EDITION_NOTE.test(cell)) {
    card.editionNote = cell;
    return;
  }
  // Les cotes du site ne sont pas une donnée de carte. Elles s'écrivent
  // `450円` en colonne, mais `2,000円(中古)` dans les encarts boutique.
  if (/^[0-9,]+円/.test(toHalfWidth(cell))) return;
  if (!card.name) {
    card.name = cell;
    return;
  }
  if (!card.subtitle) {
    card.subtitle = cell;
    return;
  }
  card.extra.push(cell);
}

/** Les lignes de table : `忍-1 | うずまきナルト | R`. */
export function parseHinokunianTable(html: string): HinokunianCard[] {
  const out: HinokunianCard[] = [];
  for (const row of html.matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/gi)) {
    const cells = [
      ...row[1]!.matchAll(/<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/gi),
    ].map((m) => cellText(m[1]!));
    if (!cells.length) continue;
    const refAt = cells.findIndex((c) => hinokunian_REF_RE.test(toHalfWidth(c)));
    if (refAt < 0) continue;
    const card: HinokunianCard = {
      printed: toHalfWidth(cells[refAt]!),
      name: null,
      subtitle: null,
      rarity: null,
      editionNote: null,
      extra: [],
    };
    for (const [index, cell] of cells.entries()) {
      if (index === refAt) continue;
      place(card, cell);
    }
    out.push(card);
  }
  return out;
}

/**
 * La première vague arcade ne met rien en table : chaque carte est une
 * vignette dont l'`alt` porte tout.
 *
 *   `DN-001T うずまきナルト -影分身の術-【ノーマル】`
 */
export function parseHinokunianAlts(html: string): HinokunianCard[] {
  const out: HinokunianCard[] = [];
  for (const match of html.matchAll(/alt="([^"]{4,120})"/gi)) {
    const text = cellText(match[1]!);
    /*
      Les vignettes des encarts boutique portent la sortie d'origine entre
      crochets pleine chasse : `術-131 千鳥［巻ノ八/ウルトラレア］` sur la page
      du 巻ノ七. Les prendre pour des cartes de la page en cours attribuerait
      un tirage à la mauvaise sortie.
    */
    if (/［[^］]*巻[ノの][^］]*］/.test(text)) continue;
    const head = /^(\S+)\s+(.*)$/.exec(text);
    if (!head || !hinokunian_REF_RE.test(toHalfWidth(head[1]!))) continue;
    let rest = head[2]!;
    const rarity = /【([^】]+)】\s*$/.exec(rest);
    if (rarity) rest = rest.slice(0, rarity.index).trim();
    const subtitle = /[-－]([^-－]+)[-－]\s*$/.exec(rest);
    if (subtitle) rest = rest.slice(0, subtitle.index).trim();
    out.push({
      printed: toHalfWidth(head[1]!),
      name: rest || null,
      subtitle: subtitle?.[1]?.trim() ?? null,
      rarity: rarity?.[1]?.trim() ?? null,
      editionNote: null,
      extra: [],
    });
  }
  return out;
}

/**
 * Une page, quelle que soit sa forme. La table gagne quand elle donne quelque
 * chose : elle porte plus de colonnes que l'`alt` d'une vignette.
 */
export function parseHinokunianPage(html: string): HinokunianCard[] {
  const table = parseHinokunianTable(html);
  const rows = table.length ? table : parseHinokunianAlts(html);
  const seen = new Set<string>();
  return rows.filter((card) => {
    if (seen.has(card.printed)) return false;
    seen.add(card.printed);
    return true;
  });
}

export function hinokunianPageUrl(path: string): string {
  return `https://hinokunian.konohashigure.com/${path.replace(/^\/+/, "")}`;
}

// ─── parseCardgameclubIt ──────────────────────────────────────────────────────────

/**
 * CardGameClub Magento singles titles (IT Carddass S1–S5).
 * Shop copy prints NI/TE/ST/CL + the Italian name. ST → ta on disk.
 */
export type CardgameclubItCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
};

export type CardgameclubItFace = CardgameclubItCard & {
  /** Wayback or live Magento product thumbnail (300×375). */
  imageUrl: string;
};

const cardgameclubIt_DATA_NAME_RE = /data-name="((?:NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^"]+)"/gi;

const LINK_TITLE_RE =
  /product-item-link[^>]*>\s*((?:NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^<]{2,120})\s*</gi;

const SMALL_IMAGE_RE =
  /((?:https:\/\/web\.archive\.org\/web\/\d+im_\/https:\/\/)?(?:media\.)?cardgame-?club\.it\/catalog\/product\/cache\/1\/small_image\/300x375\/[^"]+\.jpg)/i;

const LEGACY_IMAGE_RE =
  /((?:https:\/\/web\.archive\.org\/web\/\d+im_\/https:\/\/)?(?:www\.)?cardgame-club\.it\/media\/catalog\/product\/cache\/[^"]+\.jpg)/i;

const cardgameclubIt_TITLE_RE =
  /^(NI|TE|TA|ST|CL)[-\s]?(\d{1,3})\s+(.+?)(?:\s+(?:comune|non comune|rara|ultra rara|epica|holo|foil).*)?$/i;

export function cardgameclubItCuratedCards(): CardgameclubItCard[] {
  return curated.cards as CardgameclubItCard[];
}

export function parseCardgameclubItTitle(
  raw: string,
  setCode: string,
): CardgameclubItCard | null {
  const cleaned = raw
    .replace(/\s*-\s*(?:NEAR\s+)?MINT-?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = cardgameclubIt_TITLE_RE.exec(cleaned);
  if (!m) return null;
  const printedRef = `${m[1]!.toUpperCase()}-${m[2]}`;
  const number = colekaCarddassPrefixToCollector(printedRef);
  if (!number) return null;
  const name = m[3]!.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return { number, name, setCode, printedRef };
}

/** Magento listing blocks: `data-name` / product link + thumbnail. */
export function parseCardgameclubItListingFaces(
  html: string,
  setCode: string,
): CardgameclubItFace[] {
  const byNumber = new Map<string, CardgameclubItFace>();
  for (const block of html.split("product-item-info").slice(1)) {
    let titleRaw: string | null = null;
    const dataName = block.match(
      /data-name="((?:NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^"]+)"/i,
    );
    if (dataName) titleRaw = dataName[1]!;
    if (!titleRaw) {
      const link = LINK_TITLE_RE.exec(block);
      if (link) titleRaw = link[1]!.trim();
    }
    if (!titleRaw) continue;
    const imgMatch = SMALL_IMAGE_RE.exec(block) ?? LEGACY_IMAGE_RE.exec(block);
    if (!imgMatch) continue;
    const row = parseCardgameclubItTitle(titleRaw, setCode);
    if (!row || byNumber.has(row.number)) continue;
    const rawUrl = imgMatch[1]!;
    byNumber.set(row.number, {
      ...row,
      imageUrl: rawUrl.startsWith("http")
        ? rawUrl
        : rawUrl.startsWith("catalog/")
          ? `https://media.cardgame-club.it/${rawUrl}`
          : `https://${rawUrl.replace(/^\/+/, "")}`,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function parseCardgameclubItListing(
  html: string,
  setCode: string,
): CardgameclubItCard[] {
  const byNumber = new Map<string, CardgameclubItCard>();
  for (const match of html.matchAll(cardgameclubIt_DATA_NAME_RE)) {
    const row = parseCardgameclubItTitle(match[1]!, setCode);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  for (const match of html.matchAll(LINK_TITLE_RE)) {
    const row = parseCardgameclubItTitle(match[1]!.trim(), setCode);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  for (const match of html.matchAll(
    />\s*(NI|TE|TA|ST|CL)[-\s]?\d{1,3}\s+[^<]{2,80}</gi,
  )) {
    const row = parseCardgameclubItTitle(match[0].slice(1, -1).trim(), setCode);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function mergeCardgameclubItCardsIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly CardgameclubItCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0it`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({ printKey, lang: "it", fullName: row.name.trim() });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

// ─── parsePrimegameIt ──────────────────────────────────────────────────────────

/**
 * Primegame.it Italian singles — expansion rubrics + `/ajax/get_singles` rows.
 * Images come from tcg trend (`sthumb/{size}/{productId}`), not primegame CDN.
 */
export type PrimegameItExpansion = {
  expansionId: number;
  slug: string;
  name: string;
  /** Known Carddass set when attested — s7/s8 exist on primegame only. */
  setCode: string | null;
};

export type PrimegameItCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
  productId: number;
  productUrl: string;
  thumbUrl: string | null;
  expansionId: number;
};

const EXPANSION_LINK_RE =
  /href="\/Single\/Naruto\/(\d+)\/([^"]+)"/gi;

/** Primegame expansion ids observed 2026-09-02 — same rubrics as cardgame-club Wayback. */
export const PRIMEGAME_IT_EXPANSION_SET: Record<number, string | null> = {
  38: "s1",
  39: "s2",
  43: "s3",
  40: "s4",
  42: "s5",
  175: "s6",
  41: "promo",
  196: "s7",
  201: "s8",
};

const primegameIt_TITLE_RE =
  /^(NI|TE|TA|ST|CL)[-\s]?(\d{1,3})\s+(.+?)(?:\s+(?:comune|non comune|rara|ultra rara|epica|holo|foil).*)?$/i;

const PRODUCT_BLOCK_RE =
  /<div class="product-item[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;

const PRODUCT_LINK_RE =
  /href="(\/Product\/(\d+)\/[^"]+)"/i;

const PRODUCT_NAME_RE =
  /<div class="product-name"><a[^>]*>([^<]+)<\/a><\/div>/i;

const TCGTREND_THUMB_RE =
  /tcgtrend\.it\/(?:sthumb\/\d+\/(\d+)|thumbnailc\.aspx\?image=(\d+))/i;

export function primegameExpansionSetCode(expansionId: number): string | null {
  return PRIMEGAME_IT_EXPANSION_SET[expansionId] ?? null;
}

export function parsePrimegameExpansions(html: string): PrimegameItExpansion[] {
  const byId = new Map<number, PrimegameItExpansion>();
  for (const match of html.matchAll(EXPANSION_LINK_RE)) {
    const expansionId = Number(match[1]);
    if (!Number.isFinite(expansionId)) continue;
    const slug = match[2]!.replace(/_/g, " ").trim();
    const name = decodeURIComponent(match[2]!.replace(/_/g, " "));
    byId.set(expansionId, {
      expansionId,
      slug: match[2]!,
      name,
      setCode: primegameExpansionSetCode(expansionId),
    });
  }
  return [...byId.values()].sort((a, b) => a.expansionId - b.expansionId);
}

export function parsePrimegameSinglesResultCount(html: string): number {
  const m = html.match(/Showing\s+\d+-\d+\s+of\s+(\d+)/i);
  return m ? Number(m[1]) : 0;
}

export function parsePrimegameProductTitle(
  raw: string,
  setCode: string,
): Omit<PrimegameItCard, "productId" | "productUrl" | "thumbUrl" | "expansionId"> | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const m = primegameIt_TITLE_RE.exec(cleaned);
  if (!m) return null;
  const printedRef = `${m[1]!.toUpperCase()}-${m[2]}`;
  const number = colekaCarddassPrefixToCollector(printedRef);
  if (!number) return null;
  const name = m[3]!.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return { number, name, setCode, printedRef };
}

export function parsePrimegameSinglesAjax(
  html: string,
  expansion: PrimegameItExpansion,
): PrimegameItCard[] {
  const setCode = expansion.setCode;
  if (!setCode || setCode === "s7" || setCode === "s8") return [];
  const out: PrimegameItCard[] = [];
  for (const block of html.match(PRODUCT_BLOCK_RE) ?? []) {
    const link = PRODUCT_LINK_RE.exec(block);
    const nameMatch = PRODUCT_NAME_RE.exec(block);
    if (!link || !nameMatch) continue;
    const productId = Number(link[2]);
    if (!Number.isFinite(productId)) continue;
    const parsed = parsePrimegameProductTitle(nameMatch[1]!, setCode);
    if (!parsed) continue;
    const thumb = TCGTREND_THUMB_RE.exec(block);
    const thumbId = thumb?.[1] ?? thumb?.[2];
    out.push({
      ...parsed,
      productId,
      productUrl: link[1]!,
      thumbUrl: thumbId
        ? `https://www.tcgtrend.it/sthumb/1000/${thumbId}`
        : null,
      expansionId: expansion.expansionId,
    });
  }
  return out;
}

export function tcgTrendFaceUrl(productId: number, size = 1000): string {
  return `https://www.tcgtrend.it/sthumb/${size}/${productId}`;
}

export function mergePrimegameItIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly PrimegameItCard[];
}): { prints: NarutoPrintRow[]; titles: NarutoTitleRow[]; merged: number } {
  const printByKey = new Map(input.prints.map((row) => [row.printKey, row]));
  const titleByKey = new Map(
    input.titles.map((row) => [`${row.printKey}:${row.lang}`, row]),
  );
  let merged = 0;
  for (const card of input.cards) {
    const printKey = mintNarutoPrintKey(card.number);
    // Numéro non-collector (rubrique primegame inconnue) : rien à minter.
    if (!printKey) continue;
    if (!printByKey.has(printKey)) {
      printByKey.set(printKey, {
        printKey,
        setCode: card.setCode,
        number: card.number,
        cardType: cardTypeFromCollectorNumber(card.number),
      });
    }
    const titleKey = `${printKey}:it`;
    const existing = titleByKey.get(titleKey);
    if (existing?.fullName && existing.fullName !== card.name) continue;
    titleByKey.set(titleKey, {
      printKey,
      lang: "it",
      fullName: card.name,
      nameSource: "primegame-it",
    });
    merged += 1;
  }
  return {
    prints: [...printByKey.values()],
    titles: [...titleByKey.values()],
    merged,
  };
}

export function primegameDiskCardId(printedRef: string): string | null {
  return narutoDiskCardId(printedRef);
}

// ─── parseNikitaCardlist ──────────────────────────────────────────────────────────

/**
 * nikita.jp `/cardlist/nrt` — the JP game data behind the faces.
 *
 * We already pull `?mode=img` for `art.nikita`. The text view of the same site
 * carries what the catalogue has never held for JA: symbol, cost, the four
 * combat values, traits, battle attribute, target/effect text and the flavour
 * line. One `<tr>` per card, four shapes:
 *
 *   忍 / 騎士  symbol, cost, 戦闘力·支援力·負傷戦闘力·負傷支援力, 特徴, 戦闘属性
 *   術 / 作戦  symbol, cost, 【目標】, 【効果】
 *   依頼人     symbol (can be two: 水／土), cost, 特徴, 【効果】
 *
 * Nothing here mints a print: the ids are joined onto what the catalogue
 * already holds, exactly like the face pass.
 */
/**
 * The text view writes 忍/術/作/依 in kanji but the knight in Latin (`K-7`).
 * Same keys as the image view, so the same fold applies.
 */
const LATIN_PREFIX: Readonly<Record<string, string>> = {
  N: "忍",
  J: "術",
  S: "作",
  I: "依",
  K: "騎",
};

function foldPrintedRef(raw: string): string {
  const m = /^([NJSIK])-(\d+)$/i.exec(raw);
  if (!m) return raw;
  const kanji = LATIN_PREFIX[m[1]!.toUpperCase()];
  return kanji ? `${kanji}-${Number(m[2])}` : raw;
}

export const NIKITA_CARDLIST_PATH = "/cardlist/nrt";

export type NikitaCardFacts = {
  /** `nrt` (巻ノ) or `nrts` (疾風伝) — the letter keys mean different lines. */
  game: string | null;
  /** Site key from the image filename — `N-001`, `K-007`. */
  nikitaKey: string | null;
  /** Disk id (`ni0001`), null when the ref is not one we mint. */
  number: string | null;
  printedRef: string;
  name: string;
  cardType: string;
  setLabel: string | null;
  setCode: string | null;
  symbols: string[];
  cost: number | null;
  power: number | null;
  support: number | null;
  woundedPower: number | null;
  woundedSupport: number | null;
  traits: string[];
  battleAttribute: string | null;
  target: string | null;
  effect: string | null;
  quote: string | null;
};

const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
/**
 * `nrt` is the 巻ノ game, `nrts` the 疾風伝 one. Both name their files N/J/S —
 * under `nrts` the same `N-037.jpg` is 忍伝-037, not 忍-37. The game segment is
 * captured so nothing can be joined on the letter alone.
 */
const IMG_RE = /\/img\/card\/(nrts?)\/([A-Z]+-\d+)(?:_\d+)?\.jpg/i;
const HEAD_RE =
  /font-size:120%;'>\s*([^\s<]+)\s*<a href='\?name=[^']*'>([^<]+)<\/a>/;
const CTYPE_RE = /\?ctype=([^']+)'>([^<]+)<\/a>/;
const EXP_RE = /\?exp=([^']+)'>([^<]+)<\/a>/;
const COST_RE = /コスト：(\d+)/;
const COMBAT_RE =
  /戦闘力：(\d+)\s*　?支援力：(\d+)\s*　?負傷戦闘力：(\d+)\s*　?負傷支援力：(\d+)/;
const BTYPE_RE = /\?btype=([^']+)'>([^<]+)<\/a>/;
const QUOTE_RE = /font-style:italic;[^>]*>(?:<br \/>)?\s*「([^」]*)」/;

/** Full-width space and tag soup out; the text of one row, line by line. */
function textLines(row: string): string[] {
  return row
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/[　\s]+/g, " ").trim())
    .filter(Boolean);
}

function symbolsOf(row: string): string[] {
  const line = textLines(row).find((l) => l.startsWith("シンボル："));
  if (!line) return [];
  const head = line.slice("シンボル：".length).split("コスト")[0] ?? "";
  return head
    .split("／")
    .map((s) => s.trim())
    .filter(Boolean);
}

function traitsOf(row: string): string[] {
  const line = textLines(row).find((l) => l.startsWith("特徴："));
  if (!line) return [];
  const head = line.slice("特徴：".length).split("戦闘属性")[0] ?? "";
  return head
    .split("／")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Rules text: whatever sits between the stat block and the flavour line.
 * `【目標】` is kept apart from `【効果】` because the game separates them;
 * a ninja's `《title》` + effect has neither marker and lands in `effect`.
 */
function rulesOf(
  row: string,
  cardType: string,
): { target: string | null; effect: string | null } {
  const lines = textLines(row);
  // The type and the set share one line (`忍 巻ノ壱`) — it is not rules text.
  const skip = new RegExp(
    `^(シンボル：|戦闘力：|特徴：|巻ノ|プロモーション|※${
      cardType ? `|${cardType}(\\s|$)` : ""
    })`,
  );
  const body: string[] = [];
  let seenHead = false;
  for (const line of lines) {
    if (!seenHead) {
      if (/^[忍術作依騎]-\d/.test(line)) seenHead = true;
      continue;
    }
    if (skip.test(line)) continue;
    if (/^「.*」$/.test(line)) continue; // flavour
    body.push(line);
  }
  const target =
    body.find((l) => l.startsWith("【目標】"))?.slice("【目標】".length) ??
    null;
  const effectLines = body.filter((l) => !l.startsWith("【目標】"));
  const effect = effectLines.length
    ? effectLines
        .join(" ")
        .replace(/^【効果】/, "")
        .trim()
    : null;
  return { target: target?.trim() || null, effect: effect || null };
}

export function parseNikitaCardlist(html: string): NikitaCardFacts[] {
  const out: NikitaCardFacts[] = [];
  ROW_RE.lastIndex = 0;
  for (const match of html.matchAll(ROW_RE)) {
    const row = match[1] ?? "";
    const head = HEAD_RE.exec(row);
    if (!head) continue;
    const printedRef = head[1]!.replace(/[　\s]/g, "");
    const name = head[2]!.trim();
    const combat = COMBAT_RE.exec(row);
    const exp = EXP_RE.exec(row);
    const setLabel = exp?.[2]?.trim() ?? null;
    const cardType = CTYPE_RE.exec(row)?.[2]?.trim() ?? "";
    const rules = rulesOf(row, cardType);
    const folded = foldPrintedRef(printedRef);
    const img = IMG_RE.exec(row);
    out.push({
      game: img?.[1]?.toLowerCase() ?? null,
      nikitaKey: img?.[2]?.toUpperCase() ?? null,
      number: narutoDiskCardId(folded),
      printedRef: folded,
      name,
      cardType,
      setLabel,
      setCode: setLabel ? nikitaNrtVolumeSetCode(setLabel) : null,
      symbols: symbolsOf(row),
      cost: COST_RE.exec(row) ? Number(COST_RE.exec(row)![1]) : null,
      power: combat ? Number(combat[1]) : null,
      support: combat ? Number(combat[2]) : null,
      woundedPower: combat ? Number(combat[3]) : null,
      woundedSupport: combat ? Number(combat[4]) : null,
      traits: traitsOf(row),
      battleAttribute: BTYPE_RE.exec(row)?.[2]?.trim() ?? null,
      target: rules.target,
      effect: rules.effect,
      quote: QUOTE_RE.exec(row)?.[1]?.trim() ?? null,
    });
  }
  return out;
}

// ─── parseNikitaNrt ──────────────────────────────────────────────────────────

/**
 * nikita.jp `nrt` image list — JP Carddass scans, not Bandai USA CCG.
 *
 * Printed keys on the site: N/J/S/I/K = 忍/術/作/依/騎 → disk `ni/te/ta/cl/ki`.
 * Never `n001`. PRN = PR忍, PRS = PR作. Skip Data Carddass.
 *
 * `K` = 騎士 (Temujin, Gelel knights). It used to be skipped as "not a prefix
 * we mint"; cardcheckbox prints the ranges 騎-1〜6 / 騎-7〜8 and the site serves
 * `K-007.jpg`, so it is a real printed number and now has a family.
 */
export const NIKITA_NRT_ORIGIN = "https://tcg-db.nikita.jp";
export const NIKITA_NRT_IMG_PATH = "/cardlist/nrt/?mode=img";
export const NIKITA_NRT_LANG = "ja";

const PREFIX_TO_PRINTED: Record<string, string> = {
  n: "ni",
  j: "te",
  s: "ta",
  i: "cl",
  k: "ki",
  prn: "prni",
  prs: "prta",
};

const VOLUME_TOKEN =
  /巻ノ(十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五|四|参|三|弐|二|壱)/;

export type NikitaNrtCard = {
  number: string;
  nikitaKey: string;
  setCode: string | null;
  variant: number;
  imagePath: string;
};

export function nikitaNrtFaceUrl(imagePath: string): string {
  if (imagePath.startsWith("http")) return imagePath;
  return `${NIKITA_NRT_ORIGIN}${imagePath.startsWith("/") ? "" : "/"}${imagePath}`;
}

/** `N-001.jpg` / `PRN-006` → `ni0001` / `prni0006`. Null for K / NM / EN N. */
export function nikitaNrtFileToDiskId(filename: string): {
  number: string;
  nikitaKey: string;
  variant: number;
} | null {
  const base = filename.split("/").pop() ?? filename;
  const m = FILE_RE.exec(base);
  if (!m) return null;
  const printed = PREFIX_TO_PRINTED[m[1]!.toLowerCase()];
  if (!printed) return null;
  const disk = narutoDiskCardId(`${printed}${m[2]}`);
  if (!disk) return null;
  return {
    number: disk,
    nikitaKey: `${m[1]!.toUpperCase()}-${m[2]}`,
    variant: m[3] ? Number(m[3]) : 0,
  };
}

export function nikitaNrtVolumeSetCode(header: string): string | null {
  const m = VOLUME_TOKEN.exec(header);
  if (!m) return null;
  return carddasJpVolumeSetCode(`巻ノ${m[1]}`);
}

/**
 * Parse `mode=img` HTML. Prefer the unsuffixed JPEG when `_2` / `_3` exist.
 */
export function parseNikitaNrtImgList(html: string): NikitaNrtCard[] {
  const byNumber = new Map<string, NikitaNrtCard>();
  const sections = html.split(/(?=<div[^>]*>巻ノ)/);
  for (const section of sections) {
    const setCode = nikitaNrtVolumeSetCode(section);
    for (const path of section.matchAll(/\/img\/card\/nrt\/([^"'>\s]+)/gi)) {
      const file = path[1]!;
      const parsed = nikitaNrtFileToDiskId(file);
      if (!parsed) continue;
      const imagePath = `/img/card/nrt/${file}`;
      const prev = byNumber.get(parsed.number);
      if (prev && prev.variant <= parsed.variant) continue;
      byNumber.set(parsed.number, {
        number: parsed.number,
        nikitaKey: parsed.nikitaKey,
        setCode,
        variant: parsed.variant,
        imagePath,
      });
    }
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

// ─── parseNarutoCardsCa ──────────────────────────────────────────────────────────

/**
 * narutocards.ca Bandai CCG set pages — titles only.
 * Skip Kayou and unofficial set 29. N-US stays prefix `nus`, never `n122`.
 *
 * Tournament pack / tin pages often reprint official Bandai numbers
 * (`N-0145` on TP2). A fan checklist may also invent a new sequential id
 * (`N-1715`). That is not proof the *card* never existed (fans remake
 * official cards too) — it is not enough to mint a new print key. Overlay
 * a name onto a print that already exists; keep any face already on disk.
 */
export type NarutoCardsCaCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
  usExclusive: boolean;
};

const LABEL_RE = /aria-label="([^"]+)"/gi;

export function decodeNarutoCardsCaEntities(raw: string): string {
  return decodeNarutoHtmlEntities(raw);
}

export function narutoCardsCaSetsToScrape(): Array<{
  slug: string;
  setCode: string;
  title: string;
}> {
  return (
    ledger.sets as Array<{ slug: string; setCode: string; title: string }>
  ).filter((row) => !ledger.skip.includes(row.slug));
}

export function parseNarutoCardsCaLabel(
  raw: string,
  setCode: string,
): NarutoCardsCaCard | null {
  const cleaned = decodeNarutoHtmlEntities(raw).replace(/\s+/g, " ").trim();
  const m = /^(.+),\s*((?:N|J|M|C|PR|PS)-?(?:US-?)?\d+),\s*[A-Z]{1,3}$/i.exec(
    cleaned,
  );
  if (!m) return null;
  const name = m[1]!.trim();
  const printedRef = m[2]!.replace(/\s+/g, "").toUpperCase();
  const parsed = parseEnCcgPrintedRef(printedRef);
  if (!parsed?.number) return null;
  if (!name || /^(main navigation|breadcrumb|footer|card grid)$/i.test(name)) {
    return null;
  }
  return {
    number: parsed.number,
    name,
    setCode,
    printedRef,
    usExclusive: parsed.usExclusive,
  };
}

/** TP / tin checklists are reprint lists, not a Bandai numbering authority. */
export function isNarutoCardsCaReprintSet(setCode: string): boolean {
  return /^(tp|tin)\d+$/i.test(setCode.trim());
}

/**
 * Fan TP/tin rows may title an attested print or mint a tin US exclusive.
 * They do not mint a new N-1715-style key from the checklist alone.
 */
export function narutoCardsCaMayMintPrint(
  row: Pick<NarutoCardsCaCard, "usExclusive" | "setCode">,
  printAlreadyExists: boolean,
): boolean {
  if (printAlreadyExists) return false;
  if (row.usExclusive) return true;
  return !isNarutoCardsCaReprintSet(row.setCode);
}

/**
 * Map Vintage faces onto attested collector ids (Bandai / Goat / US exclusive).
 * Skip using a TP/tin leftover number as the disk id — the scan may still be
 * a remake of an official card, just not under that invented number.
 */
export function narutoCardsCaHintBelongsOnDisk(
  row: NarutoCardsCaCard,
  attestedDiskIds: ReadonlySet<string>,
): boolean {
  if (row.usExclusive) return true;
  const diskId = (narutoDiskCardId(row.number) ?? row.number).toLowerCase();
  if (attestedDiskIds.has(diskId)) return true;
  return !isNarutoCardsCaReprintSet(row.setCode);
}

export function parseNarutoCardsCaSetHtml(
  html: string,
  setCode: string,
): NarutoCardsCaCard[] {
  const byNumber = new Map<string, NarutoCardsCaCard>();
  for (const match of html.matchAll(LABEL_RE)) {
    const row = parseNarutoCardsCaLabel(
      match[1]!.replace(/\s+/g, " ").trim(),
      setCode,
    );
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function mergeNarutoCardsCaIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly NarutoCardsCaCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      if (!narutoCardsCaMayMintPrint(row, false)) continue;
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
        grouping: parsed?.grouping ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({ printKey, lang: "en", fullName: row.name.trim() });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

// ─── parseNarutoCardsNet ──────────────────────────────────────────────────────────

/**
 * narutocards.net sitemap — EN CCG titles derived from card URL slugs.
 *
 * Example: `/card/gaara-of-the-desert-n-us069/` → `nus0069` / "Gaara Of The Desert".
 * Names inherit slug typos (`spell-fomula`) — fill-only, never overwrite an attested title.
 */
export type NarutoCardsNetCard = {
  number: string;
  name: string;
  printedRef: string;
  slug: string;
  pageUrl: string;
};

const CARD_LOC_RE =
  /^https:\/\/narutocards\.net\/card\/(.+)-([njmc]|pr|ps)(-us\d+|-\d+[a-z]?)\/?$/i;

export function slugToNarutoCardsNetName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function printedRefFromNarutoCardsNetSuffix(
  cardType: string,
  suffix: string,
): string {
  const letter = cardType.toUpperCase();
  if (/^-us(\d+[a-z]?)$/i.test(suffix)) {
    return `${letter}-US${suffix.slice(3).replace(/[^\d]/g, "")}`;
  }
  return `${letter}-${suffix.slice(1).replace(/[^\d]/g, "")}`;
}

export function parseNarutoCardsNetCardUrl(
  loc: string,
): NarutoCardsNetCard | null {
  const m = CARD_LOC_RE.exec(loc.trim());
  if (!m) return null;
  const nameSlug = m[1]!.trim();
  const printedRef = printedRefFromNarutoCardsNetSuffix(m[2]!, m[3]!);
  const parsed = parseEnCcgPrintedRef(printedRef);
  if (!parsed?.number) return null;
  const name = slugToNarutoCardsNetName(nameSlug);
  if (!name) return null;
  const refTail = `${m[2]!.toLowerCase()}${m[3]!.toLowerCase()}`;
  const diskId = narutoDiskCardId(parsed.number) ?? parsed.number;
  return {
    number: diskId,
    name,
    printedRef,
    slug: `${nameSlug}-${refTail}`,
    pageUrl: loc.trim(),
  };
}

export function parseNarutoCardsNetSitemap(xml: string): NarutoCardsNetCard[] {
  const byNumber = new Map<string, NarutoCardsNetCard>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const loc = match[1]?.trim();
    if (!loc?.includes("/card/")) continue;
    const row = parseNarutoCardsNetCardUrl(loc);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

export function mergeNarutoCardsNetIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly NarutoCardsNetCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const existing = printByKey.get(printKey);
    if (!existing) continue;
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: row.name.trim(),
      nameSource: "narutocards-net:slug",
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

// ─── parseVintageNarutoCcg ──────────────────────────────────────────────────────────

/**
 * Vintage Naruto browse bundle: Bandai USA CCG faces hosted at
 * api.ccgtrader.co.uk. Display numbers are 1/122 — collector ids come from
 * our checklists (narutocards.ca / Goat / Bandai lists).
 */
export const VINTAGE_NARUTO_BROWSE_URL = vintageNarutoCcg.urls.browse;
export const VINTAGE_NARUTO_ASSET_ORIGIN = "https://api.ccgtrader.co.uk";
export const VINTAGE_NARUTO_CCG_LANG = "en";

const SKIP = new Set(vintageNarutoCcg.skip);

/** Vintage slug → our setCode. Shinobi's Dream is omitted on purpose. */
export const VINTAGE_NARUTO_SET_SLUGS: Readonly<Record<string, string>> = {
  "the-path-to-hokage": "s1",
  "coils-of-the-snake": "s2",
  "curse-of-the-sand": "s3",
  "revenge-and-rebirth": "s4",
  "dream-legacy": "s5",
  "eternal-rivalry": "s6",
  "quest-for-power": "s7",
  "battle-of-destiny": "s8",
  "the-chosen": "s9",
  "lineage-of-the-legends": "s10",
  "approaching-wind": "s11",
  "a-new-chronicle": "s12",
  "fateful-reunion": "s13",
  "emerging-alliance": "s14",
  "foretold-prophecy": "s15",
  "broken-promises": "s16",
  "will-of-fire": "s17",
  "fangs-of-the-snake": "s18",
  "path-of-pain": "s19",
  "tales-of-the-gallant-sage": "s20",
  "shattered-truths": "s21",
  "weapons-of-war": "s22",
  invasion: "s23",
  "sages-legacy": "s24",
  "kages-summit": "s25",
  "avengers-wrath": "s26",
  "heros-ascension": "s27",
  "ultimate-ninja-storm-3": "s28",
  "tournament-pack-1": "tp1",
  "tournament-pack-2": "tp2",
  "tournament-pack-3": "tp3",
  "tournament-pack-4": "tp4",
  "fierce-ambitions": "tin1",
  untouchables: "tin2",
  "ultimate-battle": "tin3",
  rebirth: "tin4",
  "naruto-ccg-promos": "promo",
};

export type VintageNarutoTitleHint = {
  number: string;
  setCode: string;
  name: string;
};

export type VintageNarutoCcgCard = {
  vintageId: string;
  setCode: string;
  slug: string;
  name: string;
  rarity: string;
  displayNumber: string;
  assetId: string;
  faceUrl: string;
  number: string | null;
};

const CARD_RE =
  /\{"id":"(ccg-\d+)","displayNumber":"([^"]+)","name":"([^"]+)","rarity":"([^"]+)","thumbnail":"[^"]+","image":"(https:\/\/api\.ccgtrader\.co\.uk\/_\/assets\/[^"?]+)/g;

export function vintageNarutoCcgFaceUrl(assetIdOrUrl: string): string {
  const id = /\/assets\/([a-z0-9]+)/i.exec(assetIdOrUrl)?.[1] ?? assetIdOrUrl;
  return `${VINTAGE_NARUTO_ASSET_ORIGIN}/_/assets/${id}`;
}

export function normalizeVintageNarutoName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&(#x27|#39|apos);/gi, "'")
    .replace(/&amp;/gi, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(super rare|ultra rare|rare|uncommon|common|fixed|promo|foil|version \d+)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function sliceSeriesCards(js: string, slug: string): string | null {
  const needle = `"id":"ccg-${slug}"`;
  const start = js.indexOf(needle);
  if (start < 0) return null;
  const cardsAt = js.indexOf('"cards":[', start);
  if (cardsAt < 0 || cardsAt - start > 8_000) return null;
  let i = cardsAt + '"cards":['.length;
  let depth = 1;
  while (i < js.length && depth > 0) {
    const ch = js[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
    i += 1;
  }
  return js.slice(cardsAt + '"cards":['.length, i - 1);
}

export function parseVintageNarutoCcgBundle(
  js: string,
): VintageNarutoCcgCard[] {
  const out: VintageNarutoCcgCard[] = [];
  for (const [slug, setCode] of Object.entries(VINTAGE_NARUTO_SET_SLUGS)) {
    if (SKIP.has(slug)) continue;
    const chunk = sliceSeriesCards(js, slug);
    if (!chunk) continue;
    for (const card of chunk.matchAll(CARD_RE)) {
      const image = card[5]!;
      const assetId = /\/assets\/([a-z0-9]+)/i.exec(image)?.[1];
      if (!assetId) continue;
      out.push({
        vintageId: card[1]!,
        setCode,
        slug,
        name: card[3]!,
        rarity: card[4]!,
        displayNumber: card[2]!,
        assetId,
        faceUrl: vintageNarutoCcgFaceUrl(assetId),
        number: null,
      });
    }
  }
  return out;
}

export function buildVintageNarutoTitleIndex(
  hints: readonly VintageNarutoTitleHint[],
): {
  bySetName: Map<string, string>;
  uniqueName: Map<string, string>;
} {
  const bySetName = new Map<string, string>();
  const all = new Map<string, Set<string>>();
  for (const hint of hints) {
    const diskId = narutoDiskCardId(hint.number) ?? hint.number.toLowerCase();
    const key = `${hint.setCode}\0${normalizeVintageNarutoName(hint.name)}`;
    if (!bySetName.has(key)) bySetName.set(key, diskId);
    const n = normalizeVintageNarutoName(hint.name);
    const bucket = all.get(n) ?? new Set<string>();
    bucket.add(diskId);
    all.set(n, bucket);
  }
  const uniqueName = new Map<string, string>();
  for (const [name, ids] of all) {
    if (ids.size === 1) uniqueName.set(name, [...ids][0]!);
  }
  return { bySetName, uniqueName };
}

export function resolveVintageNarutoDiskId(
  card: Pick<VintageNarutoCcgCard, "name" | "setCode">,
  index: ReturnType<typeof buildVintageNarutoTitleIndex>,
): string | null {
  const n = normalizeVintageNarutoName(card.name);
  return (
    index.bySetName.get(`${card.setCode}\0${n}`) ??
    index.uniqueName.get(n) ??
    null
  );
}

export function assignVintageNarutoDiskIds(
  cards: readonly VintageNarutoCcgCard[],
  hints: readonly VintageNarutoTitleHint[],
): VintageNarutoCcgCard[] {
  const index = buildVintageNarutoTitleIndex(hints);
  return cards.map((card) => ({
    ...card,
    number: resolveVintageNarutoDiskId(card, index),
  }));
}

// ─── parseCollectorsComet ──────────────────────────────────────────────────────────

/**
 * collectorscomet.com ui-api — Bandai USA CCG titles (750×1050 CDN).
 * Fill-only on prints that already exist; does not mint from the marketplace.
 */
export type CollectorsCometProduct = {
  name: string;
  number: string;
  editionName?: string | null;
};

export type CollectorsCometCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
};

/** `Set 9 - The Chosen` → `s9`, `Set 21.5 - Tournament Pack 3` → `tp3`. */
export function collectorsCometEditionSetCode(
  editionName: string,
): string | null {
  const name = editionName.replace(/\s+/g, " ").trim();
  if (/^promos$/i.test(name)) return "promo";
  const tp = /^Set\s+(\d+\.5)\b/i.exec(name);
  if (tp) return TP_BY_SET[tp[1]!] ?? null;
  const booster = /^Set\s+(\d+)\b/i.exec(name);
  if (booster) {
    const n = Number(booster[1]);
    if (n >= 1 && n <= 28) return `s${n}`;
  }
  return null;
}

/** Strip redundant printed ref suffixes the shop repeats in the title. */
export function cleanCollectorsCometProductName(name: string): string {
  return name
    .replace(/\s*\((?:N|J|M|C|PR|PS|NUS|JUS|MUS|CUS)-[\dA-Za-z-]+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCollectorsCometPrintedRef(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!trimmed) return null;
  const m =
    /^(N|J|M|C|PR|PS)(?:-?US)?-?(\d{1,4}[A-Z]?)$/i.exec(trimmed) ??
    /^(NUS|JUS|MUS|CUS|PRUS)-(\d{1,4}[A-Z]?)$/i.exec(trimmed);
  if (!m) return null;
  let letter = m[1]!.toUpperCase();
  let digits = m[2]!;
  if (/^NUS$/i.test(letter)) {
    letter = "N";
    return `N-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^JUS$/i.test(letter)) {
    letter = "J";
    return `J-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^MUS$/i.test(letter)) {
    letter = "M";
    return `M-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^CUS$/i.test(letter)) {
    letter = "C";
    return `C-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^PRUS$/i.test(letter)) {
    letter = "PR";
    return `PR-US-${digits.replace(/[^\d]/g, "")}`;
  }
  const us = /US/i.test(m[0]!);
  return us ? `${letter}-US-${digits.replace(/[^\d]/g, "")}` : `${letter}-${digits}`;
}

export function parseCollectorsCometProduct(
  product: CollectorsCometProduct,
  editionName: string,
): CollectorsCometCard | null {
  const setCode = collectorsCometEditionSetCode(editionName);
  if (!setCode) return null;
  const printedRef = normalizeCollectorsCometPrintedRef(product.number);
  if (!printedRef) return null;
  const parsed = parseEnCcgPrintedRef(printedRef);
  if (!parsed?.number) return null;
  const name = cleanCollectorsCometProductName(product.name);
  if (!name) return null;
  const diskId = narutoDiskCardId(parsed.number) ?? parsed.number;
  return {
    number: diskId,
    name,
    setCode,
    printedRef,
  };
}

export function mergeCollectorsCometIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly CollectorsCometCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey || !printByKey.has(printKey)) continue;
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: row.name.trim(),
      nameSource: "collectors-comet",
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

// ─── parseFansetEnTitles ──────────────────────────────────────────────────────────

/**
 * EN titles for unofficial Drive fansets — human-validated OCR.
 * Fills missing EN; re-syncs rows already stamped `fanset-ocr-validated`.
 */
export type FansetEnTitleRow = (typeof fansetEnTitles.cards)[number];

export function fansetEnTitleCards(): FansetEnTitleRow[] {
  return fansetEnTitles.cards;
}

export function mergeFansetEnTitlesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printKeys = new Set(
    prints.map((p) => canonicalizeNarutoPrintKey(p.printKey)),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const titled: string[] = [];

  for (const row of fansetEnTitleCards()) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey || !printKeys.has(printKey)) continue;
    const name = row.name.trim();
    if (!name) continue;

    const existing = titles.find(
      (t) =>
        canonicalizeNarutoPrintKey(t.printKey) === printKey &&
        t.lang.toLowerCase() === "en",
    );
    if (existing) {
      if (existing.nameSource !== "fanset-ocr-validated") continue;
      if (existing.fullName.trim() === name) continue;
      existing.fullName = name;
      titled.push(printKey);
      continue;
    }

    titles.push({
      printKey,
      lang: "en",
      fullName: name,
      nameSource: "fanset-ocr-validated",
    });
    titleKeys.add(`${printKey}\0en`);
    titled.push(printKey);
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

// ─── parseMangaNewsChecklist ──────────────────────────────────────────────────────────

/**
 * Parse Manga-News TCG Naruto deck goodie pages (FR checklist text).
 * Pure — no I/O.
 *
 * Lines look like: `NI-01 Naruto Uzumaki / Holo`
 * or `TE-54 La Lame du vent / Commune`
 */

export type MangaNewsCardType = "ni" | "te" | "ta" | "cl";

export type MangaNewsRarity = "commune" | "holo" | "unknown";

export type MangaNewsChecklistLine = {
  type: MangaNewsCardType;
  /** Digits as listed (no forced padding), e.g. "1" or "190" */
  numberDigits: string;
  /** Canonical Placarr-ish number: ni001 / ta190 */
  number: string;
  name: string;
  rarity: MangaNewsRarity;
  /** Raw matched line (trimmed) */
  raw: string;
};

export type MangaNewsDeckMeta = {
  slug: string;
  /** s1 … s5 or ns */
  setHint: string;
  title: string;
  url: string;
};

/** Known Manga-News deck goodies for FR CACG (+ Nouvelle Série blurb-only). */
export const MANGA_NEWS_DECKS: readonly MangaNewsDeckMeta[] = [
  {
    slug: "Naruto-Deck-Serie-1",
    setHint: "s1",
    title: "Naruto - Deck Serie 1",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-1",
  },
  {
    slug: "Naruto-Deck-Serie-2",
    setHint: "s2",
    title: "Naruto - Deck Serie 2",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-2",
  },
  {
    slug: "Naruto-Deck-Serie-3",
    setHint: "s3",
    title: "Naruto - Deck Serie 3",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-3",
  },
  {
    slug: "Naruto-Deck-Serie-4",
    setHint: "s4",
    title: "Naruto - Deck Serie 4",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-4",
  },
  {
    slug: "Naruto-Deck-Serie-5",
    setHint: "s5",
    title: "Naruto - Deck Serie 5",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Serie-5",
  },
  {
    slug: "Naruto-Deck-Nouvelle-Serie",
    setHint: "ns",
    title: "Naruto - Deck Nouvelle Serie",
    url: "https://www.manga-news.com/index.php/goodie/Naruto-Deck-Nouvelle-Serie",
  },
] as const;

const LINE_RE =
  /^(NI|TE|TA|CL)[\s_-]*0*(\d+)\s+(.+?)\s*\/\s*(Holo|Commune)\s*$/i;

export function normalizeCardNumber(
  type: MangaNewsCardType,
  digits: string | number,
): string {
  const n = typeof digits === "number" ? digits : Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) {
    return `${type}${String(digits).replace(/\D/g, "")}`;
  }
  return `${type}${String(n).padStart(3, "0")}`;
}

export function parseMangaNewsRarity(raw: string): MangaNewsRarity {
  const t = raw.trim().toLowerCase();
  if (t === "holo") return "holo";
  if (t === "commune") return "commune";
  return "unknown";
}

/**
 * Extract checklist rows from a Manga-News goodie page body (HTML or markdown-ish text).
 */
export function parseMangaNewsChecklistText(
  text: string,
): MangaNewsChecklistLine[] {
  const out: MangaNewsChecklistLine[] = [];
  const seenRaw = new Set<string>();

  for (const rough of text.split(/\r?\n|<br\s*\/?>/i)) {
    const line = rough
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;

    const type = m[1]!.toLowerCase() as MangaNewsCardType;
    const numberDigits = String(Number.parseInt(m[2]!, 10));
    const name = m[3]!.trim().replace(/\s+/g, " ");
    const rarity = parseMangaNewsRarity(m[4]!);
    const number = normalizeCardNumber(type, numberDigits);
    const key = `${number}|${name}|${rarity}`;
    if (seenRaw.has(key)) continue;
    seenRaw.add(key);

    out.push({
      type,
      numberDigits,
      number,
      name,
      rarity,
      raw: line,
    });
  }

  return out;
}

/** Unique collector numbers in a deck list (reprints collapse). */
export function uniqueNumbers(
  lines: readonly MangaNewsChecklistLine[],
): string[] {
  const set = new Set<string>();
  for (const line of lines) set.add(line.number);
  return [...set].sort();
}

/**
 * Packshot of the deck itself, not a card.
 *
 * Prefer `og:image` when it is the goodie (`tcg-naruto-deck-…`). The same
 * page also lists unrelated shop thumbs under `/public/images/goodies/`.
 */
function deckImageScore(url: string): number {
  const name = url.split("/").pop() ?? "";
  if (name.startsWith(".")) return 0;
  if (/_medium\./i.test(name)) return 1;
  return 2;
}

export function mangaNewsDeckImageUrl(html: string): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | undefined) => {
    const clean = url?.trim();
    if (!clean || !/tcg-naruto-deck/i.test(clean) || seen.has(clean)) return;
    seen.add(clean);
    candidates.push(clean);
  };

  const og =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    ) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
      html,
    );
  add(og?.[1]);
  for (const match of html.matchAll(
    /https?:\/\/[^"' ]+\/public\/images\/goodies\/\.?tcg-naruto-deck[^"' ]+/gi,
  )) {
    add(match[0]);
  }
  candidates.sort((a, b) => deckImageScore(b) - deckImageScore(a));
  return candidates[0] ?? null;
}

/** Strip scripts/styles then keep text-ish content for the line parser. */
export function htmlToChecklistText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8364;/g, "€")
    .replace(/&nbsp;/gi, " ");
}

// ─── parseTcdbNaruto ──────────────────────────────────────────────────────────

/**
 * TCDB Gaming checklists for Bandai USA Naruto CCG (2006–).
 *
 * TCDB invents set-acronym prefixes (`PTHJ-001`, `COSN-074`) that are **not**
 * printed on the cards. Bandai prints `J-001` / `N-074`. Strip the acronym,
 * keep the type letter + digits → `j001` / `n074`. Never store `pthj001`.
 *
 * Sid `118974` (« 2006 Naruto Promos ») is a grab-bag of mixed series
 * prefixes — same trap as Coleka `_r4102`. It is not Bandai `PR-xxx`.
 *
 * Faces stay out of `cards/`: EN CCG Series 1 (*Path to Hokage*) is not
 * Carddass FR Série 1 (*Pays du Vent*). Sharing `cards/s1/en/` would label
 * Path to Hokage with the French starters. Dump target if we ever mirror
 * checklists: `staging/tcdb-en/` (like `bandaicg-en`), not `cards/`.
 */
type TcdbEnCcgLedger = {
  mainSets: Array<{
    sid: number;
    series: number;
    title: string;
    acronym: string;
  }>;
  doNotIngest: Array<{
    sid: number;
    kind: "grab-bag" | "do-not-merge";
    url?: string;
  }>;
  acronymsObserved: Record<string, number>;
};

const tcdbEnCcg = tcdbLedger as TcdbEnCcgLedger;

export type TcdbNarutoCardType = "n" | "j" | "m" | "c";

export type ParsedTcdbNarutoRef = {
  /** Normalised TCDB code, e.g. `PTHJ-001`. */
  tcdbRef: string;
  /** Set acronym TCDB invented, e.g. `PTH`. */
  acronym: string;
  cardType: TcdbNarutoCardType;
  /** Bandai collector id `j001`. Null when the number is not a plain N/J/M/C. */
  number: string | null;
  /** Extra infix such as `us` in `BODN-us059`. */
  variant: string | null;
};

export type TcdbNarutoSidKind =
  | { kind: "en-ccg-set"; sid: number; series: number; title: string }
  | { kind: "grab-bag"; sid: number }
  | { kind: "do-not-merge"; sid: number };

const CARD_TYPES = new Set<string>(["n", "j", "m", "c"]);

/** `PTHJ-001` / `BODN-us059` / `DLN-187`. */
const tcdbNaruto_REF_RE = /^([A-Z]{2,8})([NJMC])-(?:([A-Z]+))?(\d{1,4})$/i;

function asCardType(letter: string): TcdbNarutoCardType | null {
  const t = letter.toLowerCase();
  return CARD_TYPES.has(t) ? (t as TcdbNarutoCardType) : null;
}

function collectorNumber(type: TcdbNarutoCardType, digits: string): string {
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) return `${type}${digits.toLowerCase()}`;
  const width = digits.length > 3 ? digits.length : 3;
  return `${type}${String(n).padStart(width, "0")}`;
}

/**
 * `PTHJ-001` → `{ number: "j001", … }`. Returns null for Carddass / Coleka
 * prefixes (`NI-1650`, `TE-109`) and real Bandai promos (`PR-096`).
 */
export function parseTcdbNarutoRef(raw: string): ParsedTcdbNarutoRef | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  const m = tcdbNaruto_REF_RE.exec(trimmed);
  if (!m) return null;
  const acronym = m[1]!.toUpperCase();
  const cardType = asCardType(m[2]!);
  if (!cardType) return null;
  const variant = m[3] ? m[3].toLowerCase() : null;
  const digits = m[4]!;
  return {
    tcdbRef: `${acronym}${cardType.toUpperCase()}-${variant ?? ""}${digits}`,
    acronym,
    cardType,
    number: variant ? null : collectorNumber(cardType, digits),
    variant,
  };
}

export function tcdbAcronymToSeries(acronym: string): number | null {
  const key = acronym.trim().toUpperCase();
  const n = (tcdbEnCcg.acronymsObserved as Record<string, number>)[key];
  return typeof n === "number" ? n : null;
}

export function parseTcdbSidFromUrl(urlOrPath: string): number | null {
  const m = /(?:^|[/?])sid\/(\d+)/i.exec(urlOrPath);
  if (!m) return null;
  const sid = Number.parseInt(m[1]!, 10);
  return Number.isFinite(sid) && sid > 0 ? sid : null;
}

export function tcdbNarutoSidKind(sid: number): TcdbNarutoSidKind | null {
  const grab = tcdbEnCcg.doNotIngest.find(
    (row) => row.sid === sid && row.kind === "grab-bag",
  );
  if (grab) return { kind: "grab-bag", sid };
  const reject = tcdbEnCcg.doNotIngest.find(
    (row) => row.sid === sid && row.kind === "do-not-merge",
  );
  if (reject) return { kind: "do-not-merge", sid };
  const set = tcdbEnCcg.mainSets.find((row) => row.sid === sid);
  if (set) {
    return {
      kind: "en-ccg-set",
      sid,
      series: set.series,
      title: set.title,
    };
  }
  return null;
}

/** Checklist sids may be staged later; grab-bags and misdated sets never. */
export function tcdbNarutoSidIngestPolicy(
  sid: number,
): "staging-only" | "reject" | "unknown" {
  const kind = tcdbNarutoSidKind(sid);
  if (!kind) return "unknown";
  if (kind.kind === "en-ccg-set") return "staging-only";
  return "reject";
}

// ─── parseNarutoCcgDrive ──────────────────────────────────────────────────────────

/**
 * Google Drive [Enhanced] Naruto CCG dumps (`j001.png`, `n1646.png`).
 *
 * Filenames are already collector ids (not TCDB PTHN). `[Errata]` is the
 * corrected scan of the same number — prefer it over the untagged file.
 * `[Foil Print]` is a finish of the same number — keep only when no base.
 */
const ccgDrive_FILE_RE =
  /^(n|j|m|c|pr|ps|nus|jus|mus|cus|prus)(\d{1,4})(?:\s*\[([^\]]+)\])?$/i;

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

const RETAIL_CCG = new Set(["n", "j", "m", "c"]);

export type DriveFaceTag = "errata" | "foil" | null;

export type ParsedDriveNarutoFace = {
  stem: string;
  diskHint: string;
  tag: DriveFaceTag;
};

export type DriveFolderEntry = {
  id: string;
  name: string;
  kind: "file" | "folder";
};

export type DriveEnhancedFolder = {
  id: string;
  name: string;
  setCode: string;
};

export function decodeDriveTitle(raw: string): string {
  return raw
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function parseDriveNarutoFaceFilename(
  filename: string,
): ParsedDriveNarutoFace | null {
  const base = filename
    .replace(/^Image\s+/i, "")
    .replace(/\s+Image$/i, "")
    .replace(/\s+Shared.*$/i, "")
    .trim();
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim();
  const m = ccgDrive_FILE_RE.exec(stem.replace(/\s+/g, " "));
  if (!m) return null;
  const prefix = m[1]!.toLowerCase();
  const digits = m[2]!;
  const tagRaw = (m[3] ?? "").trim().toLowerCase();
  let tag: DriveFaceTag = null;
  if (tagRaw === "errata") tag = "errata";
  else if (tagRaw === "foil print" || tagRaw === "foil") tag = "foil";
  return { stem, diskHint: `${prefix}${digits}`, tag };
}

export function driveFolderSetCode(folderName: string): string | null {
  const name = decodeDriveTitle(folderName);
  if (/^promos$/i.test(name)) return "promo";
  const tp = /^Set\s+(\d+\.5)\b/i.exec(name);
  if (tp) return TP_BY_SET[tp[1]!] ?? null;
  const booster = /^Set\s+(\d+)\b/i.exec(name);
  if (booster) {
    const n = Number(booster[1]);
    if (n >= 1 && n <= 28) return `s${n}`;
    return null;
  }
  return null;
}

export function driveEnhancedFolders(): DriveEnhancedFolder[] {
  return driveLedger.cardDatabase.enhanced.folders.flatMap((row) => {
    const setCode = row.setCode || driveFolderSetCode(row.name);
    if (!setCode) return [];
    return [{ id: row.id, name: row.name, setCode }];
  });
}

/** Retail N/J/M in the Promos tree are tin/tourney reprints, not the booster. */
export function driveFaceAppearanceSet(
  diskHint: string,
  folderSetCode: string,
): string | null {
  if (folderSetCode !== "promo") return folderSetCode;
  const id = parseNarutoCollector(diskHint);
  if (!id) return "promo";
  const prefix = canonicalNarutoDiskPrefix(id.printedPrefix);
  return RETAIL_CCG.has(prefix) ? "promo" : null;
}

export function driveFaceDiskId(
  diskHint: string,
  folderSetCode: string,
): string | null {
  return narutoDiskCardId(
    diskHint,
    driveFaceAppearanceSet(diskHint, folderSetCode),
  );
}

export function driveFaceRank(tag: DriveFaceTag): number {
  if (tag === "errata") return 3;
  if (tag === null) return 2;
  return 1;
}

export function pickDriveFaceWinner<T extends { tag: DriveFaceTag }>(
  rows: readonly T[],
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || driveFaceRank(row.tag) > driveFaceRank(best.tag)) best = row;
  }
  return best;
}

export function parseDriveEmbeddedFolderHtml(html: string): DriveFolderEntry[] {
  const out: DriveFolderEntry[] = [];
  const seen = new Set<string>();
  const re = /id="entry-([^"]+)"[\s\S]*?class="flip-entry-title">([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const id = m[1]!;
    const name = decodeDriveTitle(m[2]!);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      kind: IMAGE_EXT.test(name) ? "file" : "folder",
    });
  }
  return out;
}

export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
}

export function driveEmbeddedFolderUrl(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;
}

/** Safe folder/file segment under `staging/naruto-ccg-drive/hub/`. */
export function driveStagingSegment(name: string): string {
  return decodeDriveTitle(name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type DriveHarvestRoot = {
  id: string;
  stagingRel: string;
  label: string;
};

/** Every top-level hub folder — archive all of it under staging. */
export function driveHubHarvestRoots(): DriveHarvestRoot[] {
  return driveLedger.folders.map((row) => ({
    id: row.id,
    stagingRel: path.join("hub", driveStagingSegment(row.name)),
    label: row.name,
  }));
}

/** Official Enhanced set codes (Bandai s1–s28 + TP + promos). */
export function driveOfficialEnhancedSetCodes(): Set<string> {
  return new Set(driveEnhancedFolders().map((row) => row.setCode));
}

export function driveOfficialSetCodeInPath(
  parts: readonly string[],
): string | null {
  const official = driveOfficialEnhancedSetCodes();
  for (const seg of parts) {
    const lower = seg.toLowerCase();
    if (official.has(lower)) return lower;
    const code = driveFolderSetCode(seg);
    if (code && official.has(code)) return code;
  }
  return null;
}

/** Drive `[Fansets]` tree — remakes/customs, not Bandai Enhanced. */
export function drivePathIsFanset(parts: readonly string[]): boolean {
  return parts.some((seg) => /\[fansets\]/i.test(seg));
}
