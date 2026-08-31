import { describe, expect, it } from "vitest";

import { mergeKayouChecklists } from "./mergeKayouChecklists";
import type { KayouChecklist } from "./kayouLedgerTypes";

const base: KayouChecklist = {
  source: "narutocards.ca",
  url: "https://www.narutocards.ca/",
  sets: [
    {
      slug: "kayou-t1-w1",
      code: "t1w1",
      label: "Wave 1",
      url: "https://www.narutocards.ca/sets/kayou/kayou-t1-w1",
      cards: [
        {
          printed: "NR-R-001",
          number: "nr.r.001",
          name: "Naruto",
          rarity: "R",
          faceUrl: "https://cdn.narutocards.ca/a.webp",
        },
      ],
    },
  ],
};

describe("mergeKayouChecklists", () => {
  it("keeps narutocards names and adds CCG face alternates", () => {
    const ccg: KayouChecklist = {
      source: "capsulecorpgear",
      url: "https://capsulecorpgear.com/naruto-kayou-card-list/",
      sets: [
        {
          slug: "capsulecorpgear-t1w1",
          code: "t1w1",
          label: "T1W1",
          url: "https://capsulecorpgear.com/naruto-kayou-card-list/",
          cards: [
            {
              printed: "NR-R-001",
              number: "nr.r.001",
              name: "CCG Naruto",
              rarity: "R",
              faceUrl: "https://capsulecorpgear.com/wp-content/uploads/nr-r-001.webp",
              faceSource: "capsulecorpgear",
            },
          ],
        },
      ],
    };
    const merged = mergeKayouChecklists(base, {
      ledger: ccg,
      source: "capsulecorpgear",
    });
    const card = merged.sets[0]?.cards[0];
    expect(card?.name).toBe("Naruto");
    expect(card?.faceUrl).toBe("https://cdn.narutocards.ca/a.webp");
    expect(card?.faceUrlAlternates).toContain(
      "https://capsulecorpgear.com/wp-content/uploads/nr-r-001.webp",
    );
  });

  it("adds prints that exist only in capsulecorp", () => {
    const ccg: KayouChecklist = {
      source: "capsulecorpgear",
      url: "https://capsulecorpgear.com/naruto-kayou-card-list/",
      sets: [
        {
          slug: "capsulecorpgear-promo",
          code: "promo",
          label: "Promo",
          url: "https://capsulecorpgear.com/naruto-kayou-card-list/",
          cards: [
            {
              printed: "PR-069",
              number: "nr.pr.069",
              name: "Promo Card",
              rarity: "PR",
              faceUrl: "https://capsulecorpgear.com/wp-content/uploads/pr.webp",
            },
          ],
        },
      ],
    };
    const merged = mergeKayouChecklists(base, {
      ledger: ccg,
      source: "capsulecorpgear",
    });
    const promo = merged.sets.find((s) => s.code === "promo");
    expect(promo?.cards[0]?.name).toBe("Promo Card");
  });

  it("merges nr.ss.* into nrss.* within the same set", () => {
    const primary: KayouChecklist = {
      source: "narutocards.ca",
      url: "https://www.narutocards.ca/",
      sets: [
        {
          slug: "newyeargiftbox",
          code: "newyeargiftbox",
          label: "New Year",
          url: "https://www.narutocards.ca/",
          cards: [
            {
              printed: "NRSS-HR-011",
              number: "nrss.hr.011",
              name: "Jiraiya",
              rarity: "HR",
              faceUrl: "https://cdn.narutocards.ca/nrss.webp",
            },
          ],
        },
      ],
    };
    const ccg: KayouChecklist = {
      source: "capsulecorpgear",
      url: "https://capsulecorpgear.com/",
      sets: [
        {
          slug: "capsulecorpgear-newyear",
          code: "newyeargiftbox",
          label: "New Year",
          url: "https://capsulecorpgear.com/",
          cards: [
            {
              printed: "NR-SS-HR-011",
              number: "nr.ss.hr.011",
              name: "Jiraiya CCG",
              rarity: "SS-HR",
              faceUrl: "https://capsulecorpgear.com/ss-hr-011.webp",
              faceSource: "capsulecorpgear",
            },
          ],
        },
      ],
    };
    const merged = mergeKayouChecklists(primary, {
      ledger: ccg,
      source: "capsulecorpgear",
    });
    const set = merged.sets.find((s) => s.code === "newyeargiftbox");
    expect(set?.cards).toHaveLength(1);
    expect(set?.cards[0]?.number).toBe("nrss.hr.011");
    expect(set?.cards[0]?.name).toBe("Jiraiya");
    expect(set?.cards[0]?.faceUrlAlternates).toContain(
      "https://capsulecorpgear.com/ss-hr-011.webp",
    );
  });
});
