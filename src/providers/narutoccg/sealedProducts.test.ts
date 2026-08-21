import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  NARUTO_SEALED_SKUS,
  narutoSealedSpecs,
  NARUTO_SET_LOGOS,
  ingestNarutoSealedProducts,
} from "./sealedProducts";

const roots: string[] = [];

function tmpPack(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "naruto-sealed-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/*
  Les sorties japonaises attestées par `cardcheckbox-jp.json` entrent au
  catalogue sans packshot : elles s'ajoutent à tout ce qu'un test met en
  staging. Compter en `n + ATTESTED` garde les tests lisibles et les fait
  suivre le relevé si une sortie s'y ajoute.
*/
/**
 * Les clés des SKU qui doivent leur existence à un packshot en staging.
 *
 * Les sorties japonaises attestées entrent sans visuel : les compter ici
 * noierait ce que ces tests vérifient — quel dump produit quel SKU.
 */
function packshotKeys(index: { products: Record<string, unknown> }): string[] {
  return Object.entries(index.products)
    .filter(([, raw]) => {
      const entry = raw as { image?: unknown; path?: unknown } | null;
      if (!entry?.image) return false;
      /*
        Les visuels curés vivent dans le provider, pas dans le pack : ils sont
        donc trouvés quel que soit le contenu du pack temporaire d'un test. Les
        compter ici noierait ce que ces tests vérifient — quel dump en staging
        produit quel SKU.
      */
      return !String(entry.path ?? "").startsWith("curated/");
    })
    .map(([key]) => key);
}

const NARUTO_PACK_ROOT_FOR_TESTS = "data/naruto/carddass";

const ATTESTED = narutoSealedSpecs().filter((spec) => spec.attested).length;

describe("Naruto sealed SKUs", async () => {
  it("lists Carddass FR+IT+JP SKUs plus the Coleka s28 display, not FR S6 or chrome", async () => {
    const slugs = NARUTO_SEALED_SKUS.map((row) => row.slug);
    expect(slugs).toEqual([
      "booster-s1",
      "booster-s2",
      "booster-s3",
      "booster-s4",
      "booster-s5",
      "starter-maitre-hokage",
      "starter-pays-du-vent",
      "starter-sceller-le-malefice",
      "starter-detruire-konoha",
      "starter-apprentissage",
      "starter-puissances-cachees",
      "starter-esprit-du-sable",
      "starter-invocation",
      "starter-la-quete",
      "starter-un-nouveau-depart",
      // Le bonus de précommande PS1 : quatre cartes connues, pas un booster.
      "ps-yoyaku-tokuten",
      "tin-box",
      "display-s1-it",
      "starter-forza-della-foglia",
      "booster-s1-it",
      "display-s2-it",
      "booster-s2-it",
      "booster-s3-it",
      "starter-il-fascino-del-male",
      "booster-vol5-jp",
      "display-s13",
      "display-s14",
      "display-s15",
      "display-s17",
      "display-s18",
      "display-s20",
      "display-s24",
      "display-s25",
      "display-s26",
      "display-s16",
      "display-s19",
      "display-s21",
      "display-s22",
      "display-s23",
      "display-s27",
      "display-s28",
    ]);
    expect(slugs.some((s) => s.includes("s6"))).toBe(false);
    expect(slugs).toContain("starter-il-fascino-del-male");
    expect(
      NARUTO_SEALED_SKUS.find(
        (row) => row.slug === "starter-il-fascino-del-male",
      )?.setCode,
    ).toBe("s6");
    expect(slugs.some((s) => s.startsWith("booster-s28"))).toBe(false);
    expect(
      NARUTO_SEALED_SKUS.some((row) =>
        /chronicles|mini|promo/i.test(row.stagingFile),
      ),
    ).toBe(false);
    expect(Object.keys(NARUTO_SET_LOGOS)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]);
    const display = NARUTO_SEALED_SKUS.find(
      (row) => row.slug === "display-s28",
    );
    expect(display?.kind).toBe("display");
    expect(display?.stagingKind).toBe("coleka-s28");
    expect(
      NARUTO_SEALED_SKUS.filter((row) => row.lang === "IT").map(
        (row) => row.slug,
      ),
    ).toEqual([
      "display-s1-it",
      "starter-forza-della-foglia",
      "booster-s1-it",
      "display-s2-it",
      "booster-s2-it",
      "booster-s3-it",
      "starter-il-fascino-del-male",
    ]);
    /*
      Le scellé japonais est le parent pauvre du catalogue : deux SKU pour une
      ligne de dix-sept volumes. `cardcheckbox-jp.json` en liste une trentaine
      (volumes, starters nommés, feuilles jumbo, coffret) — à minter.
    */
    expect(
      NARUTO_SEALED_SKUS.filter((row) => row.lang === "JA").map(
        (row) => row.slug,
      ),
    ).toEqual(["ps-yoyaku-tokuten", "booster-vol5-jp"]);
  });

  it("never treats a starter or booster as known contents", async () => {
    const root = tmpPack();
    const packshots = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "packshots",
    );
    fs.mkdirSync(path.join(packshots, "logos_series"), { recursive: true });
    fs.writeFileSync(path.join(packshots, "booster_s1.gif"), "gif");
    fs.writeFileSync(path.join(packshots, "starter_hokage_s1.gif"), "gif");
    fs.writeFileSync(
      path.join(packshots, "logos_series", "logo_s1.gif"),
      "logo",
    );

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    expect(result.skipped).toBe(NARUTO_SEALED_SKUS.length - 2);

    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        {
          contentsKnown: boolean;
          prints: unknown[];
          image: string;
          setLogo: string | null;
          declaredCardCount: number | null;
        }
      >;
    };
    const booster = index.products["naruto/carddass::booster-s1"]!;
    const starter = index.products["naruto/carddass::starter-maitre-hokage"]!;
    expect(booster.contentsKnown).toBe(false);
    expect(starter.contentsKnown).toBe(false);
    expect(booster.prints).toEqual([]);
    expect(starter.prints).toEqual([]);
    expect(booster.declaredCardCount).toBe(8);
    expect(starter.declaredCardCount).toBe(40);
    expect(booster.image).toBe(
      "/assets/naruto/carddass/products/booster-s1/fr/art.carddass.gif",
    );
    expect(starter.setLogo).toBe(
      // Le badge de série découpé (224×88) l'emporte sur le `logos_series` de
      // carddass.fr (100×39) — même image, cinq fois la surface.
      "/assets/naruto/carddass/products/starter-maitre-hokage/fr/logo.badge.png",
    );
    expect(
      fs.existsSync(
        path.join(root, "products", "booster-s1", "fr", "art.carddass.gif"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(root, "products", "booster-s1", "fr", "logo.badge.png"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(root, "products", "logo-s1.gif"))).toBe(
      false,
    );
  });

  it("prefers Tric Trac starter boxes over Via Ludibunda and carddass GIFs", async () => {
    const root = tmpPack();
    const packshots = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "packshots",
    );
    fs.mkdirSync(packshots, { recursive: true });
    fs.writeFileSync(path.join(packshots, "starter_hokage_s1.gif"), "gif");
    fs.writeFileSync(path.join(packshots, "starter_vent_s1.gif"), "gif");
    const shop = path.join(root, "staging", "vialudibunda");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(
      path.join(shop, "naruto-serie-1-deck-pays-du-vent.jpg"),
      "vl",
    );
    fs.writeFileSync(
      path.join(shop, "starter-naruto-serie-1-maitre-hokage.jpg"),
      "vl-hokage",
    );
    const tt = path.join(root, "staging", "trictrac");
    fs.mkdirSync(tt, { recursive: true });
    fs.writeFileSync(path.join(tt, "starter-pays-du-vent.jpeg"), "tt-vent");
    fs.writeFileSync(path.join(tt, "starter-maitre-hokage.jpeg"), "tt-hokage");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { image: string; path: string }> };
    const vent = index.products["naruto/carddass::starter-pays-du-vent"]!;
    const hokage = index.products["naruto/carddass::starter-maitre-hokage"]!;
    expect(vent.image).toBe(
      "/assets/naruto/carddass/products/starter-pays-du-vent/fr/art.trictrac.jpeg",
    );
    expect(vent.path).toBe("staging/trictrac/starter-pays-du-vent.jpeg");
    expect(hokage.image).toBe(
      "/assets/naruto/carddass/products/starter-maitre-hokage/fr/art.trictrac.jpeg",
    );
    expect(hokage.path).toBe("staging/trictrac/starter-maitre-hokage.jpeg");
    expect(
      fs.existsSync(
        path.join(
          root,
          "products",
          "starter-pays-du-vent",
          "fr",
          "art.trictrac.jpeg",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          root,
          "products",
          "starter-pays-du-vent",
          "fr",
          "art.vialudibunda.jpg",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          root,
          "products",
          "starter-pays-du-vent",
          "fr",
          "art.carddass.gif",
        ),
      ),
    ).toBe(true);
  });

  it("uses a SciFi-Universe 200px dump when no larger shop packshot exists", async () => {
    const root = tmpPack();
    const shop = path.join(root, "staging", "scifi-universe", "images");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, "11650-maitre-hokage.jpg"), "scifi");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(1 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { path: string }> };
    expect(index.products["naruto/carddass::starter-maitre-hokage"]?.path).toBe(
      "staging/scifi-universe/images/11650-maitre-hokage.jpg",
    );
  });

  it("keeps Tric Trac over SciFi-Universe when both dumps exist", async () => {
    const root = tmpPack();
    const scifi = path.join(root, "staging", "scifi-universe", "images");
    fs.mkdirSync(scifi, { recursive: true });
    fs.writeFileSync(path.join(scifi, "11650-maitre-hokage.jpg"), "scifi");
    const tt = path.join(root, "staging", "trictrac");
    fs.mkdirSync(tt, { recursive: true });
    fs.writeFileSync(path.join(tt, "starter-maitre-hokage.jpeg"), "tt-hokage");

    await ingestNarutoSealedProducts({ packRoot: root });
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { path: string }> };
    expect(index.products["naruto/carddass::starter-maitre-hokage"]?.path).toBe(
      "staging/trictrac/starter-maitre-hokage.jpeg",
    );
  });

  it("prefers the Via Ludibunda S1 booster JPEG over the carddass.fr GIF", async () => {
    const root = tmpPack();
    const packshots = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "packshots",
    );
    fs.mkdirSync(packshots, { recursive: true });
    fs.writeFileSync(path.join(packshots, "booster_s1.gif"), "gif");
    const shop = path.join(root, "staging", "vialudibunda");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, "naruto-serie-1-booster.jpg"), "jpeg");
    fs.writeFileSync(
      path.join(shop, "naruto-serie-1-deck-pays-du-vent.jpg"),
      "jpeg",
    );

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { image: string; path: string }> };
    const booster = index.products["naruto/carddass::booster-s1"]!;
    const vent = index.products["naruto/carddass::starter-pays-du-vent"]!;
    expect(booster.image).toBe(
      "/assets/naruto/carddass/products/booster-s1/fr/art.vialudibunda.jpg",
    );
    expect(booster.path).toBe(
      "staging/vialudibunda/naruto-serie-1-booster.jpg",
    );
    expect(vent.image).toBe(
      "/assets/naruto/carddass/products/starter-pays-du-vent/fr/art.vialudibunda.jpg",
    );
    expect(vent.path).toBe(
      "staging/vialudibunda/naruto-serie-1-deck-pays-du-vent.jpg",
    );
    expect(
      fs.existsSync(
        path.join(root, "products", "booster-s1", "fr", "art.vialudibunda.jpg"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(root, "products", "booster-s1", "fr", "art.carddass.gif"),
      ),
    ).toBe(true);
  });

  it("prefers the eBay S2 booster webp over the carddass.fr GIF", async () => {
    const root = tmpPack();
    const packshots = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "packshots",
    );
    fs.mkdirSync(packshots, { recursive: true });
    fs.writeFileSync(path.join(packshots, "booster_s2.gif"), "gif");
    const ebay = path.join(root, "staging", "ebay");
    fs.mkdirSync(ebay, { recursive: true });
    fs.writeFileSync(path.join(ebay, "booster-s2.webp"), "webp");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(1 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { image: string; path: string }> };
    const booster = index.products["naruto/carddass::booster-s2"]!;
    expect(booster.image).toBe(
      "/assets/naruto/carddass/products/booster-s2/fr/art.ebay.webp",
    );
    expect(booster.path).toBe("staging/ebay/booster-s2.webp");
  });

  it("uses Manga-News Deck Série covers as FR boosters, after shop photos", async () => {
    const root = tmpPack();
    const packshots = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "packshots",
    );
    fs.mkdirSync(packshots, { recursive: true });
    fs.writeFileSync(path.join(packshots, "booster_s1.gif"), "gif");
    fs.writeFileSync(path.join(packshots, "booster_s3.gif"), "gif");
    const shop = path.join(root, "staging", "vialudibunda");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, "naruto-serie-1-booster.jpg"), "jpeg");
    const mn = path.join(root, "staging", "manga-news", "images");
    fs.mkdirSync(mn, { recursive: true });
    fs.writeFileSync(path.join(mn, "tcg-naruto-deck-serie-1.jpg"), "mn1");
    fs.writeFileSync(path.join(mn, "tcg-naruto-deck-serie-3.jpg"), "mn3");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { image: string; path: string }> };
    expect(index.products["naruto/carddass::booster-s1"]?.path).toBe(
      "staging/vialudibunda/naruto-serie-1-booster.jpg",
    );
    expect(index.products["naruto/carddass::booster-s3"]?.image).toBe(
      "/assets/naruto/carddass/products/booster-s3/fr/art.manga-news.jpg",
    );
    expect(index.products["naruto/carddass::booster-s3"]?.path).toBe(
      "staging/manga-news/images/tcg-naruto-deck-serie-3.jpg",
    );
  });

  it("promotes the Coleka s28 cover to a display SKU, not a booster", async () => {
    const root = tmpPack();
    const coverDir = path.join(root, "staging", "coleka-s28");
    fs.mkdirSync(coverDir, { recursive: true });
    fs.writeFileSync(path.join(coverDir, "set-cover.webp"), "cover");

    const result = await ingestNarutoSealedProducts({ enPackRoot: root });
    expect(result.written).toBe(1 + ATTESTED);
    expect(
      fs.existsSync(
        path.join(root, "products", "display-s28", "en", "art.coleka.webp"),
      ),
    ).toBe(true);
    /*
      Ce test attendait aussi un `logo.coleka.webp` jusqu'au 2026-08-20 : la
      couverture servait à la fois de visuel et de logo, et les seize displays
      anglais affichaient donc leur propre photo en guise de logo de série.
      Une couverture de display n'est pas un logo — on n'en pose plus.
    */
    expect(
      fs.existsSync(
        path.join(root, "products", "display-s28", "en", "logo.coleka.webp"),
      ),
    ).toBe(false);
    expect(fs.existsSync(path.join(root, "products", "logo-s28.webp"))).toBe(
      false,
    );
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        {
          kind: string;
          contentsKnown: boolean;
          prints: unknown[];
          declaredCardCount: number | null;
          image: string;
          setLogo: string | null;
          lang: string;
        }
      >;
    };
    expect(packshotKeys(index)).toEqual(["naruto/carddass::display-s28"]);
    const display = index.products["naruto/carddass::display-s28"]!;
    expect(display.kind).toBe("display");
    expect(display.contentsKnown).toBe(false);
    expect(display.prints).toEqual([]);
    expect(display.declaredCardCount).toBeNull();
    expect(display.image).toBe(
      "/assets/naruto/carddass/products/display-s28/en/art.coleka.webp",
    );
    /*
      La couverture du display n'est pas un logo — mais le wordmark du jeu en
      est un, et il est arrivé le même jour. Les seize séries anglaises le
      partagent : c'est le logo du **jeu**, pas d'une série.
    */
    expect(display.setLogo).toBe(
      "/assets/naruto/carddass/products/display-s28/en/logo.kingslayer.jpg",
    );
    expect(display.lang).toBe("EN");
  });

  it("promotes Coleka EN CCG covers to display SKUs, not Kayou", async () => {
    const root = tmpPack();
    const coverDir = path.join(root, "staging", "coleka-en-covers");
    fs.mkdirSync(coverDir, { recursive: true });
    fs.writeFileSync(path.join(coverDir, "s13.webp"), "s13");
    fs.writeFileSync(path.join(coverDir, "s26.webp"), "s26");

    const result = await ingestNarutoSealedProducts({ enPackRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<string, { kind: string; name: string; lang: string }>;
    };
    expect(packshotKeys(index).sort()).toEqual([
      "naruto/carddass::display-s13",
      "naruto/carddass::display-s26",
    ]);
    expect(index.products["naruto/carddass::display-s13"]?.name).toContain(
      "Fateful Reunion",
    );
    expect(index.products["naruto/carddass::display-s26"]?.name).toContain(
      "Avenger's Wrath",
    );
    expect(index.products["naruto/carddass::display-s13"]?.kind).toBe(
      "display",
    );
    expect(index.products["naruto/carddass::display-s13"]?.lang).toBe("EN");
    expect(fs.existsSync(path.join(root, "products", "kayou.webp"))).toBe(
      false,
    );
  });

  it("files CardGameClub Italian SKUs on CACG, not Bandai CCG", async () => {
    const root = tmpPack();
    const shop = path.join(root, "staging", "cardgameclub");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, "booster-s1-it.png"), "png");
    fs.writeFileSync(path.join(shop, "display-s1-it.png"), "png");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        {
          kind: string;
          lang: string;
          declaredCardCount: number | null;
          contentsKnown: boolean;
          image: string;
          path: string;
        }
      >;
    };
    expect(packshotKeys(index).sort()).toEqual([
      "naruto/carddass::booster-s1-it",
      "naruto/carddass::display-s1-it",
    ]);
    const booster = index.products["naruto/carddass::booster-s1-it"]!;
    const display = index.products["naruto/carddass::display-s1-it"]!;
    expect(booster.lang).toBe("IT");
    expect(booster.declaredCardCount).toBe(8);
    expect(booster.contentsKnown).toBe(false);
    expect(booster.image).toBe(
      "/assets/naruto/carddass/products/booster-s1-it/it/art.cardgameclub.png",
    );
    expect(booster.path).toBe("staging/cardgameclub/booster-s1-it.png");
    expect(display.kind).toBe("display");
    expect(display.declaredCardCount).toBeNull();
    expect(index.products["naruto/carddass::display-s13"]).toBeUndefined();
  });

  it("files the Martina S6 IT starter as a 40-card deck, not a booster", async () => {
    const root = tmpPack();
    const shop = path.join(root, "staging", "martina");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, "starter-il-fascino-del-male.jpg"), "jpg");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(1 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        {
          kind: string;
          lang: string;
          setCode: string | null;
          declaredCardCount: number | null;
          contentsKnown: boolean;
          path: string;
        }
      >;
    };
    const starter =
      index.products["naruto/carddass::starter-il-fascino-del-male"]!;
    expect(starter.kind).toBe("deck");
    expect(starter.lang).toBe("IT");
    expect(starter.setCode).toBe("s6");
    expect(starter.declaredCardCount).toBe(40);
    expect(starter.contentsKnown).toBe(false);
    expect(starter.path).toBe(
      "staging/martina/starter-il-fascino-del-male.jpg",
    );
    expect(index.products["naruto/carddass::booster-s6"]).toBeUndefined();
    expect(index.products["naruto/carddass::booster-s6-it"]).toBeUndefined();
  });

  it("files the JP 巻ノ五 booster on Carddass with 6 cards, not FR s5", async () => {
    const root = tmpPack();
    const shop = path.join(root, "staging", "gradedcardcenter");
    fs.mkdirSync(shop, { recursive: true });
    fs.writeFileSync(path.join(shop, "booster-vol5-jp.jpg"), "jpg");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(1 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        {
          lang: string;
          setCode: string | null;
          declaredCardCount: number | null;
          contentsKnown: boolean;
          name: string | null;
          image: string;
          path: string;
          setLogo: string | null;
        }
      >;
    };
    expect(packshotKeys(index)).toEqual(["naruto/carddass::booster-vol5-jp"]);
    const booster = index.products["naruto/carddass::booster-vol5-jp"]!;
    expect(booster.lang).toBe("JA");
    expect(booster.setCode).toBe("maki5");
    expect(booster.declaredCardCount).toBe(6);
    expect(booster.contentsKnown).toBe(false);
    expect(booster.name).toContain("巻ノ五");
    expect(booster.setLogo).toBeNull();
    expect(booster.image).toBe(
      "/assets/naruto/carddass/products/booster-vol5-jp/ja/art.gradedcardcenter.jpg",
    );
    expect(booster.path).toBe("staging/gradedcardcenter/booster-vol5-jp.jpg");
    expect(index.products["naruto/carddass::booster-s5"]).toBeUndefined();
  });

  it("promotes Goat Coleka-gap boxes to EN displays, not s1–s6", async () => {
    const root = tmpPack();
    const goat = path.join(root, "staging", "goat-en-boxes");
    fs.mkdirSync(goat, { recursive: true });
    fs.writeFileSync(path.join(goat, "s16.gif"), "s16");
    fs.writeFileSync(path.join(goat, "s19.jpg"), "s19");
    fs.writeFileSync(path.join(goat, "s1.jpg"), "not-a-sku");

    const result = await ingestNarutoSealedProducts({ enPackRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        {
          name: string;
          lang: string;
          kind: string;
          path: string;
          image: string;
        }
      >;
    };
    expect(packshotKeys(index).sort()).toEqual([
      "naruto/carddass::display-s16",
      "naruto/carddass::display-s19",
    ]);
    expect(index.products["naruto/carddass::display-s16"]?.name).toContain(
      "Broken Promises",
    );
    expect(index.products["naruto/carddass::display-s16"]?.lang).toBe("EN");
    expect(index.products["naruto/carddass::display-s16"]?.kind).toBe(
      "display",
    );
    expect(index.products["naruto/carddass::display-s16"]?.path).toBe(
      "staging/goat-en-boxes/s16.gif",
    );
    expect(index.products["naruto/carddass::display-s16"]?.image).toBe(
      "/assets/naruto/carddass/products/display-s16/en/art.goat.gif",
    );
    expect(index.products["naruto/carddass::display-s1"]).toBeUndefined();
    expect(fs.existsSync(path.join(root, "products", "display-s1.jpg"))).toBe(
      false,
    );
  });

  it("writes FR boosters and EN displays into the same Carddass index", async () => {
    const root = tmpPack();
    const packshots = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "packshots",
    );
    fs.mkdirSync(packshots, { recursive: true });
    fs.writeFileSync(path.join(packshots, "booster_s1.gif"), "gif");
    const coverDir = path.join(root, "staging", "coleka-s28");
    fs.mkdirSync(coverDir, { recursive: true });
    fs.writeFileSync(path.join(coverDir, "set-cover.webp"), "cover");

    const result = await ingestNarutoSealedProducts({ packRoot: root });
    expect(result.written).toBe(2 + ATTESTED);
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { pack: string; products: Record<string, { lang: string }> };
    expect(index.pack).toBe("naruto/carddass");
    expect(packshotKeys(index).sort()).toEqual([
      "naruto/carddass::booster-s1",
      "naruto/carddass::display-s28",
    ]);
    expect(index.products["naruto/carddass::booster-s1"]?.lang).toBe("FR");
    expect(index.products["naruto/carddass::display-s28"]?.lang).toBe("EN");
    expect(fs.existsSync(path.join(root, ".en-ccg"))).toBe(false);
  });
});

