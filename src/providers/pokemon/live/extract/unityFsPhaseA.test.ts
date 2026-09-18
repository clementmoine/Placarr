/**
 * UnityFS AssetManifest + MaterialManifest (Node, ADR-021 phase A).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assetEntriesFromTypeTrees,
  parseAssetManifestEntries,
} from "@/lib/unity/assetManifest";
import { parseMaterialManifests } from "@/lib/unity/materialManifest";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureUnityFs = path.join(
  here,
  "unity/fixtures/manifest_fr_10101_0000.unityfs",
);
const fixtureGolden = path.join(
  here,
  "unity/fixtures/manifest_fr_10101_0000.golden.json",
);

describe("unity AssetManifest (Node)", () => {
  it("extracts_assetList_rows_from_typetree_json", () => {
    const entries = assetEntriesFromTypeTrees([
      {
        m_Name: "AssetManifest",
        assetList: [
          {
            assetName: "Zebra",
            crc: 1,
            hash: "aa",
            dependencies: ["dep"],
          },
          {
            assetName: "alpha",
            crc: 2,
            hash: "bb",
            dependencies: [],
          },
          {
            assetName: "Alpha",
            crc: 3,
            hash: "cc",
            dependencies: [],
          },
        ],
      },
    ]);
    expect(entries.map((e) => e.name)).toEqual(["alpha", "Zebra"]);
    expect(entries[0]?.crc).toBe(2);
    expect(entries[1]?.dependencies).toEqual(["dep"]);
  });

  it("parses_live_cdn_manifest_fixture_vs_golden", () => {
    if (!existsSync(fixtureUnityFs) || !existsSync(fixtureGolden)) {
      return;
    }
    const golden = JSON.parse(readFileSync(fixtureGolden, "utf8")) as {
      assetCount: number;
      first: {
        name: string;
        crc: number;
        hash: string;
        dependencies: string[];
      };
      sampleNames: string[];
      sampleCrc: Record<string, number>;
    };
    const entries = parseAssetManifestEntries(readFileSync(fixtureUnityFs));
    expect(entries.length).toBe(golden.assetCount);
    expect(entries[0]).toEqual(golden.first);
    for (const name of golden.sampleNames) {
      expect(entries.some((e) => e.name === name)).toBe(true);
    }
    for (const [name, crc] of Object.entries(golden.sampleCrc)) {
      expect(entries.find((e) => e.name === name)?.crc).toBe(crc);
    }
  });
});

describe("unity MaterialManifest (Node)", () => {
  it("reads_MaterialManifest_from_card_bundle_when_present", () => {
    const repo = path.resolve(here, "../../..");
    const card = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/xybsp_fr_019",
    );
    if (!existsSync(card)) return;
    const rows = parseMaterialManifests(readFileSync(card));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const mm = rows[0]!;
    expect(mm.name.startsWith("MaterialManifest")).toBe(true);
    expect(mm._f).toBe("HoloFoil_Rainbow_Amplify_J");
    expect(mm._c).toBe("xybsp_fr_019");
    expect(mm._w).toBe("xybsp_wp_fr_019");
    expect(mm._s).toContain("HoloFoil_Rainbow_Amplify_J");
  });
});
