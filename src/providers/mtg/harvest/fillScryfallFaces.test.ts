import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { clearMtgArtUrlCache } from "../artUrls";
import { fillScryfallCatalogueFaces } from "./fillScryfallFaces";

const jpeg1x1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
  "base64",
);

describe("fillScryfallCatalogueFaces", () => {
  let root: string;
  let prevCwd: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "mtg-scryfall-faces-"));
    prevCwd = process.cwd();
    process.chdir(root);
    mkdirSync(path.join(root, "data", "mtg", "curated"), { recursive: true });
    writeFileSync(
      path.join(root, "data", "mtg", "curated", "art-urls.json"),
      JSON.stringify({
        "mtg:lea-1": {
          en: "https://cards.scryfall.io/normal/front/0/0/aaa.jpg",
          fr: "https://cards.scryfall.io/normal/front/0/0/bbb.jpg",
        },
        "mtg:missing-9": {
          en: "https://cards.scryfall.io/normal/front/0/0/ccc.jpg",
        },
      }) + "\n",
    );
    clearMtgArtUrlCache();
  });

  afterEach(() => {
    clearMtgArtUrlCache();
    process.chdir(prevCwd);
    vi.restoreAllMocks();
  });

  it("downloads missing Scryfall faces and stamps print_assets", async () => {
    const index = createLocalPrintsIndex("mtg");
    index.writePrints([
      {
        printKey: "mtg:lea-1",
        setCode: "lea",
        number: "1",
        cardType: "lea",
        titles: [
          { lang: "en", fullName: "Ancestral Recall" },
          { lang: "fr", fullName: "Rappel ancestral" },
        ],
      },
    ]);

    const fetched: string[] = [];
    const report = await fillScryfallCatalogueFaces({
      index,
      concurrency: 2,
      downloadImage: async (url) => {
        fetched.push(url);
        return jpeg1x1;
      },
    });

    expect(report.written).toBe(2);
    expect(report.unknownPrint).toBe(1);
    expect(fetched).toHaveLength(2);
    expect(
      existsSync(
        path.join(root, "data", "mtg", "cards", "en", "lea", "1", "art.scryfall.jpg"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(root, "data", "mtg", "cards", "fr", "lea", "1", "art.scryfall.jpg"),
      ),
    ).toBe(true);

    const en = index.lookupRow("mtg:lea-1", { language: "en" });
    expect(en?.art).toBe("art.scryfall.jpg");
    const fr = index.lookupRow("mtg:lea-1", { language: "fr" });
    expect(fr?.art).toBe("art.scryfall.jpg");
  });

  it("retries a transient download miss before failing", async () => {
    const index = createLocalPrintsIndex("mtg");
    index.writePrints([
      {
        printKey: "mtg:lea-1",
        setCode: "lea",
        number: "1",
        cardType: "lea",
        titles: [{ lang: "en", fullName: "Ancestral Recall" }],
      },
    ]);

    let attempts = 0;
    const report = await fillScryfallCatalogueFaces({
      index,
      langs: ["en"],
      retries: 2,
      concurrency: 1,
      downloadImage: async () => {
        attempts += 1;
        if (attempts < 3) return null;
        return jpeg1x1;
      },
    });

    expect(attempts).toBe(3);
    expect(report.written).toBe(1);
    expect(report.failed).toBe(0);
    expect(
      existsSync(
        path.join(root, "data", "mtg", "cards", "en", "lea", "1", "art.scryfall.jpg"),
      ),
    ).toBe(true);
  });

  it("skips when a local art.* already exists (no re-fetch)", async () => {
    const index = createLocalPrintsIndex("mtg");
    index.writePrints([
      {
        printKey: "mtg:lea-1",
        setCode: "lea",
        number: "1",
        cardType: "lea",
        titles: [{ lang: "en", fullName: "Ancestral Recall" }],
      },
    ]);
    const cardDir = path.join(root, "data", "mtg", "cards", "en", "lea", "1");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.mtgcards.webp"), jpeg1x1);

    let fetches = 0;
    const report = await fillScryfallCatalogueFaces({
      index,
      langs: ["en"],
      downloadImage: async () => {
        fetches += 1;
        return jpeg1x1;
      },
    });

    expect(report.skipped).toBe(1);
    expect(report.written).toBe(0);
    expect(fetches).toBe(0);
    expect(index.lookupRow("mtg:lea-1", { language: "en" })?.art).toBe(
      "art.mtgcards.webp",
    );
  });
});
