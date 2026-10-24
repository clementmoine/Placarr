import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

import {
  ingestLeclercSealedProducts,
  leclercCuratedProductsDir,
  readLeclercSealedLedger,
} from "./sealed";
import { LECLERC_ACTIVE_OPS } from "./pack";

describe("leclerc disney25 sealed products", () => {
  it("ships curated album + pochette packshots from Paninimania (no art.scan)", () => {
    const ledger = readLeclercSealedLedger("disney25");
    expect(ledger?.sourceId).toBe("paninimania");
    expect(ledger?.products.map((p) => p.slug)).toEqual([
      "collector-album",
      "pochette",
      "display",
    ]);
    expect(
      existsSync(
        path.join(
          leclercCuratedProductsDir("disney25"),
          "collector-album",
          "fr",
          "art.paninimania.jpg",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          leclercCuratedProductsDir("disney25"),
          "pochette",
          "fr",
          "art.paninimania.jpg",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          leclercCuratedProductsDir("disney25"),
          "collector-album",
          "fr",
          "art.scan.png",
        ),
      ),
    ).toBe(false);
    const pochette = ledger?.products.find((p) => p.slug === "pochette");
    expect(pochette).toMatchObject({
      kind: "booster",
      cardsPerPack: 4,
      declaredCardCount: 4,
      name: "Pochette — Découvre la magie de Disney",
    });
  });

  it("writes album + pochette (+ display stub) into products-index", () => {
    const out = ingestLeclercSealedProducts("disney25");
    expect(out.written).toBe(3);
    expect(out.skipped).toBe(0);
    const index = loadSealedProductsIndex("leclerc/disney25");
    const album = index.products["leclerc/disney25::collector-album"];
    const pochette = index.products["leclerc/disney25::pochette"];
    const display = index.products["leclerc/disney25::display"];
    expect(album).toMatchObject({
      slug: "collector-album",
      kind: "coffret",
      category: "albums",
      lang: "fr",
      name: "Album — Découvre la magie de Disney",
      priceCents: 199,
    });
    expect(album?.image).toBe(
      "/assets/leclerc/disney25/products/collector-album/fr/face",
    );
    expect(album?.imageBack).toBe(
      "/assets/leclerc/disney25/products/collector-album/fr/back",
    );
    expect(pochette).toMatchObject({
      slug: "pochette",
      kind: "booster",
      category: "boosters",
      lang: "fr",
      name: "Pochette — Découvre la magie de Disney",
      cardsPerPack: 4,
      packsContained: 1,
    });
    expect(pochette?.packComposition).toMatchObject({
      provenance: "structural",
      cardsPerPack: 4,
      slots: [
        {
          id: "card",
          count: 4,
          kind: "dedicated",
          rarities: ["card"],
        },
      ],
      possibleChase: ["Fixeez"],
    });
    expect(pochette?.image).toBe(
      "/assets/leclerc/disney25/products/pochette/fr/face",
    );
    expect(display).toMatchObject({
      slug: "display",
      kind: "display",
      category: "displays",
      cardsPerPack: 4,
      packsContained: null,
      image: "/assets/leclerc/disney25/products/display/fr/face",
    });
  });
});

