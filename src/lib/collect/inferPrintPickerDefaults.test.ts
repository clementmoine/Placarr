import { describe, expect, it } from "vitest";

import { inferPrintPickerDefaults } from "@/lib/collect/inferPrintPickerDefaults";

const catalogues = [
  {
    id: "narutocarddass",
    label: "Naruto Carddass",
    defaultLanguage: "fr",
    languages: ["fr", "en", "ja", "it"],
    aliases: [
      { label: "Naruto CCG" },
      { label: "Naruto JCC" },
      { label: "JCC Naruto" },
      {
        label: "Shippuden Collectible Card Game",
        language: "en",
      },
      {
        label: "Naruto Shippuden Collectible Card Game",
        language: "en",
      },
    ],
  },
  {
    id: "narutoranks",
    label: "Naruto Ninja Ranks",
    defaultLanguage: "fr",
    languages: ["en", "fr", "it"],
    aliases: [{ label: "Ninja Ranks" }],
  },
  {
    id: "narutoultra",
    label: "Naruto Ultra Challenge",
    defaultLanguage: "fr",
    languages: ["fr"],
    aliases: [{ label: "Ultra Challenge" }],
  },
  {
    id: "narutomythos",
    label: "Naruto Mythos",
    defaultLanguage: "fr",
    languages: ["fr", "en"],
    aliases: [{ label: "Mythos" }],
  },
  {
    id: "narutokayou",
    label: "Naruto Kayou",
    defaultLanguage: "en",
    languages: ["en"],
    aliases: [{ label: "Kayou" }],
  },
  {
    id: "narutoshippuden",
    label: "Naruto 疾風伝",
    defaultLanguage: null,
    languages: ["ja"],
    aliases: [{ label: "Naruto Shippuden Card Game", language: "ja" }],
  },
  {
    id: "lorcanajson",
    label: "Lorcana",
    defaultLanguage: "fr",
    languages: ["fr", "en", "de", "it"],
    aliases: [{ label: "Disney Lorcana" }],
    sets: [
      { id: "1", label: "Premier Chapitre" },
      { id: "2", label: "L'Ascension des Floodborn" },
    ],
  },
] as const;

describe("inferPrintPickerDefaults", () => {
  it("matches an exact catalogue label", () => {
    expect(
      inferPrintPickerDefaults("Naruto Ninja Ranks", catalogues),
    ).toEqual({
      catalogueId: "narutoranks",
      language: "fr",
      setId: null,
    });
  });

  it("matches CCG / JCC aliases to Carddass with French default", () => {
    expect(inferPrintPickerDefaults("Naruto CCG", catalogues)).toEqual({
      catalogueId: "narutocarddass",
      language: "fr",
      setId: null,
    });
    expect(inferPrintPickerDefaults("Naruto JCC", catalogues)).toEqual({
      catalogueId: "narutocarddass",
      language: "fr",
      setId: null,
    });
  });

  it("matches Ultra Challenge, Mythos, Kayou, and English Shippuden CCG language", () => {
    expect(inferPrintPickerDefaults("Ultra Challenge", catalogues)).toEqual({
      catalogueId: "narutoultra",
      language: "fr",
      setId: null,
    });
    expect(inferPrintPickerDefaults("Naruto Mythos", catalogues)).toEqual({
      catalogueId: "narutomythos",
      language: "fr",
      setId: null,
    });
    expect(inferPrintPickerDefaults("Kayou", catalogues)).toEqual({
      catalogueId: "narutokayou",
      language: "en",
      setId: null,
    });
    expect(
      inferPrintPickerDefaults(
        "Naruto Shippuden Collectible Card Game",
        catalogues,
      ),
    ).toEqual({
      catalogueId: "narutocarddass",
      language: "en",
      setId: null,
    });
  });

  it("matches Lorcana and a unique set when the shelf names both", () => {
    expect(
      inferPrintPickerDefaults("Lorcana Premier Chapitre", catalogues),
    ).toEqual({
      catalogueId: "lorcanajson",
      language: "fr",
      setId: "1",
    });
  });

  it("does not force a set when the shelf only names the game", () => {
    expect(inferPrintPickerDefaults("Lorcana", catalogues)).toEqual({
      catalogueId: "lorcanajson",
      language: "fr",
      setId: null,
    });
  });

  it("stays empty when the shelf name is ambiguous across catalogues", () => {
    expect(inferPrintPickerDefaults("Naruto", catalogues)).toEqual({
      catalogueId: null,
      language: null,
      setId: null,
    });
  });

  it("prefers an owned language majority over the catalogue default", () => {
    expect(
      inferPrintPickerDefaults("Naruto Ninja Ranks", catalogues, [
        { printKey: "naruto:nr-0001", language: "en" },
        { printKey: "naruto:nr-0002", language: "en" },
        { printKey: "naruto:nr-0003", language: "fr" },
      ]),
    ).toEqual({
      catalogueId: "narutoranks",
      language: "en",
      setId: null,
    });
  });
});
