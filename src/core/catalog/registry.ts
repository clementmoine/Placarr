/**
 * Provider manifest — the **only** file to edit when adding a provider.
 *
 * 1. Implement `providers/<id>/` (module + self-declared `info` / capabilities).
 * 2. Import the module below and append it to `PROVIDER_MODULES`.
 *
 * Discovery, queries, and materialization live in `catalog.ts`.
 */
import { achatmoinscherModule } from "@/providers/achatmoinscher";
import { bggModule } from "@/providers/bgg";
import { booknodeModule } from "@/providers/booknode";
import { bedethequeModule } from "@/providers/bedetheque";
import { chocobonplanModule } from "@/providers/chocobonplan";
import { chasseauxlivresModule } from "@/providers/chasseauxlivres";
import { launchboxModule } from "@/providers/launchbox";
import { coverprojectModule } from "@/providers/coverproject";
import { deezerModule } from "@/providers/deezer";
import { discogsModule } from "@/providers/discogs";
import { ebayModule } from "@/providers/ebay";
import { freakxyModule } from "@/providers/freakxy";
import { fullsetModule } from "@/providers/fullset";
import { geedieModule } from "@/providers/geedie";
import { hdjvModule } from "@/providers/hdjv";
import { howlongtobeatModule } from "@/providers/howlongtobeat";
import { icollectModule } from "@/providers/icollect";
import { igdbModule } from "@/providers/igdb";
import { ledenicheurModule } from "@/providers/ledenicheur";
import { musicbrainzModule } from "@/providers/musicbrainz";
import { omdbModule } from "@/providers/omdb";
import { googlebooksModule } from "@/providers/googlebooks";
import { openlibraryModule } from "@/providers/openlibrary";
import { philibertModule } from "@/providers/philibert";
import { okkazeoModule } from "@/providers/okkazeo";
import { espritjeuModule } from "@/providers/espritjeu";
import { myludoModule } from "@/providers/myludo";
import { playinModule } from "@/providers/playin";
import { PRESTASHOP_RETAILER_MODULES } from "@/providers/prestashop";
import { SHOPIFY_RETAILER_MODULES } from "@/providers/shopify";
import { wikidataModule } from "@/providers/wikidata";
import { pricechartingModule } from "@/providers/pricecharting";
import { rawgModule } from "@/providers/rawg";
import { scandexModule } from "@/providers/scandex";
import { screenscraperModule } from "@/providers/screenscraper";
import { senscritiqueModule } from "@/providers/senscritique";
import { smartoysModule } from "@/providers/smartoys";
import { steamModule } from "@/providers/steam";
import { steamgriddbModule } from "@/providers/steamgriddb";
import { thegamesdbModule } from "@/providers/thegamesdb";
import { tmdbModule } from "@/providers/tmdb";

import type { ProviderModule } from "@/types/providerModule";

export const PROVIDER_MODULES: ProviderModule[] = [
  screenscraperModule,
  thegamesdbModule,
  launchboxModule,
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
  bedethequeModule,
  bggModule,
  wikidataModule,
  philibertModule,
  okkazeoModule,
  espritjeuModule,
  myludoModule,
  playinModule,
  senscritiqueModule,
  fullsetModule,
  ...PRESTASHOP_RETAILER_MODULES,
  ...SHOPIFY_RETAILER_MODULES,
  chasseauxlivresModule,
  achatmoinscherModule,
  ledenicheurModule,
  chocobonplanModule,
  geedieModule,
  hdjvModule,
  freakxyModule,
  ebayModule,
  scandexModule,
];
