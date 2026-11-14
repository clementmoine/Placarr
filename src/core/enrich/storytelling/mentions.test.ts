import { describe, expect, it } from "vitest";

import { parseStoryMentions, storyBodyPlainText } from "./mentions";

describe("parseStoryMentions", () => {
  it("splits text and print/sealed mentions", () => {
    const segs = parseStoryMentions(
      "Voir [[sealed:booster-s28|sachet FR]] et [[print:naruto:pr-0096|PR‑096]].",
    );
    expect(segs).toEqual([
      { type: "text", value: "Voir " },
      {
        type: "mention",
        mention: {
          kind: "sealed",
          id: "booster-s28",
          label: "sachet FR",
        },
      },
      { type: "text", value: " et " },
      {
        type: "mention",
        mention: {
          kind: "print",
          id: "naruto:pr-0096",
          label: "PR‑096",
        },
      },
      { type: "text", value: "." },
    ]);
  });

  it("plain-text drops markup", () => {
    expect(
      storyBodyPlainText("Le [[sealed:duopack-s28|duopack]] glisse la promo."),
    ).toBe("Le duopack glisse la promo.");
  });

  it("keeps unknown markup-ish text as text when malformed", () => {
    const segs = parseStoryMentions("[[not-a-mention]]");
    expect(segs).toEqual([{ type: "text", value: "[[not-a-mention]]" }]);
  });
});
