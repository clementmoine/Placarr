import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collisionsFrom, titleMismatches, type FaceRef, foldUnsourcedNarutoArt, inferUnsourcedNarutoSource, planUnsourcedNarutoArt } from "./audit";
import sharp from "sharp";

// —— auditFaceCollisions ——
{
  function refs(...cards: [string, string][]): FaceRef[] {
    return cards.map(([card, source]) => ({
      card,
      lang: "en",
      source,
      file: `${card}/${source}`,
    }));
  }

  describe("collisionsFrom", () => {
    const titles: Record<string, string> = {
      j1033: "SPATTER'S RUSH",
      j1043: "Lightning Blade Single Slash",
      n0100: "Naruto Uzumaki",
      n0200: "Naruto Uzumaki",
    };
    const titleOf = (card: string) => titles[card] ?? null;

    it("signale deux tirages de titres différents qui partagent les mêmes octets", () => {
      const found = collisionsFrom(
        new Map([["h1", refs(["j1033", "vintage"], ["j1043", "vintage"])]]),
        titleOf,
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ reprint: false });
      expect(found[0]?.cards.sort()).toEqual(["j1033", "j1043"]);
    });

    /*
      Le jeu rejoue la même illustration d'un set à l'autre : deux numéros au
      même nom qui partagent une image, c'est une réimpression, pas une faute.
      Sans cette distinction l'outil crierait 57 fois pour rien.
    */
    it("laisse passer une réimpression : même nom sous deux numéros", () => {
      const found = collisionsFrom(
        new Map([["h1", refs(["n0100", "drive"], ["n0200", "drive"])]]),
        titleOf,
      );
      expect(found[0]?.reprint).toBe(true);
    });

    it("ne dit rien d'une image qui n'appartient qu'à un tirage", () => {
      expect(
        collisionsFrom(new Map([["h1", refs(["j1033", "drive"])]]), titleOf),
      ).toEqual([]);
    });

    it("met les cas douteux devant les réimpressions", () => {
      const found = collisionsFrom(
        new Map([
          ["h1", refs(["n0100", "drive"], ["n0200", "drive"])],
          ["h2", refs(["j1033", "vintage"], ["j1043", "vintage"])],
        ]),
        titleOf,
      );
      expect(found[0]?.reprint).toBe(false);
      expect(found[1]?.reprint).toBe(true);
    });

    it("garde la trace des sources en cause", () => {
      const found = collisionsFrom(
        new Map([["h1", refs(["j1033", "vintage"], ["j1043", "drive"])]]),
        titleOf,
      );
      expect(found[0]?.sources.sort()).toEqual(["drive", "vintage"]);
    });
  });

  describe("titleMismatches", () => {
    const shown = [
      { card: "n0849", lang: "en", source: "drive" },
      { card: "n1815", lang: "en", source: "vintage" },
    ];
    const catalogue: Record<string, string> = {
      n0849: "Ghost Samurai",
      n1815: "Sakura Haruno",
    };
    const source: Record<string, string> = {
      n0849: "Cursed Warrior",
      n1815: "sakura haruno",
    };

    it("signale une face dont le relevé nomme autrement que notre titre", () => {
      const found = titleMismatches(
        shown,
        (c) => catalogue[c] ?? null,
        (_s, c) => source[c] ?? null,
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        card: "n0849",
        catalogue: "Ghost Samurai",
        sourceName: "Cursed Warrior",
      });
    });

    it("ne s'arrête pas à la casse ni aux espaces", () => {
      // `sakura haruno` et `Sakura Haruno` sont le même nom.
      const found = titleMismatches(
        [shown[1]!],
        (c) => catalogue[c] ?? null,
        (_s, c) => source[c] ?? null,
      );
      expect(found).toEqual([]);
    });

    it("se tait quand l'un des deux noms manque", () => {
      expect(
        titleMismatches(
          shown,
          () => null,
          () => "quelque chose",
        ),
      ).toEqual([]);
      expect(
        titleMismatches(
          shown,
          (c) => catalogue[c] ?? null,
          () => null,
        ),
      ).toEqual([]);
    });
  });
}