describe("le dos de l'emballage", () => {
  /*
    Sept annonces Mercari montrent le sachet du bonus PS1, recto et verso. Le
    verso porte l'éditeur et son adresse, la centrale service client,
    l'interdiction d'export hors Japon et le texte de contenu — rien de tout
    cela n'est lisible au recto. Le modèle n'avait qu'un visuel par SKU.
  */
  it("installe le verso et le publie sous imageBack", async () => {
    const root = tmpPack();
    fs.mkdirSync(path.join(root, "staging", "tv-tokyo"), { recursive: true });
    fs.mkdirSync(path.join(root, "staging", "mercari"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "staging", "tv-tokyo", "ps-yoyaku-tokuten.gif"),
      "gif",
    );
    fs.writeFileSync(
      path.join(
        root,
        "staging",
        "mercari",
        "ps-yoyaku-tokuten-wrapper-back.jpg",
      ),
      "jpg",
    );

    await ingestNarutoSealedProducts({ packRoot: root });
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<string, { imageBack: string | null; image: string }>;
    };
    const ps = index.products["naruto/carddass::ps-yoyaku-tokuten"];
    expect(ps?.imageBack).toBe(
      "/assets/naruto/carddass/products/ps-yoyaku-tokuten/ja/back.mercari.jpg",
    );
    // Le recto reste le visuel officiel : le verso ne le remplace pas.
    expect(ps?.image).toContain("art.tvtokyo");
  });

  it("garde le verso curé même quand le pack ne contient rien", async () => {
    const root = tmpPack();
    fs.mkdirSync(path.join(root, "staging", "tv-tokyo"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "staging", "tv-tokyo", "ps-yoyaku-tokuten.gif"),
      "gif",
    );

    await ingestNarutoSealedProducts({ packRoot: root });
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as { products: Record<string, { imageBack: string | null }> };
    /*
      Le verso est une photo choisie à la main : il vit dans `curated/`, donc
      dans le provider et non dans le pack. Il est trouvé quel que soit le
      contenu du pack — c'est tout l'intérêt de ne pas l'avoir mis en staging,
      que la prochaine moisson aurait effacé.
    */
    expect(
      index.products["naruto/carddass::ps-yoyaku-tokuten"]?.imageBack,
    ).toContain("back.mercari.jpg");
  });
});

