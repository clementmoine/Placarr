import { fetchPricesFromPriceCharting } from "../src/services/priceCharting";

async function main() {
  const barcode = "0805529491427";
  const name = "Project Gotham Racing 2";
  const platform = "Xbox";

  console.log("=== PRICECHARTING TEST ===");
  console.log("Calling with isPal=false...");
  const resNTSC = await fetchPricesFromPriceCharting(barcode, name, platform, false, false);
  console.log("isPal=false result:", JSON.stringify(resNTSC, null, 2));

  console.log("\nCalling with isPal=true...");
  const resPAL = await fetchPricesFromPriceCharting(barcode, name, platform, true, false);
  console.log("isPal=true result:", JSON.stringify(resPAL, null, 2));
}

main().catch(console.error);
