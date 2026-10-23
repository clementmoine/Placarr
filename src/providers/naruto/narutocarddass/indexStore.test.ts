import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  expandNarutoCardsIndexMembershipSiblings,
  exportNarutoCardsIndexJson,
  narutoDeckGuaranteeSetsByCollector,
  writeNarutoCcgIndex,
} from "./indexStore";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("exportNarutoCardsIndexJson", () => {
  it("writes per-locale names and keeps NI distinct from N", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "naruto-index-"));
    dirs.push(dir);
    const out = path.join(dir, "cards-index.json");
    const index = exportNarutoCardsIndexJson(
      [
        {
          printKey: "naruto:ni-0001",
          setCode: "s1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:n-0001",
          setCode: "s1",
          number: "n0001",
          cardType: "n",
          family: "ninja",
        },
        {
          printKey: "naruto:ni-0264",
          setCode: "s6",
          number: "ni0264",
          cardType: "ni",
          family: "ninja",
        },
      ],
      [],
      out,
      [
        {
          printKey: "naruto:ni-0001",
          lang: "fr",
          fullName: "Naruto Uzumaki",
        },
        {
          printKey: "naruto:ni-0001",
          lang: "ja",
          fullName: "うずまきナルト",
        },
        {
          printKey: "naruto:n-0001",
          lang: "en",
          fullName: "Naruto Uzumaki",
        },
        {
          printKey: "naruto:ni-0264",
          lang: "fr",
          fullName: "Shikamaru Nara & Temari",
        },
      ],
    );
    expect(index.cards["naruto:ni-0001"]?.langs.fr?.name).toBe(
      "Naruto Uzumaki",
    );
    expect(index.cards["naruto:ni-0001"]?.langs.ja?.name).toBe(
      "うずまきナルト",
    );
    expect(index.cards["naruto:n-0001"]?.langs.en?.name).toBe("Naruto Uzumaki");
    expect(index.cards["naruto:n-0001"]?.name).toBe("Naruto Uzumaki");
    expect(index.cards["naruto:ni-0264"]?.langs.fr?.printed).toBe(false);
    const disk = JSON.parse(readFileSync(out, "utf8")) as typeof index;
    expect(disk.cards["naruto:ni-0001"]?.langs.ja?.name).toBe("うずまきナルト");
  });

  it("writes one Kakashi print when an old s6 key is still present", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "naruto-index-"));
    dirs.push(dir);
    const out = path.join(dir, "cards-index.json");
    const index = exportNarutoCardsIndexJson(
      [
        {
          printKey: "naruto:ni-0064",
          setCode: "s2",
          number: "ni0064",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:s6-ni064",
          setCode: "s6",
          number: "ni064",
          cardType: "ni",
        },
      ],
      [
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          art: "art.jpg",
        },
      ],
      out,
      [
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          fullName: "Kakashi Hatake",
        },
        {
          printKey: "naruto:s6-ni064",
          lang: "fr",
          fullName: "qui",
        },
      ],
    );
    expect(index.cards["naruto:s6-ni064"]).toBeUndefined();
    expect(index.cards["naruto:ni-0064"]?.langs.fr).toMatchObject({
      name: "Kakashi Hatake",
      art: "art.jpg",
    });
    expect(index.cards["naruto:ni-0064"]?.langs.fr?.printed).toBeUndefined();
  });
});