describe("le logo n'est pas le produit", () => {
  /*
    Relevé le 2026-08-20 : sur les seize displays anglais, `setLogo` était la
    **photo du display elle-même**, octet pour octet — le produit en tout petit.
    Les couvertures Coleka et Goat alimentaient à la fois le visuel et le logo.
    Un doublon renseigne moins que rien : il se fait passer pour une donnée.
  */
  it("ne pose jamais le visuel du produit comme logo de série", async () => {
    const index = JSON.parse(
      fs.readFileSync(
        path.join(NARUTO_PACK_ROOT_FOR_TESTS, "products-index.json"),
        "utf8",
      ),
    ) as {
      products: Record<
        string,
        { image: string | null; setLogo: string | null }
      >;
    };
    const dup: string[] = [];
    for (const [key, entry] of Object.entries(index.products)) {
      if (!entry.image || !entry.setLogo) continue;
      const toDisk = (u: string) =>
        path.join(
          NARUTO_PACK_ROOT_FOR_TESTS,
          u.replace("/assets/naruto/carddass/", ""),
        );
      try {
        const a = fs.readFileSync(toDisk(entry.image));
        const l = fs.readFileSync(toDisk(entry.setLogo));
        if (a.equals(l)) dup.push(key);
      } catch {
        /* fichier absent : hors sujet ici */
      }
    }
    expect(dup).toEqual([]);
  });
});

