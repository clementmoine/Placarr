/**
 * Unit tests for Pokémon TCG Live CDN URL helpers (no network).
 */
import { writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AsyncLock,
  DEFAULT_CONTENT_DIR,
  DEFAULT_DELAY_S,
  DEFAULT_DIR_PROBE,
  DEFAULT_WORKERS,
  SOFTBAN_COOLDOWN_S,
  SOFTBAN_STATUSES,
  bundleSetId,
  bundleUrl,
  catalogueSetnumsFromConfig,
  classifyCdn403Body,
  collectApkSetnumPairs,
  hasPair,
  httpDeps,
  isCdnPathAccessDenied,
  isCloudFrontRequestBlocked,
  loadContentDirs,
  orderDirsForSet,
  resolveContentDir,
  setnumToBundleNames,
} from "./cdn";

describe("pokemon cdn helpers", () => {
  const originalHead = httpDeps.headBundle;

  afterEach(() => {
    httpDeps.headBundle = originalHead;
  });

  it("bundle_url_default_prefix", () => {
    expect(bundleUrl("xy8_fr_012")).toBe(
      "https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.40.0/10101_0000/xy8_fr_012",
    );
  });

  it("bundle_url_uses_content_base_when_set", () => {
    expect(
      bundleUrl("xy8_fr_012", {
        contentBase:
          "https://cdn.studio-preprod.pokemon.biz/rainier/Content/Android/1.41.0",
        contentDir: "20260716_1700",
      }),
    ).toBe(
      "https://cdn.studio-preprod.pokemon.biz/rainier/Content/Android/1.41.0/20260716_1700/xy8_fr_012",
    );
  });

  it("setnum_to_bundle_names_includes_foil_t", () => {
    expect(setnumToBundleNames("bw1_001")).toEqual([
      "bw1_fr_001",
      "bw1_fr_001_t",
    ]);
  });

  it("setnum_passthrough_full_bundle", () => {
    expect(setnumToBundleNames("xy8_fr_012")).toEqual(["xy8_fr_012"]);
  });

  it("sequential_defaults_like_ptcgl_dev", () => {
    expect(DEFAULT_WORKERS).toBe(1);
    expect(DEFAULT_DELAY_S).toBe(0);
    expect(DEFAULT_DIR_PROBE).toBe("primary");
    expect(SOFTBAN_STATUSES.has(403)).toBe(true);
    expect(SOFTBAN_COOLDOWN_S).toBeGreaterThanOrEqual(60);
  });

  it("bundle_set_id", () => {
    expect(bundleSetId("me4_fr_001")).toBe("me4");
    expect(bundleSetId("zsv10-5_en_012_t")).toBe("zsv10-5");
    expect(bundleSetId("sv8_ptbr_001")).toBe("sv8");
    expect(setnumToBundleNames("sv8_001", "ptbr")).toEqual([
      "sv8_ptbr_001",
      "sv8_ptbr_001_t",
    ]);
  });

  it("order_dirs_prefers_default_then_dated", () => {
    const dirs = orderDirsForSet(
      [DEFAULT_CONTENT_DIR, "20260521_1700", "20260716_1700"],
      { known: null },
    );
    expect(dirs[0]).toBe(DEFAULT_CONTENT_DIR);
    expect(dirs).toContain("20260716_1700");
  });

  it("order_dirs_known_first", () => {
    const dirs = orderDirsForSet([DEFAULT_CONTENT_DIR, "20260521_1700"], {
      known: "20260521_1700",
    });
    expect(dirs[0]).toBe("20260521_1700");
  });

  it("catalogue_setnums_from_compendium_includes_alt_and_op", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "placarr-cdn-"));
    writeFileSync(
      path.join(tmp, "svalt-compendium_0.0.json"),
      JSON.stringify({
        keys: {
          compendium: {
            contentString: JSON.stringify({
              svalt_1: "uuid-a",
              svalt_2: "uuid-b",
            }),
          },
        },
      }),
      "utf8",
    );
    writeFileSync(
      path.join(tmp, "svbsp-compendium_0.0.json"),
      JSON.stringify({
        keys: {
          compendium: {
            contentString: JSON.stringify({
              svbsp_44: "a",
              svbsp_45: "b",
              svbsp_45_ph: "c",
            }),
          },
        },
      }),
      "utf8",
    );
    const lines = catalogueSetnumsFromConfig(tmp);
    expect(lines).toContain("svalt_001");
    expect(lines).toContain("svalt_002");
    expect(lines).toContain("svbsp_044");
    expect(lines).toContain("svbsp_045");
  });

  it("catalogue_setnums_longform_fallback_catches_op_variant", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "placarr-cdn-"));
    const blob = Buffer.from(
      "xParadiseResort_svbsp_45_op_Rare_Stamped_Stampedy",
      "utf8",
    );
    writeFileSync(
      path.join(tmp, "card-database-svbsp_0_fr_0.0.json"),
      JSON.stringify({
        keys: {
          table: {
            contentBinary: blob.toString("base64"),
          },
        },
      }),
      "utf8",
    );
    expect(catalogueSetnumsFromConfig(tmp)).toContain("svbsp_045");
  });

  it("collect_apk_setnum_pairs_reports_sources", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "placarr-cdn-"));
    writeFileSync(
      path.join(tmp, "svalt-compendium_0.0.json"),
      JSON.stringify({
        keys: {
          compendium: {
            contentString: JSON.stringify({ svalt_1: "u" }),
          },
        },
      }),
      "utf8",
    );
    const inv = collectApkSetnumPairs(tmp);
    expect(hasPair(inv.pairs, "svalt", 1)).toBe(true);
    expect(inv.compendiumStems.has("svalt")).toBe(true);
  });

  it("load_content_dirs_reads_manifest", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "placarr-cdn-"));
    writeFileSync(
      path.join(tmp, "asset-bundle-manifest_0.0.json"),
      JSON.stringify({
        keys: {
          manifest: {
            contentString: JSON.stringify({
              directories: [
                DEFAULT_CONTENT_DIR,
                "20260716_1700",
                "20260521_1700",
              ],
            }),
          },
        },
      }),
      "utf8",
    );
    const dirs = loadContentDirs(tmp);
    expect(dirs[0]).toBe(DEFAULT_CONTENT_DIR);
    expect(dirs).toContain("20260716_1700");
    expect(dirs).toContain("20260521_1700");
    expect(dirs.length).toBeGreaterThanOrEqual(3);
  });

  it("resolve_content_dir_does_not_pin_wrong_set_dir", async () => {
    /** mebsp-style: first card on dir A must not force later cards onto A. */
    const heads = new Map<string, number>([
      ["mebsp_fr_001|20260423_1700", 200],
      ["mebsp_fr_046|20260423_1700", 403],
      ["mebsp_fr_046|20260618_1700", 200],
    ]);

    httpDeps.headBundle = async (name, opts = {}) => {
      const key = `${name}|${opts.contentDir ?? ""}`;
      return [heads.get(key) ?? 403, 0];
    };

    const cache = new Map<string, string>();
    const lock = new AsyncLock();
    const dirs = ["20260423_1700", "20260618_1700", DEFAULT_CONTENT_DIR];

    expect(
      (
        await resolveContentDir("mebsp_fr_001", {
          version: "1.40.0",
          dirs,
          setDirCache: cache,
          cacheLock: lock,
        })
      ).contentDir,
    ).toBe("20260423_1700");
    expect(cache.get("mebsp")).toBe("20260423_1700");

    expect(
      (
        await resolveContentDir("mebsp_fr_046", {
          version: "1.40.0",
          dirs,
          setDirCache: cache,
          cacheLock: lock,
        })
      ).contentDir,
    ).toBe("20260618_1700");
    expect(cache.get("mebsp")).toBe("20260618_1700");
  });

  it("classifies_403_bodies_softban_vs_path_miss", () => {
    const blocked = [
      "Request blocked.",
      "We can't connect to the server for this app or website at this time.",
      "There might be too much traffic or a configuration error.",
    ].join(" ");
    expect(classifyCdn403Body(blocked)).toBe("softban");
    expect(isCloudFrontRequestBlocked(blocked)).toBe(true);

    const miss =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>";
    expect(classifyCdn403Body(miss)).toBe("missing");
    expect(isCdnPathAccessDenied(miss)).toBe(true);
    expect(isCloudFrontRequestBlocked(miss)).toBe(false);

    expect(classifyCdn403Body("Forbidden")).toBe("unknown");
  });
});
