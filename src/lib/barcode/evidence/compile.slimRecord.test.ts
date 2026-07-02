import { afterEach, describe, expect, it, vi } from "vitest";

import { compileAllBarcodeTypeResults } from "@/lib/barcode/lookup/sourceAssembly";
import { createEmptyBarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { compileResultForType } from "./compile";

const database = vi.hoisted(() => ({
  confrontWithDatabase: vi.fn(),
}));

vi.mock("@/services/metadata/database", () => ({
  confrontWithDatabase: database.confrontWithDatabase,
}));

describe("compileResultForType — slim RECORD", () => {
  afterEach(() => {
    delete process.env.BARCODE_RECORD_SLIM;
    database.confrontWithDatabase.mockReset();
  });

  it("ancre un hit PriceCharting quand le mode slim est actif", async () => {
    process.env.BARCODE_RECORD_SLIM = "1";

    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "PriceCharting",
          products: [{ name: "Mario Kart Wii", platformKey: "wii" }],
        },
      ],
      "0045496365226",
    );

    expect(result).not.toBeNull();
    expect(result?.cleanName).toBe("Mario Kart Wii");
    expect(result?.platformKey).toBe("wii");
  });

  it("ancre PriceCharting avant le filtre bruit marketplace (token contexte)", async () => {
    process.env.BARCODE_RECORD_SLIM = "1";

    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "PriceCharting",
          products: [{ name: "Mario Kart Wii CD-ROM" }],
        },
      ],
      "0045496365226",
    );

    expect(result).not.toBeNull();
  });

  it("ne consulte pas confrontWithDatabase en mode slim", async () => {
    process.env.BARCODE_RECORD_SLIM = "1";
    database.confrontWithDatabase.mockImplementation(
      () => new Promise(() => {}),
    );

    await compileAllBarcodeTypeResults({
      cleanedBarcode: "0045496365226",
      type: "games",
      payload: {
        ...createEmptyBarcodeLookupPayload(),
        pc: {
          title: "Mario Kart Wii",
          platform: "Wii",
          coverUrl: null,
          prices: null,
          ageRating: null,
        },
      },
    });

    expect(database.confrontWithDatabase).not.toHaveBeenCalled();
  });

  it("produit un résultat games depuis payload.pc en mode slim", async () => {
    process.env.BARCODE_RECORD_SLIM = "1";

    const typeResults = await compileAllBarcodeTypeResults({
      cleanedBarcode: "0045496365226",
      type: "games",
      payload: {
        ...createEmptyBarcodeLookupPayload(),
        pc: {
          title: "Mario Kart Wii",
          platform: "Wii",
          coverUrl: null,
          prices: null,
          ageRating: null,
        },
        ebay: [{ name: "Mario Kart Wii Jeu Nintendo", priceNew: 1999 }],
      },
    });

    expect(typeResults.games).not.toBeNull();
    expect(typeResults.games?.platformKey).toBe("wii");
    expect(typeResults.games?.cleanName).toBeTruthy();
  });
});
