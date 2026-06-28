import { createBarcodeLookupDeps } from "@/services/provider/barcode";
import { getMetadataProviderAdapter } from "@/services/provider/bootstrap";
import { achatmoinscherModule } from "@/services/providers/achatmoinscher";
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
import { openlibraryModule } from "@/services/providers/openlibrary";
import { picclickModule } from "@/services/providers/picclick";
import { pricechartingModule } from "@/services/providers/pricecharting";
import { rawgModule } from "@/services/providers/rawg";
import { screenscraperModule } from "@/services/providers/screenscraper";
import { steamModule } from "@/services/providers/steam";
import { steamgriddbModule } from "@/services/providers/steamgriddb";
import { tmdbModule } from "@/services/providers/tmdb";

import type { MetadataAdapterContext } from "@/types/providerModule";

type Mode = "meta" | "list" | "raw";

const out: Record<string, unknown> = {};
const barcodeDeps = createBarcodeLookupDeps();

function summarizeMeta(value: any) {
  return {
    hasResult: Boolean(value),
    keys: Object.keys(value || {}),
    attachments: value?.attachments?.length || 0,
    facts: value?.facts?.length || 0,
    title: value?.title || null,
  };
}

async function resolveMetadata(providerId: string, ctx: MetadataAdapterContext) {
  const adapter = getMetadataProviderAdapter(providerId);
  if (!adapter) return null;
  return adapter.resolve(ctx);
}

async function safe(
  name: string,
  fn: () => Promise<unknown>,
  mode: Mode = "meta",
) {
  try {
    const value = await fn();
    if (mode === "list") {
      out[name] = {
        count: Array.isArray(value) ? value.length : 0,
        first: Array.isArray(value) ? value[0] || null : null,
      };
      return;
    }
    if (mode === "raw") {
      out[name] = value;
      return;
    }
    out[name] = summarizeMeta(value);
  } catch (error) {
    out[name] = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function run() {
  await safe(igdbModule.info.id, () =>
    resolveMetadata(igdbModule.info.id, { name: "Hades", type: "games" }),
  );
  await safe(rawgModule.info.id, () =>
    resolveMetadata(rawgModule.info.id, { name: "Hades", type: "games" }),
  );
  await safe(tmdbModule.info.id, () =>
    resolveMetadata(tmdbModule.info.id, { name: "Aladdin", type: "movies" }),
  );
  await safe(omdbModule.info.id, () =>
    resolveMetadata(omdbModule.info.id, { name: "Aladdin", type: "movies" }),
  );
  await safe(screenscraperModule.info.id, () =>
    resolveMetadata(screenscraperModule.info.id, {
      name: "The Legend of Zelda Skyward Sword",
      type: "games",
    }),
  );
  await safe(steamModule.info.id, () =>
    resolveMetadata(steamModule.info.id, {
      name: "Hades",
      type: "games",
      includePcSources: true,
    }),
  );
  await safe(howlongtobeatModule.info.id, () =>
    resolveMetadata(howlongtobeatModule.info.id, {
      name: "The Legend of Zelda Skyward Sword",
      type: "games",
      platform: "wii",
    }),
  );
  await safe(steamgriddbModule.info.id, () =>
    resolveMetadata(steamgriddbModule.info.id, {
      name: "Hades",
      type: "games",
    }),
  );
  await safe(openlibraryModule.info.id, () =>
    resolveMetadata(openlibraryModule.info.id, {
      name: "1984",
      type: "books",
      barcode: "9782070368228",
    }),
  );
  await safe(deezerModule.info.id, () =>
    resolveMetadata(deezerModule.info.id, {
      name: "Daft Punk Random Access Memories",
      type: "musics",
    }),
  );
  await safe(
    musicbrainzModule.info.id,
    () => barcodeDeps.fetchFromMusicBrainz!("886443927087"),
    "raw",
  );
  await safe(
    discogsModule.info.id,
    () => barcodeDeps.fetchFromDiscogs!("886443927087"),
    "raw",
  );
  await safe(bggModule.info.id, () =>
    resolveMetadata(bggModule.info.id, { name: "Catan", type: "boardgames" }),
  );
  await safe(
    coverprojectModule.info.id,
    () =>
      resolveMetadata(coverprojectModule.info.id, {
        name: "The Legend of Zelda Skyward Sword",
        type: "games",
        platform: "Nintendo Wii",
      }),
    "raw",
  );
  await safe(
    pricechartingModule.info.id,
    () => barcodeDeps.fetchMetadataFromPriceCharting!("0045496365226"),
    "raw",
  );
  await safe(
    chasseauxlivresModule.info.id,
    () => barcodeDeps.fetchFromChasseAuxLivres!("9782070368228", "fr"),
    "list",
  );
  await safe(
    achatmoinscherModule.info.id,
    () => barcodeDeps.fetchFromAchatMoinsCher!("9782070368228"),
    "list",
  );
  await safe(
    ledenicheurModule.info.id,
    () => barcodeDeps.fetchPricesFromLeDenicheur!("hades switch"),
    "raw",
  );
  await safe(
    freakxyModule.info.id,
    () => barcodeDeps.fetchFromFreakxy!("5060004769360"),
    "list",
  );
  await safe(
    picclickModule.info.id,
    () => barcodeDeps.fetchFromPicClick!("4988601467124"),
    "list",
  );

  console.log(JSON.stringify(out, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
