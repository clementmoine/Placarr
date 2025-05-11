import { Item } from "@prisma/client";
import axios from "axios";

// AvesAPI : 1000 requests
export class AvesAPI {
  name = "AvesAPI";
  url = "https://api.avesapi.com";
  api_key = process.env.AVES_API_KEY || "";

  async search(query: string): Promise<Item["name"][] | undefined> {
    const url = new URL(`${this.url}/search`);

    url.search = new URLSearchParams({
      apikey: this.api_key,
      gl: "fr",
      hl: "fr",
      num: "10",
      type: "web",
      query: query,
      output: "json",
      device: "desktop",
      google_domain: "google.fr",
    }).toString();

    return (
      axios
        .get(url.toString())
        // Get JSON response
        .then((response) => response.data)
        // Check the response
        .then((response) => {
          if (response?.error || !response.request?.success) {
            return Promise.reject("Something went wrong");
          }

          return response;
        })
        // Serialize the item
        .then((response) => {
          if (response?.result?.organic_results?.length) {
            const products = response.result.organic_results
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
