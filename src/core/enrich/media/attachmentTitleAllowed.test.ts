import { describe, expect, it } from "vitest";

import { attachmentTitleAllowedForItem } from "./attachmentTitleAllowed";

describe("attachmentTitleAllowedForItem", () => {
  it("keeps untitled covers", () => {
    expect(
      attachmentTitleAllowedForItem("Little Nightmare", {
        type: "cover",
        title: "",
        retailCatalogImageTitlesSource: true,
      }),
    ).toBe(true);
  });

  it("rejects retail sequel covers that fail listing identity (store=present)", () => {
    expect(
      attachmentTitleAllowedForItem(
        "Little Nightmare",
        {
          type: "cover",
          title: "little nightmares iii sur ps4 visuel produit",
          retailCatalogImageTitlesSource: true,
        },
        { mediaType: "games" },
      ),
    ).toBe(false);
  });

  it("rejects Blu-ray titles on game shelves even without retail trait", () => {
    expect(
      attachmentTitleAllowedForItem(
        "La Mémoire dans la peau",
        {
          type: "cover",
          title: "La Mémoire dans la peau [Blu-ray]",
        },
        { mediaType: "games" },
      ),
    ).toBe(false);
  });

  it("rejects catalogCover titles that name another comic line", () => {
    expect(
      attachmentTitleAllowedForItem(
        "Les Trésors de Picsou n°1",
        {
          type: "cover",
          title: "Les âges d'or de Picsou, Tome 1",
          catalogCoverTitlesSource: true,
        },
        { mediaType: "books" },
      ),
    ).toBe(false);
  });

  it("keeps aligned retail covers", () => {
    expect(
      attachmentTitleAllowedForItem(
        "Prince of Persia Trilogy",
        {
          type: "cover",
          title: "PS3 Prince of Persia Trilogy: 3 Full Games",
          retailCatalogImageTitlesSource: true,
        },
        { mediaType: "games" },
      ),
    ).toBe(true);
  });

  it("rejects hardware finish conflicts via residual (shelfType)", () => {
    expect(
      attachmentTitleAllowedForItem(
        "Nintendo Wii - Bleu",
        {
          type: "cover",
          title: "Nintendo Wii - Rose",
          retailCatalogImageTitlesSource: true,
        },
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });
});
