import { describe, expect, it } from "vitest";

import { mtgPrintKey } from "./printKey";
import { loadScryfallBulkCards } from "./scryfallBulk";
import {
  mergeScryfallCardIntoSeed,
  normalizeScryfallLang,
  type MtgArtUrlMap,
  type MtgFinishesMap,
} from "./seedFromScryfall";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("mtg seed helpers (fixture, no live data/ write)", () => {
  it("parses small jsonl bulk fixtures", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mtg-jsonl-"));
    const bulk = path.join(dir, "bulk.jsonl");
    writeFileSync(
      bulk,
      JSON.stringify({
        id: "a",
        name: "Lightning Bolt",
        lang: "en",
        set: "lea",
        collector_number: "161",
        digital: false,
      }) + "\n",
    );
    const cards = await loadScryfallBulkCards(bulk);
    expect(cards).toHaveLength(1);
    expect(mtgPrintKey(cards[0]!.set, cards[0]!.collector_number)).toBe(
      "mtg:lea-161",
    );
  });

  it("keeps original EN + FR only (not DE)", () => {
    const byKey = new Map();
    const finishes: MtgFinishesMap = {};
    const artByKey: MtgArtUrlMap = {};

    expect(
      mergeScryfallCardIntoSeed(
        {
          id: "1",
          name: "Lightning Bolt",
          lang: "en",
          set: "lea",
          collector_number: "161",
          digital: false,
          finishes: ["nonfoil", "foil"],
          image_uris: { normal: "https://example.test/en.jpg" },
        },
        byKey,
        finishes,
        artByKey,
      ),
    ).toBe("kept");

    expect(
      mergeScryfallCardIntoSeed(
        {
          id: "2",
          name: "Lightning Bolt",
          printed_name: "Éclair",
          lang: "fr",
          set: "lea",
          collector_number: "161",
          digital: false,
          image_uris: { normal: "https://example.test/fr.jpg" },
        },
        byKey,
        finishes,
        artByKey,
      ),
    ).toBe("kept");

    expect(
      mergeScryfallCardIntoSeed(
        {
          id: "3",
          name: "Lightning Bolt",
          printed_name: "Blitzschlag",
          lang: "de",
          set: "lea",
          collector_number: "161",
          digital: false,
          image_uris: { normal: "https://example.test/de.jpg" },
        },
        byKey,
        finishes,
        artByKey,
      ),
    ).toBe("skipped");

    const row = byKey.get("mtg:lea-161");
    expect(row?.titles.map((t: { lang: string }) => t.lang).sort()).toEqual([
      "en",
      "fr",
    ]);
    expect(artByKey["mtg:lea-161"]).toEqual({
      en: "https://example.test/en.jpg",
      fr: "https://example.test/fr.jpg",
    });
  });

  it("keeps JP-only exclusives on second pass", () => {
    const byKey = new Map();
    const finishes: MtgFinishesMap = {};
    const artByKey: MtgArtUrlMap = {};
    const jpOnly = {
      id: "jp",
      name: "Exclusive",
      printed_name: "限定",
      lang: "ja",
      set: "pjp",
      collector_number: "1",
      digital: false,
      image_uris: { normal: "https://example.test/ja.jpg" },
    };
    expect(
      mergeScryfallCardIntoSeed(jpOnly, byKey, finishes, artByKey, {
        titlesOnlyCatalogueLangs: true,
      }),
    ).toBe("skipped");
    expect(
      mergeScryfallCardIntoSeed(jpOnly, byKey, finishes, artByKey, {
        titlesOnlyCatalogueLangs: false,
      }),
    ).toBe("kept");
    expect(byKey.get("mtg:pjp-1")?.titles[0]?.lang).toBe("ja");
  });

  it("merges sibling langs on multi-lang exclusives (4bb)", () => {
    const byKey = new Map();
    const finishes: MtgFinishesMap = {};
    const artByKey: MtgArtUrlMap = {};
    const ja = {
      id: "4bb-ja",
      name: "Swamp",
      printed_name: "沼",
      lang: "ja",
      set: "4bb",
      collector_number: "276",
      digital: false,
      image_uris: { normal: "https://example.test/4bb-ja.jpg" },
    };
    const es = {
      id: "4bb-es",
      name: "Swamp",
      printed_name: "Pantano",
      lang: "es",
      set: "4bb",
      collector_number: "276",
      digital: false,
      image_uris: { normal: "https://example.test/4bb-es.jpg" },
    };
    expect(
      mergeScryfallCardIntoSeed(ja, byKey, finishes, artByKey, {
        titlesOnlyCatalogueLangs: false,
      }),
    ).toBe("kept");
    expect(
      mergeScryfallCardIntoSeed(es, byKey, finishes, artByKey, {
        titlesOnlyCatalogueLangs: false,
      }),
    ).toBe("kept");
    expect(
      byKey.get("mtg:4bb-276")?.titles.map((t: { lang: string }) => t.lang).sort(),
    ).toEqual(["es", "ja"]);
    expect(artByKey["mtg:4bb-276"]).toEqual({
      ja: "https://example.test/4bb-ja.jpg",
      es: "https://example.test/4bb-es.jpg",
    });
  });

  it("normalizes Scryfall lang codes", () => {
    expect(normalizeScryfallLang("FR")).toBe("fr");
    expect(normalizeScryfallLang("zhs")).toBe("zhs");
    expect(normalizeScryfallLang("")).toBeNull();
  });
});
