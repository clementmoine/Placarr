import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NikitaCardFacts } from "../parse/catalogues";
import { hinokunianPages, CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER, cardgameclubItShouldAbortFaceDownloads, mergeGgClassicTitlesIntoIndex, loadNarutoCardsCaLedger, factsByDiskId } from "./catalogues";

// —— scrapeHinokunian ——
{
  describe("hinokunianPages", () => {
    const pages = hinokunianPages();

    it("porte les 53 pages du relevé", () => {
      expect(pages).toHaveLength(53);
      expect(pages.every((p) => p.path.endsWith(".html"))).toBe(true);
      expect(pages.every((p) => p.label.length > 0)).toBe(true);
    });

    it("couvre les quinze volumes et les quatre vagues arcade", () => {
      const volumes = pages.filter((p) =>
        /^cardgamemakino\d+\.html$/.test(p.path),
      );
      expect(volumes).toHaveLength(15);
      const arcade = pages.filter((p) => /^cardbattle\d\.html$/.test(p.path));
      expect(arcade).toHaveLength(4);
    });

    it("ne déclare jamais deux fois le même chemin", () => {
      expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    });
  });
}

// —— scrapeCardgameclubIt ——
{
  describe("cardgameclubItShouldAbortFaceDownloads", () => {
    it("gives up after a few consecutive Magento JPEG misses", () => {
      expect(cardgameclubItShouldAbortFaceDownloads(0)).toBe(false);
      expect(cardgameclubItShouldAbortFaceDownloads(2)).toBe(false);
      expect(
        cardgameclubItShouldAbortFaceDownloads(
          CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER,
        ),
      ).toBe(true);
    });
  });
}

// —— scrapeNarutoCardGameGg ——
{
  describe("mergeGgClassicTitlesIntoIndex", () => {
    const prints = [
      {
        printKey: "naruto:nc-0001",
        setCode: "quest",
        number: "nc0001",
        cardType: "nc",
      },
      {
        printKey: "naruto:ex-0001",
        setCode: "promo",
        number: "ex0001",
        cardType: "ex",
      },
    ];

    it("fills EN names from GG slug when missing", () => {
      const merged = mergeGgClassicTitlesIntoIndex({
        prints,
        titles: [],
        cards: [
          {
            prefix: "nc",
            number: "nc0001",
            set: "quest-for-power",
            slug: "naruto-uzumaki",
            rawId: "nc001",
            line: "classic-ccg",
          },
          {
            prefix: "ex",
            number: "ex0001",
            set: "promo",
            slug: "naruto-uzumaki",
            rawId: "ex001",
            line: "classic-ccg",
          },
        ],
      });
      expect(merged.titled).toEqual(["naruto:ex-0001", "naruto:nc-0001"]);
      expect(
        merged.titles.find(
          (t) => t.printKey === "naruto:nc-0001" && t.lang === "en",
        )?.fullName,
      ).toBe("Naruto Uzumaki");
    });

    it("does not overwrite an existing EN title", () => {
      const merged = mergeGgClassicTitlesIntoIndex({
        prints,
        titles: [
          {
            printKey: "naruto:nc-0001",
            lang: "en",
            fullName: "Keep Me",
          },
        ],
        cards: [
          {
            prefix: "nc",
            number: "nc0001",
            set: "quest-for-power",
            slug: "naruto-uzumaki",
            rawId: "nc001",
            line: "classic-ccg",
          },
        ],
      });
      expect(merged.titled).toEqual([]);
      expect(
        merged.titles.find((t) => t.printKey === "naruto:nc-0001")?.fullName,
      ).toBe("Keep Me");
    });

    it("does not mint prints absent from the index", () => {
      const merged = mergeGgClassicTitlesIntoIndex({
        prints: [],
        titles: [],
        cards: [
          {
            prefix: "nc",
            number: "nc0001",
            set: "quest-for-power",
            slug: "naruto-uzumaki",
            rawId: "nc001",
            line: "classic-ccg",
          },
        ],
      });
      expect(merged.prints).toEqual([]);
      expect(merged.titled).toEqual([]);
    });
  });
}

