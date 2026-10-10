import { describe, expect, it } from "vitest";

import {
  nextTcgdexDisplayUrl,
  tcgdexDisplayCandidates,
  tcgdexImageCandidates,
  tcgdexImageUrl,
} from "./tcgdexAssetUrls";

describe("tcgdexImageCandidates", () => {
  it("orders webp → png → jpg, then the other quality", () => {
    expect(
      tcgdexImageCandidates(
        "https://assets.tcgdex.net/fr/base/base3/1",
        "low",
      ),
    ).toEqual([
      "https://assets.tcgdex.net/fr/base/base3/1/low.webp",
      "https://assets.tcgdex.net/fr/base/base3/1/low.png",
      "https://assets.tcgdex.net/fr/base/base3/1/low.jpg",
      "https://assets.tcgdex.net/fr/base/base3/1/high.webp",
      "https://assets.tcgdex.net/fr/base/base3/1/high.png",
      "https://assets.tcgdex.net/fr/base/base3/1/high.jpg",
    ]);
  });

  it("defaults high first for full art", () => {
    expect(
      tcgdexImageUrl("https://assets.tcgdex.net/fr/base/base3/1", "high"),
    ).toBe("https://assets.tcgdex.net/fr/base/base3/1/high.webp");
  });
});

describe("tcgdexDisplayCandidates", () => {
  it("expands a failed low.webp into png then high", () => {
    const chain = tcgdexDisplayCandidates(
      "https://assets.tcgdex.net/fr/base/base3/1/low.webp",
    );
    expect(chain[0]).toBe(
      "https://assets.tcgdex.net/fr/base/base3/1/low.webp",
    );
    expect(chain[1]).toBe(
      "https://assets.tcgdex.net/fr/base/base3/1/low.png",
    );
    expect(
      nextTcgdexDisplayUrl(
        "https://assets.tcgdex.net/fr/base/base3/1/low.webp",
        chain,
      ),
    ).toBe("https://assets.tcgdex.net/fr/base/base3/1/low.png");
  });

  it("leaves local assets alone", () => {
    expect(tcgdexDisplayCandidates("/assets/pokemon/cards/x/art.webp")).toEqual(
      ["/assets/pokemon/cards/x/art.webp"],
    );
  });

  it("falls back to EN after exhausting the preferred locale", () => {
    const chain = tcgdexDisplayCandidates(
      "https://assets.tcgdex.net/fr/ex/ex5/53/high.webp",
    );
    expect(chain[0]).toBe(
      "https://assets.tcgdex.net/fr/ex/ex5/53/high.webp",
    );
    expect(chain).toContain(
      "https://assets.tcgdex.net/en/ex/ex5/53/high.webp",
    );
    expect(
      chain.indexOf("https://assets.tcgdex.net/en/ex/ex5/53/high.webp"),
    ).toBeGreaterThan(0);
  });
});