describe("le logo du CCG anglais", () => {
  /*
    Les seize displays anglais partagent un seul logo : le wordmark
    « SHONEN JUMP NARUTO SHIPPUDEN COLLECTIBLE CARD GAME ». Partager est
    légitime ici — c'est le logo du **jeu**, pas d'une série. C'est l'inverse
    du défaut corrigé le même jour, où chaque display portait sa propre photo
    en guise de logo.
  */
  it("pose le même wordmark sur les seize séries anglaises", () => {
    const index = JSON.parse(
      fs.readFileSync(
        path.join(NARUTO_PACK_ROOT_FOR_TESTS, "products-index.json"),
        "utf8",
      ),
    ) as {
      products: Record<string, { lang: string | null; setLogo: string | null }>;
    };
    const en = Object.values(index.products).filter((p) => p.lang === "EN");
    expect(en).toHaveLength(16);
    expect(en.every((p) => p.setLogo?.endsWith("logo.kingslayer.jpg"))).toBe(
      true,
    );
  });
});

describe("les faces qu'aucune source ne réclame plus", () => {
  /*
    `installDump` n'élaguait que la même source sous une autre extension. Une
    source **retirée** du modèle laissait donc son fichier sur le disque, et
    comme le choix se fait aux pixels, un fichier périmé et grand continuait de
    battre le fichier juste et petit qui devait le remplacer.

    C'est arrivé pour de bon : la fiche officielle du 巻ノ四 illustre le produit
    par six cartes étalées, sans emballage. On lui a préféré le sachet du site
    de jeu, et le catalogue a pourtant servi la planche de cartes encore une
    moisson entière — le 560×560 gagnait contre le 75×144.
  */
  it("retire la face d'une source que le modèle ne cite plus", async () => {
    const root = tmpPack();
    const staging = path.join(
      root,
      "staging",
      "carddas-jp",
      "www.carddas.com",
      "naruto",
      "image",
      "product",
    );
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, "4nd.gif"), "gif");

    // Ce que la moisson précédente avait posé, du temps où la fiche servait.
    const dest = path.join(root, "products", "booster-vol4-jp", "ja");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "art.carddassofficial.jpg"), "jpg");

    await ingestNarutoSealedProducts({ packRoot: root });

    expect(fs.existsSync(path.join(dest, "art.carddassofficial.jpg"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(dest, "art.carddasjp.gif"))).toBe(true);
  });

  /*
    Le garde-fou. Un staging absent — checkout partiel, moisson non rejouée —
    ne veut pas dire « plus aucune source » : sans cette condition, l'élagage
    viderait des visuels parfaitement valides au premier build incomplet.
  */
  it("ne touche à rien quand aucune source n'a été moissonnée", async () => {
    const root = tmpPack();
    const dest = path.join(root, "products", "booster-vol4-jp", "ja");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "art.carddassofficial.jpg"), "jpg");

    await ingestNarutoSealedProducts({ packRoot: root });

    expect(fs.existsSync(path.join(dest, "art.carddassofficial.jpg"))).toBe(
      true,
    );
  });
});

