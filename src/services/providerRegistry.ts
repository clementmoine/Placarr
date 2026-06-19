import { achatmoinscherModule } from "@/services/providers/achatmoinscher";
import { apriloshopModule } from "@/services/providers/apriloshop";
import { bggModule } from "@/services/providers/bgg";
import { chasseauxlivresModule } from "@/services/providers/chasseauxlivres";
import { coverprojectModule } from "@/services/providers/coverproject";
import { deezerModule } from "@/services/providers/deezer";
import { discogsModule } from "@/services/providers/discogs";
import { freakxyModule } from "@/services/providers/freakxy";
import { howlongtobeatModule } from "@/services/providers/howlongtobeat";
import { igdbModule } from "@/services/providers/igdb";
import { ledenicheurModule } from "@/services/providers/ledenicheur";
import { musicbrainzModule } from "@/services/providers/musicbrainz";
import { omdbModule } from "@/services/providers/omdb";
import { googlebooksModule } from "@/services/providers/googlebooks";
import { openlibraryModule } from "@/services/providers/openlibrary";
import { philibertModule } from "@/services/providers/philibert";
import { PRESTASHOP_RETAILER_MODULES } from "@/services/providers/prestashop";
import { wikidataModule } from "@/services/providers/wikidata";
import { picclickModule } from "@/services/providers/picclick";
import { pricechartingModule } from "@/services/providers/pricecharting";
import { rawgModule } from "@/services/providers/rawg";
import { scandexModule } from "@/services/providers/scandex";
import { screenscraperModule } from "@/services/providers/screenscraper";
import { steamModule } from "@/services/providers/steam";
import { steamgriddbModule } from "@/services/providers/steamgriddb";
import { tmdbModule } from "@/services/providers/tmdb";

import type { ProviderModule } from "@/types/providerModule";
import type {
  Capability,
  MediaType,
  ProviderInfo,
} from "@/types/providerRegistry";

export type {
  Capability,
  MediaType,
  ProviderAuth,
  ProviderInfo,
} from "@/types/providerRegistry";

export const PROVIDER_MODULES: ProviderModule[] = [
  screenscraperModule,
  igdbModule,
  rawgModule,
  steamgriddbModule,
  steamModule,
  howlongtobeatModule,
  pricechartingModule,
  coverprojectModule,
  musicbrainzModule,
  discogsModule,
  deezerModule,
  tmdbModule,
  omdbModule,
  openlibraryModule,
  googlebooksModule,
  bggModule,
  wikidataModule,
  philibertModule,
  ...PRESTASHOP_RETAILER_MODULES,
  chasseauxlivresModule,
  achatmoinscherModule,
  ledenicheurModule,
  apriloshopModule,
  freakxyModule,
  picclickModule,
  scandexModule,
];

export const PROVIDERS: ProviderInfo[] = PROVIDER_MODULES.map(
  (module) => module.info,
);

export function getProviderModule(id: string): ProviderModule | undefined {
  return PROVIDER_MODULES.find((module) => module.info.id === id);
}

export function isProviderConfigured(p: ProviderInfo): boolean {
  if (p.auth.kind !== "key") return true;
  return p.auth.env.every((name) => Boolean(process.env[name]?.trim()));
}

export function providersForType(type: MediaType): ProviderInfo[] {
  return PROVIDERS.filter((p) => p.types.includes(type));
}

export function capabilityCoverage(
  type: MediaType,
  capability: Capability,
): { providers: string[]; count: number } {
  const providers = providersForType(type)
    .filter((p) => p.capabilities.includes(capability))
    .map((p) => p.id);
  return { providers, count: providers.length };
}
