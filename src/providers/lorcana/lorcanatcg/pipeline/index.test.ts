import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("lorcanatcg catalog Sync", () => {
  it("never hardcodes force:true on scrapeLorcanaCards (admin/auto only)", () => {
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "index.ts"),
      "utf8",
    );
    expect(src).toMatch(/scrapeLorcanaCards\(\{\}\)/);
    expect(src).not.toMatch(/scrapeLorcanaCards\(\{[^}]*force:\s*true/);
    expect(src).not.toMatch(/argv\.includes\(["']--force["']\)/);
  });
});
