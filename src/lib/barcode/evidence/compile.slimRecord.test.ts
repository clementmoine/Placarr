import { afterEach, describe, expect, it } from "vitest";

import { compileResultForType } from "./compile";

describe("compileResultForType — slim RECORD", () => {
  afterEach(() => {
    delete process.env.BARCODE_RECORD_SLIM;
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
    expect(result?.cleanName).toBe("Mario Kart");
    expect(result?.platformKey).toBe("wii");
  });
});
