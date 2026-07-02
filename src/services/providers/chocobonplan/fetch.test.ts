import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
import axios from "axios";

import {
  fetchFromChocoBonPlan,
  fetchPricesFromChocoBonPlan,
  parseChocoBonPlanProductPage,
  pickRelevantChocoBonPlanHit,
  searchChocoBonPlanDeals,
  extractChocoBonPlanImages,
  filterChocoBonPlanImagesForProduct,
} from "./fetch";

const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);

const SAMPLE_HTML = `
<h1 class="box-corner__title">Ball x Pit sur PS5</h1>
<span class="price__promotion ">34.99 €</span>
<meta property="og:image" content="https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-slider.jpg" />
<img data-lazy-srcset="https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit-300x300.png 300w, https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png 700w" data-lazy-src="https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit-300x300.png" alt="ball x pit sur ps5 visuel produit" />
<p><!-- START_DESCRIPTION --></p>
<p><strong>Ball x Pit PS5.</strong> Roguelite arcade en français.</p>
<a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2026/02/0kPKSdnnPu2uwpL.png" target="_blank">
  <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2026/02/0kPKSdnnPu2uwpL.png" alt="gameplay 1" />
</a>
<a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-slider.jpg" target="_blank">
  <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-slider.jpg" alt="ball x pit sur ps5 visuel slider" />
</a>
<p><!-- END_DESCRIPTION --></p>
`;

beforeEach(() => {
  mockedPost.mockReset();
  mockedGet.mockReset();
});

const TEKKEN_HTML = `
<h1 class="box-corner__title">Tekken 7 sur PS4</h1>
<span class="price__promotion ">19.99 €</span>
<meta property="og:image" content="https://chocobonplan.com/wp-content/uploads/2018/03/tekken-7-ps4.png" />
<img data-lazy-srcset="https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4-300x300.png 300w, https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png 700w" data-lazy-src="https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4-300x300.png" alt="bon plan tekken 7 ps4" />
<img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/10/5cf52553-dfe9-4b70-b5b6-05825419d09e.jpeg" class="author__thumbnail" alt="Choco" />
<img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2018/11/badge-medaille-PS4-v2-150x150.png" alt="PS4" />
<p><!-- START_DESCRIPTION --></p>
<p>Tekken 7 sur PS4 en promo.</p>
<p><!-- END_DESCRIPTION --></p>
`;

const BROKEN_SWORD_HTML = `
<h1 class="box-corner__title">Les Chevaliers de Baphomet la malédiction du serpent sur PS4</h1>
<meta property="og:image" content="https://chocobonplan.com/wp-content/uploads/2016/10/les-chevaliers-de-baphomet-pas-cher-la-malediction-du-serpent.jpg" />
<img data-lazy-srcset="https://chocobonplan.com/wp-content/uploads/2016/10/les-chevaliers-de-baphomet-pas-cher-la-malediction-du-serpent-241x300.jpg 241w, https://chocobonplan.com/wp-content/uploads/2016/10/les-chevaliers-de-baphomet-pas-cher-la-malediction-du-serpent.jpg 350w" data-lazy-src="https://chocobonplan.com/wp-content/uploads/2016/10/les-chevaliers-de-baphomet-pas-cher-la-malediction-du-serpent-241x300.jpg" alt="les-chevaliers-de-baphomet-pas-cher-la-malediction-du-serpent" />
<img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/10/5cf52553-dfe9-4b70-b5b6-05825419d09e.jpeg" class="author__thumbnail" alt="Choco" />
<p><!-- START_DESCRIPTION --></p>
<p>Broken Sword sur PS4.</p>
<p><!-- END_DESCRIPTION --></p>
`;

