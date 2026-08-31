import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildCapsulecorpChecklist,
  decodeCapsulecorpField,
  parseCapsulecorpChecklist,
} from "./capsulecorpgearParse";

describe("capsulecorpgearParse", () => {
  it("decodes base64 card fields", () => {
    expect(decodeCapsulecorpField("TmFydXRvIFV6dW1ha2k=")).toBe("Naruto Uzumaki");
    expect(decodeCapsulecorpField("VDRXOA==")).toBe("T4W8");
  });

  it("maps a live page snapshot to checklist rows", () => {
    const html = readFileSync(
      path.join(__dirname, "fixtures/capsulecorpgear-list.html"),
      "utf8",
    );
    const ledger = parseCapsulecorpChecklist(html);
    expect(ledger.sets.length).toBeGreaterThan(30);
    const cards = ledger.sets.reduce((n, s) => n + s.cards.length, 0);
    expect(cards).toBeGreaterThan(2400);
    const t4w8 = ledger.sets.find((s) => s.code === "t4w8");
    const boruto = t4w8?.cards.find((c) => c.number === "nrz08.asp.001");
    expect(boruto?.name).toMatch(/Naruto|Sasuke/i);
    expect(boruto?.faceUrl).toContain("capsulecorpgear.com/wp-content/uploads/");
  });

  it("dedupes reprints in the same set", () => {
    const ledger = buildCapsulecorpChecklist([
      {
        name: "TmE=",
        id: "U1AtMDAy",
        image: "Zm9vLndlYnA=",
        box: "VDFXMQ==",
        rank: "U1A=",
      },
      {
        name: "TmE=",
        id: "U1AtMDAy",
        image: "YmFyLndlYnA=",
        box: "VDFXMQ==",
        rank: "U1A=",
      },
    ]);
    const set = ledger.sets.find((s) => s.code === "t1w1");
    expect(set?.cards).toHaveLength(1);
    expect(set?.cards[0]?.faceUrlAlternates).toContain(
      "https://capsulecorpgear.com/wp-content/uploads/bar.webp",
    );
  });
});
