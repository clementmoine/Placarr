import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { exportNarutoCardsIndexJson } from "./indexStore";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("exportNarutoCardsIndexJson", () => {
  it("writes per-locale names and keeps NI distinct from N", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "naruto-index-"));
    dirs.push(dir);
    const out = path.join(dir, "cards-index.json");
    const index = exportNarutoCardsIndexJson(
      [
        {
          printKey: "naruto:ni-0001",
          setCode: "s1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:n-0001",
          setCode: "s1",
          number: "n0001",
          cardType: "n",
          family: "ninja",
        },
        {
          printKey: "naruto:ni-0264",
          setCode: "s6",
          number: "ni0264",
          cardType: "ni",
          family: "ninja",
        },
      ],
      [],
      out,
      [
        {
          printKey: "naruto:ni-0001",
          lang: "fr",
          fullName: "Naruto Uzumaki",
        },
        {
          printKey: "naruto:ni-0001",
          lang: "ja",
          fullName: "うずまきナルト",
        },
        {
          printKey: "naruto:n-0001",
          lang: "en",
          fullName: "Naruto Uzumaki",
        },
        {
          printKey: "naruto:ni-0264",
          lang: "fr",
          fullName: "Shikamaru Nara & Temari",
        },
      ],
    );
    expect(index.cards["naruto:ni-0001"]?.langs.fr?.name).toBe(
      "Naruto Uzumaki",
    );
    expect(index.cards["naruto:ni-0001"]?.langs.ja?.name).toBe(
      "うずまきナルト",
    );
    expect(index.cards["naruto:n-0001"]?.langs.en?.name).toBe("Naruto Uzumaki");
    expect(index.cards["naruto:n-0001"]?.name).toBe("Naruto Uzumaki");
    expect(index.cards["naruto:ni-0264"]?.langs.fr?.printed).toBe(false);
    const disk = JSON.parse(readFileSync(out, "utf8")) as typeof index;
    expect(disk.cards["naruto:ni-0001"]?.langs.ja?.name).toBe("うずまきナルト");
  });

  it("writes one Kakashi print when an old s6 key is still present", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "naruto-index-"));
    dirs.push(dir);
    const out = path.join(dir, "cards-index.json");
    const index = exportNarutoCardsIndexJson(
      [
        {
          printKey: "naruto:ni-0064",
          setCode: "s2",
          number: "ni0064",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:s6-ni064",
          setCode: "s6",
          number: "ni064",
          cardType: "ni",
        },
      ],
      [
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          art: "art.jpg",
        },
      ],
      out,
      [
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          fullName: "Kakashi Hatake",
        },
        {
          printKey: "naruto:s6-ni064",
          lang: "fr",
          fullName: "qui",
        },
      ],
    );
    expect(index.cards["naruto:s6-ni064"]).toBeUndefined();
    expect(index.cards["naruto:ni-0064"]?.langs.fr).toMatchObject({
      name: "Kakashi Hatake",
      art: "art.jpg",
    });
    expect(index.cards["naruto:ni-0064"]?.langs.fr?.printed).toBeUndefined();
  });
});