// —— scrapeNarutoCardsCa ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function stageLedger(cards: unknown[]): string {
    const packDir = mkdtempSync(path.join(os.tmpdir(), "narutocards-ca-"));
    roots.push(packDir);
    const dir = path.join(packDir, "staging", "narutocards-ca");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "cards.json"), JSON.stringify({ cards }));
    return packDir;
  }

  describe("loadNarutoCardsCaLedger", () => {
    it("re-derives the number from the printedRef — a stale cache predates the prus convention", () => {
      const packDir = stageLedger([
        {
          number: "pr006-us",
          name: "Big Boss",
          setCode: "promo",
          printedRef: "PR-US006",
          usExclusive: true,
        },
        {
          number: "pr010",
          name: "Hoka Rocks",
          setCode: "promo",
          printedRef: "PR-010",
          usExclusive: false,
        },
      ]);
      const rows = loadNarutoCardsCaLedger(packDir);
      expect(rows.map((row) => row.number)).toEqual(["prus006", "pr010"]);
      expect(rows[0]?.usExclusive).toBe(true);
    });

    it("keeps the stored number when the printedRef is absent or unparsable", () => {
      const packDir = stageLedger([
        { number: "pr010", name: "Hoka Rocks", setCode: "promo" },
      ]);
      expect(loadNarutoCardsCaLedger(packDir)[0]?.number).toBe("pr010");
    });
  });
}

// —— scrapeNikitaCardlist ——
{
  function facts(over: Partial<NikitaCardFacts>): NikitaCardFacts {
    return {
      game: "nrt",
      nikitaKey: "N-001",
      number: "ni0001",
      printedRef: "忍-1",
      name: "うずまきナルト",
      cardType: "忍",
      setLabel: "巻ノ壱",
      setCode: "maki1",
      symbols: ["雷"],
      cost: 0,
      power: 1,
      support: 0,
      woundedPower: 3,
      woundedSupport: 1,
      traits: ["木ノ葉"],
      battleAttribute: "忍",
      target: null,
      effect: null,
      quote: null,
      ...over,
    };
  }

  describe("factsByDiskId", () => {
    it("keys on the disk id and drops what the catalogue does not mint", () => {
      const out = factsByDiskId([
        facts({}),
        facts({ number: null, printedRef: "N-999" }),
      ]);
      expect(Object.keys(out)).toEqual(["ni0001"]);
    });

    it("keeps a reprint whole when it says something different", () => {
      // 忍-1 is listed twice with a different flavour line: two printings, not
      // one row to fold away.
      const out = factsByDiskId([
        facts({ setLabel: "巻ノ壱", setCode: "maki1", quote: "オレってば…" }),
        facts({
          setLabel: "※確認中1",
          setCode: null,
          quote: "風雲姫は、オレが守る",
        }),
      ]);
      expect(out.ni0001?.quote).toBe("オレってば…");
      expect(out.ni0001?.variants).toHaveLength(1);
      expect(out.ni0001?.variants?.[0]?.quote).toBe("風雲姫は、オレが守る");
      // A real difference is not filed as a mere alternate label.
      expect(out.ni0001?.alsoListedIn).toBeUndefined();
    });

    it("separates a reworded reprint from a duplicate listing", () => {
      const out = factsByDiskId([
        facts({
          number: "te0146",
          setLabel: "巻ノ八",
          setCode: "maki8",
          effect: "目標は+2/±0を得る。",
        }),
        facts({
          number: "te0146",
          setLabel: "巻ノ十",
          setCode: "maki10",
          effect: "目標はターン中、+2/±0を得る。",
        }),
      ]);
      expect(out.te0146?.setLabel).toBe("巻ノ八");
      expect(out.te0146?.variants?.[0]?.setLabel).toBe("巻ノ十");
      expect(out.te0146?.variants?.[0]?.effect).toContain("ターン中");
    });

    it("prefers a confirmed volume over a ※確認中 bucket, whatever the order", () => {
      const unverifiedFirst = factsByDiskId([
        facts({ setLabel: "※確認中1", setCode: null }),
        facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
      ]);
      expect(unverifiedFirst.ni0001?.setLabel).toBe("巻ノ壱");
      expect(unverifiedFirst.ni0001?.alsoListedIn).toEqual(["※確認中1"]);

      const volumeFirst = factsByDiskId([
        facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
        facts({ setLabel: "※確認中1", setCode: null }),
        facts({ setLabel: "※確認中2", setCode: null }),
      ]);
      expect(volumeFirst.ni0001?.setLabel).toBe("巻ノ壱");
      expect(volumeFirst.ni0001?.alsoListedIn).toEqual(["※確認中1", "※確認中2"]);
    });

    it("does not repeat the kept label in alsoListedIn", () => {
      const out = factsByDiskId([
        facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
        facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
      ]);
      expect(out.ni0001?.alsoListedIn).toBeUndefined();
    });
  });
}

