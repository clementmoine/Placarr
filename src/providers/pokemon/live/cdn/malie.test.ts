import { describe, expect, it } from "vitest";

import {
  bundleStemFromCardId,
  bundleStemFromMalieImagePath,
  canReuseMalieDatabaseFile,
  filterMalieStemsByLangs,
  identityFromMalieRow,
  listMalieDatabaseKeysForLangs,
  liveLangFromMalieLocale,
  malieDatabaseFileUrl,
  malieDatabaseGzPath,
  malieRevisionFingerprint,
  parseMalieCardDatabaseKey,
  readMalieIdentitiesCache,
  writeMalieIdentitiesCache,
} from "./malie";

describe("pokemontcglive malie naming", () => {
  it("maps_malie_locales_to_live_cdn_langs", () => {
    expect(liveLangFromMalieLocale("fr-FR")).toBe("fr");
    expect(liveLangFromMalieLocale("pt-BR")).toBe("ptbr");
    expect(liveLangFromMalieLocale("es-419")).toBeNull();
    expect(liveLangFromMalieLocale("fr")).toBe("fr");
  });

  it("parses_card_database_keys_like_live_config_cache", () => {
    expect(parseMalieCardDatabaseKey("card-database-bw10_0_fr_0.0")).toEqual({
      key: "card-database-bw10_0_fr_0.0",
      liveSet: "bw10",
      tableIndex: 0,
      lang: "fr",
    });
    expect(parseMalieCardDatabaseKey("card-database-me2-5_0_ptbr_0.0")).toEqual(
      {
        key: "card-database-me2-5_0_ptbr_0.0",
        liveSet: "me2-5",
        tableIndex: 0,
        lang: "ptbr",
      },
    );
  });

  it("cardId_plus_lang_matches_cdn_bundle_stem", () => {
    expect(bundleStemFromCardId("bw10_1", "fr")).toBe("bw10_fr_001");
    expect(bundleStemFromCardId("me1_73", "en")).toBe("me1_en_073");
    expect(bundleStemFromCardId("svbsp_45", "de")).toBe("svbsp_de_045");
  });

  it("malie_image_paths_align_with_cdn_bundle_names", () => {
    expect(
      bundleStemFromMalieImagePath(
        "https://cdn.malie.io/file/malie-io/tcgl/cards/tex/fr/me1/me1_fr_001_std.png",
      ),
    ).toBe("me1_fr_001");
    expect(bundleStemFromMalieImagePath("me1_fr_001_ph.foil.png")).toBe(
      "me1_fr_001",
    );
  });

  it("identity_from_malie_row_matches_live_fields", () => {
    const id = identityFromMalieRow(
      {
        cardID: "bw10_1",
        longFormID: "Surskit_bw10_1_std_Common_NonFoil_None",
        "EN Card Name": "Surskit",
        "FR Card Name": "Arakdo",
        "Foil Effect": "NonFoil",
        "Foil Mask": "None",
        "EN Card #": "1",
        setCode: "BW10",
      },
      "fr",
    );
    expect(id).toMatchObject({
      bundle_stem: "bw10_fr_001",
      live_set: "bw10",
      num: 1,
      lang: "fr",
      variant: "std",
      card_id: "bw10_1",
      name_en: "Surskit",
      name_fr: "Arakdo",
      foil_effect: "NonFoil",
      foil_mask: "None",
    });
  });

  it("lists_only_requested_live_langs_from_index", () => {
    const keys = listMalieDatabaseKeysForLangs(
      {
        "card-database-bw1_0_fr_0.0": { data: "x" },
        "card-database-bw1_0_en_0.0": { data: "y" },
        "card-database-bw1_0_la_0.0": { data: "z" },
        "card-database-bw1_0_de_0.0": { data: "w" },
      },
      ["fr", "en"],
    );
    expect(keys.map((k) => k.key)).toEqual([
      "card-database-bw1_0_en_0.0",
      "card-database-bw1_0_fr_0.0",
    ]);
  });

  it("encodes_modifier_colon_in_malie_data_filenames", () => {
    const url = malieDatabaseFileUrl(
      "card-database-bw10_0_fr_0.0\uA7892fe20f0f.json",
    );
    expect(url).toContain("card-database-bw10_0_fr_0.0");
    expect(url).toContain("%EA%9E%89");
    expect(url).toContain("2fe20f0f.json");
  });

  it("filters_stems_to_requested_langs", () => {
    expect(
      filterMalieStemsByLangs(
        ["bw10_fr_001", "bw10_en_001", "shadersbundle", "me1_de_010"],
        ["fr"],
      ),
    ).toEqual(["bw10_fr_001"]);
  });

  it("reuses_local_db_when_revision_matches", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(os.tmpdir(), "malie-reuse-"));
    const dest = path.join(dir, "card-database-bw1_0_fr_0.0.json");
    await writeFile(dest, '{"rows":[]}\n', "utf8");
    try {
      expect(
        canReuseMalieDatabaseFile({
          destPath: dest,
          key: "card-database-bw1_0_fr_0.0",
          indexRevision: "abc",
          localRevisions: { "card-database-bw1_0_fr_0.0": "abc" },
        }),
      ).toBe(true);
      expect(
        canReuseMalieDatabaseFile({
          destPath: dest,
          key: "card-database-bw1_0_fr_0.0",
          indexRevision: "abc",
          localRevisions: { "card-database-bw1_0_fr_0.0": "old" },
        }),
      ).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores_and_reads_gzip_database_tables", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const {
      writeMalieDatabaseTableToDisk,
      readMalieDatabaseTableFromDisk,
      findMalieDatabaseOnDisk,
      compressMalieDatabasesDir,
    } = await import("./malie");
    const dir = await mkdtemp(path.join(os.tmpdir(), "malie-gz-"));
    try {
      const key = "card-database-bw1_0_fr_0.0";
      const plain = path.join(dir, `${key}.json`);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(plain, '{"rows":[{"cardID":"bw1_1"}]}\n', "utf8");
      const mig = compressMalieDatabasesDir(dir);
      expect(mig.compressed).toBe(1);
      expect(existsSync(plain)).toBe(false);
      const gz = findMalieDatabaseOnDisk(dir, key);
      expect(gz?.endsWith(".json.gz")).toBe(true);
      const table = readMalieDatabaseTableFromDisk(gz!);
      expect(table?.rows).toHaveLength(1);
      writeMalieDatabaseTableToDisk(dir, key, {
        rows: [{ cardID: "bw1_2" }, { cardID: "bw1_3" }],
      });
      expect(
        readMalieDatabaseTableFromDisk(malieDatabaseGzPath(dir, key))?.rows,
      ).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fingerprints index revisions in stable order", () => {
    const index = {
      "card-database-b_0_fr_0.0": { data: "x", revision: "2" },
      "card-database-a_0_fr_0.0": { data: "y", revision: "1" },
    };
    expect(
      malieRevisionFingerprint(
        [
          { key: "card-database-b_0_fr_0.0" },
          { key: "card-database-a_0_fr_0.0" },
        ],
        index,
      ),
    ).toBe(
      malieRevisionFingerprint(
        [
          { key: "card-database-a_0_fr_0.0" },
          { key: "card-database-b_0_fr_0.0" },
        ],
        index,
      ),
    );
  });

  it("round-trips the identities cache used by the Malie fast path", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(os.tmpdir(), "malie-id-cache-"));
    try {
      const sample = [
        identityFromMalieRow(
          {
            cardID: "bw10_1",
            longFormID: "Surskit_bw10_1_std_Common_NonFoil_None",
            "EN Card Name": "Surskit",
            "FR Card Name": "Arakdo",
            "Foil Effect": "NonFoil",
            "Foil Mask": "None",
            "EN Card #": "1",
            setCode: "BW10",
          },
          "fr",
        )!,
      ];
      writeMalieIdentitiesCache(dir, sample, {
        fingerprint: "fp",
        langs: ["fr"],
        bundleStems: 1,
        setnums: 1,
      });
      expect(readMalieIdentitiesCache(dir)).toEqual(sample);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
