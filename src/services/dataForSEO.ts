import { Item } from "@prisma/client";

// DataForSEO : 1000 requests
export class DataForSEO {
  name = "DataForSEO";
  url = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
  api_key = process.env.DATA_FOR_SEO_API_KEY || "";

  /**
   * Search an item from the GTIN
   * @param {string} barcode - Global Trade Item Number
   * @returns {Promise<Partial<Item> | undefined>}
   */
  async search(barcode: string): Promise<Partial<Item> | undefined> {
    return (
      fetch(this.url, {
        body: JSON.stringify([
          {
            keyword: `${barcode} site:fnac.com OR site:e.leclerc OR site:auchan.fr OR site:cultura.com OR site:decitre.fr OR site:amazon.fr`,
            location_code: "2250",
            language_code: "fr",
            device: "desktop",
            os: "windows",
            depth: 100,
            group_organic_results: true,
            load_async_ai_overview: false,
          },
        ]),
        method: "POST",
        headers: {
          Authorization: `Basic ${this.api_key}`,
          "Content-Type": "application/json",
        },
      })
        // Get JSON response
        .then((response) => response.json())
        // Check the response
        .then((response) => {
          if (response?.status_message !== "Ok.") {
            return Promise.reject("Something went wrong");
          }

          return response;
        })
        // Serialize the item
        .then((response) => {
          if (response?.tasks?.[0]?.result) {
            const product = response.tasks[0].result.reduce(
              (
                acc: { title: string } | undefined,
                result: { items: { title: string }[] },
              ) => {
                if (!acc) {
                  acc = result.items?.find((item) => item?.title?.length);
                }

                return acc;
              },
              undefined,
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
