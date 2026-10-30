import { describe, expect, it } from "vitest";

import {
  narutoCardGuideDisplayName,
  narutoCardGuideIdentity,
  parseNarutoCardGuideListing,
  pickNarutoCardGuideFacePath,
} from "./parseNarutoCardGuide";

describe("narutoCardGuideIdentity", () => {
  it.each([
    [
      { id: "n01-001", set: "N01" },
      { setCode: "demo", number: "n001" },
    ],
    [
      { id: "n01-009", set: "N01" },
      { setCode: "demo", number: "n009" },
    ],
    [
      { id: "c-001", set: "CHAKRA" },
      { setCode: "demo", number: "c001" },
    ],
    [
      { id: "s-001", set: "SUMMON" },
      { setCode: "demo", number: "s001" },
    ],
    [
      { id: "cp-001", set: "CHAKRA" },
      { setCode: "promo", number: "cp001", grouping: "event" },
    ],
    [
      { id: "pcc0-c-002", set: "CHAKRA" },
      { setCode: "premium00", number: "c002", grouping: "premiumvol00" },
    ],
    [
      { id: "pcc0-s-001", set: "SUMMON" },
      { setCode: "premium00", number: "s001", grouping: "premiumvol00" },
    ],
    [
      { id: "sample-1", set: "N01" },
      { setCode: "n01", number: "sample01" },
    ],
    [
      { id: "sample-19", set: "N01" },
      { setCode: "n01", number: "sample19" },
    ],
    [{ id: "unknown-card", set: "N01" }, null],
  ] as const)("%j", (card, expected) => {
    expect(narutoCardGuideIdentity(card)).toEqual(expected);
  });
});

describe("parseNarutoCardGuideListing", () => {
  const FIXTURE = `
    <section>
      <article class="card-tile" data-card-item data-name="n01-001" data-id="n01-001" data-set="N01">
        <button data-card-preview data-image-src="/Cards/N01/N01-001.webp" data-image-alt="N01-001 card">
          <img src="/Cards/N01/N01-001.webp" alt="N01-001 card">
        </button>
      </article>
      <article class="card-tile" data-card-item data-name="sample-19" data-id="sample-19" data-set="N01">
        <button data-card-preview data-image-src="/Cards/N01/SAMPLE-19.webp">
          <img src="/Cards/N01/SAMPLE-19.webp" alt="SAMPLE-19 card">
        </button>
      </article>
      <article class="card-tile" data-card-item data-name="pcc0-c-002" data-id="pcc0-c-002" data-set="CHAKRA">
        <button data-card-preview data-image-src="/Cards/Chakra%20cards/PCC0-C-002.webp">
          <img src="/Cards/Chakra cards/PCC0-C-002.webp" alt="PCC0-C-002">
        </button>
      </article>
      <article class="card-tile" data-card-item data-name="cp-001" data-id="cp-001" data-set="CHAKRA">
        <img src="/Cards/Chakra cards/CP-001.webp" alt="CP-001">
      </article>
    </section>
  `;

  it("parses tiles and dedupes by id", () => {
    const cards = parseNarutoCardGuideListing(FIXTURE);
    expect(cards.map((c) => c.id)).toEqual([
      "n01-001",
      "sample-19",
      "pcc0-c-002",
      "cp-001",
    ]);
    expect(cards[0]).toMatchObject({
      set: "N01",
      facePath: "/Cards/N01/N01-001.webp",
    });
  });

  it("prefers data-image-src for face path", () => {
    expect(
      pickNarutoCardGuideFacePath(
        `<button data-image-src="/Cards/N01/N01-001.webp"><img src="/Cards/N01/thumb.webp"></button>`,
      ),
    ).toBe("/Cards/N01/N01-001.webp");
  });

  it("formats display names from ids", () => {
    expect(
      narutoCardGuideDisplayName({
        id: "n01-001",
        name: "n01-001",
        set: "N01",
        facePath: "/Cards/N01/N01-001.webp",
      }),
    ).toBe("N-001");
    expect(
      narutoCardGuideDisplayName({
        id: "sample-19",
        name: "sample-19",
        set: "N01",
        facePath: "/Cards/N01/SAMPLE-19.webp",
      }),
    ).toBe("SAMPLE-19");
  });
});
