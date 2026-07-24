import { fetchFromFreakxy } from "../src/services/providers/freakxy";

async function main() {
  console.log("Testing scrapers...");
  const freakxy = await fetchFromFreakxy("0023272327521");
  console.log("Freakxy result:", JSON.stringify(freakxy, null, 2));
}

main().catch(console.error);
