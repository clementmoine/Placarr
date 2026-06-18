import axios from "axios";

import { pingIGDB } from "@/services/igdb";
import { pingLeDenicheur } from "@/services/leDenicheur";
import { pingSteamGridDB } from "@/services/steamGridDb";

export interface ProviderHealthStatus {
  name: string;
  type: "metadata";
  configured: boolean;
  status: "up" | "down" | "unconfigured";
  latency: number | null;
  error: string | null;
  credits: null;
}

export interface ProviderHealthCheck {
  providerId: string;
  run: () => Promise<ProviderHealthStatus>;
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
    if (timeoutId) clearTimeout(timeoutId);
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
      validateStatus: () => true,
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

export const providerHealthChecks: ProviderHealthCheck[] = [
  {
    providerId: "deezer",
    async run() {
      const name = "Deezer";
      const start = Date.now();
      const isUp = await pingUrl("https://api.deezer.com/infos");
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    },
  },
  {
    providerId: "openlibrary",
    async run() {
      const name = "Open Library";
      const start = Date.now();
      const isUp = await pingUrl("https://openlibrary.org");
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    },
  },
  {
    providerId: "boardgamegeek",
    async run() {
      const name = "BoardGameGeek";
      const token = process.env.BGG_API_TOKEN || "";
      if (!token) {
        return {
          name,
          type: "metadata",
          configured: false,
          status: "unconfigured",
          latency: null,
          error: "BGG_API_TOKEN missing",
          credits: null,
        };
      }
      const start = Date.now();
      const isUp = await pingUrl(
        "https://boardgamegeek.com/xmlapi2/search?query=test&type=boardgame",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "Placarr/1.0 (+https://github.com/clementmoine/Placarr)",
            Accept: "application/xml,text/xml,*/*",
          },
        },
      );
      return {
        name,
        type: "metadata",
        configured: Boolean(token),
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable or invalid token",
        credits: null,
      };
    },
  },
  {
    providerId: "chasseauxlivres",
    async run() {
      const name = "Chasse aux Livres";
      const start = Date.now();
      const isUp = await pingUrl("https://www.chasse-aux-livres.fr");
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    },
  },
  {
    providerId: "ledenicheur",
    async run() {
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
    },
  },
  {
    providerId: "tmdb",
    async run() {
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
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable or invalid key",
        credits: null,
      };
    },
  },
  {
    providerId: "omdb",
    async run() {
      const name = "OMDb";
      const key = process.env.OMDB_API_KEY || "";
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
      const isUp = await pingUrl(`https://www.omdbapi.com/?apikey=${key}&i=tt0111161`);
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable or invalid key",
        credits: null,
      };
    },
  },
  {
    providerId: "rawg",
    async run() {
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
      const isUp = await pingUrl(`https://api.rawg.io/api/platforms?key=${key}`);
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable or invalid key",
        credits: null,
      };
    },
  },
  {
    providerId: "screenscraper",
    async run() {
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
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable or invalid credentials",
        credits: null,
      };
    },
  },
  {
    providerId: "igdb",
    async run() {
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
    },
  },
  {
    providerId: "steam",
    async run() {
      const name = "Steam";
      const start = Date.now();
      try {
        await fetchWithTimeout(
          axios.get("https://store.steampowered.com/api/storesearch/", {
            params: { term: "Hades", cc: "fr", l: "french" },
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
    },
  },
  {
    providerId: "howlongtobeat",
    async run() {
      const name = "How Long to Beat";
      const start = Date.now();
      const isUp = await pingUrl("https://howlongtobeat.com");
      return {
        name,
        type: "metadata",
        configured: true,
        status: isUp ? "up" : "down",
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
        credits: null,
      };
    },
  },
  {
    providerId: "steamgriddb",
    async run() {
      const name = "SteamGridDB";
      const key =
        process.env.STEAMGRIDDB_API_KEY || process.env.STEAM_GRID_DB_API_KEY || "";
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
    },
  },
];
