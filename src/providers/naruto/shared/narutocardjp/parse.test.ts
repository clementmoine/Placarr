import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  narutocardjpAbsImageUrl,
  parseNarutocardjpArchiveHtml,
  parseNarutocardjpPrintedRef,
} from "./parse";

describe("parseNarutocardjpPrintedRef", () => {
  it.each([
    ["NM-003", "nm", "003"],
    ["NF-051", "nf", "051"],
    ["NX-131", "nx", "131"],
    ["忍伝-043", "shi", "043"],
    ["術伝-030", "mju", "030"],
    ["忍-368", "ni", "368"],
    ["忍伝-学007", "gaku", "007"],
  ] as const)("%s → %s/%s", (raw, family, number) => {
    const parsed = parseNarutocardjpPrintedRef(raw);
    expect(parsed?.family).toBe(family);
    expect(parsed?.number).toBe(number);
    expect(parsed?.printedRef).toMatch(/-/);
  });
});

describe("parseNarutocardjpArchiveHtml", () => {
  it("pairs headings with following images", () => {
    const html = `
      <h2>うずまきナルト NM-003</h2>
      <img src="https://cdn.example/nm003.jpg" alt="NM-003" />
      <h2>干柿鬼鮫 NX-131</h2>
      <img data-src="//cdn.example/nx131.webp" />
      <h2>忍伝-043</h2>
      <img src="/photos/shi043.jpg" />
    `;
    const hits = parseNarutocardjpArchiveHtml(html);
    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          printedRef: "NM-003",
          family: "nm",
          number: "003",
          imageUrl: "https://cdn.example/nm003.jpg",
        }),
        expect.objectContaining({
          printedRef: "NX-131",
          family: "nx",
          number: "131",
          imageUrl: "https://cdn.example/nx131.webp",
        }),
        expect.objectContaining({
          printedRef: "忍伝-043",
          family: "shi",
          number: "043",
          imageUrl: "https://naruto-card.jp/photos/shi043.jpg",
        }),
      ]),
    );
  });

  it("reads gallery tile alt text (作-245のカード写真)", () => {
    const html = `
      <li class="tile">
        <img
          src="/media/cards/abc/face.jpg"
          alt="闇の中 作-245のカード写真"
        />
      </li>
    `;
    const hits = parseNarutocardjpArchiveHtml(html);
    expect(hits).toEqual([
      expect.objectContaining({
        printedRef: "作-245",
        family: "ta",
        number: "245",
        imageUrl: "https://naruto-card.jp/media/cards/abc/face.jpg",
      }),
    ]);
  });
});

describe("narutocardjpAbsImageUrl", () => {
  it("expands protocol-relative and site-relative URLs", () => {
    expect(narutocardjpAbsImageUrl("//cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(narutocardjpAbsImageUrl("/x.png")).toBe(
      "https://naruto-card.jp/x.png",
    );
    expect(narutocardjpAbsImageUrl("data:image/png;base64,xx")).toBeNull();
  });
});

describe("narutocardjp media blob naming", () => {
  it("keys staging blobs by sha1(imageUrl).jpg (browser prefetch)", () => {
    const url =
      "https://naruto-card.jp/media/cards/a3030840-2f75-4be1-acbc-47fe80c0f7a9/0fb6279c-84f4-43a7-b9a6-8a19243b4bed.jpg";
    const hash = createHash("sha1").update(url).digest("hex");
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
    expect(`${hash}.jpg`).toMatch(/^[a-f0-9]{40}\.jpg$/);
  });
});
