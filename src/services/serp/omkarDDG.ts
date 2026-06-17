import { Item } from "@prisma/client";
import axios from "axios";

// Omkar Cloud DuckDuckGo Scraper : 100 requests / month free
export class OmkarDDG {
  name = "DuckDuckGo Scraper (Omkar)";
  url = "https://duckduckgo-scraper.omkar.cloud";
  api_key = process.env.OMKAR_DDG_API_KEY || "";

  async available(): Promise<boolean> {
    return !!this.api_key;
  }

  async getCredits(): Promise<{ remaining: number; limit: number } | null> {
    // Omkar Cloud doesn't expose a simple credit check API endpoint,
    // so we return null. The status page will ping the service URL instead.
    return null;
  }

  async search(query: string): Promise<Item["name"][] | undefined> {
    if (!(await this.available())) {
      return Promise.reject(`${this.name} unavailable (API key missing)`);
    }

    try {
      const response = await axios.get(`${this.url}/duckduckgo/search`, {
        params: {
          query: query,
          limit: 10,
        },
        headers: {
          "API-Key": this.api_key,
        },
        timeout: 5000,
      });

      const data = response.data;
      if (data && Array.isArray(data.results)) {
        const products = data.results
          .map((res: { title: string }) => res.title)
          .filter(Boolean);

        if (products.length > 0) {
          return products;
        }
      }
      return undefined;
    } catch (error) {
      console.error(`[${this.name}] Search failed:`, error);
      return undefined;
    }
  }
}
