import { describe, expect, it } from "vitest";

import { isCatalogTitleAnchorProvider } from "@/core/catalog/evidence";
import { compileResultForType } from "@/core/identify/evidence/compile";
import { buildProductEvidence } from "@/core/identify/evidence/parse";

describe("PriceCharting barcode catalogTitleAnchor", () => {
  it("treats PriceCharting as a catalog title anchor", () => {
    expect(isCatalogTitleAnchorProvider("PriceCharting")).toBe(true);
  });

  it("anchors a hardware-only PriceCharting barcode hit", async () => {
    const evidence = buildProductEvidence("PriceCharting", {
      name: "Game & Watch Super Mario Bros",
      coverUrl: "https://example.com/gw.jpg",
      platformKey: "gameandwatch",
    });
    expect(evidence?.catalogTitleAnchor).toBe(true);
    expect(evidence?.isCanonical).toBe(false);

    const result = await compileResultForType(
      "hardware",
      [
        {
          providerName: "PriceCharting",
          products: [
            {
              name: "Game & Watch Super Mario Bros",
              coverUrl: "https://example.com/gw.jpg",
              platformKey: "gameandwatch",
            },
          ],
        },
      ],
      "045496883041",
    );

    expect(result).not.toBeNull();
    expect(result?.cleanName).toMatch(/Game & Watch/i);
    expect(result?.platformKey).toBe("gameandwatch");
  });
});
