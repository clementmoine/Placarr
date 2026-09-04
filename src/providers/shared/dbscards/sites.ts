/**
 * TCG Cards family — one Symfony codebase, many hosts.
 *
 * Measured 2026-08-16: `/js/routing` is 110 routes, identical except `host`.
 * Footer sister list (tcgcards.fr hub, home 500 that day): bss / dbs / dgm /
 * fab / fft / lol / lor / mtg / ope / pkm / swu / ygo, plus Fusion World on
 * `fw.dbscards.fr`. Product listings paginate as `/products/{cat}/2`.
 *
 * This module is the site table. Parsing and the sequential crawl live next
 * door; a pack just names a row. Product scrapes do not walk `/cards` —
 * sealed SKUs only. Pokémon also harvests pkmcards.fr `/cards` faces into
 * `art.pkmcards.*` (all tiles that map to a Live stem — not gap-only).
 *
 * Accessories are classified here and never requested. Displays are listed,
 * not opened. Boosters are opened for the labelled 15-tile preview.
 */

export type TcgCardsCategoryRole = "preview" | "detail" | "index" | "skip";

/**
 * Role of a `/products/{slug}` category, shared by every host. Unknown slugs
 * are `skip` so a new accessory nav item cannot start a crawl by accident.
 */
export const TCGCARDS_CATEGORY_ROLES: Readonly<
  Record<string, TcgCardsCategoryRole>
> = {
  boosters: "preview",
  "boosters-blister": "preview",
  decks: "detail",
  "armory-decks": "detail",
  "blitz-decks": "detail",
  "silver-age-decks": "detail",
  "commander-decks": "detail",
  "collector-boxes": "detail",
  "illumineers-quest": "detail",
  "special-packs": "detail",
  "trove-packs": "detail",
  "elite-trainer": "detail",
  minitins: "detail",
  pokebox: "detail",
  tripacks: "detail",
  "double-packs": "detail",
  tins: "detail",
  "prerelease-packs": "detail",
  puzzles: "detail",
  displays: "index",
  accessories: "skip",
  binders: "skip",
  "binders-pages": "skip",
  "card-sleeves": "skip",
  coins: "skip",
  "deck-boxes": "skip",
  "deck-separator": "skip",
  dices: "skip",
  playmats: "skip",
  pins: "skip",
  "lore-trackers": "skip",
  stickers: "skip",
  "storage-boxes": "skip",
};

export type TcgCardsSiteId =
  | "masters"
  | "fusion"
  | "lorcards"
  | "pkmcards"
  | "opecards"
  | "ygocards"
  | "mtgcards"
  | "fabcards"
  | "fftcards"
  | "swucards"
  | "dgmcards"
  | "bsscards"
  | "lolcards";

export type TcgCardsSite = {
  id: TcgCardsSiteId;
  origin: string;
  /**
   * Local `data/<pack>/` folder. `null` = family member we do not collect
   * yet; the row is still here so a later pack is one id, not a new scraper.
   * A pack id without a Catalogue tab (OP / YGO / Magic stubs) is still
   * crawlable — staging only until the local line is wired.
   */
  packId: string | null;
  stagingFolder: string;
  /**
   * Nav `/products/{slug}` slugs published on the host (measured 2026-08-16,
   * revu le 2026-08-19). C'est le seul point de ces crawls qui ne se découvre
   * pas tout seul : les cartes viennent du `<select>` de séries des sites
   * Bandai, les produits d'une liste écrite ici. Un slug oublié est invisible,
   * sans erreur — `prerelease-packs` chez lorcards cachait ainsi deux packs
   * avant-première (Set 13, Set 14).
   *
   * Pour la revoir : `TCGCARDS_CATEGORY_ROLES` classe les slugs connus, et
   * tout slug inconnu vaut `skip`. Un slug vu sur un site et typé autrement que
   * `skip` mais absent d'ici est un trou.
   */
  categories: readonly string[];
  /**
   * Union decks / exclusive boxes with the pack's `catalog.sqlite`. Only the
   * Bandai DBS indexes have that series axis; a Lorcana starter declaring
   * 446 is the chapter pool, not the deck.
   */
  catalogJoin?: boolean;
  indexLang?: string;
  /** Card-list locales, only filled where we actually crawl `/cards`. */
  lists?: Readonly<Record<string, string>>;
};

