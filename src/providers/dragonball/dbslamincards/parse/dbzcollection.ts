/**
 * Parse pages set dbzcollection.fr (Lamincards FR idc=94 / IT idc=74 / ES idc=108).
 *
 * HTTP / URLs / decode : `shared/dbzcollection/site`. Ici : Regular/Silver/Gold
 * + `namesOnly` IT/ES (`n° 1`, `S5`, `G7`).
 */
import {
  dbzcSetListingUrl as dbzcSetListingUrlShared,
  decodeDbzcEntities,
  extractDbzcTableField,
} from "@/providers/dragonball/shared/dbzcollection/site";

export {
  DBZC_ORIGIN,
  dbzcAbsoluteUrl,
  dbzcCardInfoUrl,
  decodeDbzcEntities,
} from "@/providers/dragonball/shared/dbzcollection/site";

export const DBZC_COLLECTION_IDC = "94";

export function dbzcSetListingUrl(
  ids: string,
  idc: string = DBZC_COLLECTION_IDC,
): string {
  return dbzcSetListingUrlShared(ids, idc);
}

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

/** Tuile listing sans numéro imprimé (séries IT/ES). */
export type DbzcListingTile = {
  grouping: string | null;
  rarityLabel: string | null;
  cardId: string;
  thumbPath: string;
  facePath: string;
};

export type DbzcCardInfo = {
  name: string | null;
  printed: string | null;
  printedRaw: string | null;
  grouping: string | null;
  rarityLabel: string | null;
};

const CARD_RE =
  /title="(Regular|Silver|Gold)"[^>]*>\s*<div class="bc_texte_numero">(\d+)<\/div>[\s\S]{0,500}?src="(cartes\/(\d+)\/(\d+)\/h100_(\d+)_carte\.jpg)"/gi;

const TILE_RE =
  /title="(Regular|Silver|Gold)"[\s\S]{0,900}?src="(cartes\/(\d+)\/(\d+)\/h100_(\d+)_carte\.jpg)"/gi;

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

/**
 * Listings IT/ES : rareté + cardId sur la tuile, numéro via AJAX.
 */
export function parseDbzcListingTiles(html: string): DbzcListingTile[] {
  const tiles: DbzcListingTile[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(TILE_RE)) {
    const rarity = match[1]!;
    const thumbPath = match[2]!;
    const cardId = match[5]!;
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    const { grouping, label } = rarityToGrouping(rarity);
    tiles.push({
      grouping,
      rarityLabel: label,
      cardId,
      thumbPath,
      facePath: thumbPath.replace(/h100_/, "h400_"),
    });
  }
  return tiles;
}

/**
 * Numéro AJAX : `n° 1`, `S5`, `G7`, `65`.
 */
export function parseDbzcPrintedNumber(raw: string): {
  printed: string | null;
  grouping: string | null;
} {
  const text = decodeDbzcEntities(raw).replace(/\u00a0/g, " ").trim();
  if (!text) return { printed: null, grouping: null };
  const prefixed = text.match(/^([SGs])\s*(\d+)$/i);
  if (prefixed) {
    const letter = prefixed[1]!.toUpperCase();
    const n = Number.parseInt(prefixed[2]!, 10);
    if (!Number.isFinite(n) || n < 1) return { printed: null, grouping: null };
    return {
      printed: String(n),
      grouping: letter === "S" ? "s" : letter === "G" ? "g" : null,
    };
  }
  const plain = text.match(/(?:n\s*[°º.]?\s*)?(\d+)\s*$/i);
  if (!plain) return { printed: null, grouping: null };
  const n = Number.parseInt(plain[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return { printed: null, grouping: null };
  return { printed: String(n), grouping: null };
}

/**
 * Fiche AJAX : Nom / Numéro / Rareté.
 */
export function parseDbzcCardInfo(html: string): DbzcCardInfo {
  const name = extractDbzcTableField(html, "Nom");
  const printedRaw =
    extractDbzcTableField(html, "Num&eacute;ro") ??
    extractDbzcTableField(html, "Numéro");
  const rarityRaw =
    extractDbzcTableField(html, "Raret&eacute;") ??
    extractDbzcTableField(html, "Rareté");
  const fromPrinted = printedRaw
    ? parseDbzcPrintedNumber(printedRaw)
    : { printed: null, grouping: null };
  const fromRarity = rarityRaw ? rarityToGrouping(rarityRaw) : null;
  return {
    name,
    printed: fromPrinted.printed,
    printedRaw,
    grouping: fromPrinted.grouping ?? fromRarity?.grouping ?? null,
    rarityLabel: fromRarity?.label ?? null,
  };
}

/**
 * Groupings DBC possibles pour une rareté dbzc (Argento Silver → metalsil).
 */
export function dbzcGroupingCandidates(
  grouping: string | null,
  rarityLabel: string | null,
): Array<string | null> {
  const lower = (rarityLabel ?? "").trim().toLowerCase();
  const g = grouping?.trim().toLowerCase() || null;
  if (g === "s" || lower === "silver") return ["s", "metalsil", "argento"];
  if (g === "g" || lower === "gold") return ["g", "oro", "or"];
  return [null];
}
