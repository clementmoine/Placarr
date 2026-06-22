import { achatmoinscherModule } from "@/services/providers/achatmoinscher";
import { apriloshopModule } from "@/services/providers/apriloshop";
import { bggModule } from "@/services/providers/bgg";
import { chasseauxlivresModule } from "@/services/providers/chasseauxlivres";
import { launchboxModule } from "@/services/providers/launchbox";
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
import { okkazeoModule } from "@/services/providers/okkazeo";
import { PRESTASHOP_RETAILER_MODULES } from "@/services/providers/prestashop";
import { wikidataModule } from "@/services/providers/wikidata";
import { picclickModule } from "@/services/providers/picclick";
import { pricechartingModule } from "@/services/providers/pricecharting";
import { rawgModule } from "@/services/providers/rawg";
import { scandexModule } from "@/services/providers/scandex";
import { isScreenScraperConfigured } from "@/services/providers/screenscraper/env";
import { screenscraperModule } from "@/services/providers/screenscraper";
import { steamModule } from "@/services/providers/steam";
import { steamgriddbModule } from "@/services/providers/steamgriddb";
import { thegamesdbModule } from "@/services/providers/thegamesdb";
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
  thegamesdbModule,
  launchboxModule,
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
  okkazeoModule,
  ...PRESTASHOP_RETAILER_MODULES,
  chasseauxlivresModule,
  achatmoinscherModule,
  ledenicheurModule,
  apriloshopModule,
  freakxyModule,
  picclickModule,
  scandexModule,
];

const PROVIDER_METADATA_EXTENSIONS: Record<
  string,
  { weight: number; defaultLanguage?: "fr" | "en" | "unknown"; isRealBoxCover?: boolean }
> = {
  screenscraper: { weight: 0.9, defaultLanguage: "fr", isRealBoxCover: true },
  igdb: { weight: 0.85, defaultLanguage: "en" },
  thegamesdb: { weight: 0.75, defaultLanguage: "en", isRealBoxCover: true },
  launchbox: { weight: 0.7, defaultLanguage: "en", isRealBoxCover: true },
  coverproject: { weight: 0.8, isRealBoxCover: true },
  howlongtobeat: { weight: 0.6 },
  steam: { weight: 0.8, defaultLanguage: "en" },
  rawg: { weight: 0.65, defaultLanguage: "en" },
  steamgriddb: { weight: 0.5 },
  pricecharting: { weight: 0.7 },
  tmdb: { weight: 0.85, defaultLanguage: "fr" },
  omdb: { weight: 0.7, defaultLanguage: "en", isSecondary: true } as any,
  musicbrainz: { weight: 0.8 },
  discogs: { weight: 0.75 },
  deezer: { weight: 0.7 },
  openlibrary: { weight: 0.85, defaultLanguage: "en" },
  googlebooks: { weight: 0.8, defaultLanguage: "en" },
  boardgamegeek: { weight: 0.9, defaultLanguage: "en", isRealBoxCover: true },
  wikidata: { weight: 0.6 },
  philibert: { weight: 0.8, defaultLanguage: "fr", isRealBoxCover: true },
  okkazeo: { weight: 0.8, defaultLanguage: "fr", isRealBoxCover: true },
  chasseauxlivres: { weight: 0.8, defaultLanguage: "fr" },
  achatmoinscher: { weight: 0.5, defaultLanguage: "fr", isSecondary: true } as any,
  ledenicheur: { weight: 0.7, defaultLanguage: "fr" },
  apriloshop: { weight: 0.7, defaultLanguage: "fr", isRealBoxCover: true },
  freakxy: { weight: 0.7, defaultLanguage: "fr", isRealBoxCover: true },
  picclick: { weight: 0.5 },
  scandex: { weight: 0.5 },
};

export const PROVIDERS: ProviderInfo[] = PROVIDER_MODULES.map((module) => {
  const ext = PROVIDER_METADATA_EXTENSIONS[module.info.id] || {};
  return {
    ...module.info,
    weight: module.info.weight ?? ext.weight ?? 0.5,
    defaultLanguage: module.info.defaultLanguage ?? ext.defaultLanguage ?? "unknown",
    isRealBoxCover: module.info.isRealBoxCover ?? ext.isRealBoxCover ?? false,
    isSecondary: module.info.isSecondary ?? (ext as any).isSecondary ?? false,
  };
});



export function getProviderModule(id: string): ProviderModule | undefined {
  return PROVIDER_MODULES.find((module) => module.info.id === id);
}

export function isProviderConfigured(p: ProviderInfo): boolean {
  if (p.id === "screenscraper") return isScreenScraperConfigured();
  if (p.id === "thegamesdb") {
    return Boolean(process.env.THEGAMESDB_API_KEY?.trim());
  }
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
