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
    const url = "https://apriloshop.fr/section-playstation-2/real-madrid-club-football-ps2";
    console.log("Querying", url);
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    console.log("Status:", res.status);
    const html = res.data;

    // Check if there is JSON-LD
    const jsonLdMatches = html.match(
      /<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/gi,
    );
    console.log(
      "Found JSON-LD blocks:",
      jsonLdMatches ? jsonLdMatches.length : 0,
    );
    if (jsonLdMatches) {
      for (const block of jsonLdMatches) {
        const jsonText = block
          .replace(/<script[^>]*>/i, "")
          .replace(/<\/script>/i, "")
          .trim();
        try {
          const parsed = JSON.parse(jsonText);
          console.log(
            "JSON-LD parsed object type:",
            parsed["@type"] || parsed.type,
          );
          if (parsed["@type"] === "ItemList" && parsed.itemListElement) {
            console.log("ItemList elements:", parsed.itemListElement.length);
            for (const item of parsed.itemListElement) {
              console.log("Item in list:", item.name || item.item?.name);
            }
          }
          if (parsed["@type"] === "Product") {
            console.log("Product JSON-LD:", JSON.stringify(parsed, null, 2));
          }
        } catch (e) {
          // ignore parsing error for other scripts
        }
      }
    }

    // Also look for HTML product item blocks (typical Prestashop 1.7+ has article tags with class="product-miniature")
    const articleBlocks = html.match(
      /<article[^>]*class="[^"]*product-miniature[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
    );
    console.log(
      "Found article blocks:",
      articleBlocks ? articleBlocks.length : 0,
    );
    if (articleBlocks) {
      for (let i = 0; i < articleBlocks.length; i++) {
        const block = articleBlocks[i];
        const titleMatch = block.match(
          /class="[^"]*product-title[^"]*"[^>]*>\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
        );
        const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i);
        console.log(`Article ${i + 1}:`);
        console.log(
          "  Title:",
          titleMatch ? titleMatch[1].trim() : "Not found",
        );
        console.log("  Image:", imgMatch ? imgMatch[1].trim() : "Not found");
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
