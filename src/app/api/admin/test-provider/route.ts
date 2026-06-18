import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import axios from "axios";

import { fetchFromChasseAuxLivres } from "@/services/chasseAuxLivres";
import { fetchFromAchatMoinsCher } from "@/services/achatMoinsCher";
import { fetchPricesFromLeDenicheur } from "@/services/leDenicheur";
import { extractProductName } from "@/lib/productName";

// Import metadata resolvers
import {
  fetchFromDeezer,
  fetchCoverFromCoverProject,
  fetchFromScreenScraper,
  fetchFromRawg,
  fetchFromBGG,
  fetchFromOpenLibrary,
  fetchFromTMDB,
  confrontWithDatabase,
  getDatabaseSuggestions,
} from "@/services/metadata";
import { fetchFromIGDB } from "@/services/igdb";
import { fetchFromSteam } from "@/services/steam";
import { fetchFromHowLongToBeat } from "@/services/howLongToBeat";
import { fetchFromSteamGridDB } from "@/services/steamGridDb";

async function processScrapedNames(
  rawNames: string[] | undefined,
  type: string | null,
) {
  if (!rawNames) {
    return { rawNames: null, extractedName: null, suggestions: [] };
  }
  const name = extractProductName(rawNames);
  const confrontedName = name ? await confrontWithDatabase(name, type) : null;
  const dbSuggestions = name ? await getDatabaseSuggestions(name, type) : [];

  const suggestions = [
    confrontedName,
    ...dbSuggestions,
    name,
    ...rawNames,
  ].filter((s): s is string => !!s);
  const seen = new Set<string>();
  const uniqueSuggestions: string[] = [];
  for (const s of suggestions) {
    const norm = s.toLowerCase().trim();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      uniqueSuggestions.push(s.trim());
    }
  }

  return {
    rawNames,
    extractedName: confrontedName || name,
    suggestions: uniqueSuggestions.slice(0, 6),
  };
}

