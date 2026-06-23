import { fetchFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { fetchFromChasseAuxLivres } from "@/services/providers/chasseauxlivres";
import { fetchFromDiscogs } from "@/services/providers/discogs";
import { fetchFromFreakxy } from "@/services/providers/freakxy";
import { fetchFromHowLongToBeat } from "@/services/providers/howlongtobeat";
import { fetchFromIGDB } from "@/services/providers/igdb";
import { fetchPricesFromLeDenicheur } from "@/services/providers/ledenicheur";
import {
  fetchFromBGG,
  fetchFromDeezer,
  fetchFromOMDb,
  fetchFromOpenLibrary,
  fetchFromRawg,
  fetchFromScreenScraper,
  fetchFromTMDB,
} from "@/services/metadataResolvers";
import { fetchCoverFromCoverProject } from "@/services/providers/coverproject";
import { fetchFromMusicBrainz } from "@/services/providers/musicbrainz";
import { fetchFromPicClick } from "@/services/providers/picclick";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchFromSteam } from "@/services/providers/steam";
import { fetchFromSteamGridDB } from "@/services/providers/steamgriddb";

type Mode = "meta" | "list" | "raw";

const out: Record<string, unknown> = {};

function summarizeMeta(value: any) {
  return {
    hasResult: Boolean(value),
    keys: Object.keys(value || {}),
    attachments: value?.attachments?.length || 0,
    facts: value?.facts?.length || 0,
    title: value?.title || null,
  };
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
  await safe("igdb", () => fetchFromIGDB("Hades"));
  await safe("rawg", () => fetchFromRawg("Hades"));
  await safe("tmdb", () => fetchFromTMDB("Aladdin"));
  await safe("omdb", () => fetchFromOMDb("Aladdin"));
  await safe("screenscraper", () =>
    fetchFromScreenScraper("The Legend of Zelda Skyward Sword"),
  );
  await safe("steam", () => fetchFromSteam("Hades"));
  await safe("howlongtobeat", () =>
    fetchFromHowLongToBeat("The Legend of Zelda Skyward Sword", "wii"),
  );
  await safe("steamgriddb", () => fetchFromSteamGridDB("Hades"));
  await safe("openlibrary", () =>
    fetchFromOpenLibrary("1984", "9782070368228"),
  );
  await safe("deezer", () =>
    fetchFromDeezer("Daft Punk Random Access Memories"),
  );
  await safe("musicbrainz", () => fetchFromMusicBrainz("886443927087"), "raw");
  await safe("discogs", () => fetchFromDiscogs("886443927087"), "raw");
  await safe("bgg", () => fetchFromBGG("Catan"));
  await safe(
    "coverproject",
    () =>
      fetchCoverFromCoverProject(
        "The Legend of Zelda Skyward Sword",
        "Nintendo Wii",
      ),
    "raw",
  );
  await safe(
    "pricecharting",
    () => fetchMetadataFromPriceCharting("0045496365226"),
    "raw",
  );
  await safe(
    "chasseauxlivres",
    () => fetchFromChasseAuxLivres("9782070368228", "fr"),
    "list",
  );
  await safe(
    "achatmoinscher",
    () => fetchFromAchatMoinsCher("9782070368228"),
    "list",
  );
  await safe(
    "ledenicheur",
    () => fetchPricesFromLeDenicheur("hades switch"),
    "raw",
  );
  await safe("freakxy", () => fetchFromFreakxy("5060004769360"), "list");
  await safe("picclick", () => fetchFromPicClick("4988601467124"), "list");

  console.log(JSON.stringify(out, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
