import { describe, it } from "vitest";
import { fetchPricesFromSmartoys } from "@/services/providers/smartoys";

describe("repro smartoys price fetch", () => {
  it("parses prices for the star wars xbox barcode and rejects bogus ones", async () => {
    for (const code of [
      "023272327521",
      "23272327521",
      "00000000000",
      "99999999999",
      "0000000000000",
    ]) {
      const res = await fetchPricesFromSmartoys(code);
      console.log(`\n[${code}] ->`, JSON.stringify(res));
    }
  }, 120000);
});
