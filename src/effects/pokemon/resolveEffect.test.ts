import { describe, expect, it } from "vitest";

// Installs the SQLite `card_foil` lookups; without it the pack sees stubs.
import "./cardFoilIndex";

import {
  liveBundleLangsToTry,
  orderLiveSetCandidates,
  paperBundleId,
  paperMaskUrl,
  pickPaperVariant,
  resolveEffectForPaperCard,
  resolveEffectForPrintKey,
  type PaperCardEntry,
} from "./resolveEffect";

describe("paperBundleId", () => {
  it("pads collector numbers", () => {
    expect(paperBundleId("bw10", "1")).toBe("bw10_fr_001");
    expect(paperBundleId("sv8-5", 12, "en")).toBe("sv8-5_en_012");
  });
});

describe("liveBundleLangsToTry", () => {
  it("prefers caller lang then fr/en for CDN dumps", () => {
    expect(liveBundleLangsToTry("fr")).toEqual(["fr", "en"]);
    expect(liveBundleLangsToTry("en")).toEqual(["en", "fr"]);
    expect(liveBundleLangsToTry("de")).toEqual(["de", "fr", "en"]);
  });
});

describe("pickPaperVariant", () => {
  const entry: PaperCardEntry = {
    std: {
      foil: "Standard_NonFoil_J",
      shader: "NonFoil",
      cardTex: "x",
      maskTex: "",
    },
    ph: {
      foil: "HoloFoil_Rainbow_Amplify_J",
      shader: "Rainbow",
      cardTex: "x",
      maskTex: "mask_ph",
    },
  };

  it("maps reverse to ph foil", () => {
    expect(pickPaperVariant(entry, "reverse")?.key).toBe("ph");
  });

  it("maps holo to ph when std is NonFoil", () => {
    expect(pickPaperVariant(entry, "holo")?.key).toBe("ph");
  });

  it("returns null for normal", () => {
    expect(pickPaperVariant(entry, "normal")).toBeNull();
  });

  it("prefers foil std for holo when present", () => {
    const holoStd: PaperCardEntry = {
      std: {
        foil: "HoloFoil_SunPillar_Amplify_J",
        shader: "SunPillar",
        cardTex: "x",
        maskTex: "mask",
      },
    };
    expect(pickPaperVariant(holoStd, "holo")?.key).toBe("std");
  });

  it("maps live-std / live-ph to the matching foil key", () => {
    const dual: PaperCardEntry = {
      std: {
        foil: "HoloFoil_Tinsel_Amplify_J",
        shader: "Tinsel",
        cardTex: "x",
        maskTex: "mask_std",
      },
      ph: {
        foil: "HoloFoil_Rainbow_Amplify_J",
        shader: "Rainbow",
        cardTex: "x",
        maskTex: "mask_ph",
      },
    };
    expect(pickPaperVariant(dual, "live-std")?.key).toBe("std");
    expect(pickPaperVariant(dual, "live-ph")?.key).toBe("ph");
    expect(pickPaperVariant(dual, "live-ph")?.variant.shader).toBe("Rainbow");
    expect(pickPaperVariant(entry, "live-std")).toBeNull();
  });
});

describe("resolveEffectForPaperCard", () => {
  it("resolves stub bw10 reverse to Rainbow", () => {
    const r = resolveEffectForPaperCard({ bundleId: "bw10_fr_001" });
    expect(r).toMatchObject({
      shader: "Rainbow",
      variant: "ph",
      confidence: "exact",
      source: "tcglive-bundle",
    });
    expect(r?.maskTex).toBe("bw10_wp_ph_fr_001");
  });

  it("returns null for unknown bundles (honest empty)", () => {
    expect(
      resolveEffectForPaperCard({ bundleId: "zzznone_fr_001" }),
    ).toBeNull();
  });
});

describe("orderLiveSetCandidates", () => {
  it("prefers Live radiant stems for RC collector numbers", () => {
    expect(orderLiveSetCandidates(["xy9-5", "xy9-5r"], "RC1")).toEqual([
      "xy9-5r",
      "xy9-5",
    ]);
    expect(orderLiveSetCandidates(["bw11", "bw11r"], "rc10")).toEqual([
      "bw11r",
      "bw11",
    ]);
  });

  it("keeps primary-first order for plain numbers", () => {
    expect(orderLiveSetCandidates(["xy9-5", "xy9-5r"], "1")).toEqual([
      "xy9-5",
      "xy9-5r",
    ]);
  });
});