describe("parseChocoBonPlanProductPage", () => {
  it("extrait titre, description, image et prix promotion", () => {
    const parsed = parseChocoBonPlanProductPage(SAMPLE_HTML);
    expect(parsed).toMatchObject({
      title: "Ball x Pit sur PS5",
      description: "Ball x Pit PS5. Roguelite arcade en français.",
      coverUrl:
        "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
      backgroundImageUrl:
        "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-slider.jpg",
      priceNew: 3499,
    });
    expect(parsed.attachments?.map((image) => image.type)).toEqual(
      expect.arrayContaining(["cover", "background", "screenshot"]),
    );
  });

  it("ignore les avatars et badges, et garde le bon-plan en cover HD", () => {
    const parsed = parseChocoBonPlanProductPage(TEKKEN_HTML);
    expect(parsed.coverUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png",
    );
    expect(parsed.attachments?.map((image) => image.url)).toEqual(
      expect.arrayContaining([
        "https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png",
      ]),
    );
    expect(parsed.attachments?.some((image) => image.url.includes("5cf52553"))).toBe(
      false,
    );
  });

  it("prend la jaquette produit sur les anciennes fiches PS4", () => {
    const parsed = parseChocoBonPlanProductPage(BROKEN_SWORD_HTML);
    expect(parsed.coverUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2016/10/les-chevaliers-de-baphomet-pas-cher-la-malediction-du-serpent.jpg",
    );
    expect(parsed.attachments?.some((image) => image.url.includes("5cf52553"))).toBe(
      false,
    );
  });

  it("prend la jaquette produit quand elle est dans box-corner__img avant le h1", () => {
    const parsed = parseChocoBonPlanProductPage(`
<article class="box-corner box-bp">
  <div class="box-corner__content">
    <div class="row">
      <div class="col-md-3">
        <div class="box-corner__img">
          <img data-lazy-srcset="https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-produit-300x300.png 300w, https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-produit.png 700w" data-lazy-src="https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-produit-300x300.png" alt="silt ps4 produit" />
        </div>
      </div>
      <div class="col-md-6">
        <h1 class="box-corner__title">Silt sur PS4</h1>
        <p><!-- START_DESCRIPTION --></p>
        <p>Silt PS4.</p>
        <a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-slider.jpg">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-slider.jpg" alt="silt ps4 slider" />
        </a>
        <p><!-- END_DESCRIPTION --></p>
      </div>
    </div>
  </div>
</article>
`);
    expect(parsed.coverUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-produit.png",
    );
    expect(parsed.backgroundImageUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2024/10/silt-ps4-slider.jpg",
    );
  });

  it("extrait la jaquette produit sans marqueur START_DESCRIPTION", () => {
    const parsed = parseChocoBonPlanProductPage(`
<article class="box-corner  box-bp">
  <div class="box-corner__content">
    <div class="row">
      <div class="col-md-3">
        <div class="box-corner__img">
          <img data-lazy-srcset="https://chocobonplan.com/wp-content/uploads/2021/12/AC-aube-ragnarok-ps4-visuel-produit-300x300.png 300w, https://chocobonplan.com/wp-content/uploads/2021/12/AC-aube-ragnarok-ps4-visuel-produit.png 700w" data-lazy-src="https://chocobonplan.com/wp-content/uploads/2021/12/AC-aube-ragnarok-ps4-visuel-produit-300x300.png" alt="AC aube ragnarok ps4 visuel produit" />
        </div>
      </div>
      <div class="col-md-6">
        <h1 class="box-corner__title">Assassin's Creed Valhalla DLC Aube du Ragnarok sur PS4</h1>
        <a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2026/04/SLIDER-AC-aube-ragnarok-ps4-v12.jpg">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2026/04/SLIDER-AC-aube-ragnarok-ps4-v12.jpg" alt="SLIDER AC aube ragnarok ps4 v12" />
        </a>
      </div>
    </div>
  </div>
</article>
`);
    expect(parsed.coverUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2021/12/AC-aube-ragnarok-ps4-visuel-produit.png",
    );
    expect(parsed.backgroundImageUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2026/04/SLIDER-AC-aube-ragnarok-ps4-v12.jpg",
    );
  });

  it("classe les screen-N et SLIDER avant la heuristique -ps5", () => {
    const parsed = parseChocoBonPlanProductPage(`
<article class="box-corner box-bp">
  <div class="box-corner__content">
    <div class="row">
      <div class="col-md-3">
        <div class="box-corner__img">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/04/alan-wake-edition-deluxe-ps5-visuel-produit.png" alt="alan wake edition deluxe ps5 visuel produit" />
        </div>
      </div>
      <div class="col-md-6">
        <h1 class="box-corner__title">Alan Wake 2 Deluxe Edition PS5</h1>
        <p><!-- START_DESCRIPTION --></p>
        <a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2025/04/SLIDER-alan-wake-edition-deluxe-ps5.jpg">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/04/SLIDER-alan-wake-edition-deluxe-ps5.jpg" alt="SLIDER alan wake edition deluxe ps5" />
        </a>
        <a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2025/04/screen-1-Alan-Wake-2-Deluxe-Edition-PS5.jpg">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/04/screen-1-Alan-Wake-2-Deluxe-Edition-PS5.jpg" alt="screen 1 Alan Wake 2 Deluxe Edition PS5" />
        </a>
        <a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2025/04/screen-2-Alan-Wake-2-Deluxe-Edition-PS5.jpg">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/04/screen-2-Alan-Wake-2-Deluxe-Edition-PS5.jpg" alt="screen 2 Alan Wake 2 Deluxe Edition PS5" />
        </a>
        <p><!-- END_DESCRIPTION --></p>
      </div>
    </div>
  </div>
</article>
`);
    expect(parsed.coverUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2025/04/alan-wake-edition-deluxe-ps5-visuel-produit.png",
    );
    expect(parsed.backgroundImageUrl).toBe(
      "https://chocobonplan.com/wp-content/uploads/2025/04/SLIDER-alan-wake-edition-deluxe-ps5.jpg",
    );
    const byType = Object.fromEntries(
      (parsed.attachments || []).map((image) => [image.url.split("/").pop(), image.type]),
    );
    expect(byType["alan-wake-edition-deluxe-ps5-visuel-produit.png"]).toBe("cover");
    expect(byType["SLIDER-alan-wake-edition-deluxe-ps5.jpg"]).toBe("background");
    expect(byType["screen-1-Alan-Wake-2-Deluxe-Edition-PS5.jpg"]).toBe("screenshot");
    expect(byType["screen-2-Alan-Wake-2-Deluxe-Edition-PS5.jpg"]).toBe("screenshot");
  });

  it("ignore les avatars auteur staff (BisH0p, Choco)", () => {
    const images = extractChocoBonPlanImages(`
<article class="box-corner box-bp">
  <div class="box-corner__content">
    <div class="row">
      <div class="col-md-6">
        <h1 class="box-corner__title">Alan Wake 2 Deluxe Edition PS5</h1>
        <p><!-- START_DESCRIPTION --></p>
        <a class="img-popin" href="https://chocobonplan.com/wp-content/uploads/2025/04/screen-1-Alan-Wake-2-Deluxe-Edition-PS5.jpg">
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2025/04/screen-1-Alan-Wake-2-Deluxe-Edition-PS5.jpg" alt="screen 1 Alan Wake 2 Deluxe Edition PS5" />
        </a>
        <p><!-- END_DESCRIPTION --></p>
      </div>
      <div class="col-md-2">
        <address class="author">
          <a rel="author" href="https://chocobonplan.com/author/bish0p/" class="author__name">BisH0p</a>
          <img data-lazy-src="https://chocobonplan.com/wp-content/uploads/2021/10/BisH0p.jpg" class="avatar avatar-120 photo img-responsive author__thumbnail" alt="BisH0p" />
        </address>
      </div>
    </div>
  </div>
</article>
`);
    expect(images.some((image) => image.url.includes("BisH0p"))).toBe(false);
    expect(images.some((image) => image.url.includes("screen-1"))).toBe(true);
  });

  it("drop Switch gallery art on a PS4 product page", () => {
    const filtered = filterChocoBonPlanImagesForProduct(
      [
        {
          url: "https://example.com/switch-cover.png",
          type: "cover",
          title: "the great ace attorney switch visuel produit",
        },
        {
          url: "https://example.com/ps4-cover.png",
          type: "cover",
          title: "the great ace attorney ps4 visuel produit",
        },
      ],
      "The Great Ace Attorney Chronicles sur PS4",
    );

    expect(filtered.map((image) => image.url)).toEqual([
      "https://example.com/ps4-cover.png",
    ]);
  });

  it("drop sequel gallery art that does not match the product page title", () => {
    const filtered = filterChocoBonPlanImagesForProduct(
      [
        {
          url: "https://example.com/ln3-cover.png",
          type: "cover",
          title: "little nightmares iii sur ps4 visuel produit",
        },
        {
          url: "https://example.com/ln-cover.png",
          type: "cover",
          title: "little nightmares sur ps4 visuel produit",
        },
      ],
      "Little Nightmares sur PS4",
    );

    expect(filtered.map((image) => image.url)).toEqual([
      "https://example.com/ln-cover.png",
    ]);
  });
});

