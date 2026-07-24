import { describe, expect, it } from "vitest";

import { mapBooknodeMetadata } from "./index";

describe("mapBooknodeMetadata attachments", () => {
  it("tags only the fiche cover as cover; /covers gallery as image", () => {
    const metadata = mapBooknodeMetadata({
      id: "1",
      title: "Alice 19th, Tome 5",
      sourceUrl: "https://booknode.com/alice_19th_tome_5_1",
      imageUrl:
        "https://cdn1.booknode.com/book_cover/100/mod11/alice-19th-tome-5-1001-264-432.webp",
      coverImages: [
        "https://cdn1.booknode.com/book_cover/100/mod11/alice-19th-tome-5-1001-264-432.webp",
        "https://cdn1.booknode.com/book_cover/200/mod11/alice-19th-tome-5-2002-264-432.webp",
        "https://cdn1.booknode.com/book_cover/300/mod11/alice-19th-tome-5-3003-264-432.webp",
      ],
    });

    expect(metadata?.attachments).toEqual([
      {
        type: "cover",
        url: "https://cdn1.booknode.com/book_cover/100/mod11/alice-19th-tome-5-1001-264-432.webp",
        title: "Alice 19th, Tome 5",
        role: "fr",
        source: "booknode",
      },
      {
        type: "image",
        url: "https://cdn1.booknode.com/book_cover/200/mod11/alice-19th-tome-5-2002-264-432.webp",
        title: "Alice 19th, Tome 5",
        source: "booknode",
      },
      {
        type: "image",
        url: "https://cdn1.booknode.com/book_cover/300/mod11/alice-19th-tome-5-3003-264-432.webp",
        title: "Alice 19th, Tome 5",
        source: "booknode",
      },
    ]);
    expect(metadata?.observations?.length).toBeGreaterThan(0);
  });

  it("emits tome / barcode facts when parsed from the fiche", () => {
    const metadata = mapBooknodeMetadata({
      id: "3",
      title: "Alice 19th, Tome 5",
      sourceUrl: "https://booknode.com/alice_19th_tome_5_1",
      seriesName: "Alice 19th",
      seriesPosition: 5,
      barcode: "9782723442381",
      releaseDate: "2001-01-01",
      pageCount: 192,
    });

    expect(
      metadata?.facts?.some((f) => f.kind === "tag" && f.label === "Tome"),
    ).toBe(true);
    expect(
      metadata?.facts?.some(
        (f) => f.kind === "identifier" && f.value === "9782723442381",
      ),
    ).toBe(true);
    expect(metadata?.pageCount).toBe(192);
    expect(metadata?.barcode).toBe("9782723442381");
  });

  it("still emits a cover when only the fiche image is present", () => {
    const metadata = mapBooknodeMetadata({
      id: "2",
      title: "Solo",
      sourceUrl: "https://booknode.com/solo",
      imageUrl:
        "https://cdn1.booknode.com/book_cover/10/mod11/solo-101-264-432.webp",
    });

    expect(metadata?.attachments).toEqual([
      {
        type: "cover",
        url: "https://cdn1.booknode.com/book_cover/10/mod11/solo-101-264-432.webp",
        title: "Solo",
        role: "fr",
        source: "booknode",
      },
    ]);
  });
});