describe("resolveEffectForPrintKey", () => {
  it("resolves pokemon:bw10-001 reverse via Live dump", () => {
    const r = resolveEffectForPrintKey("pokemon:bw10-001", "reverse");
    expect(r).toMatchObject({
      shader: "Rainbow",
      variant: "ph",
      bundle: "bw10_fr_001",
      confidence: "exact",
    });
    expect(paperMaskUrl(r!.bundle, r!.maskTex)).toBe(
      "/assets/pokemon/cards/bw10/fr/001/mask-ph.webp",
    );
  });

  it("returns null for normal finish", () => {
    expect(resolveEffectForPrintKey("pokemon:bw10-001", "normal")).toBeNull();
  });

  it("returns null for unknown set (honest empty)", () => {
    expect(resolveEffectForPrintKey("pokemon:base1-004", "holo")).toBeNull();
  });

  it("returns null for non-pokemon printKey", () => {
    expect(resolveEffectForPrintKey("lorcana:1-1", "holo")).toBeNull();
  });

  it("remaps Hidden Fates Shiny Vault SV# into sm11-5 Live nums", () => {
    const r = resolveEffectForPrintKey("pokemon:sma-SV1", "holo");
    expect(r).toMatchObject({
      shader: "Rainbow",
      variant: "std",
      bundle: "sm11-5_fr_070",
      confidence: "exact",
      source: "tcglive-bundle",
    });
  });

  it("falls back Shining Fates Shiny Vault to swsh4-5 with SV offset", () => {
    const r = resolveEffectForPrintKey("pokemon:swsh4.5sv-SV001", "holo");
    expect(r).toMatchObject({
      shader: "SunPillar",
      variant: "std",
      bundle: "swsh4-5_fr_074",
      confidence: "exact",
      source: "tcglive-reprint-fallback",
    });
  });

  it("falls back last Shining Fates Shiny Vault card to Live 195", () => {
    const r = resolveEffectForPrintKey("pokemon:swsh4.5sv-SV122", "holo");
    expect(r).toMatchObject({
      shader: "SwSecret",
      bundle: "swsh4-5_fr_195",
      source: "tcglive-reprint-fallback",
    });
  });

  it("prefers the requested lang when that Live bundle is in the dump", () => {
    const r = resolveEffectForPrintKey("pokemon:sv03.5-006", "holo", "en");
    expect(r).toMatchObject({
      bundle: "sv3-5_en_006",
      shader: "SunPillar",
      source: "tcglive-bundle",
    });
  });

  /*
    This asserted a FR fallback for an EN request, on the premise that
    `xy1_en_001` was missing from the dump. It is there now — no card in the
    shipped dump has FR without EN — so the assertion described a world that
    no longer exists and the test stopped guarding anything.

    The language fallback itself is alive (`liveBundleLangsToTry`: caller's
    lang, then `fr`, then `en`), so it is still covered — by a locale the dump
    genuinely lacks, which no re-extract will quietly turn into a hit.
  */
  it("serves the requested locale when the dump has it", () => {
    const r = resolveEffectForPrintKey("pokemon:xy1-001", "holo", "en");
    expect(r).toMatchObject({
      bundle: "xy1_en_001",
      shader: "Rainbow",
      source: "tcglive-bundle",
    });
  });

  it("falls back to a dumped locale when the asked-for one is absent", () => {
    const r = resolveEffectForPrintKey("pokemon:xy1-001", "holo", "ja");
    expect(r?.bundle).toMatch(/^xy1_(fr|en)_001$/);
  });

  it("uses Live identity name join when set+num miss but title matches", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { resetLiveCardsIndexCache } = await import("./liveCardsIndex");
    const { resetCardFoilIndexCache } = await import("./cardFoilIndex");

    const dir = await mkdtemp(path.join(os.tmpdir(), "name-fallback-"));
    const dbPath = path.join(dir, "catalog.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE live_cards (
        bundle_stem TEXT NOT NULL,
        live_set TEXT NOT NULL,
        num INTEGER NOT NULL,
        lang TEXT NOT NULL,
        variant TEXT NOT NULL,
        long_form_id TEXT NOT NULL PRIMARY KEY,
        card_id TEXT,
        name_en TEXT,
        name_fr TEXT,
        collector_num TEXT,
        foil_effect TEXT,
        foil_mask TEXT,
        rarity_code TEXT,
        set_code TEXT
      );
      -- The foil mapping lives in the same file, so a fixture DB needs it too.
      CREATE TABLE card_foil (
        bundle_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        card_tex TEXT NOT NULL DEFAULT '',
        mask_tex TEXT NOT NULL DEFAULT '',
        etch_tex TEXT NOT NULL DEFAULT '',
        cold_foil_tex TEXT NOT NULL DEFAULT '',
        foil TEXT NOT NULL DEFAULT '',
        shader TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (bundle_id, variant)
      );
    `);
    db.prepare(`INSERT INTO card_foil VALUES (?,?,?,?,?,?,?,?)`).run(
      "bw10_fr_001",
      "ph",
      "bw10_fr_001",
      "bw10_wp_ph_fr_001",
      "",
      "",
      "HoloFoil_Rainbow_Amplify_J",
      "Rainbow",
    );
    // Num does not match printKey 999 — only the title joins to bw10_fr_001.
    db.prepare(
      `INSERT INTO live_cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "bw10_fr_001",
      "bw10",
      1,
      "fr",
      "std",
      "Fake_bw10_1_std_Common_NonFoil_None",
      "bw10_1",
      "Testmon",
      "Testmon FR",
      "1",
      "NonFoil",
      "None",
      "Common",
      "BW10",
    );
    db.close();

    const prev = process.env.PLACARR_LIVE_CARDS_DB;
    process.env.PLACARR_LIVE_CARDS_DB = dbPath;
    resetLiveCardsIndexCache();
    resetCardFoilIndexCache();
    try {
      const r = resolveEffectForPrintKey(
        "pokemon:bw10-999",
        "reverse",
        "fr",
        "Testmon",
      );
      expect(r).toMatchObject({
        bundle: "bw10_fr_001",
        shader: "Rainbow",
        source: "tcglive-name-fallback",
      });
    } finally {
      if (prev === undefined) delete process.env.PLACARR_LIVE_CARDS_DB;
      else process.env.PLACARR_LIVE_CARDS_DB = prev;
      resetLiveCardsIndexCache();
      resetCardFoilIndexCache();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
