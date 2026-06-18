import { fetchFromIGDB } from "@/services/igdb";
import { fetchFromSteam } from "@/services/steam";
import { fetchFromHowLongToBeat } from "@/services/howLongToBeat";
import { fetchFromSteamGridDB } from "@/services/steamGridDb";
import type { MetadataResult } from "@/services/metadata";

import type { MetadataProviderAdapter } from "./types";

export const igdbMetadataAdapter: MetadataProviderAdapter = {
  id: "igdb",
  async resolve({ name, platform }) {
    return (await fetchFromIGDB(name, platform)) as MetadataResult | null;
  },
};

export const howLongToBeatMetadataAdapter: MetadataProviderAdapter = {
  id: "howlongtobeat",
  async resolve({ name, platform }) {
    return (await fetchFromHowLongToBeat(name, platform)) as MetadataResult | null;
  },
};

export const steamMetadataAdapter: MetadataProviderAdapter = {
  id: "steam",
  async resolve({ name, includePcSources }) {
    if (!includePcSources) return null;
    return (await fetchFromSteam(name)) as MetadataResult | null;
  },
};

export const steamGridDbMetadataAdapter: MetadataProviderAdapter = {
  id: "steamgriddb",
  async resolve({ name }) {
    return (await fetchFromSteamGridDB(name)) as MetadataResult | null;
  },
};

export const gameExternalMetadataAdapters: MetadataProviderAdapter[] = [
  igdbMetadataAdapter,
  howLongToBeatMetadataAdapter,
  steamMetadataAdapter,
  steamGridDbMetadataAdapter,
];