// —— foldUnsourcedNarutoArt ——
{
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  describe("inferUnsourcedNarutoSource", () => {
    it("names JA nikita, FR carddass, IT coleka, EN by size", () => {
      expect(
        inferUnsourcedNarutoSource({ lang: "ja", width: 340, height: 500 }),
      ).toBe("nikita");
      expect(
        inferUnsourcedNarutoSource({ lang: "fr", width: 350, height: 495 }),
      ).toBe("carddass");
      expect(
        inferUnsourcedNarutoSource({ lang: "fr", width: 843, height: 1206 }),
      ).toBe("carddass");
      expect(
        inferUnsourcedNarutoSource({ lang: "it", width: 1007, height: 1500 }),
      ).toBe("coleka");
      expect(
        inferUnsourcedNarutoSource({ lang: "en", width: 750, height: 1050 }),
      ).toBe("vintage");
      expect(
        inferUnsourcedNarutoSource({ lang: "en", width: 350, height: 490 }),
      ).toBe("goat");
      expect(
        inferUnsourcedNarutoSource({
          lang: "en",
          appearanceSet: "s28",
          width: 350,
          height: 490,
        }),
      ).toBe("stop2shop");
    });

    it("does not invent a host for collector photos or odd EN thumbs", () => {
      expect(
        inferUnsourcedNarutoSource({ lang: "fr", width: 1076, height: 1500 }),
      ).toBeNull();
      expect(
        inferUnsourcedNarutoSource({ lang: "en", width: 200, height: 285 }),
      ).toBeNull();
    });
  });

  describe("planUnsourcedNarutoArt", () => {
    it("drops a byte-identical named sibling", () => {
      expect(
        planUnsourcedNarutoArt({
          unsourcedFile: "art.jpg",
          unsourcedHash: "abc",
          named: [{ source: "suruga", file: "art.suruga.jpg", hash: "abc" }],
          lang: "ja",
          width: 351,
          height: 512,
        }),
      ).toEqual({ op: "delete", keep: "art.suruga.jpg" });
    });

    it("renames a unique JA nikita scan", () => {
      expect(
        planUnsourcedNarutoArt({
          unsourcedFile: "art.jpg",
          unsourcedHash: "nikita",
          named: [{ source: "suruga", file: "art.suruga.jpg", hash: "other" }],
          lang: "ja",
          width: 340,
          height: 500,
        }),
      ).toEqual({ op: "rename", source: "nikita" });
    });

    it("keeps unique bytes when that source is already named", () => {
      expect(
        planUnsourcedNarutoArt({
          unsourcedFile: "art.jpg",
          unsourcedHash: "mystery",
          named: [{ source: "nikita", file: "art.nikita.jpg", hash: "n" }],
          lang: "ja",
          width: 340,
          height: 500,
        }),
      ).toEqual({ op: "keep" });
    });
  });

  describe("foldUnsourcedNarutoArt", () => {
    it("deletes a Suruga duplicate and renames leftover nikita", async () => {
      const root = path.join(os.tmpdir(), `naruto-fold-${Date.now()}`);
      dirs.push(root);
      const ja = path.join(root, "cards", "ninja", "ni0001", "ja");
      mkdirSync(ja, { recursive: true });
      const dup = await sharp({
        create: {
          width: 10,
          height: 14,
          channels: 3,
          background: { r: 1, g: 2, b: 3 },
        },
      })
        .jpeg()
        .toBuffer();
      const nikita = await sharp({
        create: {
          width: 340,
          height: 500,
          channels: 3,
          background: { r: 9, g: 8, b: 7 },
        },
      })
        .jpeg()
        .toBuffer();
      writeFileSync(path.join(ja, "art.jpg"), dup);
      writeFileSync(path.join(ja, "art.suruga.jpg"), dup);
      writeFileSync(path.join(ja, "face.json"), '{"art":"art.jpg"}\n');
      const ni2 = path.join(root, "cards", "ninja", "ni0002", "ja");
      mkdirSync(ni2, { recursive: true });
      writeFileSync(path.join(ni2, "art.jpg"), nikita);

      const out = await foldUnsourcedNarutoArt(root);
      expect(out).toEqual({ deleted: 1, renamed: 1, kept: 0 });
      expect(readFileSync(path.join(ja, "face.json"), "utf8")).toContain(
        "art.suruga.jpg",
      );
      expect(readFileSync(path.join(ni2, "art.nikita.jpg")).equals(nikita)).toBe(
        true,
      );
    });
  });
}

