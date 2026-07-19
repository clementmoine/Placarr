import { describe, expect, it } from "vitest";
import {
  coerceCardFormatForType,
  getCardFormatsForPicker,
  getDefaultCardFormatAlias,
} from "@/lib/text/cardFormat";

describe("getDefaultCardFormatAlias", () => {
  it.each([
    ["games", "dvd"],
    ["movies", "dvd"],
    ["musics", "square"],
    ["boardgames", "square"],
    ["books", "book"],
    [null, "dvd"],
    [undefined, "dvd"],
  ] as const)("maps %s → %s", (type, alias) => {
    expect(getDefaultCardFormatAlias(type)).toBe(alias);
  });
});

describe("getCardFormatsForPicker", () => {
  it("always hides the Default alias", () => {
    expect(getCardFormatsForPicker("movies")).not.toContain("dvd");
    expect(getCardFormatsForPicker("books")).not.toContain("book");
    expect(getCardFormatsForPicker("musics")).not.toContain("square");
    expect(getCardFormatsForPicker("games")).not.toContain("dvd");
  });

  it("always includes default", () => {
    expect(getCardFormatsForPicker("games")[0]).toBe("default");
  });
});

describe("coerceCardFormatForType", () => {
  it("collapses the alias into default", () => {
    expect(coerceCardFormatForType("square", "musics")).toBe("default");
    expect(coerceCardFormatForType("dvd", "movies")).toBe("default");
    expect(coerceCardFormatForType("book", "books")).toBe("default");
  });

  it("keeps a non-alias named format", () => {
    expect(coerceCardFormatForType("vhs", "musics")).toBe("vhs");
    expect(coerceCardFormatForType("square", "movies")).toBe("square");
    expect(coerceCardFormatForType("tcg", "games")).toBe("tcg");
  });
});
