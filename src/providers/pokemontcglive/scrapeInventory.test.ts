import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildScrapeInventory,
  cdnStatusFromBundleResult,
  malieCardTexUrl,
  mergeCdnResultsIntoInventory,
  mergeLiveIdentities,
  readJsonGzipFile,
} from "./scrapeInventory";

describe("scrapeInventory", () => {
  it("builds_malie_art_url_from_stem", () => {
    expect(malieCardTexUrl("me1_fr_001")).toBe(
      "https://cdn.malie.io/file/malie-io/tcgl/cards/tex/fr/me1/me1_fr_001_std.png",
    );
  });

  it("unions_apk_setnums_and_malie_stems", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-inv-"));
    const inv = buildScrapeInventory({
      outDir: dir,
      langs: ["fr", "en"],
      apkSetnums: ["sv1_001"],
      apkStems: ["sv1_fr_002"],
      malieStems: ["sv1_fr_001", "sv1_de_001"],
    });
    expect(inv.stems).toContain("sv1_fr_001");
    expect(inv.stems).toContain("sv1_en_001");
    expect(inv.stems).toContain("sv1_fr_002");
    expect(inv.stems).not.toContain("sv1_de_001"); // filtered by langs
    const fr001 = inv.entries.find((e) => e.stem === "sv1_fr_001")!;
    expect(fr001.sources).toEqual(
      expect.arrayContaining(["setnum-expand", "malie"]),
    );
    expect(fr001.malie).toBe("catalogued");
    const fr002 = inv.entries.find((e) => e.stem === "sv1_fr_002")!;
    expect(fr002.malie).toBe("unavailable");
    expect(fr002.sources).toContain("apk");
    expect(inv.report.malieUnavailable).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(inv.report.malieUnavailablePath)).toBe(true);
    expect(
      fs.readFileSync(inv.report.malieUnavailablePath, "utf8"),
    ).toContain("sv1_fr_002");
  });

  it("merges_cdn_results_into_availability_log", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-inv-"));
    const inv = buildScrapeInventory({
      outDir: dir,
      langs: ["fr"],
      malieStems: ["sv1_fr_001", "sv1_fr_002"],
    });
    mergeCdnResultsIntoInventory(inv, [
      { name: "sv1_fr_001", ok: true, skipped: true, status: 200 },
      {
        name: "sv1_fr_002",
        ok: false,
        status: 404,
        error: "cdn-forbidden-or-missing",
        softBan: false,
      },
    ]);
    expect(inv.entries.find((e) => e.stem === "sv1_fr_001")!.cdn).toBe(
      "skipped",
    );
    expect(inv.entries.find((e) => e.stem === "sv1_fr_002")!.cdn).toBe(
      "unavailable",
    );
    expect(inv.report.cdnUnavailable).toBe(1);
    const avail = readJsonGzipFile(inv.report.availabilityPath) as {
      cdnUnavailable: { stem: string }[];
    };
    expect(avail.cdnUnavailable.map((x) => x.stem)).toEqual(["sv1_fr_002"]);
  });

  it("cdn_status_marks_softban", () => {
    expect(
      cdnStatusFromBundleResult({
        name: "x",
        ok: false,
        softBan: true,
        error: "cloudfront-request-blocked",
        status: 403,
      }).cdn,
    ).toBe("softban");
  });

  it("merges_identities_with_primary_wins", () => {
    const rows = mergeLiveIdentities(
      [{ long_form_id: "a", name: "malie" }],
      [
        { long_form_id: "a", name: "apk" },
        { long_form_id: "b", name: "apk-only" },
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.long_form_id === "a")!.name).toBe("malie");
    expect(rows.find((r) => r.long_form_id === "b")!.name).toBe("apk-only");
  });
});
