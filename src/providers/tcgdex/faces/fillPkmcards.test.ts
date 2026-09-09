import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { fillPkmcardsFaces } from "./fillPkmcards";
import { parsePkmcardsPokemonSlug } from "./pkmcardsSlug";
import { buildPkmcardsAbbrToLiveStem } from "./pkmcardsSetMap";

describe("parsePkmcardsPokemonSlug", () => {
  it("lit set-lang-num au milieu du slug (pas le préfixe DBS)", () => {
    expect(
      parsePkmcardsPokemonSlug(
        "pbl-fr-001-mega-evolution-nuit-noire-tropius",
      ),
    ).toEqual({ setAbbr: "pbl", lang: "fr", number: "001" });
    expect(
      parsePkmcardsPokemonSlug(
        "dri-fr-147-ecarlate-et-violet-rivalites-destinees-rattata",
      ),
    ).toEqual({ setAbbr: "dri", lang: "fr", number: "147" });
    expect(parsePkmcardsPokemonSlug("en-bt25-009-sr-gogeta")).toBeNull();
  });
});

describe("buildPkmcardsAbbrToLiveStem", () => {
  it("reconnaît un stem Live déjà sur disque", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pkm-map-"));
    mkdirSync(path.join(root, "me5"), { recursive: true });
    mkdirSync(path.join(root, "sv10"), { recursive: true });
    const map = buildPkmcardsAbbrToLiveStem(root);
    expect(map.get("me5")?.liveStem).toBe("me5");
    expect(map.get("sv10")?.liveStem).toBe("sv10");
  });
});

describe("fillPkmcardsFaces", () => {
  it("prend art.pkmcards même si Live art.webp est déjà là (skip seulement la source)", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pkm-fill-"));
    const withLive = path.join(root, "me5", "fr", "002");
    const already = path.join(root, "me5", "fr", "003");
    mkdirSync(withLive, { recursive: true });
    mkdirSync(already, { recursive: true });
    writeFileSync(path.join(withLive, "art.webp"), "live");
    writeFileSync(path.join(already, "art.pkmcards.webp"), "have");

    const entries = [
      {
        itemId: "1",
        slug: "me5-fr-001-tropius",
        ref: null,
        sku: null,
        name: "Tropius",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/001.webp",
        imageBack: null,
      },
      {
        itemId: "2",
        slug: "me5-fr-002-larvibule",
        ref: null,
        sku: null,
        name: "Larvibule",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/002.webp",
        imageBack: null,
      },
      {
        itemId: "3",
        slug: "me5-fr-003-mimantis",
        ref: null,
        sku: null,
        name: "Mimantis",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/003.webp",
        imageBack: null,
      },
      {
        itemId: "4",
        slug: "zzz-fr-001-unknown-set",
        ref: null,
        sku: null,
        name: "X",
        lang: "fr",
        priceText: null,
        price: null,
        currency: null,
        priceDeltaText: null,
        priceDelta: null,
        imageFront: "https://example.test/x.webp",
        imageBack: null,
      },
    ];

    const report = await fillPkmcardsFaces({
      cardsRoot: root,
      entries,
      downloadDelayMs: 0,
    });

    expect(report.skipped).toBe(1); // 003 déjà art.pkmcards
    expect(report.unmapped).toBe(1); // zzz
    // 001 (mkdir) + 002 (malgré live) tentent le download → fail sans serveur
    expect(report.tried).toBe(2);
    expect(report.failed).toBe(2);
    expect(existsSync(path.join(already, "art.pkmcards.webp"))).toBe(true);
  });
});
