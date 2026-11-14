/**
 * Shop tile / sealed preview link → local printKey.
 *
 * One mapper for the whole *cards.fr family: sealed ingest, FR face fill, and
 * Cardmarket price indexes. A slug/ref fix here benefits every pack that
 * crawls the Symfony stack.
 *
 * Shapes handled:
 * - Bandai collector: `bt13-135` / `fs10-01-p1` / `st25-001`
 * - Letter set + number: `asc-276`, `tdm-0001` (leading zeros stripped)
 * - Lorcana numeric set (needs `resolveCatalogueSetId`): `12-223`
 * - YGO hyphenated: `cyac-fr042`
 * - YGO glued + CDN folder: `ra03079` + `/cards/fr/ra03/` → `ra03-fr079`
 */
import { buildPrintKey } from "@/core/identify/printKey";
import { dbscardsPrintRef } from "@/providers/shared/tcgcards/tile";

/** Print-game ids whose collector refs are Bandai `set-number[-grouping]`. */
export const CARDS_FR_BANDAI_PRINT_GAMES = new Set([
  "dbscg",
  "dbsfw",
  "onepiece",
]);

export type CardsFrShopPrint = {
  slug: string;
  ref?: string | null;
  /** Face URL — unlocks YGO glued-slug sets via `/cards/{lang}/{set}/`. */
  image?: string | null;
  name?: string | null;
};

export type CardsFrCatalogueSetResolver = (input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
}) => string | null;

/** Bandai-shaped collector ref → printKey, or null when the game is not Bandai. */
export function printKeyFromBandaiCollectorRef(
  game: string,
  ref: string | null | undefined,
): string | null {
  if (!CARDS_FR_BANDAI_PRINT_GAMES.has(game)) return null;
  if (!ref) return null;
  const parts = ref.trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return buildPrintKey({ game, set: parts[0]!, number: parts[1]! });
  }
  return buildPrintKey({
    game,
    set: parts[0]!,
    number: parts[1]!,
    grouping: parts.slice(2).join(""),
  });
}

/**
 * Resolve a shop print (tile or sealed preview link) to a catalogue printKey.
 *
 * Prefer an explicit `ref` when present; otherwise derive it from the slug
 * (and title-shaped sku via {@link dbscardsPrintRef} when callers pass only a slug).
 */
export function cardsFrShopPrintKey(input: {
  game: string;
  print: CardsFrShopPrint;
  resolveCatalogueSetId?: CardsFrCatalogueSetResolver;
}): string | null {
  const { game, print, resolveCatalogueSetId } = input;
  const bandai = printKeyFromBandaiCollectorRef(game, print.ref);
  if (bandai) return bandai;

  const ref =
    print.ref?.trim().toLowerCase() ||
    dbscardsPrintRef({ sku: null, slug: print.slug })?.toLowerCase() ||
    null;

  if (ref) {
    const fromRef = printKeyFromShopRef({
      game,
      ref,
      slug: print.slug,
      name: print.name,
      resolveCatalogueSetId,
    });
    if (fromRef) return fromRef;
  }

  return printKeyFromYgoCdnSlug({
    game,
    slug: print.slug,
    image: print.image,
  });
}

function printKeyFromShopRef(input: {
  game: string;
  ref: string;
  slug?: string | null;
  name?: string | null;
  resolveCatalogueSetId?: CardsFrCatalogueSetResolver;
}): string | null {
  const plain = /^([a-z0-9.]+)-(\d+[a-z]*)$/i.exec(input.ref);
  if (plain) {
    const shopSet = plain[1]!;
    const number = plain[2]!;
    if (input.resolveCatalogueSetId) {
      const catalogueSetId = input.resolveCatalogueSetId({
        setCode: shopSet,
        slug: input.slug,
        name: input.name,
      });
      if (!catalogueSetId?.trim()) return null;
      return buildPrintKey({
        game: input.game,
        set: catalogueSetId.trim(),
        number,
      });
    }
    /*
      Numeric shop sets (Lorcana `12-223`) need the pack resolver — without it
      a stale number/total ref (`241-204`) would mint a confident false key.
      Letter sets (Pokémon ASC, MTG tdm) are the catalogue id as printed.
    */
    if (/^\d+$/.test(shopSet)) return null;
    return buildPrintKey({
      game: input.game,
      set: shopSet,
      number: number.replace(/^0+(\d)/, "$1"),
    });
  }

  const langNum =
    /^([a-z0-9]+)-((?:fr|en|de|it|es|pt)\d+[a-z]*)$/i.exec(input.ref);
  if (langNum) {
    return buildPrintKey({
      game: input.game,
      set: langNum[1]!,
      number: langNum[2]!,
    });
  }

  return null;
}

/** Glued YGO slug `ra03079-…` + CDN `/cards/fr/ra03/` → `yugioh:ra03-fr079`. */
function printKeyFromYgoCdnSlug(input: {
  game: string;
  slug: string;
  image?: string | null;
}): string | null {
  const slug = input.slug.trim().toLowerCase();
  const fromPath = /\/cards\/([a-z]{2})\/([a-z0-9]+)\//i.exec(
    input.image ?? "",
  );
  if (!fromPath) return null;
  const pathLang = fromPath[1]!.toLowerCase();
  const set = fromPath[2]!.toLowerCase();
  if (!slug.startsWith(set)) return null;
  const rest = slug.slice(set.length);
  const num = /^(\d+[a-z]*)-/i.exec(rest);
  if (!num) return null;
  return buildPrintKey({
    game: input.game,
    set,
    number: `${pathLang}${num[1]!.toLowerCase()}`,
  });
}

/** `tdm-fr-0001-m-…` → `mtg:tdm-1` (compat wrapper for markets / faces). */
export function mtgcardsSlugToPrintKey(slug: string): string | null {
  return cardsFrShopPrintKey({
    game: "mtg",
    print: { slug },
  });
}

/** Compat wrapper — same path as sealed ingest for YGO tiles. */
export function ygocardsTileToPrintKey(tile: {
  slug: string;
  imageFront?: string | null;
  image?: string | null;
  ref?: string | null;
  lang?: string | null;
}): string | null {
  return cardsFrShopPrintKey({
    game: "yugioh",
    print: {
      slug: tile.slug,
      ref: tile.ref,
      image: tile.imageFront ?? tile.image,
    },
  });
}
