/**
 * Provider manifest — the **only** file to edit when adding a provider.
 *
 * 1. Implement `providers/<id>/` (module + self-declared `info` / capabilities).
 * 2. Import the module below and append it to `PROVIDER_MODULES`.
 *
 * Discovery, queries, and materialization live in `catalog.ts`.
 */
import { abebooksModule } from "@/providers/abebooks";
import { achatmoinscherModule } from "@/providers/achatmoinscher";
import { babelioModule } from "@/providers/babelio";
import { backmarketModule } from "@/providers/backmarket";
import { bdovoreModule } from "@/providers/bdovore";
import { bdphileModule } from "@/providers/bdphile";
import { bdfugueModule } from "@/providers/bdfugue";
import { bggModule } from "@/providers/bgg";
import { booknodeModule } from "@/providers/booknode";
import { bricksetModule } from "@/providers/brickset";
import { bedethequeModule } from "@/providers/bedetheque";
import { canalbdModule } from "@/providers/canalbd";
import { chocobonplanModule } from "@/providers/chocobonplan";
import { chasseauxlivresModule } from "@/providers/chasseauxlivres";
import { launchboxModule } from "@/providers/launchbox";
import { coverprojectModule } from "@/providers/coverproject";
import { decitreModule } from "@/providers/decitre";
import { deezerModule } from "@/providers/deezer";
import { discogsModule } from "@/providers/discogs";
import { ebayModule } from "@/providers/ebay";
import { freakxyModule } from "@/providers/freakxy";
import { fullsetModule } from "@/providers/fullset";
import { lorcanajsonModule } from "@/providers/lorcanajson";
import { lorcanaggModule } from "@/providers/lorcanagg";
import { lorcastModule } from "@/providers/lorcast";
import { lorcanatcgModule } from "@/providers/lorcanatcg";
import { tcgdexModule } from "@/providers/tcgdex";
import { pokemontcgliveModule } from "@/providers/pokemontcglive";
import { furetModule } from "@/providers/furet";
import { geedieModule } from "@/providers/geedie";
import { gibertModule } from "@/providers/gibert";
import { hdjvModule } from "@/providers/hdjv";
import { howlongtobeatModule } from "@/providers/howlongtobeat";
import { icollectModule } from "@/providers/icollect";
import { igdbModule } from "@/providers/igdb";
import { izneoModule } from "@/providers/izneo";
import { jikanModule } from "@/providers/jikan";
import { ledenicheurModule } from "@/providers/ledenicheur";
import { nautiljonModule } from "@/providers/nautiljon";
import { musicbrainzModule } from "@/providers/musicbrainz";
import { nointroModule } from "@/providers/nointro";
import { narutocarddassModule } from "@/providers/narutocarddass";
import { narutoshippudenModule } from "@/providers/narutoshippuden";
import { narutoranksModule } from "@/providers/narutoranks";
import { narutoultraModule } from "@/providers/narutoultra";
import { narutomythosModule } from "@/providers/narutomythos";
import { narutokayouModule } from "@/providers/narutokayou";
import { narutodefininjaModule } from "@/providers/narutodefininja";
import { narutodatacarddassModule } from "@/providers/narutodatacarddass";
import { onepieceModule } from "@/providers/onepiece";
import { digimonModule } from "@/providers/digimon";
import { yugiohModule } from "@/providers/yugioh";
import { mtgModule } from "@/providers/mtg";
import { dbscgModule } from "@/providers/dbscg";
import { dbsfwModule } from "@/providers/dbsfw";
import { omdbModule } from "@/providers/omdb";
import { googlebooksModule } from "@/providers/googlebooks";
import { openlibraryModule } from "@/providers/openlibrary";
import { philibertModule } from "@/providers/philibert";
import { planetebdModule } from "@/providers/planetebd";
import { okkazeoModule } from "@/providers/okkazeo";
import { espritjeuModule } from "@/providers/espritjeu";
import { myludoModule } from "@/providers/myludo";
import { playinModule } from "@/providers/playin";
import { PRESTASHOP_RETAILER_MODULES } from "@/providers/prestashop";
import { SHOPIFY_RETAILER_MODULES } from "@/providers/shopify";
import { wikidataModule } from "@/providers/wikidata";
import { pricechartingModule } from "@/providers/pricecharting";
import { rawgModule } from "@/providers/rawg";
import { rebrickableModule } from "@/providers/rebrickable";
import { scandexModule } from "@/providers/scandex";
import { screenscraperModule } from "@/providers/screenscraper";
import { senscritiqueModule } from "@/providers/senscritique";
import { smartoysModule } from "@/providers/smartoys";
import { steamModule } from "@/providers/steam";
import { steamgriddbModule } from "@/providers/steamgriddb";
import { thegamesdbModule } from "@/providers/thegamesdb";
import { tmdbModule } from "@/providers/tmdb";
import { vivlioModule } from "@/providers/vivlio";

import type { ProviderModule } from "@/types/providerModule";

export const PROVIDER_MODULES: ProviderModule[] = [
  screenscraperModule,
  thegamesdbModule,
  launchboxModule,
  nointroModule,
  igdbModule,
  rawgModule,
  steamgriddbModule,
  steamModule,
  howlongtobeatModule,
  pricechartingModule,
  icollectModule,
  smartoysModule,
  coverprojectModule,
  musicbrainzModule,
  discogsModule,
  deezerModule,
  tmdbModule,
  omdbModule,
  openlibraryModule,
  googlebooksModule,
  booknodeModule,
  bricksetModule,
  rebrickableModule,
  babelioModule,
  planetebdModule,
  vivlioModule,
  izneoModule,
  nautiljonModule,
  jikanModule,
  bedethequeModule,
  bdovoreModule,
  bdphileModule,
  bdfugueModule,
  canalbdModule,
  bggModule,
  wikidataModule,
  philibertModule,
  okkazeoModule,
  espritjeuModule,
  myludoModule,
  playinModule,
  senscritiqueModule,
  fullsetModule,
  lorcanajsonModule,
  lorcanatcgModule,
  narutocarddassModule,
  narutoshippudenModule,
  narutoranksModule,
  narutoultraModule,
  narutomythosModule,
  narutokayouModule,
  narutodefininjaModule,
  narutodatacarddassModule,
  onepieceModule,
  digimonModule,
  yugiohModule,
  mtgModule,
  dbscgModule,
  dbsfwModule,
  lorcanaggModule,
  lorcastModule,
  tcgdexModule,
  pokemontcgliveModule,
  ...PRESTASHOP_RETAILER_MODULES,
  ...SHOPIFY_RETAILER_MODULES,
  chasseauxlivresModule,
  achatmoinscherModule,
  abebooksModule,
  backmarketModule,
  decitreModule,
  furetModule,
  gibertModule,
  ledenicheurModule,
  chocobonplanModule,
  geedieModule,
  hdjvModule,
  freakxyModule,
  ebayModule,
  scandexModule,
];
