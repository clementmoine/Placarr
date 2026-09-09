import { describe, expect, it } from "vitest";

import home from "./curated/sources/bandaicg-home.json";
import cardlist from "./curated/sources/bandaicg-en-cardlist.json";

describe("bandaicg.com home.php 2009 hub", () => {
  it("does not ingest the vBulletin hub or tin forum attachments", () => {
    expect(home.ingest).toBe("none");
    expect(home.wayback.timestamp).toBe("20090211193529");
    expect(home.skip).toEqual(
      expect.arrayContaining(["showthread.php", "attachment.php"]),
    );
    const tin = home.announced.find((row) => row.kind === "tin");
    expect(tin?.name).toBe("Guardian of the Village");
    expect(tin?.variants).toEqual(["Gaara", "Kakashi", "Naruto"]);
    const s13 = home.announced.find((row) => row.setCode === "s13");
    expect(s13?.name).toBe("Fateful Reunion");
    expect(s13?.cards).toBe(cardlist.counts.bySet.s13);
  });
});
