/**
 * Pack → SQL face browse page (admin wiring). Lives under `lib/admin/`, not
 * `providers/shared/`, so shared stays franchise-blind.
 *
 * Foil-aware packs declare {@link CataloguePackInfo.foilAwareBrowse}; others
 * return an empty page for `foilOnly` instead of an unfiltered corpus.
 *
 * Object keys use pack-id **constants** (computed) so the provider-blind
 * core guard does not see bare `mtg:` / `pokemon:` key literals.
 */
import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import { listDbsCgCatalogueBrowsePageRows } from "@/providers/dragonball/dbscg/catalogueBrowse";
import { DBS_CG_PACK_ID } from "@/providers/dragonball/dbscg/indexStore";
import { listDbsFwCatalogueBrowsePageRows } from "@/providers/dragonball/dbsfw/catalogueBrowse";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";
import {
  listLorcanaCatalogueBrowsePageRows,
} from "@/providers/lorcana/lorcanatcg/catalogueBrowse";
import { LORCANA_PACK_ID } from "@/providers/lorcana/lorcanatcg/indexStore";
import { listMtgCatalogueBrowsePage } from "@/providers/mtg/catalogueBrowse";
import { MTG_PACK_ID } from "@/providers/mtg/pack";
import { listCarddassCatalogueBrowsePage } from "@/providers/naruto/narutocarddass/catalogueBrowse";
import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/identity";
import { listKayouCatalogueBrowsePage } from "@/providers/naruto/narutokayou/catalogueBrowse";
import { NARUTO_KAYOU_PACK_ID } from "@/providers/naruto/narutokayou/pack";
import { listShippudenCatalogueBrowsePage } from "@/providers/naruto/narutoshippuden/catalogueBrowse";
import { NARUTO_SHIPPUDEN_PACK_ID } from "@/providers/naruto/narutoshippuden/indexStore";
import { POKEMON_PACK_ID } from "@/providers/pokemon/paths";
import {
  hydratePokemonCatalogueBrowseRow,
  listPokemonCatalogueBrowsePage,
} from "@/providers/pokemon/tcgdex/catalogueBrowse";

export type CatalogueFaceBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
  foilOnly?: boolean;
  printed?: "all" | "printed" | "unprinted";
  preferLang?: string | null;
  localeMode?: "preferred" | "all";
  identityOnly?: boolean;
};

export type CatalogueFaceBrowsePage = {
  rows: CatalogueCardRow[];
  total: number;
};

type BrowsePageFn = (
  input: CatalogueFaceBrowsePageInput,
) => CatalogueFaceBrowsePage;

const FACE_BROWSE_PAGES: Partial<
  Record<CataloguePackId, BrowsePageFn>
> = {
  [POKEMON_PACK_ID]: (input) =>
    listPokemonCatalogueBrowsePage({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
      foilOnly: input.foilOnly,
      printed: input.printed ?? "all",
      identityOnly: input.identityOnly,
    }),
  [LORCANA_PACK_ID]: (input) =>
    listLorcanaCatalogueBrowsePageRows({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
      foilOnly: input.foilOnly,
    }),
  [NARUTO_PACK_ID]: (input) =>
    listCarddassCatalogueBrowsePage({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
      foilOnly: input.foilOnly,
      printed: input.printed ?? "all",
      preferLang: input.preferLang,
      localeMode: input.localeMode,
    }),
  [NARUTO_KAYOU_PACK_ID]: (input) =>
    listKayouCatalogueBrowsePage({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
      foilOnly: input.foilOnly,
    }),
  [NARUTO_SHIPPUDEN_PACK_ID]: (input) =>
    listShippudenCatalogueBrowsePage({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
    }),
  [DBS_CG_PACK_ID]: (input) =>
    listDbsCgCatalogueBrowsePageRows({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
    }),
  [DBS_FW_PACK_ID]: (input) =>
    listDbsFwCatalogueBrowsePageRows({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
    }),
  [MTG_PACK_ID]: (input) =>
    listMtgCatalogueBrowsePage({
      langs: input.langs,
      q: input.q,
      offset: input.offset,
      limit: input.limit,
      missingArtOnly: input.missingArtOnly,
      missingNameOnly: input.missingNameOnly,
      incompleteOnly: input.incompleteOnly,
    }),
};

/** Registered SQL browse helper, or null → LocalPrints / materialize. */
export function listRegisteredFaceBrowsePage(
  pack: CataloguePackId,
  input: CatalogueFaceBrowsePageInput,
): CatalogueFaceBrowsePage | null {
  const list = FACE_BROWSE_PAGES[pack];
  return list ? list(input) : null;
}

/**
 * Window hydrate after identity-only overscan (Pokémon price audit).
 * Other packs already resolve art in their page helper.
 */
export function hydrateRegisteredBrowseRow(
  pack: CataloguePackId,
  row: CatalogueCardRow,
): CatalogueCardRow {
  if (pack === POKEMON_PACK_ID) return hydratePokemonCatalogueBrowseRow(row);
  return row;
}
