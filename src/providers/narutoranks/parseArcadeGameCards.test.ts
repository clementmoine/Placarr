import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { packStagingDir } from "@/lib/packPaths";

import { createArcadeNameCheck } from "./arcadeGameCards";
import {
  arcadeBackImageUrl,
  arcadeListingUrls,
  arcadeReferenceToCard,
  ARCADE_LANG,
  fileEchoesReference,
  namesAgree,
  parseArcadeListing,
} from "./parseArcadeGameCards";
import { NARUTO_RANKS_PACK_ID } from "./pack";

/** Un bloc produit, tel que la boutique l'écrit. */
function product(printed: string, name: string, file: string): string {
  return `<li class="product type-product">
    <a href="/product/x"><img src="https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/${file}?w=740&ssl=1"></a>
    <h2 class="woocommerce-loop-product__title">Naruto 2002 Panini Card ${printed} ${name}</h2>
  </li>`;
}

const CHECKLIST: Record<string, string> = {
  "nr-0001": "Title Card",
  "nr-0002": "Group 7 puzzle",
  "nr-0006": "Naruto-Sasuke-Sakura",
  "nr-0010": "Naruto",
  "nr-0040": "Rock lee",
  "sd-0003": "Sasuke",
  "sd-0004": "Kakashi",
  "ff-0001": "Guy - Kakashi",
};
const nameCheck = (setCode: string, number: string, vendorName: string) => {
  const expected = CHECKLIST[`${setCode}-${number}`];
  if (!expected) return false;
  return namesAgree(vendorName, expected);
};

describe("parseArcadeListing", () => {
  it("retient une carte dont la référence, le fichier et le nom concordent", () => {
    const { cards } = parseArcadeListing(
      product("40", "Rock lee", "naruto2002paninicard40front.jpg"),
      nameCheck,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ setCode: "nr", number: "0040" });
  });

  it("accepte card010front pour la carte 10", () => {
    const { cards } = parseArcadeListing(
      product("10", "Naruto", "naruto2002paninicard010front.jpg"),
      nameCheck,
    );
    expect(cards).toMatchObject([{ setCode: "nr", number: "0010" }]);
  });

  it("accepte les suffixes personnages sur les puzzles Groupe 7", () => {
    const { cards } = parseArcadeListing(
      product("02", "Group 7 Naruto Sakura", "naruto2002paninicard02front.jpg"),
      nameCheck,
    );
    expect(cards).toMatchObject([{ setCode: "nr", number: "0002" }]);
  });

  it("accepte un insert, dont le fichier porte le code", () => {
    const { cards } = parseArcadeListing(
      product("FF1", "Guy Kakashi", "naruto2002paniniff1front.jpg"),
      nameCheck,
    );
    expect(cards[0]).toMatchObject({ setCode: "ff", number: "0001" });
  });

  it("refuse les deux fiches SD dont les noms sont intervertis", () => {
    const html =
      product("SD3", "Kakashi", "naruto2002paninisd3front-e161.jpg") +
      product("SD3", "Sasuke", "naruto2002paninisd4front-e161.jpg");
    const { cards, rejected } = parseArcadeListing(html, nameCheck);
    expect(cards).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[0]!.reason).toMatch(/checklist/);
    expect(rejected[1]!.reason).toMatch(/ne redit pas la référence/);
  });

  it("refuse une fiche dont le nom ne passe pas la checklist", () => {
    const { cards, rejected } = parseArcadeListing(
      product("99", "Inconnue", "naruto2002paninicard99front.jpg"),
      () => false,
    );
    expect(cards).toHaveLength(0);
    expect(rejected[0]!.reason).toMatch(/checklist/);
  });
});

describe("createArcadeNameCheck", () => {
  it("accepte le titre vendeur attesté de la carte 1", () => {
    const check = createArcadeNameCheck();
    expect(check("nr", "0001", "The Ninja Are Here")).toBe(true);
  });
});

