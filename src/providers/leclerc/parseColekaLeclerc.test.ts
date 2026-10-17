import { describe, expect, it } from "vitest";

import {
  buildLeclercFixeezLookup,
  colekaLeclercFaceUrl,
  colekaLeclercListingUrl,
  colekaLeclercNumberFromCdnPath,
  parseColekaLeclercListing,
} from "./parseColekaLeclerc";

describe("parseColekaLeclercListing", () => {
  it("strips Coleka thumb size suffix", () => {
    expect(
      colekaLeclercFaceUrl(
        "https://thumbs.coleka.com/media/item/2024/x.webp".replace(
          "x.webp",
          "card-001_250x250.webp",
        ),
      ),
    ).toBe("https://thumbs.coleka.com/media/item/2024/card-001.webp");
  });

  it("builds paginated listing URLs", () => {
    const listing = {
      setCode: "marvel22",
      listingPath: "/fr/x_r1",
    };
    expect(colekaLeclercListingUrl(listing, 1)).toBe(
      "https://www.coleka.com/fr/x_r1",
    );
    expect(colekaLeclercListingUrl(listing, 2)).toBe(
      "https://www.coleka.com/fr/x_r1?p=2",
    );
  });

  it("parses CDN basename numbers", () => {
    expect(
      colekaLeclercNumberFromCdnPath(
        "https://thumbs.coleka.com/x/decouvre-la-magie-de-disney-leclerc-jumba-004.webp",
      ),
    ).toBe("004");
    expect(
      colekaLeclercNumberFromCdnPath(
        "https://thumbs.coleka.com/x/decouvre-la-magie-de-disney-leclerc-buzz-l-eclair-029-001.webp",
      ),
    ).toBe("029");
    expect(
      colekaLeclercNumberFromCdnPath(
        "https://thumbs.coleka.com/x/carte-n-99-099_250x250.webp",
      ),
    ).toBe("099");
    expect(
      colekaLeclercNumberFromCdnPath(
        "https://thumbs.coleka.com/x/fixeez-thor-f14-001.webp",
      ),
    ).toBe("f14");
    expect(
      colekaLeclercNumberFromCdnPath(
        "https://thumbs.coleka.com/x/album-001.webp",
      ),
    ).toBeNull();
  });

  it("parses cards with Ref and Fixeez", () => {
    const html = `
      <li class="pending col-md-4 col-xs-6 col-lg-3">
        <a class="lib_has_2_lines" href="/fr/x/miss-marvel_i1">
          <img src="https://thumbs.coleka.com/media/item/2024/miss-marvel-001_250x250.webp" />
          <h3 class="product-title">Miss Marvel</h3>
          <span class="ref">Ref. 1</span>
        </a>
      </li>
      <li class="pending col-md-4 col-xs-6 col-lg-3">
        <a href="/fr/x/fixeez-thor_i2">
          <img src="https://thumbs.coleka.com/media/item/2024/fixeez-thor-f14-001_250x250.webp" />
          <h3 class="product-title">Fixeez Thor</h3>
        </a>
      </li>
      <li class="pending col-md-4 col-xs-6 col-lg-3">
        <a href="/fr/x/album_i3">
          <img src="https://thumbs.coleka.com/media/item/2024/album_250x250.webp" />
          <h3 class="product-title">Album</h3>
        </a>
      </li>
    `;
    const parsed = parseColekaLeclercListing(html, "marvel24");
    expect(parsed.cards).toEqual([
      expect.objectContaining({
        number: "001",
        name: "Miss Marvel",
        kind: "card",
        faceUrl:
          "https://thumbs.coleka.com/media/item/2024/miss-marvel-001.webp",
      }),
      expect.objectContaining({
        number: "f14",
        kind: "fixeez",
      }),
    ]);
    expect(parsed.rejected.some((r) => r.name === "Album")).toBe(true);
  });

  it("matches nameless Fixeez via checklist lookup (marvel23)", () => {
    const lookup = buildLeclercFixeezLookup([
      { number: "f01", name: "Fixeez — La main de Spider-man" },
      { number: "f02", name: "Fixeez — Spider-man" },
      { number: "f13", name: "Fixeez — Spider-man", aka: ["Spidey"] },
      { number: "f17", name: "Fixeez — Drax" },
    ]);
    const html = `
      <li class="pending col-md-4 col-xs-6 col-lg-3">
        <a href="/fr/x/fixeez-drax_i1">
          <img src="https://thumbs.coleka.com/media/item/2023/fixeez-drax_250x250.webp" />
          <h3 class="product-title">Fixeez Drax</h3>
        </a>
      </li>
      <li class="pending col-md-4 col-xs-6 col-lg-3">
        <a href="/fr/x/fixeez-spidey_i2">
          <img src="https://thumbs.coleka.com/media/item/2023/fixeez-spidey_250x250.webp" />
          <h3 class="product-title">Fixeez Spidey</h3>
        </a>
      </li>
      <li class="pending col-md-4 col-xs-6 col-lg-3">
        <a href="/fr/x/fixeez-spider_i3">
          <img src="https://thumbs.coleka.com/media/item/2023/fixeez-spider-man_250x250.webp" />
          <h3 class="product-title">Fixeez Spider-Man</h3>
        </a>
      </li>
    `;
    const parsed = parseColekaLeclercListing(html, "marvel23", {
      fixeezLookup: lookup,
    });
    expect(parsed.cards.map((c) => c.number)).toEqual(["f02", "f13", "f17"]);
    expect(parsed.rejected.filter((r) => r.reason === "fixeez-no-number")).toEqual(
      [],
    );
  });
});
