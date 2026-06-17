import { fetchMetadataFromPriceCharting } from "../src/services/priceCharting";
import { fetchFromChasseAuxLivres } from "../src/services/chasseAuxLivres";
import { fetchFromAchatMoinsCher } from "../src/services/achatMoinsCher";
import { fetchFromFreakxy } from "../src/services/freakxy";
import { fetchFromApriloshop } from "../src/services/apriloshop";
import { fetchFromPicClick } from "../src/services/picclick";

async function runTest(barcode: string) {
  console.log(`\n===================================`);
  console.log(`Testing barcode lookup for ${barcode}...`);
  console.log(`===================================`);

  const [pc, cal, amc, freakxy, aprilo, picclick] = await Promise.allSettled([
    fetchMetadataFromPriceCharting(barcode),
    fetchFromChasseAuxLivres(barcode, "dvd"),
    fetchFromAchatMoinsCher(barcode),
    fetchFromFreakxy(barcode),
    fetchFromApriloshop(barcode),
    fetchFromPicClick(barcode),
  ]);

  console.log("PriceCharting:", JSON.stringify(pc, null, 2));
  console.log("Chasse aux Livres:", JSON.stringify(cal, null, 2));
  console.log("AchatMoinsCher:", JSON.stringify(amc, null, 2));
  console.log("Freakxy:", JSON.stringify(freakxy, null, 2));
  console.log("Apriloshop:", JSON.stringify(aprilo, null, 2));
  console.log("PicClick:", JSON.stringify(picclick, null, 2));
}

async function main() {
  await runTest("5024866326963");
}

main().catch(console.error);
