/**
 * Provider manifest — the **only** file to edit when adding a provider.
 *
 * 1. Implement `providers/<id>/` (module + self-declared `info` / capabilities).
 * 2. Import the module below and append it to `PROVIDER_MODULES`.
 *
 * Discovery, queries, and materialization live in `catalog.ts`.
 */
import { achatmoinscherModule } from "@/services/providers/achatmoinscher";
import { bggModule } from "@/services/providers/bgg";
import { booknodeModule } from "@/services/providers/booknode";
import { bedethequeModule } from "@/services/providers/bedetheque";
import { chocobonplanModule } from "@/services/providers/chocobonplan";
import { chasseauxlivresModule } from "@/services/providers/chasseauxlivres";
import { launchboxModule } from "@/services/providers/launchbox";
import { coverprojectModule } from "@/services/providers/coverproject";
import { deezerModule } from "@/services/providers/deezer";
import { discogsModule } from "@/services/providers/discogs";
import { ebayModule } from "@/services/providers/ebay";
import { freakxyModule } from "@/services/providers/freakxy";
import { geedieModule } from "@/services/providers/geedie";
import { hdjvModule } from "@/services/providers/hdjv";
import { howlongtobeatModule } from "@/services/providers/howlongtobeat";
import { icollectModule } from "@/services/providers/icollect";
import { igdbModule } from "@/services/providers/igdb";
import { ledenicheurModule } from "@/services/providers/ledenicheur";
import { musicbrainzModule } from "@/services/providers/musicbrainz";
import { omdbModule } from "@/services/providers/omdb";
import { googlebooksModule } from "@/services/providers/googlebooks";
import { openlibraryModule } from "@/services/providers/openlibrary";
import { philibertModule } from "@/services/providers/philibert";
import { okkazeoModule } from "@/services/providers/okkazeo";
import { espritjeuModule } from "@/services/providers/espritjeu";
import { myludoModule } from "@/services/providers/myludo";
import { playinModule } from "@/services/providers/playin";
import { PRESTASHOP_RETAILER_MODULES } from "@/services/providers/prestashop";
import { SHOPIFY_RETAILER_MODULES } from "@/services/providers/shopify";
import { wikidataModule } from "@/services/providers/wikidata";
import { pricechartingModule } from "@/services/providers/pricecharting";
import { rawgModule } from "@/services/providers/rawg";
import { scandexModule } from "@/services/providers/scandex";
import { screenscraperModule } from "@/services/providers/screenscraper";
import { smartoysModule } from "@/services/providers/smartoys";
import { steamModule } from "@/services/providers/steam";
import { steamgriddbModule } from "@/services/providers/steamgriddb";
import { thegamesdbModule } from "@/services/providers/thegamesdb";
import { tmdbModule } from "@/services/providers/tmdb";

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