describe("pickRelevantChocoBonPlanHit", () => {
  it("ignore les bundles sans rapport", () => {
    const hit = pickRelevantChocoBonPlanHit(
      "Ball x Pit PS5",
      [
        {
          title: "Jeux gratuits Epic Games : RollerCoaster Tycoon",
          url: "https://chocobonplan.com/epic/",
          image: "https://example.com/epic.png",
          objectID: "1",
        },
        {
          title: "Ball x Pit sur PS5",
          url: "https://chocobonplan.com/ball-x-pit/",
          image: "https://example.com/ball.png",
          objectID: "2",
        },
      ],
      ["Ball x Pit PS5"],
    );
    expect(hit?.objectID).toBe("2");
  });

  it("accepte une édition deluxe via le titre de base", () => {
    const hit = pickRelevantChocoBonPlanHit(
      "Tekken 7 Deluxe Edition",
      [
        {
          title: "Tekken 7 Collector sur PC",
          url: "https://chocobonplan.com/tekken-pc/",
          image: "https://example.com/pc.png",
          objectID: "1",
        },
        {
          title: "Tekken 7 sur PS4",
          url: "https://chocobonplan.com/tekken-7-ps4/",
          image: "https://example.com/ps4.png",
          objectID: "2",
        },
      ],
      ["Tekken 7 Deluxe Edition", "Tekken 7", "Tekken 7 sur PS4"],
    );
    expect(hit?.objectID).toBe("2");
  });

  it("prefere la fiche PS5 quand la recherche plateforme est dans le contexte", () => {
    const hit = pickRelevantChocoBonPlanHit(
      "The Pathless",
      [
        {
          title: "The Pathless sur Switch",
          url: "https://chocobonplan.com/bons-plans/jeux-video-pas-cher/switch-1-jeux-video-pas-cher/the-pathless-sur-switch/",
          image: "https://example.com/switch.png",
          objectID: "switch",
        },
        {
          title: "The Pathless Day One Edition sur PS5",
          url: "https://chocobonplan.com/bons-plans/jeux-video-pas-cher/jeux-ps5-pas-cher/the-pathless-day-one-edition-sur-ps5/",
          image: "https://example.com/ps5.png",
          objectID: "ps5",
        },
      ],
      [
        "The Pathless",
        "The Pathless ps5",
        "The Pathless Day One Edition sur PS5",
      ],
    );
    expect(hit?.objectID).toBe("ps5");
  });

  it("rejette Afterbirth+ quand Repentance est demande", () => {
    const hit = pickRelevantChocoBonPlanHit(
      "The Binding of Isaac Repentance",
      [
        {
          title: "The Binding of Isaac Afterbirth+ sur PS5",
          url: "https://chocobonplan.com/isaac-afterbirth/",
          image: "https://example.com/afterbirth.png",
          objectID: "afterbirth",
        },
        {
          title: "The Binding of Isaac Repentance sur PS5",
          url: "https://chocobonplan.com/isaac-repentance/",
          image: "https://example.com/repentance.png",
          objectID: "repentance",
        },
      ],
      ["The Binding of Isaac Repentance", "The Binding of Isaac Repentance ps5"],
    );
    expect(hit?.objectID).toBe("repentance");
  });

  it("rejette Devil May Cry 5 quand DmC Definitive Edition est demande", () => {
    const alignment = [
      "DmC Devil May Cry Definitive Edition",
      "DmC Devil May Cry Definitive Edition ps4",
    ];
    const hit = pickRelevantChocoBonPlanHit(
      "DmC Devil May Cry Definitive Edition",
      [
        {
          title: "Devil May Cry 5 sur PS4",
          url: "https://chocobonplan.com/dmc5/",
          image: "https://example.com/dmc5.png",
          objectID: "dmc5",
        },
        {
          title: "DMC Definitive Edition sur PS4 et Xbox One",
          url: "https://chocobonplan.com/dmc-de/",
          image: "https://example.com/dmc-de.png",
          objectID: "dmc-de",
        },
      ],
      alignment,
    );
    expect(hit?.objectID).toBe("dmc-de");
  });
});

