import { fetchFromScreenScraper } from "@/services/metadataResolvers";

async function main() {
  console.log("Starting test...");
  const result = await fetchFromScreenScraper(
    "Amped Freestyle Snowboarding",
    "0659556980511",
    "Xbox Original",
  );
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
