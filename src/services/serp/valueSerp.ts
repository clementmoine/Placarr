import { Item } from "@prisma/client";

// Value Serp : 100 requests / month
export class ValueSerp {
  name = "Value Serp";
  url = "https://api.valueserp.com";
  api_key = process.env.VALUE_SERP_API_KEY || "";

  // Check remaining credits
  available(): Promise<boolean> {
    const url = new URL(`${this.url}/account`);

    url.search = new URLSearchParams({
      api_key: this.api_key,
    }).toString();

    return (
      fetch(url)
        // Get JSON response
        .then((response) => response.json())
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

  /**
   * Search an item from the GTIN
   * @param {string} barcode - Global Trade Item Number
   * @returns {Promise<Partial<Item> | undefined>}
   */
  async search(barcode: string): Promise<Partial<Item> | undefined> {
    if (await !this.available()) {
      return Promise.reject(`${this.name} unavailable`);
    }

    const url = new URL(`${this.url}/search`);

    url.search = new URLSearchParams({
      api_key: this.api_key,
      q: `${barcode} site:fnac.com OR site:e.leclerc OR site:auchan.fr OR site:cultura.com OR site:decitre.fr OR site:amazon.fr`,
      gl: "fr",
      hl: "fr",
      google_domain: "google.fr",
      include_ai_overview: "false",
      engine: "google",
      ads_optimized: "false",
      output: "json",
    }).toString();

    return (
      fetch(url)
        // Get JSON response
        .then((response) => response.json())
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
            const product = response.organic_results.find(
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
