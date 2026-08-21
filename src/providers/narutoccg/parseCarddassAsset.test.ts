import { describe, expect, it } from "vitest";

import {
  NARUTO_GAME,
  carddassFaceFilename,
  parseCarddassAssetPath,
  parseCarddassMedThumbFilename,
  pickLatestCdxRow,
  faceArtRank,
  pickPreferredFaceArtFilename,
  waybackRawUrl,
} from "./parseCarddassAsset";
import {
  canonicalizeCarddassUrl,
  siteRelPathFromOriginal,
} from "./scrapeCards";

describe("parseCarddassAssetPath", () => {
  it.each([
    [
      "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
      {
        set: "s1",
        number: "ni001",
        printKey: `${NARUTO_GAME}:s1-ni001`,
        role: "art",
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/s4/TACTIQUE-190.jpg",
      {
        set: "s4",
        number: "ta190",
        printKey: `${NARUTO_GAME}:s4-ta190`,
        role: "art",
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/5/technique/TE-222.jpg",
      {
        set: "s5",
        number: "te222",
        printKey: `${NARUTO_GAME}:s5-te222`,
        role: "art",
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/5/clients/CL-027.jpg",
      {
        set: "s5",
        number: "cl027",
        printKey: `${NARUTO_GAME}:s5-cl027`,
        role: "art",
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/s4/NINJA-168-vc.jpg",
      {
        set: "s4",
        number: "ni168",
        printKey: `${NARUTO_GAME}:s4-ni168`,
        role: "corrected",
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/promo/TECHNIQUE-030-CdF.jpg",
      {
        set: "promo",
        number: "te030",
        printKey: `${NARUTO_GAME}:promo-te030-cdf`,
        role: "art",
        grouping: "cdf",
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/promo/NINJA-023.jpg",
      {
        set: "promo",
        number: "ni023",
        printKey: `${NARUTO_GAME}:promo-ni023`,
        role: "art",
        grouping: null,
      },
    ],
    [
      "http://www.carddass.fr/naruto/images/cartes/5/ninjas/NINJA%20211.jpg",
      {
        set: "s5",
        number: "ni211",
        printKey: `${NARUTO_GAME}:s5-ni211`,
        role: "art",
      },
    ],
  ] as const)("%s", (url, expected) => {
    const parsed = parseCarddassAssetPath(url);
    expect(parsed).toMatchObject(expected);
  });

  it("rejects med / chrome", () => {
    expect(
      parseCarddassAssetPath(
        "http://www.carddass.fr/naruto/images/cartes/cartes_med/TACTIQUE-183-med.jpg",
      ),
    ).toBeNull();
    expect(
      parseCarddassAssetPath(
        "http://www.carddass.fr/naruto/images/cartes/promo/cartes_preview_s4.jpg",
      ),
    ).toBeNull();
  });
});

describe("parseCarddassMedThumbFilename", () => {
  it.each([
    ["NINJA-001_med.jpg", "ni001"],
    ["NINJA 217-med.jpg", "ni217"],
    ["NINJA-023-mini.jpg", "ni023"],
    ["TECHNIQUE-062_med.jpg", "te062"],
    ["TE-236-med.jpg", "te236"],
    ["TACTIQUE-021-med.jpg", "ta021"],
    ["TA-252-med.jpg", "ta252"],
    ["CL-027-med.jpg", "cl027"],
    ["s4_start_boosts.jpg", null],
  ] as const)("%s → %s", (file, number) => {
    const parsed = parseCarddassMedThumbFilename(file);
    expect(parsed?.number ?? null).toBe(number);
  });
});

describe("corrected face filenames", () => {
  it("maps roles to disk names", () => {
    expect(carddassFaceFilename("art", ".jpg")).toBe("art.carddass.jpg");
    expect(carddassFaceFilename("corrected", "jpg")).toBe("art.corrected.jpg");
  });

  it("prefers art.corrected over art for serving", () => {
    expect(
      pickPreferredFaceArtFilename([
        "thumb.jpg",
        "art.jpg",
        "art.corrected.jpg",
      ]),
    ).toBe("art.corrected.jpg");
    expect(pickPreferredFaceArtFilename(["art.jpg", "back.jpg"])).toBe(
      "art.jpg",
    );
    expect(pickPreferredFaceArtFilename(["art.corrected.webp"])).toBe(
      "art.corrected.webp",
    );
    expect(pickPreferredFaceArtFilename(["thumb.jpg"])).toBeNull();
  });

  it("ranks faces so every caller agrees on precedence", () => {
    expect(faceArtRank("art.reconstructed.png")).toBeGreaterThan(
      faceArtRank("art.corrected.jpg"),
    );
    expect(faceArtRank("art.corrected.jpg")).toBeGreaterThan(
      faceArtRank("art.jpg"),
    );
    // A scrape merging disk into freshly downloaded files must not demote a
    // reconstruction just because it is not `.corrected.`.
    expect(faceArtRank("art.reconstructed.png")).toBeGreaterThan(
      faceArtRank("art.jpg"),
    );
    expect(faceArtRank("thumb.jpg")).toBe(0);
    expect(faceArtRank("back.jpg")).toBe(0);
  });

  it("prefers a hand-made reconstruction over both official faces", () => {
    expect(
      pickPreferredFaceArtFilename([
        "thumb.jpg",
        "art.jpg",
        "art.corrected.jpg",
        "art.reconstructed.png",
      ]),
    ).toBe("art.reconstructed.png");
    expect(
      pickPreferredFaceArtFilename(["art.jpg", "art.reconstructed.png"]),
    ).toBe("art.reconstructed.png");
    // `art.reconstructed.*` must not be served by the plain `art.*` branch.
    expect(pickPreferredFaceArtFilename(["art.reconstructed.png"])).toBe(
      "art.reconstructed.png",
    );
  });

  it("keeps every dump as art.<source> and prefers the locale's dump on a tie", () => {
    expect(faceArtRank("art.suruga.jpg")).toBeGreaterThan(0);
    expect(faceArtRank("art.nikita.jpg")).toBeGreaterThan(0);
    expect(faceArtRank("art.nikita.jpg", "ja")).toBeGreaterThan(
      faceArtRank("art.suruga.jpg", "ja"),
    );
    expect(
      pickPreferredFaceArtFilename(
        ["art.jpg", "art.suruga.jpg", "art.nikita.jpg"],
        "ja",
      ),
    ).toBe("art.nikita.jpg");
    expect(
      pickPreferredFaceArtFilename(["art.jpg", "art.vintage.jpg"], "en"),
    ).toBe("art.vintage.jpg");
  });
});

describe("wayback helpers", () => {
  it("picks latest timestamp", () => {
    expect(
      pickLatestCdxRow([
        ["20070101000000", "http://a"],
        ["20080101000000", "http://b"],
      ]),
    ).toEqual({ timestamp: "20080101000000", original: "http://b" });
  });

  it("builds id_ raw url", () => {
    expect(
      waybackRawUrl(
        "20071018170742",
        "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
      ),
    ).toBe(
      "https://web.archive.org/web/20071018170742id_/http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
    );
  });

  it("canonicalizes :80 host duplicates", () => {
    expect(
      canonicalizeCarddassUrl(
        "http://www.carddass.fr:80/naruto/images/cartes/promo/x.jpg",
      ),
    ).toBe(
      canonicalizeCarddassUrl(
        "http://www.carddass.fr/naruto/images/cartes/promo/x.jpg",
      ),
    );
  });

  it("maps site mirror relative paths", () => {
    expect(
      siteRelPathFromOriginal(
        "http://www.carddass.fr/naruto/images/cartes/promo/orochimaru_promo.jpg",
      ),
    ).toBe("images/cartes/promo/orochimaru_promo.jpg");
  });
});
