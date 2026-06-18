import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import axios from "axios";

import { ValueSerp } from "@/services/serp/valueSerp";
import { ScaleSerp } from "@/services/serp/scaleSerp";
import { SerpWow } from "@/services/serp/serpWow";
import { SerpAPI } from "@/services/serp/serpAPI";
import { OmkarDDG } from "@/services/serp/omkarDDG";
import { pingIGDB } from "@/services/igdb";
import { pingLeDenicheur } from "@/services/leDenicheur";
import { pingSteamGridDB } from "@/services/steamGridDb";

interface ApiStatus {
  name: string;
  type: "serp" | "metadata";
  configured: boolean;
  status: "up" | "down" | "unconfigured";
  latency: number | null;
  error: string | null;
  credits: { remaining: number; limit: number } | null;
}

async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 4000,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

async function pingUrl(
  url: string,
  options: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await axios({
      url,
      method: "GET",
      timeout: 5000,
      validateStatus: () => true, // Treat any status code as contactable
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const checks: Promise<ApiStatus>[] = [
    // 1. Value Serp
    (async (): Promise<ApiStatus> => {
      const name = "Value Serp";
      const key = process.env.VALUE_SERP_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const provider = new ValueSerp();
      const start = Date.now();
      try {
        const credits = await fetchWithTimeout(provider.getCredits());
        const latency = Date.now() - start;
        if (credits) {
          return {
            name,
            type: "serp",
            configured: true,
            status: "up",
            latency,
            error: null,
            credits,
          };
        } else {
          const isUp = await pingUrl(provider.url);
          return {
            name,
            type: "serp",
            configured: true,
            status: isUp ? "up" : "down",
            latency: Date.now() - start,
            error:
              "Failed to fetch account info (invalid API key or quota exceeded)",
            credits: null,
          };
        }
      } catch (err: unknown) {
        const isUp = await pingUrl(provider.url);
        const errMsg = err instanceof Error ? err.message : "Connection failed";
        return {
          name,
          type: "serp",
          configured: true,
          status: isUp ? "up" : "down",
          latency: Date.now() - start,
          error: errMsg,
          credits: null,
        };
      }
    })(),

    // 2. Scale Serp
    (async (): Promise<ApiStatus> => {
      const name = "Scale Serp";
      const key = process.env.SCALE_SERP_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const provider = new ScaleSerp();
      const start = Date.now();
      try {
        const credits = await fetchWithTimeout(provider.getCredits());
        const latency = Date.now() - start;
        if (credits) {
          return {
            name,
            type: "serp",
            configured: true,
            status: "up",
            latency,
            error: null,
            credits,
          };
        } else {
          const isUp = await pingUrl(provider.url);
          return {
            name,
            type: "serp",
            configured: true,
            status: isUp ? "up" : "down",
            latency: Date.now() - start,
            error:
              "Failed to fetch account info (invalid API key or quota exceeded)",
            credits: null,
          };
        }
      } catch (err: unknown) {
        const isUp = await pingUrl(provider.url);
        const errMsg = err instanceof Error ? err.message : "Connection failed";
        return {
          name,
          type: "serp",
          configured: true,
          status: isUp ? "up" : "down",
          latency: Date.now() - start,
          error: errMsg,
          credits: null,
        };
      }
    })(),

    // 3. Serp Wow
    (async (): Promise<ApiStatus> => {
      const name = "Serp Wow";
      const key = process.env.SERP_WOW_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const provider = new SerpWow();
      const start = Date.now();
      try {
        const credits = await fetchWithTimeout(provider.getCredits());
        const latency = Date.now() - start;
        if (credits) {
          return {
            name,
            type: "serp",
            configured: true,
            status: "up",
            latency,
            error: null,
            credits,
          };
        } else {
          const isUp = await pingUrl(provider.url);
          return {
            name,
            type: "serp",
            configured: true,
            status: isUp ? "up" : "down",
            latency: Date.now() - start,
            error:
              "Failed to fetch account info (invalid API key or quota exceeded)",
            credits: null,
          };
        }
      } catch (err: unknown) {
        const isUp = await pingUrl(provider.url);
        const errMsg = err instanceof Error ? err.message : "Connection failed";
        return {
          name,
          type: "serp",
          configured: true,
          status: isUp ? "up" : "down",
          latency: Date.now() - start,
          error: errMsg,
          credits: null,
        };
      }
    })(),

    // 4. Serp API
    (async (): Promise<ApiStatus> => {
      const name = "Serp API";
      const key = process.env.SERP_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const provider = new SerpAPI();
      const start = Date.now();
      try {
        const credits = await fetchWithTimeout(provider.getCredits());
        const latency = Date.now() - start;
        if (credits) {
          return {
            name,
            type: "serp",
            configured: true,
            status: "up",
            latency,
            error: null,
            credits,
          };
        } else {
          const isUp = await pingUrl(provider.url);
          return {
            name,
            type: "serp",
            configured: true,
            status: isUp ? "up" : "down",
            latency: Date.now() - start,
            error:
              "Failed to fetch account info (invalid API key or quota exceeded)",
            credits: null,
          };
        }
      } catch (err: unknown) {
        const isUp = await pingUrl(provider.url);
        const errMsg = err instanceof Error ? err.message : "Connection failed";
        return {
          name,
          type: "serp",
          configured: true,
          status: isUp ? "up" : "down",
          latency: Date.now() - start,
          error: errMsg,
          credits: null,
        };
      }
    })(),

    // 5. AvesAPI
    (async (): Promise<ApiStatus> => {
      const name = "AvesAPI";
      const key = process.env.AVES_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const start = Date.now();
      const url = `https://api.avesapi.com/search?apikey=${key}&query=test&limit=1`;
      const isUp = await pingUrl(url);
      const latency = Date.now() - start;
      return {
        name,
        type: "serp",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 6. DataForSEO
    (async (): Promise<ApiStatus> => {
      const name = "DataForSEO";
      const key = process.env.DATA_FOR_SEO_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key/credentials missing",
          credits: null,
        };
      }
      const start = Date.now();
      const isUp = await pingUrl("https://api.dataforseo.com", {
        headers: { Authorization: `Basic ${key}` },
      });
      const latency = Date.now() - start;
      return {
        name,
        type: "serp",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 7. DuckDuckGo Scraper (Omkar)
    (async (): Promise<ApiStatus> => {
      const name = "DuckDuckGo Scraper (Omkar)";
      const key = process.env.OMKAR_DDG_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "serp",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const start = Date.now();
      const provider = new OmkarDDG();
      const isUp = await pingUrl(provider.url);
      const latency = Date.now() - start;
      return {
        name,
        type: "serp",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 8. Deezer
    (async (): Promise<ApiStatus> => {
      const name = "Deezer";
      const start = Date.now();
      const isUp = await pingUrl("https://api.deezer.com/infos");
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 9. Open Library
    (async (): Promise<ApiStatus> => {
      const name = "Open Library";
      const start = Date.now();
      const isUp = await pingUrl("https://openlibrary.org");
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 10. BoardGameGeek
    (async (): Promise<ApiStatus> => {
      const name = "BoardGameGeek";
      const start = Date.now();
      const isUp = await pingUrl(
        "https://boardgamegeek.com/xmlapi2/search?query=test&type=boardgame",
      );
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 11. Chasse aux Livres
    (async (): Promise<ApiStatus> => {
      const name = "Chasse aux Livres";
      const start = Date.now();
      const isUp = await pingUrl("https://www.chasse-aux-livres.fr");
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 12. TMDB
    (async (): Promise<ApiStatus> => {
      const name = "LeDenicheur";
      const result = await pingLeDenicheur();
      return {
        name,
        type: "metadata",
        configured: true,
        status: result.ok ? "up" : "down",
        latency: result.latency,
        error: result.error ?? null,
        credits: null,
      };
    })(),

    // 13. TMDB
    (async (): Promise<ApiStatus> => {
      const name = "TMDB";
      const key = process.env.TMDB_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "metadata",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const start = Date.now();
      const isUp = await pingUrl(
        `https://api.themoviedb.org/3/configuration?api_key=${key}`,
      );
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable or invalid key",
        credits: null,
      };
    })(),

    // 13. RAWG
    (async (): Promise<ApiStatus> => {
      const name = "RAWG";
      const key = process.env.RAWG_API_KEY || "";
      if (!key) {
        return {
          name,
          type: "metadata",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "API key missing",
          credits: null,
        };
      }
      const start = Date.now();
      const isUp = await pingUrl(
        `https://api.rawg.io/api/platforms?key=${key}`,
      );
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable or invalid key",
        credits: null,
      };
    })(),

    // 14. ScreenScraper
    (async (): Promise<ApiStatus> => {
      const name = "ScreenScraper";
      const devId = process.env.SCREENSCRAPER_DEV_ID || "";
      const devPass = process.env.SCREENSCRAPER_DEV_PASSWORD || "";
      if (!devId || !devPass) {
        return {
          name,
          type: "metadata",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "SCREENSCRAPER_DEV_ID / SCREENSCRAPER_DEV_PASSWORD missing",
          credits: null,
        };
      }
      const start = Date.now();
      const isUp = await pingUrl(
        `https://api.screenscraper.fr/api2/ssuserInfos.php?devid=${devId}&devpassword=${devPass}&softname=Placarr&output=json`,
      );
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable or invalid credentials",
        credits: null,
      };
    })(),

    // 15. IGDB
    (async (): Promise<ApiStatus> => {
      const name = "IGDB";
      const clientId = process.env.IGDB_CLIENT_ID || "";
      const clientSecret = process.env.IGDB_CLIENT_SECRET || "";
      if (!clientId || !clientSecret) {
        return {
          name,
          type: "metadata",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "IGDB_CLIENT_ID / IGDB_CLIENT_SECRET missing",
          credits: null,
        };
      }
      const result = await pingIGDB();
      return {
        name,
        type: "metadata",
        configured: true,
        status: result.ok ? "up" : "down",
        latency: result.latency,
        error: result.error ?? null,
        credits: null,
      };
    })(),

    // 16. Steam Store
    (async (): Promise<ApiStatus> => {
      const name = "Steam";
      const start = Date.now();
      try {
        await fetchWithTimeout(
          axios.get("https://store.steampowered.com/api/storesearch/", {
            params: {
              term: "Hades",
              cc: "fr",
              l: "french",
            },
            timeout: 4000,
          }),
        );
        return {
          name,
          type: "metadata",
          configured: true,
          status: "up",
          latency: Date.now() - start,
          error: null,
          credits: null,
        };
      } catch (err: any) {
        return {
          name,
          type: "metadata",
          configured: true,
          status: "down",
          latency: Date.now() - start,
          error: err.message || "Steam Store unreachable",
          credits: null,
        };
      }
    })(),

    // 17. How Long to Beat
    (async (): Promise<ApiStatus> => {
      const name = "How Long to Beat";
      const start = Date.now();
      const isUp = await pingUrl("https://howlongtobeat.com");
      const latency = Date.now() - start;
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    })(),

    // 18. SteamGridDB
    (async (): Promise<ApiStatus> => {
      const name = "SteamGridDB";
      const key =
        process.env.STEAMGRIDDB_API_KEY ||
        process.env.STEAM_GRID_DB_API_KEY ||
        "";
      if (!key) {
        return {
          name,
          type: "metadata",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "STEAMGRIDDB_API_KEY missing",
          credits: null,
        };
      }
      const result = await pingSteamGridDB();
      return {
        name,
        type: "metadata",
        configured: true,
        status: result.ok ? "up" : "down",
        latency: result.latency,
        error: result.error ?? null,
        credits: null,
      };
    })(),
  ];

  const results = await Promise.all(checks);
  return NextResponse.json(results);
}
