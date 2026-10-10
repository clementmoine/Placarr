import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { kayouOfficialIdToPrint, type KayouChecklist } from "../identity";
import {
  buildAlertehitImageIndex,
  buildCapsulecorpChecklist,
  buildNarutodbKayouChecklist,
  buildNarutopiaKayouImageIndex,
  decodeCapsulecorpField,
  enrichChecklistWithAlertehitFaces,
  enrichChecklistWithNarutopiaFaces,
  narutodbOfficialImageUrl,
  narutopiaKayouLookupKeys,
  parseAlertehitImages,
  parseCapsulecorpChecklist,
  parseNarutodbCardsJson,
  parseNarutodbSetsJson,
} from "./hosts";

// —— alertehitNarutodexParse ——
{
  describe("alertehitNarutodexParse", () => {
    const js = readFileSync(
      path.join(__dirname, "../fixtures/alertehit-narutodex.js"),
      "utf8",
    );

    it("indexes hitmarket images by rarity folder", () => {
      const rows = parseAlertehitImages(js);
      expect(rows.length).toBeGreaterThan(1600);
      expect(rows.some((r) => r.faceUrl.includes("naruto.hitmarket.fr/UR/NRSS-UR-001.webp"))).toBe(
        true,
      );
    });

    it("enriches merged rows with short-ref hitmarket URLs", () => {
      const index = buildAlertehitImageIndex(js);
      const base: KayouChecklist = {
        source: "test",
        url: "https://example.test/",
        sets: [
          {
            slug: "t1w1",
            code: "t1w1",
            label: "T1W1",
            url: "https://example.test/",
            cards: [
              {
                printed: "NR-SP-002",
                number: "nr.sp.002",
                name: "Nagato",
                rarity: "SP",
                faceUrl: "https://cdn.narutocards.ca/a.webp",
              },
            ],
          },
        ],
      };
      const enriched = enrichChecklistWithAlertehitFaces(base, index);
      const card = enriched.sets[0]?.cards[0];
      expect(card?.faceUrlAlternates?.some((u) => u.includes("hitmarket.fr/SP/SP-2.webp"))).toBe(
        true,
      );
    });
  });
}

// —— narutodbParse ——
{
  describe("narutodbParse", () => {
    it("maps NREA01 ids like official product codes", () => {
      expect(kayouOfficialIdToPrint("NREA01-SR-018L2")).toEqual({
        setCode: "nrea01",
        number: "nrea01.sr.018l2",
      });
    });

    it("builds CDN front/back URLs", () => {
      expect(narutodbOfficialImageUrl("NREA01-SR-018L2", "back")).toBe(
        "https://cdn.narutodb.com/storage/cards/official/NREA01-SR-018L2-back.png",
      );
    });

    it("builds a checklist set for Earth Scroll 1", () => {
      const sets = parseNarutodbSetsJson([
        { id: "NREA01", name: "Earth Scroll", subtitle: "Series 1", total_cards: 132 },
      ]);
      const cards = parseNarutodbCardsJson([
        {
          card_number: "NREA01-SR-018L2",
          set_id: "NREA01",
          rarity_code: "SR",
          character_name: "Inojin Yamanaka",
        },
        {
          card_number: "NRCCNA-MR-001",
          set_id: "NRCCNA",
          rarity_code: "MR",
          character_name: "Naruto",
        },
      ]);
      const ledger = buildNarutodbKayouChecklist({
        sets,
        cardsBySet: { NREA01: cards.filter((c) => c.set_id === "NREA01") },
        observed: "2026-09-05",
      });
      expect(ledger.sets).toHaveLength(1);
      expect(ledger.sets[0]?.code).toBe("nrea01");
      expect(ledger.sets[0]?.cards[0]).toMatchObject({
        printed: "NREA01-SR-018L2",
        number: "nrea01.sr.018l2",
        name: "Inojin Yamanaka",
        rarity: "SR",
        faceSource: "narutodb",
        faceUrl:
          "https://cdn.narutodb.com/storage/cards/official/NREA01-SR-018L2-front.png",
      });
    });
  });
}

// —— narutopiaParse ——
{
  describe("narutopiaKayouLookupKeys", () => {
    it("adds NR- prefix for SSR codes", () => {
      expect(narutopiaKayouLookupKeys("SSR-001")).toEqual(
        expect.arrayContaining(["SSR-001", "NR-SSR-001", "nr.ssr.001"]),
      );
    });
  });

  describe("narutopiaKayouLookupKeys", () => {
    it("bridge NRCC-XR-006 → cc.xr.006pl5", () => {
      const keys = narutopiaKayouLookupKeys("NRCC-XR-006");
      expect(keys).toContain("cc.xr.006pl5");
      expect(keys).toContain("cc.xr.006l5");
    });
  });

  describe("enrichChecklistWithNarutopiaFaces", () => {
    it("fills missing faces from Narutopia index", () => {
      const index = buildNarutopiaKayouImageIndex([
        {
          url: "https://narutopia.fr/ssr-naruto-kayou/",
          entries: [
            {
              heading: "SSR-001-NARUTO",
              code: "SSR-001",
              name: "NARUTO",
              faceUrl: "https://narutopia.fr/wp-content/uploads/x/SSR-001.webp",
              widgetId: "SSR-001",
            },
          ],
        },
      ]);
      const base: KayouChecklist = {
        source: "test",
        url: "https://example.test",
        sets: [
          {
            slug: "t1",
            code: "t1w1",
            label: "T1W1",
            url: "https://example.test",
            cards: [
              {
                printed: "NR-SSR-001",
                number: "nr.ssr.001",
                name: "Naruto",
                rarity: "SSR",
                faceUrl: null,
              },
            ],
          },
        ],
      };
      const enriched = enrichChecklistWithNarutopiaFaces(base, index);
      expect(enriched.sets[0]!.cards[0]!.faceUrl).toContain("SSR-001.webp");
      expect(enriched.sets[0]!.cards[0]!.faceSource).toBe("narutopia");
    });
  });
}

// —— capsulecorpgearParse ——
{
  describe("capsulecorpgearParse", () => {
    it("decodes base64 card fields", () => {
      expect(decodeCapsulecorpField("TmFydXRvIFV6dW1ha2k=")).toBe("Naruto Uzumaki");
      expect(decodeCapsulecorpField("VDRXOA==")).toBe("T4W8");
    });

    it("maps a live page snapshot to checklist rows", () => {
      const html = readFileSync(
        path.join(__dirname, "../fixtures/capsulecorpgear-list.html"),
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
}
