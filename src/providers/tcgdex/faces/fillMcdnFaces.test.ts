import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { pokemonMcdnGalleryCodes } from "./mcdnGalleryCode";
import {
  pokemonMcdnCandidateUrls,
  pokemonMcdnCardNumber,
  pokemonMcdnCms2Url,
  pokemonMcdnCms3Url,
} from "./mcdnUrls";
import {
  fillMcdnFacesForSet,
  parseMcdnLocalIds,
} from "./fillMcdnFaces";

describe("pokemonMcdnGalleryCodes", () => {
  it("pads SV stems and keeps SWSH unpadded preference", () => {
    expect(pokemonMcdnGalleryCodes("sv8", {})).toEqual(
      expect.arrayContaining(["SV08", "SV8"]),
    );
    expect(pokemonMcdnGalleryCodes("swsh6", {})[0]).toBe("SWSH6");
  });

  it("honours curated aliases for 30th", () => {
    expect(pokemonMcdnGalleryCodes("30th", { "30th": "30TH" })[0]).toBe(
      "30TH",
    );
  });
});

describe("pokemonMcdnUrls", () => {
  it("builds cms3 then cms2 candidates with unpadded numbers", () => {
    expect(pokemonMcdnCardNumber("033")).toBe("33");
    expect(pokemonMcdnCms3Url("30TH", "fr", 33)).toContain(
      "/cms3/fr/img/cards/full/30TH/30TH_FR_33.png",
    );
    expect(pokemonMcdnCms2Url("SV08", "en", 1)).toContain(
      "/cms2/img/cards/web/SV08/SV08_EN_1.png",
    );
    expect(pokemonMcdnCandidateUrls("30TH", "fr", 33)[0]).toContain(
      "/cards/full/",
    );
    expect(pokemonMcdnCandidateUrls("30TH", "fr", 33)[1]).toContain(
      "/cards/web/",
    );
  });
});

describe("parseMcdnLocalIds", () => {
  it("expands inclusive ranges", () => {
    expect(parseMcdnLocalIds("1-3")).toEqual(["1", "2", "3"]);
  });
});

describe("fillMcdnFacesForSet", () => {
  it("writes art.mcdn.png preferring the first successful candidate URL", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-mcdn-"));
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...Array(600).fill(2),
    ]);
    const seen: string[] = [];
    const report = await fillMcdnFacesForSet({
      setId: "30th",
      lang: "fr",
      galleryCode: "30TH",
      localIds: ["33"],
      cardsRoot: root,
      downloadImage: async (url) => {
        seen.push(url);
        if (url.includes("/cards/full/")) return png;
        return null;
      },
    });
    expect(report.written).toBe(1);
    expect(seen[0]).toContain("/cards/full/30TH/30TH_FR_33.png");
    const cardDir = path.join(root, "30th", "fr", "033");
    expect(existsSync(path.join(cardDir, "art.mcdn.png"))).toBe(true);
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, "face.json"), "utf8"),
    ) as { art: string };
    expect(decision.art).toBe("art.mcdn.png");
  });
});