describe("writeNarutoCcgIndex", () => {
  const print = {
    printKey: "naruto:ni-0001",
    setCode: "s1",
    number: "ni0001",
    cardType: "character",
  };

  function scratch(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "naruto-index-"));
    dirs.push(dir);
    return path.join(dir, "catalog.sqlite");
  }

  it("nomme le tirage manquant plutôt que de rendre « constraint failed »", () => {
    // Le cas réel : des faces d'un jeu voisin ramassées par erreur, sans
    // tirage en face. SQLite ne disait que « constraint failed », et la seule
    // piste restante était une base vide.
    expect(() =>
      writeNarutoCcgIndex({
        prints: [print],
        assets: [
          { printKey: "naruto:mju-0023", lang: "ja", art: "art.nikita.jpg" },
        ],
        dbPath: scratch(),
      }),
    ).toThrow(/naruto:mju-0023/);
  });

  it("laisse le catalogue précédent intact quand la construction échoue", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({ prints: [print], assets: [], dbPath });

    const countPrints = () => {
      const db = new DatabaseSync(dbPath);
      const [row] = db.prepare("select count(*) as n from prints").all() as {
        n: number;
      }[];
      db.close();
      return row.n;
    };
    const before = countPrints();
    expect(before).toBeGreaterThanOrEqual(1);

    expect(() =>
      writeNarutoCcgIndex({
        prints: [print],
        assets: [{ printKey: "naruto:absent", lang: "ja", art: "a.jpg" }],
        dbPath,
      }),
    ).toThrow();

    // Une reconstruction ratée effaçait la base : le fichier était supprimé
    // avant l'écriture, et le ROLLBACK ne rendait rien.
    expect(countPrints()).toBe(before);
    expect(existsSync(`${dbPath}.building`)).toBe(false);
  });

  it("remplace bien le catalogue quand la construction réussit", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({ prints: [print], assets: [], dbPath });
    const second = writeNarutoCcgIndex({
      prints: [
        print,
        { ...print, printKey: "naruto:ni-0002", number: "ni0002" },
      ],
      assets: [],
      dbPath,
    });
    // Set-scoped SSOT + 巻ノ membership → one row per set (s1 + maki*).
    expect(second.printCount).toBeGreaterThanOrEqual(2);
    expect(existsSync(`${dbPath}.building`)).toBe(false);
  });

  it("écrit print_sets pour une carte multi-série", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:ni-0049",
          setCode: "s1",
          setCodes: ["s1", "s5"],
          number: "ni0049",
          cardType: "ni",
        },
      ],
      assets: [],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const rows = db
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode FROM print_sets ORDER BY print_key, set_code`,
      )
      .all() as { printKey: string; setCode: string }[];
    db.close();
    expect(rows).toEqual(
      expect.arrayContaining([
        { printKey: "naruto:s1-ni0049", setCode: "s1" },
        { printKey: "naruto:s5-ni0049", setCode: "s5" },
      ]),
    );
  });

  it("keeps deck-guarantee S2 membership for an S1-only booster checklist card", () => {
    const deckSets = narutoDeckGuaranteeSetsByCollector();
    expect(deckSets.get("ni0008")?.has("s2")).toBe(true);

    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:s1-ni0008",
          setCode: "s1",
          number: "ni0008",
          cardType: "ni",
        },
      ],
      titles: [
        { printKey: "naruto:s1-ni0008", lang: "fr", fullName: "Naruto Uzumaki" },
      ],
      assets: [],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const keys = (
      db
        .prepare(`SELECT print_key AS printKey FROM prints ORDER BY print_key`)
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    db.close();
    expect(keys).toContain("naruto:s1-ni0008");
    expect(keys).toContain("naruto:s2-ni0008");
  });

  it("expands stale index siblings for deck reprints (borrow detect without rebuild)", () => {
    const expanded = expandNarutoCardsIndexMembershipSiblings({
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:s1-ni0008": {
          set: "s1",
          card: "ni0008",
          name: "Naruto Uzumaki",
          langs: { fr: { name: "Naruto Uzumaki", art: "art.jpg" } },
        },
      },
    });
    expect(expanded.cards["naruto:s2-ni0008"]?.set).toBe("s2");
    expect(expanded.cards["naruto:s2-ni0008"]?.langs.fr?.name).toBe(
      "Naruto Uzumaki",
    );
  });

  it("drops a ghost S1 print when the FR checklist is S2-only", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:s1-cl0005",
          setCode: "s1",
          number: "cl0005",
          cardType: "cl",
        },
        {
          printKey: "naruto:s2-cl0005",
          setCode: "s2",
          number: "cl0005",
          cardType: "cl",
        },
      ],
      titles: [
        { printKey: "naruto:s1-cl0005", lang: "fr", fullName: "Zôri" },
        { printKey: "naruto:s2-cl0005", lang: "fr", fullName: "Zôri" },
      ],
      assets: [],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const keys = (
      db
        .prepare(`SELECT print_key AS printKey FROM prints ORDER BY print_key`)
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    db.close();
    expect(keys).toContain("naruto:s2-cl0005");
    expect(keys).not.toContain("naruto:s1-cl0005");
  });

  it("keeps FR title for HTML-only TA-090 on official serie 2 only", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:s1-ta0090",
          setCode: "s1",
          number: "ta0090",
          cardType: "ta",
        },
        {
          printKey: "naruto:s2-ta0090",
          setCode: "s2",
          number: "ta0090",
          cardType: "ta",
        },
      ],
      titles: [
        {
          printKey: "naruto:s1-ta0090",
          lang: "fr",
          fullName: "Le don de la copie",
        },
        {
          printKey: "naruto:s2-ta0090",
          lang: "fr",
          fullName: "Le don de la copie",
        },
      ],
      assets: [],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const frTitles = (
      db
        .prepare(
          `SELECT print_key AS printKey FROM print_titles WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    db.close();
    expect(frTitles).toEqual(["naruto:s2-ta0090"]);
  });

  it("keeps FR title and art for TE-191 on S4 (PDF checklist hole)", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:s1-te0191",
          setCode: "s1",
          number: "te0191",
          cardType: "te",
        },
        {
          printKey: "naruto:s4-te0191",
          setCode: "s4",
          number: "te0191",
          cardType: "te",
        },
      ],
      titles: [
        {
          printKey: "naruto:s1-te0191",
          lang: "fr",
          fullName: "Les lames de chakra",
        },
        {
          printKey: "naruto:s4-te0191",
          lang: "fr",
          fullName: "Les lames de chakra",
        },
        {
          printKey: "naruto:s4-te0191",
          lang: "it",
          fullName: "Tirapugni a lama",
        },
      ],
      assets: [
        {
          printKey: "naruto:s1-te0191",
          lang: "fr",
          art: "art.rakuten.jpg",
        },
        {
          printKey: "naruto:s4-te0191",
          lang: "fr",
          art: "art.carddass.jpg",
        },
      ],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const frTitles = (
      db
        .prepare(
          `SELECT print_key AS printKey, full_name AS name FROM print_titles WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string; name: string }[]
    );
    const frArts = (
      db
        .prepare(
          `SELECT print_key AS printKey, art FROM print_assets WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string; art: string }[]
    );
    db.close();
    expect(frTitles).toEqual([
      { printKey: "naruto:s4-te0191", name: "Les lames de chakra" },
    ]);
    expect(frArts).toEqual([
      { printKey: "naruto:s4-te0191", art: "art.carddass.jpg" },
    ]);
  });

  it("keeps JA s1 print but does not fan FR title onto it (NI-316)", () => {
    /*
      `ja/s1/ni0316` mints s1 for JA; FR scan lives under fr/s6. Expanding every
      locale onto every membership used to put « Kakashi » + FR art on s1 and
      show a sans-image S1 tile.
    */
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:s1-ni0316",
          setCode: "s1",
          number: "ni0316",
          cardType: "ni",
        },
        {
          printKey: "naruto:s6-ni0316",
          setCode: "s6",
          number: "ni0316",
          cardType: "ni",
        },
      ],
      titles: [
        {
          printKey: "naruto:s1-ni0316",
          lang: "ja",
          fullName: "はたけカカシ",
        },
        {
          printKey: "naruto:s6-ni0316",
          lang: "fr",
          fullName: "Kakashi Hatake",
        },
      ],
      assets: [
        {
          printKey: "naruto:s6-ni0316",
          lang: "fr",
          art: "art.carddass.jpg",
          printed: false,
        },
      ],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const frTitles = (
      db
        .prepare(
          `SELECT print_key AS printKey FROM print_titles WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    const frArts = (
      db
        .prepare(
          `SELECT print_key AS printKey FROM print_assets WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    const keys = (
      db
        .prepare(`SELECT print_key AS printKey FROM prints ORDER BY print_key`)
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    db.close();
    expect(keys).toContain("naruto:s1-ni0316");
    expect(keys).toContain("naruto:s6-ni0316");
    expect(frTitles).toEqual(["naruto:s6-ni0316"]);
    expect(frArts).toEqual(["naruto:s6-ni0316"]);
  });

  it("keeps FR title and face on S1 manga prerelease bags", () => {
    /*
      Bags live under `s1-*-prerelease` (set = s1). Paper checklist only knows
      the retail id — locale fan-out must still accept FR on the bag key.
    */
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:s1-ni0019",
          setCode: "s1",
          number: "ni0019",
          cardType: "ni",
        },
        {
          printKey: "naruto:s1-ni0019-prerelease",
          setCode: "s1",
          number: "ni0019-prerelease",
          cardType: "ni",
          grouping: "prerelease",
        },
      ],
      titles: [
        {
          printKey: "naruto:s1-ni0019",
          lang: "fr",
          fullName: "Naruto Uzumaki",
        },
        {
          printKey: "naruto:s1-ni0019-prerelease",
          lang: "fr",
          fullName: "Naruto Uzumaki",
          rarity: "prerelease",
        },
      ],
      assets: [
        {
          printKey: "naruto:s1-ni0019-prerelease",
          lang: "fr",
          art: "art.carddass.jpg",
          printed: true,
        },
      ],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const frTitles = (
      db
        .prepare(
          `SELECT print_key AS printKey FROM print_titles WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    const frArts = (
      db
        .prepare(
          `SELECT print_key AS printKey FROM print_assets WHERE lang='fr' ORDER BY print_key`,
        )
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);
    db.close();
    expect(frTitles).toContain("naruto:s1-ni0019-prerelease");
    expect(frArts).toEqual(["naruto:s1-ni0019-prerelease"]);
  });

  it("ajoute s6 aux inserts FR attestés même sans setCodes européen", () => {
    const dbPath = scratch();
    writeNarutoCcgIndex({
      prints: [
        {
          printKey: "naruto:ta-0221",
          setCode: "maki11",
          number: "ta0221",
          cardType: "ta",
        },
      ],
      assets: [],
      dbPath,
    });
    const db = new DatabaseSync(dbPath);
    const sets = (
      db
        .prepare(
          `SELECT set_code AS setCode FROM print_sets WHERE print_key = ? ORDER BY set_code`,
        )
        .all("naruto:s6-ta0221") as { setCode: string }[]
    ).map((row) => row.setCode);
    db.close();
    expect(sets).toEqual(["s6"]);
  });
});
