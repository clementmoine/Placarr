import { describe, expect, it } from "vitest";

import {
  inferGeedieAttachmentRole,
  parseGeedieCountryOfRelease,
  parseGeedieProductPage,
  parseGeedieSearchResults,
  pickAlignedGeedieSearchHits,
  pickBestGeedieSearchHit,
  upgradeGeedieImageUrl,
} from "./fetch";

const SEARCH_FIXTURE = `
<img src="https://imagedelivery.net/2b3D1Oo3LJTf2No6Qa-wbQ/4861c183-5bf1-4e27-85c7-e0f4a266bc00/thumbnail" alt="PS4 Trine 4: The Nightmare Prince cover" />
<a href="https://geedie.lt/en/ps4-trine-4-the-nightmare-prince" class="text-gray-700">
<img src="https://imagedelivery.net/2b3D1Oo3LJTf2No6Qa-wbQ/94217910-a8e5-4eba-efaa-f03fb836ed00/thumbnail" alt="PS4 Trine: Ultimate Collection incl. Trine 1-4 cover" />
<a href="https://geedie.lt/en/ps4-trine-ultimate-collection-incl-trine-1-4" class="text-gray-700">
`;

const STORAGE_SEARCH_FIXTURE = `
<div class="group relative flex flex-col justify-between">
  <img src="/storage/products/ps5-the-plucky-squire/640x480-cover.webp" alt="PS5 The Plucky Squire cover" class="w-full h-full object-contain"/>
  <a href="https://geedie.lt/en/ps5-the-plucky-squire" class="text-gray-700">
    <span aria-hidden="true" class="absolute inset-0"></span>
    PS5 The Plucky Squire
  </a>
</div>
<div class="group relative flex flex-col justify-between">
  <img src="https://imagedelivery.net/2b3D1Oo3LJTf2No6Qa-wbQ/7a9c7b6e-623b-43ec-0f0f-bb12f21e7c00/thumbnail" alt="Atari Jaguar Tiny Toon Adventures: Plucky Duck in Hollywood Hijinks cover" />
  <a href="https://geedie.lt/en/atari-jaguar-tiny-toon-adventures-plucky-duck-in-hollywood-hijinks" class="text-gray-700">
    Atari Jaguar Tiny Toon Adventures: Plucky Duck in Hollywood Hijinks
  </a>
</div>
`;

const PRODUCT_FIXTURE = `
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Product","name":"PS4 Trine 4: The Nightmare Prince","image":"https://imagedelivery.net/2b3D1Oo3LJTf2No6Qa-wbQ/4861c183-5bf1-4e27-85c7-e0f4a266bc00/thumbnail","gtin13":"5016488133142"}
</script>
<div x-data="{ currentImage: 'https://imagedelivery.net/2b3D1Oo3LJTf2No6Qa-wbQ/4861c183-5bf1-4e27-85c7-e0f4a266bc00/public' }">
`;