export const TCGCARDS_SITES: Readonly<Record<TcgCardsSiteId, TcgCardsSite>> = {
  masters: {
    id: "masters",
    origin: "https://www.dbscards.fr",
    packId: "dbs/cg",
    stagingFolder: "dbscards-products",
    catalogJoin: true,
    indexLang: "fr",
    lists: {
      fr: "/cards/liste-cartes-francaises",
      en: "/cards/liste-cartes-anglaises",
    },
    categories: [
      "boosters",
      "displays",
      "decks",
      "collector-boxes",
      "special-packs",
    ],
  },
  fusion: {
    id: "fusion",
    origin: "https://fw.dbscards.fr",
    packId: "dbs/fw",
    stagingFolder: "dbscards-products",
    catalogJoin: true,
    indexLang: "en",
    lists: {
      en: "/cards/liste-cartes-anglaises",
      ja: "/cards/liste-cartes-japonaises",
    },
    categories: ["boosters", "displays", "decks", "collector-boxes"],
  },
  lorcards: {
    id: "lorcards",
    origin: "https://www.lorcards.fr",
    packId: "lorcana",
    stagingFolder: "lorcards-products",
    categories: [
      "boosters",
      "boosters-blister",
      "displays",
      "decks",
      "collector-boxes",
      "illumineers-quest",
      "trove-packs",
      "prerelease-packs",
      "puzzles",
    ],
  },
  pkmcards: {
    id: "pkmcards",
    origin: "https://www.pkmcards.fr",
    packId: "pokemon",
    stagingFolder: "pkmcards-products",
    categories: [
      "boosters",
      "displays",
      "collector-boxes",
      "elite-trainer",
      "minitins",
      "pokebox",
      "special-packs",
      "tripacks",
    ],
  },
  opecards: {
    id: "opecards",
    origin: "https://www.opecards.fr",
    packId: "onepiece",
    stagingFolder: "opecards-products",
    categories: [
      "boosters",
      "displays",
      "decks",
      "collector-boxes",
      "double-packs",
      "tins",
    ],
  },
  ygocards: {
    id: "ygocards",
    origin: "https://www.ygocards.fr",
    packId: "yugioh",
    stagingFolder: "ygocards-products",
    categories: ["boosters", "displays"],
  },
  mtgcards: {
    id: "mtgcards",
    origin: "https://www.mtgcards.fr",
    packId: "mtg",
    stagingFolder: "mtgcards-products",
    categories: ["commander-decks", "prerelease-packs"],
  },
  fabcards: {
    id: "fabcards",
    origin: "https://www.fabcards.fr",
    packId: null,
    stagingFolder: "fabcards-products",
    categories: [
      "boosters",
      "displays",
      "armory-decks",
      "blitz-decks",
      "silver-age-decks",
    ],
  },
  fftcards: {
    id: "fftcards",
    origin: "https://www.fftcards.fr",
    packId: null,
    stagingFolder: "fftcards-products",
    categories: ["boosters", "displays", "decks"],
  },
  swucards: {
    id: "swucards",
    origin: "https://www.swucards.fr",
    packId: null,
    stagingFolder: "swucards-products",
    categories: ["boosters", "displays", "decks", "collector-boxes"],
  },
  dgmcards: {
    id: "dgmcards",
    origin: "https://www.dgmcards.fr",
    packId: null,
    stagingFolder: "dgmcards-products",
    categories: ["boosters", "decks"],
  },
  bsscards: {
    id: "bsscards",
    origin: "https://www.bsscards.fr",
    packId: null,
    stagingFolder: "bsscards-products",
    categories: [
      "boosters",
      "displays",
      "decks",
      "collector-boxes",
      "special-packs",
    ],
  },
  lolcards: {
    id: "lolcards",
    origin: "https://www.lolcards.fr",
    packId: null,
    stagingFolder: "lolcards-products",
    categories: [
      "boosters",
      "boosters-blister",
      "displays",
      "decks",
      "collector-boxes",
    ],
  },
};

export function isTcgCardsSiteId(value: string): value is TcgCardsSiteId {
  return Object.hasOwn(TCGCARDS_SITES, value);
}

export function tcgCardsSite(id: TcgCardsSiteId): TcgCardsSite {
  return TCGCARDS_SITES[id];
}

export function tcgCardsCategoryRole(category: string): TcgCardsCategoryRole {
  return TCGCARDS_CATEGORY_ROLES[category] ?? "skip";
}

export function tcgCardsListingCategories(
  site: TcgCardsSite | TcgCardsSiteId,
): string[] {
  const row = typeof site === "string" ? tcgCardsSite(site) : site;
  return row.categories.filter(
    (category) => tcgCardsCategoryRole(category) !== "skip",
  );
}

export function tcgCardsDetailCategories(
  site: TcgCardsSite | TcgCardsSiteId,
): string[] {
  return tcgCardsListingCategories(site).filter((category) => {
    const role = tcgCardsCategoryRole(category);
    return role === "preview" || role === "detail";
  });
}

/** Sites we actually write under `data/<pack>/`. */
export function tcgCardsCrawlableSites(): TcgCardsSite[] {
  return Object.values(TCGCARDS_SITES).filter((site) => site.packId != null);
}

export function tcgCardsSiteForPack(packId: string): TcgCardsSite | null {
  return (
    Object.values(TCGCARDS_SITES).find((site) => site.packId === packId) ?? null
  );
}
