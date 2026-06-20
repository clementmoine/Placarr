import { cleanCode } from "../src/lib/barcode/query";
import { resolveBarcode } from "../src/services/barcodeResolver";

async function main() {
  const barcode = cleanCode("023272327521");
  console.log("Cleaned barcode:", barcode);
  const res = await resolveBarcode(barcode, null, { refresh: true });
  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