describe("geedie fetch", () => {
  it("parses marketplace search hits", () => {
    const hits = parseGeedieSearchResults(SEARCH_FIXTURE);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.title).toBe("PS4 Trine 4: The Nightmare Prince");
    expect(hits[0]?.productUrl).toContain("ps4-trine-4-the-nightmare-prince");
  });

  it("parses marketplace cards that use /storage/products thumbnails", () => {
    const hits = parseGeedieSearchResults(STORAGE_SEARCH_FIXTURE);
    expect(hits.map((hit) => hit.title)).toEqual(
      expect.arrayContaining([
        "PS5 The Plucky Squire",
        "Atari Jaguar Tiny Toon Adventures: Plucky Duck in Hollywood Hijinks",
      ]),
    );
    const plucky = hits.find((hit) => hit.title === "PS5 The Plucky Squire");
    expect(plucky?.thumbnailUrl).toBe(
      "https://geedie.lt/storage/products/ps5-the-plucky-squire/640x480-cover.webp",
    );
  });

  it("upgrades thumbnail URLs to public size", () => {
    expect(
      upgradeGeedieImageUrl(
        "https://imagedelivery.net/example/id/thumbnail",
      ),
    ).toBe("https://imagedelivery.net/example/id/public");
  });

  it("parses product JSON-LD and gallery image", () => {
    const product = parseGeedieProductPage(
      PRODUCT_FIXTURE,
      "https://geedie.lt/en/ps4-trine-4-the-nightmare-prince",
    );
    expect(product?.title).toBe("PS4 Trine 4: The Nightmare Prince");
    expect(product?.barcode).toBe("5016488133142");
    expect(product?.coverUrl).toContain("/public");
  });

  it("prefers the catalog render over a seller's collectable photo", () => {
    // Real Geedie shape: a listing with both the full-res /storage/products
    // catalog cover (currentImage) and a seller-uploaded /storage/collectables
    // photo of their used copy. The catalog render must win.
    const html = `
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Product","name":"PS4 Assassin's Creed The Ezio Collection","image":"/storage/products/ps4-assassin-s-creed-the-ezio-collection-3307215977361/640x480-8BLefyaJREyxJt58VPPwOjToIoBA7xSTIYUTCrHL.webp","gtin13":"3307215977361"}
</script>
<div x-data="{ currentImage: 'https://geedie.lt/storage/products/ps4-assassin-s-creed-the-ezio-collection-3307215977361/8BLefyaJREyxJt58VPPwOjToIoBA7xSTIYUTCrHL.jpg' }">
<img src="https://geedie.lt/storage/collectables/32736/qw9dgEgL5rQcg6HPYMdJSQxXdhWgDmcu00RsZkBU.jpg" />
`;
    const product = parseGeedieProductPage(
      html,
      "https://geedie.lt/en/ps4-assassin-s-creed-the-ezio-collection-3307215977361",
    );
    expect(product?.coverUrl).toBe(
      "https://geedie.lt/storage/products/ps4-assassin-s-creed-the-ezio-collection-3307215977361/8BLefyaJREyxJt58VPPwOjToIoBA7xSTIYUTCrHL.jpg",
    );
    expect(product?.coverUrl).not.toContain("/storage/collectables/");
  });

  it("falls back to the collectable photo only when no catalog image exists", () => {
    // No JSON-LD image and no currentImage → the seller photo is the only cover,
    // so keep it (honest fallback over nothing) rather than dropping the listing.
    const html = `
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Product","name":"PS4 Obscure Used Game","gtin13":"1234567890123"}
</script>
<img src="https://geedie.lt/storage/collectables/99999/onlyPhoto.jpg" />
`;
    const product = parseGeedieProductPage(
      html,
      "https://geedie.lt/en/ps4-obscure-used-game",
    );
    expect(product?.coverUrl).toBe(
      "https://geedie.lt/storage/collectables/99999/onlyPhoto.jpg",
    );
  });

  it("reads the announced 'Country of release' from the product detail", () => {
    // Real Geedie shape: the attribute label sits in one div and the value is a
    // marketplace filter link carrying both a title attribute and visible text.
    const html = `
<div class="text-xs font-bold capitalize">
    Country of release
</div>
<div class="text-sm md:mt-1 md:text-base">
    <a href="https://geedie.lt/en/marketplace?Country%20of%20release%5B0%5D=1367" rel="nofollow" title="Japan">Japan</a>
</div>
`;
    expect(parseGeedieCountryOfRelease(html)).toBe("Japan");
  });

  it("derives the region role from the announced country, not the title", () => {
    // A Japanese edition whose marketplace title says nothing about region must
    // still resolve to "jp" via the declared country — so the shared regionRank
    // ordering can rank it below the PAL covers instead of mislabelling it "eu".
    const role = inferGeedieAttachmentRole(
      {
        title: "PS4 Assassin's Creed The Ezio Collection",
        productUrl:
          "https://geedie.lt/en/sony-playstation-4-assassin-s-creed-the-ezio-collection-3",
        thumbnailUrl: "https://geedie.lt/storage/products/x/cover.webp",
      },
      {
        title: "PS4 Assassin's Creed The Ezio Collection",
        productUrl:
          "https://geedie.lt/en/sony-playstation-4-assassin-s-creed-the-ezio-collection-3",
        coverUrl: "https://geedie.lt/storage/products/x/cover.webp",
        countryOfRelease: "Japan",
      },
    );
    expect(role).toBe("jp");
  });

  it("falls back to title keywords when no country is announced", () => {
    const role = inferGeedieAttachmentRole(
      {
        title: "PS4 Some Game (USA)",
        productUrl: "https://geedie.lt/en/ps4-some-game-usa",
        thumbnailUrl: "https://geedie.lt/storage/products/x/cover.webp",
      },
      {
        title: "PS4 Some Game (USA)",
        productUrl: "https://geedie.lt/en/ps4-some-game-usa",
        coverUrl: "https://geedie.lt/storage/products/x/cover.webp",
        countryOfRelease: null,
      },
    );
    expect(role).toBe("us");
  });

  it("accepts Geedie marketplace titles with platform prefix", () => {
    const hit = pickBestGeedieSearchHit(
      "Alan Wake II - Deluxe Edition",
      "ps5",
      [
        {
          title: "PS5 Alan Wake II (2) Deluxe Edition",
          productUrl:
            "https://geedie.lt/en/ps5-alan-wake-ii-2-deluxe-edition",
          thumbnailUrl:
            "https://imagedelivery.net/example/alan-wake/thumbnail",
        },
        {
          title: "Xbox Series X Alan Wake II (2) Deluxe Edition",
          productUrl:
            "https://geedie.lt/en/xbox-series-x-alan-wake-ii-2-deluxe-edition",
          thumbnailUrl:
            "https://imagedelivery.net/example/alan-wake-xbox/thumbnail",
        },
      ],
    );

    expect(hit?.productUrl).toContain("ps5-alan-wake-ii-2-deluxe-edition");
  });

  it("prefers the PS5 base game for a deluxe edition request", () => {
    const hits = parseGeedieSearchResults(STORAGE_SEARCH_FIXTURE);
    const hit = pickBestGeedieSearchHit(
      "The Plucky Squire - Deluxe Edition",
      "ps5",
      hits,
      ["The Plucky Squire - Deluxe Edition", "The Plucky Squire", "The Plucky Squire ps5"],
    );
    expect(hit?.productUrl).toContain("ps5-the-plucky-squire");
  });

  it("collects multiple aligned marketplace listings for a gallery", () => {
    const hits = parseGeedieSearchResults(`
      <img src="https://geedie.lt/storage/products/ps5-lollipop-chainsaw-repop/640x480-cover.webp" alt="PS5 Lollipop Chainsaw RePOP cover" />
      <a href="https://geedie.lt/en/ps5-lollipop-chainsaw-repop-7350002938935" class="text-gray-700">PS5 Lollipop Chainsaw RePOP</a>
      <img src="https://geedie.lt/storage/products/ps5-lollipop-chainsaw-repop-jp/640x480-cover.webp" alt="PS5 Lollipop Chainsaw RePOP Japanese cover" />
      <a href="https://geedie.lt/en/ps5-lollipop-chainsaw-repop-japanese" class="text-gray-700">PS5 Lollipop Chainsaw RePOP Japanese</a>
      <img src="https://geedie.lt/storage/products/xbox-lollipop/640x480-cover.webp" alt="Xbox Series X Lollipop Chainsaw RePOP cover" />
      <a href="https://geedie.lt/en/xbox-series-x-lollipop-chainsaw-repop" class="text-gray-700">Xbox Series X Lollipop Chainsaw RePOP</a>
    `);

    const aligned = pickAlignedGeedieSearchHits(
      "Lollipop Chainsaw RePOP",
      "ps5",
      hits,
      ["Lollipop Chainsaw RePOP", "Lollipop Chainsaw RePOP ps5"],
    );

    expect(aligned.map((entry) => entry.productUrl)).toEqual([
      "https://geedie.lt/en/ps5-lollipop-chainsaw-repop-7350002938935",
      "https://geedie.lt/en/ps5-lollipop-chainsaw-repop-japanese",
    ]);
  });

  it("exclut The Great Ace Attorney quand Investigations Collection est demandé", () => {
    const hits = [
      {
        title: "PS4 Ace Attorney Investigations Collection",
        productUrl:
          "https://geedie.lt/en/ps4-ace-attorney-investigations-collection",
        thumbnailUrl:
          "https://geedie.lt/storage/products/ps4-ace-attorney-investigations-collection/640x480-cover.webp",
      },
      {
        title: "PS4 The Great Ace Attorney Chronicles",
        productUrl:
          "https://geedie.lt/en/sony-playstation-4-the-great-ace-attorney-chronicles",
        thumbnailUrl:
          "https://geedie.lt/storage/products/sony-playstation-4-the-great-ace-attorney-chronicles/640x480-cover.webp",
      },
    ];

    const aligned = pickAlignedGeedieSearchHits(
      "Ace Attorney Investigations Collection",
      "ps4",
      hits,
      [
        "Ace Attorney Investigations Collection",
        "Ace Attorney Investigations Collection ps4",
      ],
    );

    expect(aligned.map((entry) => entry.title)).toEqual([
      "PS4 Ace Attorney Investigations Collection",
    ]);
  });

  it("exclut les jaquettes PS5 quand la plateforme demandée est PS4", () => {
    const hits = [
      {
        title: "PS5 Metal Gear Solid: Master Collection Vol. 1",
        productUrl:
          "https://geedie.lt/en/ps5-metal-gear-solid-master-collection-vol-1",
        thumbnailUrl:
          "https://geedie.lt/storage/products/ps5-mgs/640x480-cover.webp",
      },
      {
        title: "PS4 Metal Gear Solid: Master Collection Vol. 1",
        productUrl:
          "https://geedie.lt/en/ps4-metal-gear-solid-master-collection-vol-1",
        thumbnailUrl:
          "https://geedie.lt/storage/products/ps4-mgs/640x480-cover.webp",
      },
    ];

    expect(
      pickAlignedGeedieSearchHits(
        "Metal Gear Solid: Master Collection Vol. 1",
        "ps4",
        hits,
      ).map((entry) => entry.title),
    ).toEqual(["PS4 Metal Gear Solid: Master Collection Vol. 1"]);
  });

  it("exclut les jeux Hell * voisins quand Hell Pie est demandé", () => {
    const hits = [
      {
        title: "PS5 Hell Pie",
        productUrl: "https://geedie.lt/en/ps5-hell-pie",
        thumbnailUrl:
          "https://geedie.lt/storage/products/ps5-hell-pie/640x480-cover.webp",
      },
      {
        title: "PS5 Hell is Us",
        productUrl: "https://geedie.lt/en/ps5-hell-is-us",
        thumbnailUrl:
          "https://geedie.lt/storage/products/ps5-hell-is-us/640x480-cover.webp",
      },
      {
        title: "PS5 Hell Let Loose",
        productUrl: "https://geedie.lt/en/ps5-hell-let-loose",
        thumbnailUrl:
          "https://geedie.lt/storage/products/ps5-hell-let-loose/640x480-cover.webp",
      },
    ];

    expect(
      pickAlignedGeedieSearchHits("Hell Pie", "ps5", hits, ["Hell Pie"]).map(
        (entry) => entry.title,
      ),
    ).toEqual(["PS5 Hell Pie"]);
  });
});
