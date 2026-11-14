import { describe, expect, it } from "vitest";

import { tcgFaceAttachmentRole } from "./tcgFaceRole";

describe("tcgFaceAttachmentRole", () => {
  it("embeds print language when known", () => {
    expect(
      tcgFaceAttachmentRole({
        printGame: "mythos",
        lang: "fr",
        source: "kana",
      }),
    ).toBe("mythos-face-fr-kana");
    expect(
      tcgFaceAttachmentRole({
        printGame: "pokemon",
        lang: "EN",
        source: "live",
      }),
    ).toBe("pokemon-face-en-live");
  });

  it("falls back without language", () => {
    expect(
      tcgFaceAttachmentRole({
        printGame: "naruto",
        source: "carddass",
      }),
    ).toBe("naruto-face-carddass");
  });

  it("sanitizes source tokens", () => {
    expect(
      tcgFaceAttachmentRole({
        printGame: "lorcana",
        lang: "de",
        source: "art.official",
      }),
    ).toBe("lorcana-face-de-artofficial");
  });
});
