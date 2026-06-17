const axios = require("axios");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function test() {
  try {
    const url = "https://www.freakxy.fr/catalogsearch/result/?q=5024866326963";
    console.log("Querying", url);
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    console.log("Status:", res.status);
    const html = res.data;

    // Look for product list/grid items
    // Magento 2 usually has class="product-item" or similar.
    // Let's print some portions or regex matches.
    const productItems = html.match(
      /<li class="item product product-item">([\s\S]*?)<\/li>/gi,
    );
    console.log(
      "Found product item blocks:",
      productItems ? productItems.length : 0,
    );

    if (productItems) {
      for (let i = 0; i < productItems.length; i++) {
        const item = productItems[i];
        const titleMatch = item.match(
          /class="product-item-link"[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
        );
        const imgMatch =
          item.match(
            /<img[^>]*class="product-image-photo"[^>]*src="([^"]+)"/i,
          ) ||
          item.match(/<img[^>]*src="([^"]+)"[^>]*class="product-image-photo"/i);
        console.log(`Product ${i + 1}:`);
        console.log(
          "  Title:",
          titleMatch ? titleMatch[1].trim() : "Not found",
        );
        console.log("  Image:", imgMatch ? imgMatch[1].trim() : "Not found");
      }
    } else {
      // Print first 2000 chars of body or look for other product patterns
      console.log("HTML length:", html.length);
      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      console.log("Page Title:", titleMatch ? titleMatch[1].trim() : "None");
      // Let's search for "product-item" in the text
      const idx = html.indexOf("product-item");
      if (idx !== -1) {
        console.log(
          "Found product-item at index",
          idx,
          ". Snippet:",
          html.substring(idx - 100, idx + 400),
        );
      } else {
        console.log(
          "No product-item found. Search for catalogsearch results snippet:",
        );
        const contentIdx = html.indexOf("columns");
        if (contentIdx !== -1) {
          console.log(html.substring(contentIdx, contentIdx + 1000));
        }
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
