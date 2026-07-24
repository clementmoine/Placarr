import { afterEach, describe, expect, it, vi } from "vitest";

import { compileAllBarcodeTypeResults } from "@/core/identify/lookup/sourceAssembly";
import { createEmptyBarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { compileResultForType } from "./compile";

const database = vi.hoisted(() => ({
  confrontWithDatabase: vi.fn(),
}));

vi.mock("@/core/enrich/database", () => ({
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
        },
        ebay: [{ name: "Mario Kart Wii Jeu Nintendo", priceNew: 1999 }],
      },
    });

    expect(typeResults.games).not.toBeNull();
    expect(typeResults.games?.platformKey).toBe("wii");
    expect(typeResults.games?.cleanName).toBeTruthy();
  });

  it("ancre le titre iCollect offline (catalogTitleAnchor) contre le consensus marketplace", async () => {
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "iCollect Everything",
          products: [{ name: "Mario Kart Wii", platformKey: "wii" }],
        },
        {
          providerName: "eBay",
          products: [
            { name: "Mario Kart", platformKey: "wii" },
            { name: "Mario Kart", platformKey: "wii" },
            { name: "Mario Kart", platformKey: "wii" },
          ],
        },
      ],
      "0045496365226",
    );

    expect(result).not.toBeNull();
    expect(result?.cleanName).toBe("Mario Kart Wii");
    expect(result?.platformKey).toBe("wii");
  });
});
