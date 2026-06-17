import { fetchFromScreenScraper } from "../src/services/metadata";

async function main() {
  console.log("=== CALLING SCREEN SCRAPER FOR WHEELMAN ===");
  const barcode = "5037930100970";
  const title = "Wheelman";
  const platform = "Xbox 360";

  console.log(`Searching with title="${title}", barcode="${barcode}", platform="${platform}"`);
  try {
    const res = await fetchFromScreenScraper(title, barcode, platform);
    console.log("Result:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

main().catch(console.error);
