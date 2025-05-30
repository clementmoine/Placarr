import { Item } from "@prisma/client";
import axios from "axios";

// Serp API : 100 requests / month
export class SerpAPI {
  name = "Serp API";
  url = "https://serpapi.com";
  api_key = process.env.SERP_API_KEY || "";

  // Check remaining credits
  available(): Promise<boolean> {
    const url = new URL(`${this.url}/account`);

    url.search = new URLSearchParams({
      api_key: this.api_key,
    }).toString();

    return (
      axios
        .get(url.toString())
        // Get JSON response
        .then((response) => response.data)
        // Check the credits
        .then((response) => {
          if (response?.plan_searches_left === 0) {
            return Promise.reject("No remaining credits");
          }

          return true;
        })
        .catch(() => {
          return false;
        })
    );
  }

  async search(query: string): Promise<Item["name"][] | undefined> {
    if (await !this.available()) {
      return Promise.reject(`${this.name} unavailable`);
    }

    const url = new URL(`${this.url}/search.json`);

    url.search = new URLSearchParams({
      api_key: this.api_key,
      q: query,
      gl: "fr",
      hl: "fr",
      google_domain: "google.fr",
      include_ai_overview: "false",
      engine: "google",
      ads_optimized: "false",
      output: "json",
    }).toString();

    return (
      axios
        .get(url.toString())
        // Get JSON response
        .then((response) => response.data)
        // Check the response
        .then((response) => {
          if (response?.error) {
            return Promise.reject("Something went wrong");
          }

          return response;
        })
        // Serialize the item
        .then((response) => {
          if (response?.organic_results?.length) {
            const products = response?.organic_results
              .map((product: { title: string }) => product?.title)
              .filter(Boolean);

            if (products.length) {
              return products;
            }
          }
        })
        .catch(() => {
          return undefined;
        })
    );
  }
}
