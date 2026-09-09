import { describe, expect, it } from "vitest";

import dig from "../curated/sources/kana-manga-blister-2008.json";

describe("Kana manga blister 2008 dig", () => {
  it("confirms the official mangakana announcement via Wayback", () => {
    expect(dig.verdict).toBe("confirmed");
    expect(dig.officialAnnouncement.startDate).toBe("2008-04-25");
    expect(dig.officialAnnouncement.claim).toMatch(/15 premiers tomes/i);
    expect(dig.officialAnnouncement.claim).toMatch(/7 cartes inédites/i);
    expect(dig.officialAnnouncement.wayback).toContain("web.archive.org");
    expect(dig.tomeMapping).toHaveLength(15);
    expect(dig.tomeMapping.filter((row) => row.kind === "inedite")).toHaveLength(
      6,
    );
  });

  it("reads print numbers from collage image filenames on the Kana page", () => {
    expect(dig.collageImages.files.map((row) => row.number).sort()).toEqual([
      "ni232",
      "ni236",
      "ni239",
      "ni240",
      "ni252",
      "ni253",
      "ta214",
      "ta219",
    ]);
    expect(dig.tomeMapping.find((row) => row.tome === 12)).toMatchObject({
      number: "ni240",
      kind: "s5-reprint",
    });
  });
});
