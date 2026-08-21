import { mintNarutoPrintKey } from "./collectorIdentity";

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

const TITLE_RE =
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
  for (const match of html.matchAll(TITLE_RE)) {
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
