import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { mergeSurugaHtmlIntoListingsTsv } from "./mergeSurugaPaste";
import { parseSurugaDataCarddassListingsTsv } from "./parse/parseSurugaDataCarddass";

describe("mergeSurugaHtmlIntoListingsTsv", () => {
  it("appends new product ids from category HTML", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-suruga-merge-"));
    const tsvPath = path.join(tmp, "listings.tsv");
    writeFileSync(tsvPath, "# productId\tprinted\nG8903919\tNM-031\n", "utf8");

    const html = `
      items.push({ item_id: "G8903919", item_name: "NM - 031: already" });
      items.push({ item_id: "G9999999", item_name: "DN - 099 T: Naruto" });
    `;
    const report = mergeSurugaHtmlIntoListingsTsv(html, tsvPath);
    expect(report.before).toBe(1);
    expect(report.added).toBe(1);
    expect(report.after).toBe(2);

    const rows = parseSurugaDataCarddassListingsTsv(
      readFileSync(tsvPath, "utf8"),
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["G8903919", "G9999999"]);
  });
});
