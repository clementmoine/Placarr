import { Item } from "@prisma/client";

// DataForSEO : 1000 requests
export class DataForSEO {
  name = "DataForSEO";
  url = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
  api_key = process.env.DATA_FOR_SEO_API_KEY || "";

  async search(query: string): Promise<Item["name"][] | undefined> {
    return (
      fetch(this.url, {
        body: JSON.stringify([
          {
            keyword: query,
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
            const products = response.tasks[0].result.flatMap(
              (result: { items: { title: string }[] }) =>
                result.items?.map((item) => item?.title).filter(Boolean),
            );

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
