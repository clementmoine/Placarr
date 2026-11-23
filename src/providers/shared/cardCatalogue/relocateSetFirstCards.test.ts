import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { relocateSetFirstCardDirs } from "./relocateSetFirstCards";

function put(file: string, body: string, mtime: Date): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  utimesSync(file, mtime, mtime);
}

describe("relocateSetFirstCardDirs", () => {
  it("moves cards/{set}/{lang}/ faces under cards/{lang}/{set}/, newest wins", () => {
    // 2026-11-22 : Kayou t4w3 HR 084 — face fraîche en set-first, face
    // d'octobre en lang-first ; l'app et la sonde lenticulaire lisaient la
    // vieille.
    const cards = mkdtempSync(path.join(tmpdir(), "set-first-"));
    const old = new Date("2026-10-18T00:00:00Z");
    const fresh = new Date("2026-11-22T00:00:00Z");
    put(
      path.join(cards, "en", "t4w3", "nr.hr.084", "art.narutopia.webp"),
      "old",
      old,
    );
    put(
      path.join(cards, "t4w3", "en", "nr.hr.084", "art.narutopia.webp"),
      "new",
      fresh,
    );
    put(
      path.join(cards, "t4w3", "en", "nr.hr.085", "art.narutopia.webp"),
      "only",
      fresh,
    );
    // Stale set-first copy older than the canonical one: canonical stays.
    put(
      path.join(cards, "en", "t4w1", "nr.r.001", "art.a.webp"),
      "canon",
      fresh,
    );
    put(path.join(cards, "t4w1", "en", "nr.r.001", "art.a.webp"), "stale", old);
    // Files at the cards root (backs) are not set dirs.
    put(path.join(cards, "back.png"), "back", old);

    const report = relocateSetFirstCardDirs(cards);

    const read = (...p: string[]) =>
      readFileSync(path.join(cards, ...p), "utf8");
    expect(read("en", "t4w3", "nr.hr.084", "art.narutopia.webp")).toBe("new");
    expect(read("en", "t4w3", "nr.hr.085", "art.narutopia.webp")).toBe("only");
    expect(read("en", "t4w1", "nr.r.001", "art.a.webp")).toBe("canon");
    expect(existsSync(path.join(cards, "t4w3"))).toBe(false);
    expect(existsSync(path.join(cards, "t4w1"))).toBe(false);
    expect(read("back.png")).toBe("back");
    expect(report).toEqual({ moved: 1, replaced: 1, keptCanonical: 1 });
  });

  it("leaves a lang-first tree alone", () => {
    const cards = mkdtempSync(path.join(tmpdir(), "lang-first-"));
    put(path.join(cards, "fr", "s1", "ni0001", "art.webp"), "x", new Date());
    expect(relocateSetFirstCardDirs(cards)).toEqual({
      moved: 0,
      replaced: 0,
      keptCanonical: 0,
    });
    expect(existsSync(path.join(cards, "fr", "s1", "ni0001", "art.webp"))).toBe(
      true,
    );
  });
});