describe.each([
  {
    setCode: "marvel21",
    albumName: "Album — Révèle ton Pouvoir",
    pochetteName: "Pochette — Révèle ton Pouvoir",
    chase: false,
    pochetteArt: "art.paninimania.jpg",
  },
  {
    setCode: "marvel22",
    albumName: "Album — Pars en Mission",
    pochetteName: "Pochette — Pars en Mission",
    chase: false,
    pochetteArt: "art.paninimania.jpg",
  },
  {
    setCode: "marvel24",
    albumName: "Album — Explore L'Univers Marvel avec Groot",
    pochetteName: "Pochette — Explore L'Univers Marvel avec Groot",
    chase: true,
    /** Crop 1 pochette (Paninimania empilait 2). */
    pochetteArt: "art.crop.jpg",
  },
] as const)(
  "leclerc $setCode sealed (Cartes & Stickers + Paninimania)",
  ({ setCode, albumName, pochetteName, chase, pochetteArt }) => {
    it("ships curated album + pochette packshots and album 1,99€", () => {
      const ledger = readLeclercSealedLedger(setCode);
      expect(ledger?.sourceId).toBe("cartesetstickers");
      expect(ledger?.products.map((p) => p.slug)).toEqual([
        "collector-album",
        "pochette",
        "display",
      ]);
      expect(
        existsSync(
          path.join(
            leclercCuratedProductsDir(setCode),
            "collector-album",
            "fr",
            "art.paninimania.jpg",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(
            leclercCuratedProductsDir(setCode),
            "pochette",
            "fr",
            pochetteArt,
          ),
        ),
      ).toBe(true);
      const out = ingestLeclercSealedProducts(setCode);
      expect(out.written).toBe(3);
      const index = loadSealedProductsIndex(`leclerc/${setCode}`);
      expect(index.products[`leclerc/${setCode}::collector-album`]).toMatchObject(
        {
          name: albumName,
          priceCents: 199,
        },
      );
      const pochette = index.products[`leclerc/${setCode}::pochette`];
      expect(pochette).toMatchObject({
        name: pochetteName,
        cardsPerPack: 4,
        packComposition: {
          provenance: "structural",
          cardsPerPack: 4,
          slots: [{ id: "card", count: 4, kind: "dedicated" }],
        },
      });
      expect(pochette?.image).toBe(
        `/assets/leclerc/${setCode}/products/pochette/fr/face`,
      );
      if (chase) {
        expect(pochette?.packComposition).toMatchObject({
          possibleChase: ["Fixeez"],
        });
      } else {
        expect(pochette?.packComposition).not.toHaveProperty("possibleChase");
      }
    });
  },
);

describe("leclerc marvel23 sealed products (Paninimania idm=7561)", () => {
  it("ships album + pochette + pochette-fixeez packshots", () => {
    const ledger = readLeclercSealedLedger("marvel23");
    expect(ledger?.products.map((p) => p.slug)).toEqual([
      "collector-album",
      "pochette",
      "pochette-fixeez",
      "display",
    ]);
    for (const rel of [
      "collector-album/fr/art.paninimania.jpg",
      "collector-album/fr/back.paninimania.jpg",
      "pochette/fr/art.paninimania.jpg",
      "pochette-fixeez/fr/art.paninimania.jpg",
      "pochette-fixeez/fr/back.paninimania.jpg",
      "display/fr/art.packshot.png",
    ]) {
      expect(
        existsSync(path.join(leclercCuratedProductsDir("marvel23"), rel)),
      ).toBe(true);
    }
  });

  it("writes 4 SKUs into products-index (incl. Fixeez pack + display stub)", () => {
    const out = ingestLeclercSealedProducts("marvel23");
    expect(out.written).toBe(4);
    expect(out.skipped).toBe(0);
    const index = loadSealedProductsIndex("leclerc/marvel23");
    expect(index.products["leclerc/marvel23::collector-album"]).toMatchObject({
      name: "Album — Défie tes Héros",
      priceCents: 199,
    });
    expect(index.products["leclerc/marvel23::pochette"]).toMatchObject({
      cardsPerPack: 4,
      packComposition: {
        provenance: "structural",
        cardsPerPack: 4,
        slots: [{ id: "card", count: 4, kind: "dedicated" }],
      },
    });
    expect(
      index.products["leclerc/marvel23::pochette"]?.packComposition,
    ).not.toHaveProperty("possibleChase");
    expect(index.products["leclerc/marvel23::pochette-fixeez"]).toMatchObject({
      slug: "pochette-fixeez",
      kind: "booster",
      cardsPerPack: 1,
      name: "Pochette Fixeez — Défie tes Héros",
    });
    expect(index.products["leclerc/marvel23::pochette-fixeez"]?.image).toBe(
      "/assets/leclerc/marvel23/products/pochette-fixeez/fr/face",
    );
    expect(index.products["leclerc/marvel23::pochette-fixeez"]?.imageBack).toBe(
      "/assets/leclerc/marvel23/products/pochette-fixeez/fr/back",
    );
  });
});

describe("leclerc marvel20 sealed products (Paninimania idm=7013)", () => {
  it("overrides seed pochette with 4 stickers + 2 cards", () => {
    const out = ingestLeclercSealedProducts("marvel20");
    expect(out.written).toBe(3);
    const index = loadSealedProductsIndex("leclerc/marvel20");
    expect(index.products["leclerc/marvel20::collector-album"]).toMatchObject({
      priceCents: 199,
      name: "Album — Deviens un Héros",
    });
    expect(index.products["leclerc/marvel20::pochette"]).toMatchObject({
      cardsPerPack: 6,
      declaredCardCount: 6,
      packComposition: {
        provenance: "structural",
        cardsPerPack: 6,
        slots: [
          { id: "sticker", count: 4, kind: "dedicated" },
          { id: "card", count: 2, kind: "dedicated" },
        ],
      },
    });
  });
});

describe("leclerc sealed seed stubs", () => {
  it.each(LECLERC_ACTIVE_OPS.map((op) => op.setCode))(
    "seeds album + pochette + display for %s (art optional)",
    (setCode) => {
      const out = ingestLeclercSealedProducts(setCode);
      expect(out.written).toBeGreaterThanOrEqual(3);
      expect(out.file).toBeTruthy();
      const index = loadSealedProductsIndex(`leclerc/${setCode}`);
      expect(index.products[`leclerc/${setCode}::collector-album`]).toMatchObject({
        slug: "collector-album",
        kind: "coffret",
        category: "albums",
      });
      const cardsPerPack =
        setCode === "sw15" || setCode === "sw16"
          ? 2
          : setCode === "marvel20"
            ? 6
            : 4;
      expect(index.products[`leclerc/${setCode}::pochette`]).toMatchObject({
        slug: "pochette",
        kind: "booster",
        cardsPerPack,
        packsContained: 1,
      });
      expect(index.products[`leclerc/${setCode}::display`]).toMatchObject({
        slug: "display",
        kind: "display",
        /** Seed défaut 4 — overlay ledger display packshot ne change pas le CPP. */
        cardsPerPack: 4,
        /** Cartons attestés seulement ; sinon null (pas inventé depuis Gemini/lots). */
        packsContained:
          setCode === "sw19" ? 244 : setCode === "marvel23" ? 420 : null,
      });
    },
  );

  it("exposes Star Wars sealed packshots on admin-enabled ops", () => {
    const out = ingestLeclercSealedProducts("sw19");
    expect(out.written).toBe(3);
    const index = loadSealedProductsIndex("leclerc/sw19");
    expect(index.products["leclerc/sw19::pochette"]?.name).toBe(
      "Pochette — Maîtriser la Force",
    );
    expect(index.products["leclerc/sw19::display"]).toMatchObject({
      image: "/assets/leclerc/sw19/products/display/fr/face",
      packsContained: 244,
      cardsPerPack: 4,
      declaredCardCount: 976,
    });
  });
});

describe.each([
  {
    setCode: "sw15",
    sourceId: "bibelotmania",
    albumName: "Album — Star Wars Cosmic Shells",
    pochetteName: "Pochette — Star Wars Cosmic Shells",
    art: "art.bibelotmania.jpg",
    cardsPerPack: 2,
    priceCents: 299,
  },
  {
    setCode: "sw16",
    sourceId: "bibelotmania",
    albumName: "Album — Star Wars Cosmic Shells II",
    pochetteName: "Pochette — Star Wars Cosmic Shells II",
    art: "art.bibelotmania.jpg",
    cardsPerPack: 2,
    priceCents: 299,
  },
  {
    setCode: "sw18",
    sourceId: "paninimania",
    albumName: "Album — Star Wars",
    pochetteName: "Pochette — Star Wars",
    art: "art.paninimania.jpg",
    cardsPerPack: 4,
    priceCents: 199,
  },
  {
    setCode: "sw19",
    sourceId: "paninimania",
    albumName: "Album — Maîtriser la Force",
    pochetteName: "Pochette — Maîtriser la Force",
    art: "art.paninimania.jpg",
    cardsPerPack: 4,
    priceCents: 199,
  },
] as const)(
  "leclerc $setCode sealed (Star Wars)",
  ({
    setCode,
    sourceId,
    albumName,
    pochetteName,
    art,
    cardsPerPack,
    priceCents,
  }) => {
    it("ships curated album + pochette as /face|/back role URLs", () => {
      const ledger = readLeclercSealedLedger(setCode);
      expect(ledger?.sourceId).toBe(sourceId);
      expect(
        existsSync(
          path.join(
            leclercCuratedProductsDir(setCode),
            "collector-album",
            "fr",
            art,
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(leclercCuratedProductsDir(setCode), "pochette", "fr", art),
        ),
      ).toBe(true);
      const out = ingestLeclercSealedProducts(setCode);
      expect(out.written).toBe(3);
      const index = loadSealedProductsIndex(`leclerc/${setCode}`);
      expect(
        index.products[`leclerc/${setCode}::collector-album`],
      ).toMatchObject({
        name: albumName,
        priceCents,
        image: `/assets/leclerc/${setCode}/products/collector-album/fr/face`,
      });
      const pochette = index.products[`leclerc/${setCode}::pochette`];
      expect(pochette).toMatchObject({
        name: pochetteName,
        cardsPerPack,
        image: `/assets/leclerc/${setCode}/products/pochette/fr/face`,
        packComposition: {
          provenance: "structural",
          cardsPerPack,
        },
      });
      if (setCode === "sw18" || setCode === "sw19") {
        expect(index.products[`leclerc/${setCode}::display`]?.image).toBe(
          `/assets/leclerc/${setCode}/products/display/fr/face`,
        );
      } else {
        expect(index.products[`leclerc/${setCode}::display`]?.image).toBeNull();
      }
    });
  },
);

describe("leclerc display packshots (studio)", () => {
  it.each([
    ["disney25", "Display — Découvre la magie de Disney"],
    ["disney26", "Display — Le Monde avec Disney"],
    ["marvel20", "Display — Deviens un Héros"],
    ["marvel21", "Display — Révèle ton Pouvoir"],
    ["marvel22", "Display — Pars en Mission"],
    ["marvel23", "Display — Défie tes Héros"],
    ["marvel24", "Display — Explore L'Univers Marvel avec Groot"],
    ["sw18", "Display — Star Wars"],
    ["sw19", "Display — Maîtriser la Force"],
  ] as const)("%s display resolves /face from art.packshot.png", (setCode, name) => {
    expect(
      existsSync(
        path.join(
          leclercCuratedProductsDir(setCode),
          "display",
          "fr",
          "art.packshot.png",
        ),
      ),
    ).toBe(true);
    const out = ingestLeclercSealedProducts(setCode);
    expect(out.written).toBeGreaterThanOrEqual(1);
    const display = loadSealedProductsIndex(`leclerc/${setCode}`).products[
      `leclerc/${setCode}::display`
    ];
    expect(display).toMatchObject({
      name,
      image: `/assets/leclerc/${setCode}/products/display/fr/face`,
      packsContained:
        setCode === "sw19" ? 244 : setCode === "marvel23" ? 420 : null,
    });
  });
});