describe("les trois signaux, pris un par un", () => {
  it("lit la référence : nue pour la base, préfixée pour un insert", () => {
    expect(arcadeReferenceToCard("02")).toEqual({
      setCode: "nr",
      number: "0002",
    });
    expect(arcadeReferenceToCard("FF1")).toEqual({
      setCode: "ff",
      number: "0001",
    });
    expect(arcadeReferenceToCard("")).toBeNull();
  });

  it("vérifie que le fichier redit la référence", () => {
    expect(
      fileEchoesReference("https://x/naruto2002paninicard02front.jpg", "02"),
    ).toBe(true);
    expect(
      fileEchoesReference("https://x/naruto2002paninicard010front.jpg", "10"),
    ).toBe(true);
    expect(
      fileEchoesReference("https://x/naruto2002paniniff1front.jpg", "FF1"),
    ).toBe(true);
    expect(
      fileEchoesReference("https://x/naruto2002paninisd4front-e1.jpg", "SD3"),
    ).toBe(false);
    expect(
      fileEchoesReference("https://x/naruto2002paninicard12front.jpg", "02"),
    ).toBe(false);
  });

  it("compare les noms sans buter sur la casse ni les séparateurs", () => {
    expect(namesAgree("Guy Kakashi", "Guy - Kakashi")).toBe(true);
    expect(namesAgree("Rock lee", "ROCK LEE")).toBe(true);
    expect(
      namesAgree("Naruto Sakura Sasuke", "Naruto-Sasuke-Sakura"),
    ).toBe(true);
    expect(namesAgree("Kakashi", "Sasuke")).toBe(false);
  });

  it("dérive le verso en remplaçant front par back dans l'URL", () => {
    expect(
      arcadeBackImageUrl(
        "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/naruto2002paninicard72front.jpg?w=740",
      ),
    ).toBe(
      "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/naruto2002paninicard72back.jpg?w=740",
    );
  });

  it("vise l'édition américaine, sur trois pages", () => {
    expect(ARCADE_LANG).toBe("en");
    const urls = arcadeListingUrls();
    expect(urls).toHaveLength(3);
    expect(urls[2]).toMatch(/page\/3\/$/);
  });
});

const STAGING = path.join(
  packStagingDir(NARUTO_RANKS_PACK_ID),
  "arcadegamecards",
);
const HAS_CACHED_LISTING = existsSync(
  path.join(STAGING, "listing-0.html"),
);

describe.skipIf(!HAS_CACHED_LISTING)(
  "moisson arcadegamecards (HTML en cache, 2026-08-22)",
  () => {
    it("accepte 78 prints et refuse exactement trois fiches", () => {
      const check = createArcadeNameCheck();
      const found = new Map<string, string>();
      const rejected: { printed: string; reason: string }[] = [];

      for (const f of readdirSync(STAGING).filter((x) =>
        x.startsWith("listing-"),
      )) {
        const { cards, rejected: pageRejected } = parseArcadeListing(
          readFileSync(path.join(STAGING, f), "utf8"),
          check,
        );
        for (const c of cards) found.set(`${c.setCode}-${c.number}`, c.printed);
        rejected.push(...pageRejected);
      }

      expect(found.size).toBe(78);
      expect(rejected).toHaveLength(3);
      expect(rejected.map((r) => r.printed).sort()).toEqual(["21", "SD3", "SD3"]);
    });

    it("couvre 71/72 cartes de base", () => {
      const check = createArcadeNameCheck();
      const nr = new Set<string>();
      for (const f of readdirSync(STAGING).filter((x) =>
        x.startsWith("listing-"),
      )) {
        const { cards } = parseArcadeListing(
          readFileSync(path.join(STAGING, f), "utf8"),
          check,
        );
        for (const c of cards) {
          if (c.setCode === "nr") nr.add(c.number);
        }
      }
      expect(nr.size).toBe(71);
      expect(nr.has("0021")).toBe(false);
      for (const n of ["0001", "0002", "0003", "0006", "0010"]) {
        expect(nr.has(n)).toBe(true);
      }
    });
  },
);
