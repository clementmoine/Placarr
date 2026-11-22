import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assembleOfficialDataCarddassChecklist,
  mergeChecklistWithPrevious,
  writeOfficialDataCarddassChecklist,
} from "./harvest";

const card = (printed: string, name: string, note?: string) => {
  const [prefix, number] = printed.split("-");
  return {
    printed,
    set: (prefix ?? "").toLowerCase(),
    number: number ?? "",
    name,
    nameJa: name,
    ...(note ? { note } : {}),
  };
};

describe("mergeChecklistWithPrevious", () => {
  it("keeps cards whose source was not re-read instead of shrinking", () => {
    // 2026-11-22 : `staging/official` (hand mirror) gone → Sync re-assembled
    // 125 cards and overwrote the 1 482-card checklist.
    const previous = {
      cards: [card("DN-001", "ナルト"), card("NF-002", "旧名")],
      sources: ["dn/battle_card.csv", "nf/nf1.php"],
    };
    const assembled = {
      cards: [card("NF-002", "うずまきナルト(疾風伝)", "suruga-ya GL411753")],
      byPrefix: { NF: 1 },
      sources: ["suruga-scan-gl411.json"],
    };

    const merged = mergeChecklistWithPrevious(assembled, previous);

    expect(merged.cards.map((c) => `${c.printed}:${c.name}`)).toEqual([
      "DN-001:ナルト",
      // A card read again this run wins over the stored one.
      "NF-002:うずまきナルト(疾風伝)",
    ]);
    expect(merged.byPrefix).toEqual({ DN: 1, NF: 1 });
    expect(merged.sources).toEqual([
      "dn/battle_card.csv",
      "nf/nf1.php",
      "suruga-scan-gl411.json",
    ]);
  });

  it("is the assembly itself when there is no previous checklist", () => {
    const assembled = {
      cards: [card("NX-001", "a")],
      byPrefix: { NX: 1 },
      sources: ["nx/cat69001.html"],
    };
    expect(mergeChecklistWithPrevious(assembled, null)).toEqual(assembled);
  });
});

describe("assembleOfficialDataCarddassChecklist", () => {
  it("reads the DN table from the archived battle_card.shtml", () => {
    // The page's own CSV was never archived; the page carries the same table.
    const stagingRoot = mkdtempSync(path.join(tmpdir(), "dcd-assemble-"));
    const dn = path.join(stagingRoot, "official", "dn");
    mkdirSync(dn, { recursive: true });
    writeFileSync(
      path.join(dn, "battle_card.shtml"),
      Buffer.from(
        new TextEncoder().encode(
          '<tr><td align="center">DN-001T</td><td align="left">NARUTO</td></tr>',
        ),
      ),
    );
    const assembled = assembleOfficialDataCarddassChecklist({ stagingRoot });
    expect(assembled.sources).toContain("dn/battle_card.shtml");
    expect(assembled.cards.map((c) => c.printed)).toContain("DN-001T");
  });
});

describe("assembleOfficialDataCarddassChecklist — hinokunian", () => {
  it("takes DN / DT from the live hinokunian harvest (cardbattle pages)", () => {
    const stagingRoot = mkdtempSync(path.join(tmpdir(), "dcd-hino-"));
    const assembled = assembleOfficialDataCarddassChecklist({
      stagingRoot,
      hinokunianFacts: {
        version: 1,
        source: "hinokunian",
        lang: "ja",
        capturedAt: "2026-08-19T22:27:29.613Z",
        releaseCount: 2,
        cardCount: 3,
        releases: [
          {
            path: "cardbattle4.html",
            label: "第四弾",
            cards: [
              {
                printed: "DT-001",
                name: "うずまきナルト",
                subtitle: null,
                rarity: null,
                editionNote: null,
                extra: [],
              },
              {
                printed: "DN-133T",
                name: "我愛羅",
                subtitle: null,
                rarity: null,
                editionNote: null,
                extra: [],
              },
            ],
          },
          {
            // Carddass JP release — not Data Carddass.
            path: "kan1.html",
            label: "巻ノ壱",
            cards: [
              {
                printed: "忍-1",
                name: "ナルト",
                subtitle: null,
                rarity: null,
                editionNote: null,
                extra: [],
              },
            ],
          },
        ],
      } as never,
    });
    const printed = assembled.cards.map((c) => c.printed);
    expect(printed).toEqual(expect.arrayContaining(["DN-133T", "DT-001"]));
    expect(printed).not.toContain("忍-1");
    expect(assembled.sources).toContain("hinokunian cardbattle");
  });
});

describe("writeOfficialDataCarddassChecklist — eBay seed", () => {
  it("reads the synced eBay faces ledger (data/…/sources/ebay.json)", () => {
    // ab86fb92 moved ebay.json from curated/ to data/; the seed kept reading
    // curated/sources/ebay.json and silently dropped 145 cards.
    const root = mkdtempSync(path.join(tmpdir(), "dcd-ebay-"));
    const prev = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = path.join(root, "data");
    try {
      const sources = path.join(
        root,
        "data",
        "naruto",
        "data-carddass",
        "sources",
      );
      mkdirSync(sources, { recursive: true });
      writeFileSync(
        path.join(sources, "ebay.json"),
        JSON.stringify({ faces: [{ printedRef: "NX-990", title: "ナルト" }] }),
      );
      const out = writeOfficialDataCarddassChecklist({
        stagingRoot: path.join(root, "staging"),
        outPath: path.join(root, "out.json"),
      });
      expect(out.cards.map((c) => c.printed)).toContain("NX-990");
    } finally {
      if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prev;
    }
  });
});
