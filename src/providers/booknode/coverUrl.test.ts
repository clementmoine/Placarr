import { describe, expect, it } from "vitest";

import {
  booknodeCoverDownloadCandidates,
  booknodeCoverMediaKey,
  normalizeBooknodeCoverUrl,
} from "./coverUrl";

const MOD11_SUPER_PICSOU_N2 = [
  "https://cdn1.booknode.com/book_cover/1691/mod11/super-picsou-geant-n2-1691462-264-432.webp",
  "https://cdn1.booknode.com/book_cover/1691/mod11/super-picsou-geant-n2-1691462-132-216.webp",
  "https://cdn1.booknode.com/book_cover/1691/mod11/super-picsou-geant-n2-1691462-66-108.webp",
  "https://cdn1.booknode.com/book_cover/1691/mod11/super_picsou_geant_n2-1691462-264-432.webp",
  "https://cdn1.booknode.com/book_cover/1691/mod11/super_picsou_geant_n2-1691462-132-216.webp",
  "https://cdn1.booknode.com/book_cover/1691/mod11/super_picsou_geant_n2-1691462-66-108.webp",
];

describe("booknode coverUrl", () => {
  it("prefers the /full/ JPEG variant for Booknode download upgrades", () => {
    const thumb =
      "https://cdn1.booknode.com/book_cover/5518/lart_et_la_creation_de_arcane-5517967-264-432.webp";

    expect(booknodeCoverDownloadCandidates(thumb).slice(0, 3)).toEqual([
      "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517967.jpg",
      "https://cdn1.booknode.com/book_cover/5518/full/lart_et_la_creation_de_arcane-5517967.jpg",
      "https://cdn1.booknode.com/book_cover/5518/mod11/lart-et-la-creation-de-arcane-5517967-264-432.webp",
    ]);
    expect(normalizeBooknodeCoverUrl(thumb)).toBe(
      "https://cdn1.booknode.com/book_cover/5518/mod11/lart-et-la-creation-de-arcane-5517967-264-432.webp",
    );
  });

  it("adds hyphen slug and mod11 candidates for /full/ underscore URLs", () => {
    const underscore =
      "https://cdn1.booknode.com/book_cover/1691/full/super_picsou_geant_n2-1691462.jpg";

    const candidates = booknodeCoverDownloadCandidates(underscore);
    expect(candidates[0]).toBe(
      "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n2-1691462.jpg",
    );
    expect(candidates).toContain(underscore);
    expect(candidates).toContain(MOD11_SUPER_PICSOU_N2[0]);
    expect(normalizeBooknodeCoverUrl(underscore)).toBe(
      MOD11_SUPER_PICSOU_N2[0],
    );
  });

  it("includes mod11 fallbacks for Super Picsou full JPEG URLs", () => {
    const full =
      "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n2-1691462.jpg";

    const candidates = booknodeCoverDownloadCandidates(full);
    expect(candidates[0]).toBe(full);
    expect(candidates).toContain(
      "https://cdn1.booknode.com/book_cover/1691/full/super_picsou_geant_n2-1691462.jpg",
    );
    for (const mod11 of MOD11_SUPER_PICSOU_N2) {
      expect(candidates).toContain(mod11);
    }
  });

  it("normalizes Super Picsou webp thumbs to hyphenated full JPEGs", () => {
    const thumb =
      "https://cdn1.booknode.com/book_cover/1691/super_picsou_geant_n2-1691462-264-432.webp";

    expect(normalizeBooknodeCoverUrl(thumb)).toBe(MOD11_SUPER_PICSOU_N2[0]);
  });

  it("dedupes thumbnail and full JPEG variants of the same upload", () => {
    const full =
      "https://cdn1.booknode.com/book_cover/987/full/death-note-tome-1-986958.jpg";
    const thumb =
      "https://cdn1.booknode.com/book_cover/987/death_note_tome_1-986958-264-432.webp";

    expect(booknodeCoverMediaKey(full)).toBe("987:986958");
    expect(booknodeCoverMediaKey(thumb)).toBe("987:986958");
  });
});