describe("fetchFromChocoBonPlan", () => {
  it("combine Algolia et la fiche produit", async () => {
    mockedPost.mockResolvedValue({
      status: 200,
      data: {
        hits: [
          {
            title: "Ball x Pit sur PS5",
            url: "https://chocobonplan.com/ball-x-pit/",
            image: "https://chocobonplan.com/wp-content/uploads/ball-300x300.png",
            objectID: "299830",
          },
        ],
      },
    } as never);
    mockedGet.mockResolvedValue({ status: 200, data: SAMPLE_HTML } as never);

    const hits = await searchChocoBonPlanDeals("Ball x Pit PS5");
    expect(
      pickRelevantChocoBonPlanHit("Ball x Pit PS5", hits, ["Ball x Pit PS5"]),
    ).toBeTruthy();

    const result = await fetchFromChocoBonPlan("Ball x Pit PS5", ["Ball x Pit PS5"]);
    expect(result).toMatchObject({
      title: "Ball x Pit sur PS5",
      productUrl: "https://chocobonplan.com/ball-x-pit/",
      coverUrl:
        "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
      description: "Ball x Pit PS5. Roguelite arcade en français.",
      priceNew: 3499,
      objectId: "299830",
      attachments: expect.arrayContaining([
        expect.objectContaining({ type: "cover" }),
        expect.objectContaining({ type: "background" }),
        expect.objectContaining({ type: "screenshot" }),
      ]),
    });
  });
});

describe("fetchPricesFromChocoBonPlan", () => {
  it("retourne le meilleur prix observé", async () => {
    mockedPost.mockResolvedValue({
      status: 200,
      data: {
        hits: [
          {
            title: "Ball x Pit sur PS5",
            url: "https://chocobonplan.com/ball-x-pit/",
            image: "https://example.com/ball.png",
            objectID: "299830",
          },
        ],
      },
    } as never);
    mockedGet.mockResolvedValue({ status: 200, data: SAMPLE_HTML } as never);

    await expect(
      fetchPricesFromChocoBonPlan(["Ball x Pit PS5", "Ball x Pit PS5"]),
    ).resolves.toEqual({
      priceNew: 3499,
      sourceUrl: "https://chocobonplan.com/ball-x-pit/",
      productName: "Ball x Pit sur PS5",
      coverUrl:
        "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
      matchedQuery: "Ball x Pit PS5",
    });
  });
});
