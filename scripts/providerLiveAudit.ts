import axios from "axios";

import { fetchFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { fetchFromChasseAuxLivres } from "@/services/providers/chasseauxlivres";
import { fetchFromFreakxy } from "@/services/providers/freakxy";
import { fetchFromHowLongToBeat } from "@/services/providers/howlongtobeat";
import { fetchPricesFromLeDenicheur } from "@/services/providers/ledenicheur";
import { fetchFromMusicBrainz } from "@/services/providers/musicbrainz";
import { fetchFromPicClick } from "@/services/providers/picclick";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";
import { fetchFromSteam } from "@/services/providers/steam";
import { fetchFromDiscogs } from "@/services/providers/discogs";
import { createBGGResolver } from "@/services/providers/bgg";
import { createDeezerResolver } from "@/services/providers/deezer";
import { createOpenLibraryResolver } from "@/services/providers/openlibrary";

const fetchFromOpenLibrary = createOpenLibraryResolver();
const fetchFromDeezer = createDeezerResolver();
const fetchFromBGG = createBGGResolver({
  formatScore: (value, scale) => `${Math.round((value / scale) * 100)}/100`,
});

type AuditOutput = Record<string, unknown>;

const out: AuditOutput = {};

async function safe(name: string, fn: () => Promise<unknown>) {
  try {
    out[name] = await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out[name] = { error: message };
  }
}

async function run() {
  await safe("steam_raw", async () => {
    const search = await axios.get(
      "https://store.steampowered.com/api/storesearch/",
      {
        params: { term: "Hades", cc: "fr", l: "french" },
        timeout: 8000,
      },
    );
    const appId = search.data?.items?.[0]?.id;
    const details = appId
      ? await axios.get("https://store.steampowered.com/api/appdetails", {
          params: { appids: appId, l: "french", cc: "fr" },
          timeout: 8000,
        })
      : null;

    return {
      searchKeys: Object.keys(search.data || {}),
      searchFirstItemKeys: Object.keys(search.data?.items?.[0] || {}),
      appId,
      detailDataKeys: Object.keys(details?.data?.[String(appId)]?.data || {}),
    };
  });

  await safe("steam_mapped", async () => {
    const mapped = await fetchFromSteam("Hades");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      factsCount: mapped?.facts?.length || 0,
      attachmentsCount: mapped?.attachments?.length || 0,
    };
  });

  await safe("hltb_mapped", async () => {
    const mapped = await fetchFromHowLongToBeat(
      "The Legend of Zelda: Skyward Sword",
      "wii",
    );
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      factsCount: mapped?.facts?.length || 0,
      attachmentsCount: mapped?.attachments?.length || 0,
    };
  });

  await safe("musicbrainz_raw", async () => {
    const response = await axios.get("https://musicbrainz.org/ws/2/release/", {
      params: { query: "barcode:4988601467124", fmt: "json", limit: 1 },
      headers: { "User-Agent": "Placarr/1.0 (provider-audit)" },
      timeout: 8000,
    });
    return {
      keys: Object.keys(response.data || {}),
      releaseKeys: Object.keys(response.data?.releases?.[0] || {}),
    };
  });

  await safe("musicbrainz_mapped", async () => {
    const mapped = await fetchFromMusicBrainz("4988601467124");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
    };
  });

  await safe("discogs_mapped", async () => {
    const mapped = await fetchFromDiscogs("4988601467124");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
    };
  });

  await safe("openlibrary_raw", async () => {
    const response = await axios.get(
      "https://openlibrary.org/isbn/9782919603114.json",
      {
        timeout: 8000,
      },
    );
    return {
      keys: Object.keys(response.data || {}),
      hasDescription: Boolean(response.data?.description),
      hasSubjects: Array.isArray(response.data?.subjects),
    };
  });

  await safe("openlibrary_raw_known", async () => {
    const response = await axios.get(
      "https://openlibrary.org/isbn/9780140328721.json",
      {
        timeout: 8000,
      },
    );
    return {
      keys: Object.keys(response.data || {}),
      hasDescription: Boolean(response.data?.description),
      hasSubjects: Array.isArray(response.data?.subjects),
    };
  });

  await safe("openlibrary_mapped", async () => {
    const mapped = await fetchFromOpenLibrary("", "9782919603114");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      factsCount: mapped?.facts?.length || 0,
      aliasesCount: mapped?.aliases?.length || 0,
    };
  });

  await safe("openlibrary_mapped_known", async () => {
    const mapped = await fetchFromOpenLibrary(
      "Fantastic Mr. Fox",
      "9780140328721",
    );
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      factsCount: mapped?.facts?.length || 0,
      aliasesCount: mapped?.aliases?.length || 0,
    };
  });

  await safe("deezer_raw", async () => {
    const upcResponse = await axios.get(
      "https://api.deezer.com/album/upc:4988601467124",
      {
        timeout: 8000,
      },
    );
    const albumId = upcResponse.data?.id;
    const albumResponse = albumId
      ? await axios.get(`https://api.deezer.com/album/${albumId}`, {
          timeout: 8000,
        })
      : null;
    return {
      upcKeys: Object.keys(upcResponse.data || {}),
      albumKeys: Object.keys(albumResponse?.data || {}),
      firstTrackKeys: Object.keys(albumResponse?.data?.tracks?.data?.[0] || {}),
    };
  });

  await safe("deezer_mapped", async () => {
    const mapped = await fetchFromDeezer("", "4988601467124");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      attachmentsCount: mapped?.attachments?.length || 0,
    };
  });

  await safe("deezer_raw_by_name", async () => {
    const searchResponse = await axios.get(
      "https://api.deezer.com/search/album",
      {
        params: { q: "Daft Punk Random Access Memories" },
        timeout: 8000,
      },
    );
    const first = searchResponse.data?.data?.[0];
    const albumId = first?.id;
    const albumResponse = albumId
      ? await axios.get(`https://api.deezer.com/album/${albumId}`, {
          timeout: 8000,
        })
      : null;
    return {
      searchKeys: Object.keys(searchResponse.data || {}),
      searchFirstKeys: Object.keys(first || {}),
      albumKeys: Object.keys(albumResponse?.data || {}),
      firstTrackKeys: Object.keys(albumResponse?.data?.tracks?.data?.[0] || {}),
    };
  });

  await safe("deezer_mapped_by_name", async () => {
    const mapped = await fetchFromDeezer("Daft Punk Random Access Memories");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      attachmentsCount: mapped?.attachments?.length || 0,
    };
  });

  await safe("bgg_raw", async () => {
    const searchResponse = await axios.get(
      "https://boardgamegeek.com/xmlapi2/search?query=Catan&type=boardgame",
      {
        responseType: "text",
        timeout: 8000,
      },
    );
    const thingResponse = await axios.get(
      "https://boardgamegeek.com/xmlapi2/thing?id=13&stats=1",
      {
        responseType: "text",
        timeout: 8000,
      },
    );
    const xml = thingResponse.data || "";
    return {
      searchLength: String(searchResponse.data || "").length,
      hasRanks: xml.includes("<ranks>"),
      hasMechanics: xml.includes("boardgamemechanic"),
      hasCategories: xml.includes("boardgamecategory"),
      hasFamilies: xml.includes("boardgamefamily"),
      hasPolls: xml.includes("<poll "),
    };
  });

  await safe("bgg_raw_with_user_agent", async () => {
    const headers = { "User-Agent": "Placarr/1.0 (provider-audit)" };
    const searchResponse = await axios.get(
      "https://boardgamegeek.com/xmlapi2/search?query=Catan&type=boardgame",
      {
        responseType: "text",
        headers,
        timeout: 8000,
      },
    );
    const thingResponse = await axios.get(
      "https://boardgamegeek.com/xmlapi2/thing?id=13&stats=1",
      {
        responseType: "text",
        headers,
        timeout: 8000,
      },
    );
    const xml = thingResponse.data || "";
    return {
      searchLength: String(searchResponse.data || "").length,
      hasRanks: xml.includes("<ranks>"),
      hasMechanics: xml.includes("boardgamemechanic"),
      hasCategories: xml.includes("boardgamecategory"),
      hasFamilies: xml.includes("boardgamefamily"),
      hasPolls: xml.includes("<poll "),
    };
  });

  await safe("bgg_mapped", async () => {
    const mapped = await fetchFromBGG("Catan");
    return {
      hasResult: Boolean(mapped),
      keys: Object.keys(mapped || {}),
      factsCount: mapped?.facts?.length || 0,
      aliasesCount: mapped?.aliases?.length || 0,
    };
  });

  await safe("chasseauxlivres", async () => {
    const result = await fetchFromChasseAuxLivres("9782919603114", "fr");
    return {
      count: result.length,
      firstKeys: Object.keys(result[0] || {}),
      first: result[0] || null,
    };
  });

  await safe("achatmoinscher", async () => {
    const result = await fetchFromAchatMoinsCher("9782919603114");
    return {
      count: result.length,
      firstKeys: Object.keys(result[0] || {}),
      first: result[0] || null,
    };
  });

  await safe("ledenicheur", async () => {
    const result = await fetchPricesFromLeDenicheur("9782919603114");
    return {
      hasResult: Boolean(result),
      keys: Object.keys(result || {}),
      result,
    };
  });

  await safe("pricecharting", async () => {
    const result = await fetchMetadataFromPriceCharting("5060004769360");
    return {
      hasResult: Boolean(result),
      keys: Object.keys(result || {}),
      result,
    };
  });

  await safe("freakxy", async () => {
    const result = await fetchFromFreakxy("5060004769360");
    return {
      count: result.length,
      firstKeys: Object.keys(result[0] || {}),
      first: result[0] || null,
    };
  });

  await safe("picclick", async () => {
    const result = await fetchFromPicClick("4988601467124");
    return {
      count: result.length,
      firstKeys: Object.keys(result[0] || {}),
      first: result[0] || null,
    };
  });

  console.log(JSON.stringify(out, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
