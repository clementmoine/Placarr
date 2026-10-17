import { describe, expect, it } from "vitest";

import {
  extractScanflipPageResultForTests,
  normalizeScanflipCardForTests,
} from "./client";

// Re-export test hooks — added below in client via test-only exports.
describe("scanflip client normalize", () => {
  it("keeps code, name and CDN face", () => {
    const card = normalizeScanflipCardForTests({
      id: "abc",
      slug: "ks-001-fr-hiruzen-sarutobi",
      code: "KS-001",
      name: "Hiruzen Sarutobi",
      version: "Le Professeur",
      imageCdn: "https://media.scanflip.fr/x/a.jpg",
      imageLowResCdn: "https://media.scanflip.fr/x/b.jpg",
      expansionName: "Konoha Shidō",
      rarity: { code: "C", name: "Common" },
      releaseDate: "!Date:2024-01-01T00:00:00.000Z",
    });
    expect(card).toMatchObject({
      code: "KS-001",
      name: "Hiruzen Sarutobi",
      rarityCode: "C",
      releaseDate: "2024-01-01",
      imageCdn: "https://media.scanflip.fr/x/a.jpg",
    });
  });

  it("reads telefunc ret.data pages", () => {
    const page = extractScanflipPageResultForTests({
      ret: {
        data: {
          page: 2,
          pageSize: 500,
          totalCount: 1000,
          data: [
            {
              id: "1",
              slug: "ldd-f000",
              code: "LDD-F000",
              name: "Dragon à Trois Cornes",
              imageCdn: "https://media.scanflip.fr/a",
            },
          ],
        },
      },
    });
    expect(page?.page).toBe(2);
    expect(page?.data[0]?.code).toBe("LDD-F000");
  });
});
