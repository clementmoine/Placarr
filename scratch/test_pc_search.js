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
    const url =
      "https://www.pricecharting.com/search-products?q=Freedom+Fighters";
    console.log("Querying", url);
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    console.log("Status:", res.status);
    const html = res.data;

    // Look for rows / table cells
    // Let's print out text that contains "/game/" or matches links
    console.log("HTML length:", html.length);

    // Find all links to games
    // E.g. href="/game/pal-gamecube/freedom-fighters"
    const regex = /href=\"\/game\/([^\"]+)\"/gi;
    let match;
    const matches = [];
    while ((match = regex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    console.log(
      "Found game links (unique):",
      Array.from(new Set(matches)).slice(0, 15),
    );
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
