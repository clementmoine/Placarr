import { fetchFromFreakxy } from "../src/services/providers/freakxy";
import { fetchFromApriloshop } from "../src/services/providers/apriloshop";

async function main() {
  console.log("Testing scrapers...");
  const [freakxy, aprilo] = await Promise.all([
    fetchFromFreakxy("0023272327521"),
    fetchFromApriloshop("0023272327521"),
  ]);
  console.log("Freakxy result:", JSON.stringify(freakxy, null, 2));
  console.log("Apriloshop result:", JSON.stringify(aprilo, null, 2));
}

main().catch(console.error);