describe("le badge de série par-delà les langues", () => {
  /*
    Les badges n'existent que dans deux langues — le français pour les séries
    1 à 5, l'allemand pour les 6 à 9. Tant qu'on exigeait la langue exacte,
    treize SKU restaient sans logo : les séries 1 à 5 en allemand et en
    italien, la 6 en italien.

    Un badge porte d'abord le **numéro** de la série, et il se lit pareil dans
    toutes les langues. L'accent de « SÉRIE » ne vaut pas qu'on laisse un
    produit nu.
  */
  it("sert le badge français aux séries italiennes et allemandes", async () => {
    const root = tmpPack();
    await ingestNarutoSealedProducts({ packRoot: root });
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        { setCode: string | null; lang: string; setLogo: string | null }
      >;
    };
    const rows = Object.values(index.products).filter(
      (row) => row.setCode && /^s[1-9]$/.test(row.setCode),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.setLogo)).toEqual([]);
  });

  /*
    Le repli ne doit pas écraser ce qui existe : une série allemande qui a son
    propre badge le garde. Sa langue est essayée avant les autres.
  */
  it("garde le badge allemand là où il existe", async () => {
    const root = tmpPack();
    await ingestNarutoSealedProducts({ packRoot: root });
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "products-index.json"), "utf8"),
    ) as {
      products: Record<
        string,
        { setCode: string | null; lang: string; setLogo: string | null }
      >;
    };
    const de = Object.values(index.products).find(
      (row) => row.setCode === "s7" && row.lang === "DE",
    );
    expect(de?.setLogo).toContain("/de/logo.badge.png");
  });
});
