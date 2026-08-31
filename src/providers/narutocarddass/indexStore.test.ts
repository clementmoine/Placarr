import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { exportNarutoCardsIndexJson, writeNarutoCcgIndex } from "./indexStore";

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
    expect(countPrints()).toBe(1);

    expect(() =>
      writeNarutoCcgIndex({
        prints: [print],
        assets: [{ printKey: "naruto:absent", lang: "ja", art: "a.jpg" }],
        dbPath,
      }),
    ).toThrow();

    // Une reconstruction ratée effaçait la base : le fichier était supprimé
    // avant l'écriture, et le ROLLBACK ne rendait rien.
    expect(countPrints()).toBe(1);
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
    expect(second.printCount).toBe(2);
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
    const sets = (
      db
        .prepare(
          `SELECT set_code AS setCode FROM print_sets WHERE print_key = ? ORDER BY set_code`,
        )
        .all("naruto:ni-0049") as { setCode: string }[]
    ).map((row) => row.setCode);
    db.close();
    expect(sets).toEqual(["s1", "s5"]);
  });
});
