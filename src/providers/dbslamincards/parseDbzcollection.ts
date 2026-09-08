/**
 * Parse pages set dbzcollection.fr (Lamincards FR — idc=94).
 *
 * Même gabarit HTML qu’AnimeCollection : `bc_texte_numero` +
 * `cartes/{idc}/{ids}/h100_{cardId}_carte.jpg` / packagings.
 */
export const DBZC_ORIGIN = "http://www.dbzcollection.fr/2v2";
export const DBZC_COLLECTION_IDC = "94";

export type DbzcCard = {
  printed: string;
  number: string;
  grouping: string | null;
  rarityLabel: string | null;
  cardId: string;
  thumbPath: string;
  facePath: string;
};

export type DbzcPack = {
  label: string;
  packId: string;
  thumbPath: string;
  facePath: string;
};

export type DbzcListingParse = {
  cards: DbzcCard[];
  packs: DbzcPack[];
};

const CARD_RE =
  /title="(Regular|Silver|Gold)"[^>]*>\s*<div class="bc_texte_numero">(\d+)<\/div>[\s\S]{0,500}?src="(cartes\/(\d+)\/(\d+)\/h100_(\d+)_carte\.jpg)"/gi;

const PACK_RE =
  /<div class="bc_texte_numero">([^<]+)<\/div>[\s\S]{0,500}?src="(packagings\/(\d+)\/(\d+)\/h100_(\d+)_packaging\.jpg)"/gi;

function rarityToGrouping(raw: string): {
  grouping: string | null;
  label: string | null;
} {
  const lower = raw.trim().toLowerCase();
  if (lower === "silver") return { grouping: "s", label: "Silver" };
  if (lower === "gold") return { grouping: "g", label: "Gold" };
  return { grouping: null, label: null };
}

export function parseDbzcollectionListing(html: string): DbzcListingParse {
  const cards: DbzcCard[] = [];
  const seenCards = new Set<string>();

  for (const match of html.matchAll(CARD_RE)) {
    const rarity = match[1]!;
    const printedRaw = match[2]!;
    const thumbPath = match[3]!;
    const cardId = match[6]!;
    const n = Number.parseInt(printedRaw, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const { grouping, label } = rarityToGrouping(rarity);
    const number = String(n).padStart(4, "0");
    const key = grouping ? `${number}:${grouping}` : number;
    if (seenCards.has(key)) continue;
    seenCards.add(key);
    const facePath = thumbPath.replace(/h100_/, "h400_");
    cards.push({
      printed: String(n),
      number,
      grouping,
      rarityLabel: label,
      cardId,
      thumbPath,
      facePath,
    });
  }

  const packs: DbzcPack[] = [];
  const seenPacks = new Set<string>();
  for (const match of html.matchAll(PACK_RE)) {
    const label = match[1]!.trim();
    const thumbPath = match[2]!;
    const packId = match[5]!;
    if (!label || seenPacks.has(packId)) continue;
    // Ignore card-number tiles accidentally caught (digits-only labels).
    if (/^\d+$/.test(label)) continue;
    seenPacks.add(packId);
    packs.push({
      label,
      packId,
      thumbPath,
      facePath: thumbPath.replace(/h100_/, "h400_"),
    });
  }

  cards.sort((a, b) => {
    const byNum =
      Number.parseInt(a.printed, 10) - Number.parseInt(b.printed, 10);
    if (byNum !== 0) return byNum;
    return (a.grouping ?? "").localeCompare(b.grouping ?? "");
  });

  return { cards, packs };
}

export function dbzcAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const p = pathOrUrl.startsWith("/") ? pathOrUrl.slice(1) : pathOrUrl;
  return `${DBZC_ORIGIN}/${p}`;
}

export function dbzcSetListingUrl(ids: string): string {
  return `${DBZC_ORIGIN}/cartes.php?idc=${DBZC_COLLECTION_IDC}&ids=${ids}`;
}

export function dbzcCardInfoUrl(cardId: string): string {
  return `${DBZC_ORIGIN}/traitements_ajax/get_infos_detail_carte.php?id=${cardId.trim()}`;
}

/** Decode HTML entities from the AJAX detail table. */
function decodeEntities(raw: string): string {
  return raw
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&uuml;/gi, "ü")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCharCode(Number(n)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fiche AJAX : `Nom : Bubbles` dans `apercu_td_valeur`.
 */
export function parseDbzcCardInfo(html: string): { name: string | null } {
  const m = html.match(
    /apercu_td_intitule[^>]*>\s*Nom\s*:?\s*<\/td>\s*<td class="apercu_td_valeur"[^>]*>([^<]*)<\/td>/i,
  );
  if (!m) return { name: null };
  const name = decodeEntities(m[1] ?? "");
  return { name: name || null };
}
