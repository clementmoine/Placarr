import {
  existsSync,
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  DATA_CARDDASS_OFFICIAL_PAGES,
  harvestDataCarddassOfficialMirror,
} from "./officialMirror";

describe("DATA_CARDDASS_OFFICIAL_PAGES", () => {
  it("maps each archived official page to its staging/official file", () => {
    const byFile = new Map(
      DATA_CARDDASS_OFFICIAL_PAGES.map((page) => [page.file, page.url]),
    );
    expect(byFile.get("dn/battle_card.shtml")).toBe(
      "http://www.carddass.com/naruto/mission/cardlist/battle_card.shtml",
    );
    expect(byFile.get("nm/tokunin.php")).toBe(
      "http://www.carddass.com/naruto/mission/cardlist/tokunin.php",
    );
    expect(byFile.get("nf/nf1.php")).toBe(
      "http://www.fudanin.com/formation/cardlist/1st.php",
    );
    expect(byFile.get("nf/nf_adv.php")).toBe(
      "http://www.fudanin.com/formation/cardlist/advance.php",
    );
    expect(byFile.get("nx/cat10248.html")).toBe(
      "http://fudanin.com/x/cardlist/?search=true&category=10248",
    );
    expect(byFile.get("nx/cat10248p30.html")).toBe(
      "http://fudanin.com/x/cardlist/?page=30&search=true&category=10248",
    );
  });
});

describe("harvestDataCarddassOfficialMirror", () => {
  it("writes the newest 200 capture of each page, keeps files already there", async () => {
    const stagingRoot = mkdtempSync(path.join(tmpdir(), "dcd-official-"));
    const official = path.join(stagingRoot, "official");
    mkdirSync(path.join(official, "nm"), { recursive: true });
    writeFileSync(path.join(official, "nm", "tokunin.php"), "already");

    const latestCapture = vi.fn(async (url: string) =>
      url.endsWith("battle_card.shtml") ? "20160414013410" : null,
    );
    const fetchCapture = vi.fn(async () => Buffer.from("<html>DN</html>"));

    const report = await harvestDataCarddassOfficialMirror({
      stagingRoot,
      pages: [
        {
          file: "dn/battle_card.shtml",
          url: "http://www.carddass.com/naruto/mission/cardlist/battle_card.shtml",
        },
        {
          file: "nm/tokunin.php",
          url: "http://www.carddass.com/naruto/mission/cardlist/tokunin.php",
        },
        {
          file: "nx/cat99999p30.html",
          url: "http://fudanin.com/x/cardlist/?page=30&search=true&category=99999",
        },
      ],
      latestCapture,
      fetchCapture,
    });

    expect(
      readFileSync(path.join(official, "dn", "battle_card.shtml"), "utf8"),
    ).toBe("<html>DN</html>");
    expect(fetchCapture).toHaveBeenCalledWith(
      "20160414013410",
      "http://www.carddass.com/naruto/mission/cardlist/battle_card.shtml",
    );
    // Already mirrored: no CDX hit, no refetch.
    expect(readFileSync(path.join(official, "nm", "tokunin.php"), "utf8")).toBe(
      "already",
    );
    expect(latestCapture).not.toHaveBeenCalledWith(
      "http://www.carddass.com/naruto/mission/cardlist/tokunin.php",
    );
    // Never archived: honest miss, no file.
    expect(existsSync(path.join(official, "nx", "cat99999p30.html"))).toBe(
      false,
    );
    expect(report).toEqual({
      fetched: 1,
      kept: 1,
      missing: ["nx/cat99999p30.html"],
    });
  });
});
