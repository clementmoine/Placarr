import { Item } from "@prisma/client";
import axios from "axios";

// Scale Serp : 100 requests / month
export class ScaleSerp {
  name = "Scale Serp";
  url = "https://api.scaleserp.com";
  api_key = process.env.SCALE_SERP_API_KEY || "";

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
        // Check the response
        .then((response) => {
          if (!response?.request_info?.success) {
            return Promise.reject("Request failed");
          }

          return response;
        })
        // Check the credits
        .then((response) => {
          if (response?.account_info?.topup_credits_remaining === 0) {
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

    const url = new URL(`${this.url}/search`);

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
          if (!response?.request_info?.success) {
            return Promise.reject("Request failed");
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
