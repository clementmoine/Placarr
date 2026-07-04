import { describe, expect, it } from "vitest";

import {
  collectHtmlMappingSignals,
  collectMarkdownMappingSignals,
  collectObjectMappingSignals,
} from "./scrapeMappingSignals";

describe("scrapeMappingSignals", () => {
  it("detects bedetheque-style media slots from HTML", () => {
    const html = `
      <input type="hidden" id="EAN" value="9782723457897">
      <input type="hidden" id="Couverture" value="https://www.bedetheque.com/media/Couvertures/Couv_1.jpg">
      <a href="https://www.bedetheque.com/media/Versos/Verso_1.jpg">verso</a>
      <a href="https://www.bedetheque.com/media/Planches/PlancheA_1.jpg">planche</a>
    `;
    const signals = collectHtmlMappingSignals(html);
    expect(signals).toEqual(
      expect.arrayContaining([
        "field:barcode",
        "field:ean",
        "image:cover",
        "image:versos",
        "image:planches",
        "image:gallery",
      ]),
    );
  });

  it("detects booknode gallery hints from markdown", () => {
    const markdown = `
Couvertures 20](https://booknode.com/fullmetal_alchemist_tome_1_058766/covers "Couvertures")
2 785 notes | 261 commentaires
![Couverture](https://cdn1.booknode.com/book_cover/1286/full/fullmetal-alchemist-tome-1-1285686.jpg)
[Hiromu Arakawa](https://booknode.com/auteur/hiromu-arakawa)
[Manga](https://booknode.com/theme/manga_1)
    `;
    const signals = collectMarkdownMappingSignals(markdown);
    expect(signals).toEqual(
      expect.arrayContaining([
        "image:cover",
        "image:gallery",
        "page:covers",
        "field:authors",
        "field:ratingcount",
        "field:reviewcount",
      ]),
    );
  });

  it("expands media arrays on intermediate fetch objects", () => {
    const signals = collectObjectMappingSignals({
      title: "Game",
      medias: [
        { type: "box-2D", url: "https://example.com/box.jpg" },
        { type: "ss", url: "https://example.com/ss.jpg" },
      ],
    });
    expect(signals).toEqual(
      expect.arrayContaining([
        "field:title",
        "image:gallery",
        "image:box2d",
        "image:ss",
      ]),
    );
  });
});
