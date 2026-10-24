/**
 * Official-site upsert after promote: staging is purged, durable art + pages
 * ledger must be enough to (re)create SKUs.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SealedProductEntry } from "@/providers/shared/sealedProducts/indexFormat";
import {
  sealedBehaviorForKind,
  sealedContentsKnown,
} from "@/providers/shared/sealedProducts/kinds";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import {
  officialSiteDurablePagesPath,
  officialSiteStagingDir,
} from "./officialSite";
import {
  officialArtLooksLikeCmsHero,
  upsertOfficialSiteProducts,
} from "./officialSiteApply";

let root = "";

const PAGE = {
  slug: "hyperia-city",
  title: "Hyperia City",
  logoUrl: null,
  logoAlt: null,
  setId: "set14",
  packshots: [
    {
      url: "https://example.com/assets/fr_trove.png",
      alt: "Illumineer's Trove",
      kind: "trove",
    },
  ],
  spoilers: [],
  contents: null,
  sourceUrl: "https://www.disneylorcana.com/fr-FR/product/hyperia-city",
  lang: "fr",
};

function writeDurableLedger(): void {
  const file = officialSiteDurablePagesPath("lorcana");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ menu: [], pages: [PAGE] }));
}

function writeDurableArt(): string {
  const dir = path.join(
    root,
    "lorcana",
    "products",
    "hyperia-city-trove",
    "fr",
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "art.disneysite.png"), "png");
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "official-apply-"));
  vi.stubEnv("PLACARR_DATA_DIR", root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("upsertOfficialSiteProducts without staging", () => {
  it("recreates the SKU from durable art + durable pages ledger", () => {
    writeDurableLedger();
    writeDurableArt();

    const out = upsertOfficialSiteProducts({ setLogoIndex: null });
    expect(out.written).toBeGreaterThanOrEqual(1);

    const row =
      loadSealedProductsIndex("lorcana").products[
        "lorcana::hyperia-city-trove"
      ] ??
      Object.values(loadSealedProductsIndex("lorcana").products).find(
        (p) => p.slug === "hyperia-city-trove",
      );
    expect(row).toBeTruthy();
    expect(row!.category).toBe("official-site");
    expect(row!.kind).toBe("trove");
    expect(row!.lang).toBe("fr");
    expect(row!.image).toBe(
      "/assets/lorcana/products/hyperia-city-trove/fr/face",
    );
    expect(row!.catalogueSetId).toBe("14");
  });

  it("skips when neither staging nor durable art exists", () => {
    writeDurableLedger();
    const out = upsertOfficialSiteProducts({ setLogoIndex: null });
    expect(out.written).toBe(0);
    expect(out.skipped).toBe(1);
    expect(
      Object.values(loadSealedProductsIndex("lorcana").products).some(
        (p) => p.slug === "hyperia-city-trove",
      ),
    ).toBe(false);
  });

  it("drops a playmat that was mis-minted as collector_box", () => {
    const ledgerPath = officialSiteDurablePagesPath("lorcana");
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        menu: [],
        pages: [
          {
            ...PAGE,
            slug: "reign-of-jafar",
            title: "Le Règne de Jafar",
            setId: "set8",
            packshots: [
              {
                url: "https://ravensburger.cloud/cms/gallery/lorcana-web/products/jafar/skus/misc/dlc_s8_playmats_product-photography-hades.png",
                alt: "Hadès Tapis de jeu",
                kind: "collector_box",
              },
            ],
          },
        ],
      }),
    );
    const dir = path.join(
      root,
      "lorcana",
      "products",
      "reign-of-jafar-collector_box",
      "fr",
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.disneysite.png"), "png");
    persistSealedProductsIndexDoc(
      {
        version: 1,
        pack: "lorcana",
        generatedAt: "2026-01-01T00:00:00.000Z",
        products: {
          "lorcana::reign-of-jafar-collector_box": {
            slug: "reign-of-jafar-collector_box",
            path: "https://www.disneylorcana.com/fr-FR/product/reign-of-jafar",
            kind: "collector_box",
            behavior: sealedBehaviorForKind("collector_box"),
            category: "official-site",
            name: "Le Règne de Jafar",
            image:
              "/assets/lorcana/products/reign-of-jafar-collector_box/fr/face",
            imageBack: null,
            setLogo: null,
            setCode: "8",
            catalogueSetId: "8",
            lang: "fr",
            releaseDate: null,
            priceCents: null,
            cardsPerPack: null,
            packsContained: null,
            guaranteedPrints: [],
            randomPoolScope: "none",
            randomPoolPrints: [],
            declaredCardCount: null,
            setCardCount: null,
            contentsKnown: false,
            containsPrintsIsPreview: true,
            prints: [],
          } satisfies SealedProductEntry,
        },
      },
      { alreadyMerged: true },
    );

    const out = upsertOfficialSiteProducts({ setLogoIndex: null });
    expect(out.written).toBeGreaterThanOrEqual(1);
    expect(
      loadSealedProductsIndex("lorcana").products[
        "lorcana::reign-of-jafar-collector_box"
      ],
    ).toBeUndefined();
  });

  it("returns 0/0 without any ledger", () => {
    expect(upsertOfficialSiteProducts({ setLogoIndex: null })).toEqual({
      written: 0,
      skipped: 0,
    });
  });
});

describe("officialArtLooksLikeCmsHero", () => {
  it("flags 1920×1080 website headers", () => {
    const file = path.join(root, "hero.png");
    // Minimal IHDR PNG 1920×1080
    const png = Buffer.alloc(33);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1080, 20);
    writeFileSync(file, png);
    expect(officialArtLooksLikeCmsHero(file)).toBe(true);
  });
});

describe("upsertOfficialSiteProducts product-shot upgrade", () => {
  it("replaces a CMS hero art.disneysite with the staging product-shot", () => {
    const staging = officialSiteStagingDir("lorcana");
    mkdirSync(path.join(staging, "packshots"), { recursive: true });
    writeFileSync(
      path.join(staging, "pages.json"),
      JSON.stringify({
        menu: [],
        pages: [
          {
            slug: "elsa-gift-box",
            title: "Elsa Gift Box",
            logoUrl: null,
            logoAlt: null,
            setId: null,
            packshots: [
              {
                url: "https://example.com/collection-product-shot_en.png",
                alt: "Elsa Gift Box Components",
                kind: "collector_box",
              },
            ],
            spoilers: [],
            contents: null,
            sourceUrl: "https://www.disneylorcana.com/en-US/product/elsa-gift-box",
            lang: "en",
          },
        ],
      }),
    );

    const heroDir = path.join(
      root,
      "lorcana",
      "products",
      "elsa-gift-box-collector_box-en",
      "en",
    );
    mkdirSync(heroDir, { recursive: true });
    const hero = Buffer.alloc(33);
    hero[0] = 0x89;
    hero[1] = 0x50;
    hero[2] = 0x4e;
    hero[3] = 0x47;
    hero.writeUInt32BE(1920, 16);
    hero.writeUInt32BE(1080, 20);
    writeFileSync(path.join(heroDir, "art.disneysite.jpg"), hero);

    const shot = Buffer.alloc(40);
    shot[0] = 0x89;
    shot[1] = 0x50;
    shot[2] = 0x4e;
    shot[3] = 0x47;
    shot.writeUInt32BE(1920, 16);
    shot.writeUInt32BE(1354, 20);
    shot.write("PRODUCT", 24);
    writeFileSync(
      path.join(
        staging,
        "packshots",
        "elsa-gift-box.collector_box.0.en.png",
      ),
      shot,
    );

    const entry: SealedProductEntry = {
      slug: "elsa-gift-box-collector_box-en",
      path: "https://www.disneylorcana.com/en-US/product/elsa-gift-box",
      kind: "collector_box",
      behavior: sealedBehaviorForKind("collector_box"),
      category: "official-site",
      name: "Elsa Gift Box",
      image:
        "/assets/lorcana/products/elsa-gift-box-collector_box-en/en/face",
      imageBack: null,
      setLogo: null,
      setCode: null,
      catalogueSetId: null,
      lang: "en",
      releaseDate: null,
      priceCents: null,
      cardsPerPack: null,
      packsContained: 5,
      guaranteedPrints: [],
      randomPoolScope: "none",
      randomPoolPrints: [],
      declaredCardCount: null,
      setCardCount: null,
      contentsKnown: sealedContentsKnown({
        kind: "collector_box",
        containsPrintsIsPreview: true,
        printCount: 0,
      }),
      containsPrintsIsPreview: true,
      prints: [],
    };
    persistSealedProductsIndexDoc(
      {
        version: 1,
        pack: "lorcana",
        generatedAt: "2026-01-01T00:00:00.000Z",
        products: { "lorcana::elsa-gift-box-collector_box-en": entry },
      },
      { alreadyMerged: true },
    );

    const out = upsertOfficialSiteProducts({ setLogoIndex: null });
    expect(out.written).toBeGreaterThanOrEqual(1);

    const row = Object.values(
      loadSealedProductsIndex("lorcana").products,
    ).find((p) => p.slug === "elsa-gift-box-collector_box-en");
    expect(row?.image).toBe(
      "/assets/lorcana/products/elsa-gift-box-collector_box-en/en/face",
    );
    expect(
      readFileSync(path.join(heroDir, "art.disneysite.png")).equals(shot),
    ).toBe(true);
    expect(existsSync(path.join(heroDir, "art.disneysite.jpg"))).toBe(false);
  });
});
