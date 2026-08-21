/**
 * Goat CrystalCommerce singles for Bandai USA CCG.
 * Titles as the shop printed them. Faces are the 350×490 CDN JPEG the shop
 * actually serves (same pixels as Storm 3 stop2shop) — drop `/medium/`.
 */
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import { goatCdnOriginal } from "./goatPackshots";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { parseEnCcgPrintedRef } from "./parseEnCcgPrinted";
import {
  normalizeGoatValue,
  parseGoatCataloguePage,
} from "./parseGoatCatalogue";

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

const TITLE_RE = />([^<]{1,80}?)\s*-\s*([NJMC])-(\d{1,4})\s*-/g;
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
  for (const match of html.matchAll(TITLE_RE)) {
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
