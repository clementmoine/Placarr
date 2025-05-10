import { Item } from "@prisma/client";

// AvesAPI : 1000 requests
export class AvesAPI {
  name = "AvesAPI";
  url = "https://api.avesapi.com";
  api_key = process.env.AVES_API_KEY || "";

  /**
   * Search an item from the GTIN
   * @param {string} barcode - Global Trade Item Number
   * @returns {Promise<Partial<Item> | undefined>}
   */
  async search(barcode: string): Promise<Partial<Item> | undefined> {
    const url = new URL(`${this.url}/search`);

    url.search = new URLSearchParams({
      apikey: this.api_key,
      gl: "fr",
      hl: "fr",
      num: "10",
      type: "web",
      query: `${barcode} site:fnac.com OR site:e.leclerc OR site:auchan.fr OR site:cultura.com OR site:decitre.fr OR site:amazon.fr`,
      output: "json",
      device: "desktop",
      google_domain: "google.fr",
    }).toString();

    return (
      fetch(url)
        // Get JSON response
        .then((response) => response.json())
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
            const product = response.result.organic_results.find(
              (product: { title: string }) => product?.title?.length,
            );

            if (product) {
              return {
                name: product.title,
                barcode,
              };
            }
          }
        })
        .catch(() => {
          return undefined;
        })
    );
  }
}
