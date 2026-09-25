/**
 * Prix-only — Cardmarket EUR from the local `pkmcards-fr.json` list dump.
 *
 * Catalogue Pokémon rows use Live bundle ids (`me5_fr_001`) as `printKey`.
 * {@link catalogueCardPriceCentsByPrintKey} normalises those to `pokemon:…`
 * before calling this module.
 */
import { buildPrintKey } from "@/core/identify/printKey";
import { packCardsDir, packCatalogDb } from "@/lib/packPaths";
import { createPrintKeyPriceModule } from "@/providers/shared/createPrintKeyPriceModule";
import {
  fetchMappedCardsFrCardForPrintKey,
  type CardsFrMappedPriceSpec,
} from "@/providers/shared/tcgcards/cardsFrPriceFetch";
import type { DbscardsPriceCard } from "@/providers/shared/tcgcards/priceIndex";
import { pkmcardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";
import type { DbscardsTile } from "@/providers/shared/tcgcards/tile";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  buildPkmcardsAbbrToLiveStem,
  parsePkmcardsPokemonSlug,
  resolvePkmcardsAbbrToLiveStem,
} from "@/providers/pokemon/tcgdex/scrape/faces";

const POKEMON_GAME = "pokemon";

/** Cache of catalogue `set` ids so me05 / me5 land on the same printKey. */
let catalogueSetsCache: Set<string> | null = null;

function cataloguePokemonSets(): Set<string> {
  if (catalogueSetsCache) return catalogueSetsCache;
  const sets = new Set<string>();
  try {
    const dbPath = packCatalogDb("pokemon");
    if (!existsSync(dbPath)) {
      catalogueSetsCache = sets;
      return sets;
    }
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT DISTINCT lower(set_id) AS setId FROM prints WHERE set_id IS NOT NULL`,
        )
        .all() as Array<{ setId: string }>;
      for (const row of rows) {
        const set = row.setId?.trim();
        if (set) sets.add(set);
      }
    } finally {
      db.close();
    }
  } catch {
    /* empty */
  }
  catalogueSetsCache = sets;
  return sets;
}

/**
 * When Live has both `me05` and `me5`, prefer the stem that Catalogue indexes.
 */
export function preferPokemonCatalogueStem(stem: string): string {
  const raw = stem.trim().toLowerCase();
  if (!raw) return raw;
  const sets = cataloguePokemonSets();
  if (sets.has(raw)) return raw;
  const aliases: string[] = [];
  const me0 = /^me0(\d+(?:\.\d+)?)$/.exec(raw);
  if (me0) aliases.push(`me${me0[1]}`);
  // Live CDN often drops the leading zero (`me5`); TCGdex keeps `me05`.
  const meShort = /^me(\d+(?:\.\d+)?)$/.exec(raw);
  if (meShort && !raw.startsWith("me0")) {
    aliases.push(`me0${meShort[1]}`);
  }
  const meDot = /^me(\d+)\.(\d+)$/.exec(raw);
  if (meDot) aliases.push(`me${meDot[1]}-${meDot[2]}`);
  const meDash = /^me(\d+)-(\d+)$/.exec(raw);
  if (meDash) aliases.push(`me${meDash[1]}.${meDash[2]}`);
  const sv0 = /^sv0(\d+(?:\.\d+)?)$/.exec(raw);
  if (sv0) aliases.push(`sv${sv0[1]}`);
  const svShort = /^sv(\d+(?:\.\d+)?)$/.exec(raw);
  if (svShort && !raw.startsWith("sv0")) {
    aliases.push(`sv0${svShort[1]}`);
  }
  for (const alias of aliases) {
    if (sets.has(alias)) return alias;
  }
  return raw;
}

/** Live CDN / Catalogue bundle id → `pokemon:set-number`. */
export function liveBundleIdToPokemonPrintKey(
  bundleId: string | null | undefined,
): string | null {
  const raw = bundleId?.trim() ?? "";
  if (!raw) return null;
  const match =
    /^([a-z0-9.-]+)_([a-z]{2,4})_(\d+[a-z]*)(?:_[a-z])?$/i.exec(raw);
  if (!match) return null;
  const set = preferPokemonCatalogueStem(match[1]!.toLowerCase());
  const number = match[3]!.toLowerCase();
  return buildPrintKey({ game: POKEMON_GAME, set, number });
}

/** Normalise any Catalogue printKey before asking a pokemon pricer. */
export function cataloguePokemonPriceLookupKey(printKey: string): string {
  const trimmed = printKey.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(":")) return trimmed.toLowerCase();
  return liveBundleIdToPokemonPrintKey(trimmed) ?? trimmed.toLowerCase();
}

export function pkmcardsTileToPrintKey(
  tile: Pick<DbscardsTile, "slug">,
  cardsRoot = packCardsDir("pokemon"),
  abbrMap = buildPkmcardsAbbrToLiveStem(cardsRoot),
): string | null {
  const parsed = parsePkmcardsPokemonSlug(tile.slug);
  if (!parsed) return null;
  const liveStem = resolvePkmcardsAbbrToLiveStem(
    parsed.setAbbr,
    cardsRoot,
    abbrMap,
  );
  if (!liveStem) return null;
  const set = preferPokemonCatalogueStem(liveStem);
  return buildPrintKey({
    game: POKEMON_GAME,
    set,
    number: parsed.number,
  });
}

const SPEC: CardsFrMappedPriceSpec = {
  cacheId: "pkmmarket",
  game: POKEMON_GAME,
  origin: "https://www.pkmcards.fr",
  indexPath: pkmcardsIndexPath("fr"),
  printKeyOf: (tile) => pkmcardsTileToPrintKey(tile),
};

/**
 * Prix-only. Id `pkmmarket` (pas `pkmcards`) : le dump liste / faces portent
 * déjà le slug site.
 */
export const pkmmarketModule = createPrintKeyPriceModule<DbscardsPriceCard>({
  providerId: "pkmmarket",
  label: "pkmcards.fr",
  priceSource: "pkmcards",
  currency: "EUR",
  websiteUrl: "https://www.pkmcards.fr/",
  notes:
    "Cotes Cardmarket EUR (dump liste pkmcards.fr) pour Pokémon TCG. Match par printKey (Live bundle → pokemon:set-number). Fichier local — pas de HTTP au refresh.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  supplyMode: "scrape_cache",
  printGame: POKEMON_GAME,
  mappingProbe: {
    sampleInput: "pokemon:me5-001",
    context: {
      name: "Tropius",
      printKey: "pokemon:me5-001",
    },
  },
  fetchCard: (printKey, { ctx }) =>
    fetchMappedCardsFrCardForPrintKey(printKey, SPEC, {
      evidenceOnly: Boolean(ctx.evidenceOnly),
    }),
  priceRows: (card) => [
    {
      condition: "new",
      priceCents: card.priceCents,
      productName: card.name,
      ...(card.sourceUrl ? { sourceUrl: card.sourceUrl } : {}),
    },
  ],
});