export async function POST(req: NextRequest) {
  // Ensure the user is an admin
  const adminCheck = await requireAdmin();
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  try {
    const body = await req.json();
    const { provider, query, type } = body;

    if (!provider || !query) {
      return NextResponse.json(
        { error: "Missing provider or query" },
        { status: 400 },
      );
    }

    let result: any = null;
    let providerName = "";

    // -------------------------------------------------------------
    // BARCODE RESOLVERS (Input: Barcode -> Output: Name list / Title)
    // -------------------------------------------------------------
    if (provider === "chasseauxlivres-barcode") {
      providerName = "Chasse aux Livres - Barcode";
      // Map shelf type to catalog: books, movies, musics, games, boardgames
      let catalog = "fr";
      if (type === "movies") catalog = "dvd";
      else if (type === "musics") catalog = "music";
      else if (type === "games") catalog = "videogames";
      else if (type === "boardgames") catalog = "toys";

      const resolvedNames = await fetchFromChasseAuxLivres(query, catalog);
      const suggestions: string[] = [];
      const matches: {
        cleanName: string;
        rawName: string;
        coverUrl?: string;
      }[] = [];
      let firstConfrontedName: string | null = null;

      for (const product of resolvedNames) {
        const name = product.name;
        const confrontedName = await confrontWithDatabase(name, type);

        matches.push({
          cleanName: confrontedName || name,
          rawName: name,
          coverUrl: product.coverUrl,
        });

        if (confrontedName) {
          if (!firstConfrontedName) firstConfrontedName = confrontedName;
          suggestions.push(confrontedName);
        }
        const dbSuggestions = await getDatabaseSuggestions(name, type);
        suggestions.push(...dbSuggestions);
        suggestions.push(name);
      }

      const seen = new Set<string>();
      const uniqueSuggestions: string[] = [];
      for (const s of suggestions) {
        const norm = s.toLowerCase().trim();
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          uniqueSuggestions.push(s.trim());
        }
      }

      result = {
        matches,
        rawNames: resolvedNames.map((rn) => rn.name),
        extractedName:
          firstConfrontedName ||
          (resolvedNames[0] ? resolvedNames[0].name : null),
        suggestions: uniqueSuggestions.slice(0, 6),
      };
    } else if (provider === "achatmoinscher-barcode") {
      providerName = "AchatMoinsCher - Barcode";
      const resolvedNames = await fetchFromAchatMoinsCher(query);
      const suggestions: string[] = [];
      const matches: {
        cleanName: string;
        rawName: string;
        coverUrl?: string | null;
      }[] = [];
      let firstConfrontedName: string | null = null;

      for (const product of resolvedNames) {
        const name = product.name;
        const confrontedName = await confrontWithDatabase(name, type);

        matches.push({
          cleanName: confrontedName || name,
          rawName: name,
          coverUrl: product.coverUrl,
        });

        if (confrontedName) {
          if (!firstConfrontedName) firstConfrontedName = confrontedName;
          suggestions.push(confrontedName);
        }
        const dbSuggestions = await getDatabaseSuggestions(name, type);
        suggestions.push(...dbSuggestions);
        suggestions.push(name);
      }

      const seen = new Set<string>();
      const uniqueSuggestions: string[] = [];
      for (const s of suggestions) {
        const norm = s.toLowerCase().trim();
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          uniqueSuggestions.push(s.trim());
        }
      }

      result = {
        matches,
        rawNames: resolvedNames.map((rn) => rn.name),
        extractedName:
          firstConfrontedName ||
          (resolvedNames[0] ? resolvedNames[0].name : null),
        suggestions: uniqueSuggestions.slice(0, 6),
      };
    } else if (provider === "ledenicheur-prices") {
      providerName = "LeDenicheur - Prices";
      const prices = await fetchPricesFromLeDenicheur(query);
      result = { prices };
    } else if (provider === "openlibrary-barcode") {
      providerName = "Open Library - Barcode";
      const response = await axios.get(
        `https://openlibrary.org/isbn/${query}.json`,
      );
      const title = response.data?.title;
      result = {
        rawNames: title ? [title] : [],
        extractedName: title,
        rawResponse: response.data,
      };
    } else if (provider === "deezer-barcode") {
      providerName = "Deezer - Barcode";
      const response = await axios.get(
        `https://api.deezer.com/album/upc:${query}`,
      );
      const album = response.data;
      if (album && album.title && !album.error) {
        const artistName = album.artist?.name || "";
        const title = artistName
          ? `${artistName} - ${album.title}`
          : album.title;
        result = {
          rawNames: [title],
          extractedName: title,
          rawResponse: album,
        };
      } else {
        result = { error: album.error?.message || "Not found in Deezer" };
      }
    } else if (provider === "screenscraper-barcode") {
      providerName = "ScreenScraper - Barcode";
      const devId = process.env.SCREENSCRAPER_DEV_ID;
      const devPass = process.env.SCREENSCRAPER_DEV_PASSWORD;
      if (!devId || !devPass) {
        return NextResponse.json(
          { error: "ScreenScraper Dev ID/Password missing in environment" },
          { status: 400 },
        );
      }
      const ssUser = process.env.SCREENSCRAPER_USER || "";
      const ssPass = process.env.SCREENSCRAPER_PASSWORD || "";
      const res = await axios.get(
        "https://api.screenscraper.fr/api2/jeuInfos.php",
        {
          params: {
            devid: devId,
            devpassword: devPass,
            softname: "Placarr",
            output: "json",
            ...(ssUser && ssPass ? { ssid: ssUser, sspassword: ssPass } : {}),
            romnom: query,
            systemeid: "0",
            romtype: "rom",
          },
          timeout: 8000,
        },
      );
      const jeu = res.data?.response?.jeu;
      if (jeu && jeu.id) {
        const noms: { region: string; text: string }[] = jeu.noms || [];
        const regionOrder = ["eu", "wor", "us"];
        let gameTitle: string | null = null;
        for (const region of regionOrder) {
          const found = noms.find((n) => n.region === region);
          if (found) {
            gameTitle = found.text;
            break;
          }
        }
        if (!gameTitle && noms.length > 0) gameTitle = noms[0].text;
        result = {
          rawNames: gameTitle ? [gameTitle] : [],
          extractedName: gameTitle,
          rawResponse: res.data,
        };
      } else {
        result = { error: "Not found in ScreenScraper", rawResponse: res.data };
      }

      // -------------------------------------------------------------
      // METADATA RESOLVERS (Input: Title/Query -> Output: Metadata Result)
      // -------------------------------------------------------------
    } else if (provider === "screenscraper-metadata") {
      providerName = "ScreenScraper - Metadata";
      const meta = await fetchFromScreenScraper(query);
      result = { metadata: meta };
    } else if (provider === "igdb-metadata") {
      providerName = "IGDB - Metadata";
      const meta = await fetchFromIGDB(query);
      result = { metadata: meta };
    } else if (provider === "steam-metadata") {
      providerName = "Steam - Metadata";
      const meta = await fetchFromSteam(query);
      result = { metadata: meta };
    } else if (provider === "hltb-metadata") {
      providerName = "How Long to Beat - Metadata";
      const meta = await fetchFromHowLongToBeat(query);
      result = { metadata: meta };
    } else if (provider === "rawg-metadata") {
      providerName = "RAWG - Metadata";
      const meta = await fetchFromRawg(query);
      result = { metadata: meta };
    } else if (provider === "steamgriddb-metadata") {
      providerName = "SteamGridDB - Artwork";
      const meta = await fetchFromSteamGridDB(query);
      result = { metadata: meta };
    } else if (provider === "tmdb-metadata") {
      providerName = "TMDB - Metadata";
      const meta = await fetchFromTMDB(query);
      result = { metadata: meta };
    } else if (provider === "openlibrary-metadata") {
      providerName = "Open Library - Metadata";
      const meta = await fetchFromOpenLibrary(query);
      result = { metadata: meta };
    } else if (provider === "deezer-metadata") {
      providerName = "Deezer - Metadata";
      const meta = await fetchFromDeezer(query);
      result = { metadata: meta };
    } else if (provider === "bgg-metadata") {
      providerName = "BoardGameGeek - Metadata";
      const meta = await fetchFromBGG(query);
      result = { metadata: meta };
    } else if (provider === "coverproject-metadata") {
      providerName = "The Cover Project - Covers";
      const platformName = type === "games" ? "Nintendo Switch" : "";
      const coverUrl = await fetchCoverFromCoverProject(query, platformName);
      result = { coverUrl };
    } else {
      return NextResponse.json(
        { error: `Unknown provider: ${provider}` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      provider: providerName,
      query,
      result,
    });
  } catch (error: any) {
    console.error("[TestProvider] Error running provider test:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An error occurred during testing",
        details: error.response?.data || null,
      },
      { status: 500 },
    );
  }
}
