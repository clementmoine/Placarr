/**
 * Parseur des fiches et listings dbzcollection.fr pour la collection
 * Dragon Ball : Cartes À Jouer Et À Collectionner (Bandai France, 2005-2009, idc=1).
 *
 * HTTP / URLs / decode : `shared/dbzcollection/site`. Ici : grammaire JCC
 * (`D-1`, HD h3000, stats TCG).
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
  dbzcPackInfoUrl,
  decodeDbzcEntities,
} from "@/providers/dragonball/shared/dbzcollection/site";

export const DBZC_COLLECTION_IDC = "1";

export function dbzcSetListingUrl(
  ids: string,
  idc: string = DBZC_COLLECTION_IDC,
): string {
  return dbzcSetListingUrlShared(ids, idc);
}

export type DbzcCardTile = {
  cardId: string;
  printed: string;
  rarityTile: string;
  thumbPath: string;
  facePath: string;
  hdFacePath: string;
};

export type DbzcPackTile = {
  packId: string;
  label: string;
  thumbPath: string;
  facePath: string;
  hdFacePath: string;
};

export type DbzcListingParse = {
  cards: DbzcCardTile[];
  packs: DbzcPackTile[];
};

export type DbzcCardDetail = {
  cardId: string;
  collection: string | null;
  serie: string | null;
  printed: string | null;
  rarity: string | null;
  name: string | null;
  cost: string | null;
  characteristics: string | null;
  powerCost: string | null;
  power: string | null;
  pouvoirCache: string | null;
  nature: string | null;
  otherInfo: string | null;
  hdPath: string | null;
};

export type DbzcPackDetail = {
  packId: string;
  serie: string | null;
  name: string | null;
  otherInfo: string | null;
  hdPath: string | null;
};

const CARD_RE =
  /title="([^"]*)"[^>]*>\s*<div class="bc_texte_numero">([^<]+)<\/div>[\s\S]{0,600}?src="(cartes\/(\d+)\/(\d+)\/h100_(\d+)_carte\.jpg)"/gi;

const PACK_RE =
  /<div class="bc_texte_numero">([^<]+)<\/div>[\s\S]{0,600}?src="(packagings\/(\d+)\/(\d+)\/h100_(\d+)_packaging\.jpg)"/gi;

const HD_LINK_RE =
  /<a\s+href="([^"]+)"[^>]*>Cliquez ici pour\s+(?:t[ée]l[ée]charger|t&eacute;l&eacute;charger)\s+la version HD/i;

export function parseDbzcollectionListing(html: string): DbzcListingParse {
  const cards: DbzcCardTile[] = [];
  const seenCards = new Set<string>();

  for (const match of html.matchAll(CARD_RE)) {
    const rarityTile = decodeDbzcEntities(match[1]!.trim());
    const printed = match[2]!.trim();
    const thumbPath = match[3]!;
    const cardId = match[6]!;
    if (seenCards.has(cardId)) continue;
    seenCards.add(cardId);

    cards.push({
      cardId,
      printed,
      rarityTile,
      thumbPath,
      facePath: thumbPath.replace(/h100_/, "h400_"),
      hdFacePath: thumbPath.replace(/h100_/, "h3000_"),
    });
  }

  const packs: DbzcPackTile[] = [];
  const seenPacks = new Set<string>();

  for (const match of html.matchAll(PACK_RE)) {
    const label = decodeDbzcEntities(match[1]!.trim());
    const thumbPath = match[2]!;
    const packId = match[5]!;
    if (seenPacks.has(packId)) continue;
    seenPacks.add(packId);

    packs.push({
      packId,
      label,
      thumbPath,
      facePath: thumbPath.replace(/h100_/, "h400_"),
      hdFacePath: thumbPath.replace(/h100_/, "h3000_"),
    });
  }

  return { cards, packs };
}

export function parseDbzcCardDetail(html: string, cardId: string): DbzcCardDetail {
  const hdMatch = html.match(HD_LINK_RE);
  const hdPath = hdMatch ? hdMatch[1]!.trim() : null;

  return {
    cardId,
    collection: extractDbzcTableField(html, "Collection"),
    serie: extractDbzcTableField(html, "S&eacute;rie") ?? extractDbzcTableField(html, "Série"),
    printed: extractDbzcTableField(html, "Num&eacute;ro") ?? extractDbzcTableField(html, "Numéro"),
    rarity: extractDbzcTableField(html, "Raret&eacute;") ?? extractDbzcTableField(html, "Rareté"),
    name: extractDbzcTableField(html, "Nom"),
    cost: extractDbzcTableField(html, "Prix d'appel") ?? extractDbzcTableField(html, "Energie/Cout"),
    characteristics:
      extractDbzcTableField(html, "Caracteristiques") ??
      extractDbzcTableField(html, "Caractéristiques"),
    powerCost: extractDbzcTableField(html, "Prix pouvoir") ?? extractDbzcTableField(html, "Cout pouvoir"),
    power: extractDbzcTableField(html, "Pouvoir"),
    pouvoirCache:
      extractDbzcTableField(html, "Pouvoir cach&eacute;") ??
      extractDbzcTableField(html, "Pouvoir caché"),
    nature: extractDbzcTableField(html, "Nature") ?? extractDbzcTableField(html, "Couleur"),
    otherInfo: extractDbzcTableField(html, "Autres infos"),
    hdPath,
  };
}

export function parseDbzcPackDetail(html: string, packId: string): DbzcPackDetail {
  const hdMatch = html.match(HD_LINK_RE);
  const hdPath = hdMatch ? hdMatch[1]!.trim() : null;

  return {
    packId,
    serie: extractDbzcTableField(html, "S&eacute;rie") ?? extractDbzcTableField(html, "Série"),
    name: extractDbzcTableField(html, "Nom"),
    otherInfo: extractDbzcTableField(html, "Autres infos"),
    hdPath,
  };
}
