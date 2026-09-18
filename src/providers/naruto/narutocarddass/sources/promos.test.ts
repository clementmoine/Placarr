import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dig from "../curated/sources/ebay-tin-metal-hunt-2026-08-29.json";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { NARUTO_SEALED_SKUS } from "../sealed";
import { ebayIngestPackshots } from "./packshots";
import { narutoAttestedPairOf, narutoIsAttestedPair, attestedPromoPrintKey, groupingFromDiskCardId, mergeAttestedPromos, type AttestedPromoRow, colekaUsPromoLedgerPath, loadColekaUsPromoLedger, mergeColekaUsPromosIntoIndex, parseColekaUsPromoLedgerFromStaging, loadS1FrPrerelease, mergeS1FrPrerelease, s1FrPrereleasePrintKey, belongsOnNarutoPromoChecklist, digCollectorForm } from "./promos";

// —— attestedPairs ——
{
  describe("narutoAttestedPairs", () => {
    it("links named pairs without treating every NI as an N", () => {
      expect(narutoIsAttestedPair("ni0001", "n0001")).toBe(true);
      expect(narutoIsAttestedPair("ni001", "N-001")).toBe(true);
      expect(narutoAttestedPairOf("ta081")).toBe("m0081");
      expect(narutoIsAttestedPair("ni232", "n232")).toBe(false);
    });
  });
}

// —— attestedPromos ——
{
  describe("attestedPromos", () => {
    it("parses cdf grouping from diskCardId", () => {
      expect(groupingFromDiskCardId("te030", "te030-cdf")).toBe("cdf");
      expect(groupingFromDiskCardId("ni063", "ni063")).toBeNull();
      expect(groupingFromDiskCardId("ni063", undefined)).toBeNull();
    });

    it("builds promo printKeys", () => {
      expect(attestedPromoPrintKey({ number: "ni063", name: "Iruka" })).toBe(
        "naruto:ni-0063-promo",
      );
      expect(attestedPromoPrintKey({ number: "pr011", name: "Orochimaru" })).toBe(
        "naruto:pr-0011",
      );
      expect(
        attestedPromoPrintKey({
          number: "te030",
          name: "L'éclair pourfendeur",
          diskCardId: "te030-cdf",
        }),
      ).toBe("naruto:te-0030-cdf");
    });

    it("refuses to mint S6 insert twins that are not 7r7 tournament promos", () => {
      const merged = mergeAttestedPromos({
        prints: [],
        titles: [],
        promos: [
          { number: "ni232", name: "Shikamaru Nara" },
          { number: "ni063", name: "Iruka", shuriken: 2 },
        ],
      });
      expect(merged.addedPrints).toEqual(["naruto:ni-0063-promo"]);
      expect(
        merged.prints.some((p) => p.printKey === "naruto:ni-0232-promo"),
      ).toBe(false);
    });

    it("injects missing promo prints with FR names, keeps existing art rows", () => {
      const existing: NarutoPrintRow = {
        printKey: "naruto:promo-ni095",
        setCode: "promo",
        number: "ni095",
        cardType: "ni",
      };
      const titles: NarutoTitleRow[] = [
        {
          printKey: "naruto:promo-ni095",
          lang: "fr",
          fullName: "Neji Hyûga",
          rarity: "promo",
        },
      ];
      const promos: AttestedPromoRow[] = [
        { number: "ni095", name: "Neji Hyûga", diskCardId: "ni095" },
        { number: "ni063", name: "Iruka", shuriken: 2 },
        {
          number: "te030",
          name: "L'éclair pourfendeur",
          diskCardId: "te030-cdf",
        },
      ];
      const merged = mergeAttestedPromos({
        prints: [existing],
        titles,
        promos,
      });
      expect(merged.addedPrints).toEqual([
        "naruto:ni-0063-promo",
        "naruto:te-0030-cdf",
      ]);
      expect(
        merged.titles.find((t) => t.printKey === "naruto:ni-0063-promo")
          ?.fullName,
      ).toBe("Iruka");
      expect(
        merged.prints.find((p) => p.printKey === "naruto:ni-0063-promo"),
      ).toMatchObject({
        number: "ni0063-promo",
        grouping: "promo",
      });
      expect(
        merged.prints.find((p) => p.printKey === "naruto:promo-ni095"),
      ).toEqual(existing);
    });
  });
}

// —— colekaUsPromos ——
{
  describe("loadColekaUsPromoLedger", () => {
    it("reads staging/coleka-us-promos under the pack root", () => {
      const packDir = mkdtempSync(
        path.join(tmpdir(), "naruto-coleka-us-promos-"),
      );
      const dest = colekaUsPromoLedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "coleka-us-promos", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "pr0001",
              cardType: "pr",
              colekaRef: "PR-001",
              name: "Naruto Uzumaki",
              colekaId: "1624573",
              pagePath: "/fr/x_i1624573",
              thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
              faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
            },
          ],
        }),
        "utf8",
      );
      expect(loadColekaUsPromoLedger(packDir).map((c) => c.number)).toEqual([
        "pr0001",
      ]);
    });

    it("rebuilds the ledger from cached listing HTML when cards.json is empty", () => {
      const packDir = mkdtempSync(
        path.join(tmpdir(), "naruto-coleka-us-promos-html-"),
      );
      const staging = path.join(packDir, "staging", "coleka-us-promos");
      mkdirSync(staging, { recursive: true });
      writeFileSync(path.join(staging, "cards.json"), JSON.stringify({ cards: [] }));
      writeFileSync(
        path.join(staging, "listing-0.html"),
        `<a class="lib_has_2_lines" data-id="1624573" href="/fr/x_i1624573">
          <img src="https://thumbs.coleka.com/media/item/x_250x250.webp" />
          <h3 class="product-title">Naruto Uzumaki</h3>
          <span class="ref">Ref. Pr 001</span>
        </a>`,
        "utf8",
      );
      expect(parseColekaUsPromoLedgerFromStaging(packDir)).toMatchObject([
        { number: "pr0001", name: "Naruto Uzumaki" },
      ]);
      expect(loadColekaUsPromoLedger(packDir)).toMatchObject([
        { number: "pr0001", name: "Naruto Uzumaki" },
      ]);
    });
  });

  describe("mergeColekaUsPromosIntoIndex", () => {
    it("adds missing promo prints and English titles without inventing a French name", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-us-promo-merge-"));
      const dest = colekaUsPromoLedgerPath(packDir);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "pr0005-R",
              cardType: "pr",
              colekaRef: "PR-005R",
              name: "Naruto Uzumaki",
              colekaId: "1",
              pagePath: "/x",
              thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
              faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
            },
            {
              number: "pr0096",
              cardType: "pr",
              colekaRef: "PR-096",
              name: "The 4 th Hokage",
              colekaId: "2",
              pagePath: "/y",
              thumbUrl: "https://thumbs.coleka.com/media/item/y_250x250.webp",
              faceUrl: "https://thumbs.coleka.com/media/item/y.webp",
            },
          ],
        }),
        "utf8",
      );
      const merged = mergeColekaUsPromosIntoIndex({
        prints: [
          {
            printKey: "naruto:pr-0096",
            setCode: "promo",
            number: "pr0096",
            cardType: "pr",
            family: "promo",
          },
        ],
        titles: [
          { printKey: "naruto:pr-0096", lang: "fr", fullName: "4E Hokage" },
        ],
        root: packDir,
      });
      expect(merged.prints).toHaveLength(2);
      expect(merged.addedPrints).toEqual(["naruto:pr-0005-r"]);
      expect(merged.titled).toEqual(["naruto:pr-0005-r", "naruto:pr-0096"]);
      expect(
        merged.titles.find(
          (t) => t.printKey === "naruto:pr-0096" && t.lang === "en",
        )?.fullName,
      ).toBe("The 4 th Hokage");
      expect(
        merged.titles.find(
          (t) => t.printKey === "naruto:pr-0096" && t.lang === "fr",
        )?.fullName,
      ).toBe("4E Hokage");
      expect(
        merged.titles.some(
          (t) => t.printKey === "naruto:pr-0005-r" && t.lang === "fr",
        ),
      ).toBe(false);
    });
  });
}

// —— s1FrPrerelease ——
{
  describe("s1FrPrerelease", () => {
    it("mints distinct prerelease printKeys", () => {
      expect(s1FrPrereleasePrintKey("ni019")).toBe("naruto:ni-0019-prerelease");
      expect(s1FrPrereleasePrintKey("ta005")).toBe("naruto:ta-0005-prerelease");
      expect(s1FrPrereleasePrintKey("te036-prerelease")).toBe(
        "naruto:te-0036-prerelease",
      );
    });

    it("loads the ten manga variants from the ledger", () => {
      expect(loadS1FrPrerelease().map((c) => c.number)).toEqual([
        "ni025",
        "ni019",
        "ni047",
        "ni027",
        "ta005",
        "ta004",
        "te015",
        "te007",
        "te003",
        "te036",
      ]);
    });

    it("injects missing prerelease prints with FR titles", () => {
      const existing: NarutoPrintRow = {
        printKey: "naruto:ni-0019",
        setCode: "s1",
        number: "ni0019",
        cardType: "ni",
      };
      const titles: NarutoTitleRow[] = [
        {
          printKey: "naruto:ni-0019",
          lang: "fr",
          fullName: "Naruto Uzumaki",
          rarity: "holo",
        },
      ];
      const merged = mergeS1FrPrerelease({
        prints: [existing],
        titles,
        cards: [
          { number: "ni019", name: "Naruto Uzumaki" },
          { number: "ta005", name: "Le désastre Kyubi" },
        ],
      });
      expect(merged.addedPrints.sort()).toEqual([
        "naruto:ni-0019-prerelease",
        "naruto:ta-0005-prerelease",
      ]);
      expect(
        merged.prints.find((p) => p.printKey === "naruto:ni-0019-prerelease"),
      ).toMatchObject({
        setCode: "prerelease",
        number: "ni0019-prerelease",
        grouping: "prerelease",
      });
      expect(
        merged.titles.find((t) => t.printKey === "naruto:ta-0005-prerelease"),
      ).toMatchObject({
        fullName: "Le désastre Kyubi",
        rarity: "prerelease",
        lang: "fr",
      });
      expect(merged.prints.find((p) => p.printKey === "naruto:ni-0019")).toEqual(
        existing,
      );
    });

    it("rememberships legacy s1 prerelease prints onto the prerelease series", () => {
      const legacy: NarutoPrintRow = {
        printKey: "naruto:ni-0019-prerelease",
        setCode: "s1",
        number: "ni0019-prerelease",
        cardType: "ni",
        grouping: "prerelease",
      };
      const merged = mergeS1FrPrerelease({
        prints: [legacy],
        titles: [
          {
            printKey: "naruto:ni-0019-prerelease",
            lang: "fr",
            fullName: "Naruto Uzumaki",
            rarity: "prerelease",
          },
        ],
        cards: [{ number: "ni019", name: "Naruto Uzumaki" }],
      });
      expect(merged.addedPrints).toEqual([]);
      expect(
        merged.prints.find((p) => p.printKey === "naruto:ni-0019-prerelease"),
      ).toMatchObject({ setCode: "prerelease" });
    });
  });
}

// —— confirmedCarddassTournamentPromos ——
{
  describe("belongsOnNarutoPromoChecklist", () => {
    it("keeps dedicated PR- / OP sequences", () => {
      expect(belongsOnNarutoPromoChecklist("pr011")).toBe(true);
      expect(belongsOnNarutoPromoChecklist("pr0096")).toBe(true);
      expect(belongsOnNarutoPromoChecklist("pr100")).toBe(true);
    });

    it("keeps Collection Naruto tournament reprints from the dig lists", () => {
      expect(belongsOnNarutoPromoChecklist("ni0023-promo")).toBe(true);
      expect(belongsOnNarutoPromoChecklist("te0030-cdf")).toBe(true);
      expect(belongsOnNarutoPromoChecklist("te0002-promo")).toBe(true);
      expect(digCollectorForm("ni0023-promo")).toBe("ni023");
    });

    it("rejects S6 manga/DVD inserts filed as -promo twins", () => {
      expect(belongsOnNarutoPromoChecklist("ni0232-promo")).toBe(false);
      expect(belongsOnNarutoPromoChecklist("ni0236-promo")).toBe(false);
      expect(belongsOnNarutoPromoChecklist("ta0221-promo")).toBe(false);
      expect(belongsOnNarutoPromoChecklist("ta0227-promo")).toBe(false);
      // Retail / insert print itself is not a promo checklist member either.
      expect(belongsOnNarutoPromoChecklist("ni0232")).toBe(false);
    });
  });
}

// —— ebayTinMetalHunt ——
{
  describe("ebay-tin-metal-hunt", () => {
    it("does not mint Carddass FR tins from EN Shippuden listings", () => {
      expect(dig.verdict).toContain("Aucune tin Carddass FR");
      expect(dig.stillMissing).not.toContain("tin-box-hobby");
      expect(
        NARUTO_SEALED_SKUS.some((row) => row.slug === "tin-box-hobby"),
      ).toBe(true);
      expect(
        dig.listings.every(
          (row) =>
            row.id === "285342890666" ||
            (row.not ?? []).includes("carddass-fr") ||
            (row.not ?? []).includes("carddass-fr-tin"),
        ),
      ).toBe(true);
    });

    it("ingests the FR Storm 3 display as display-s28-fr", () => {
      const hit = dig.listings.find((row) => row.id === "285342890666");
      expect(hit?.sku).toBe("display-s28-fr");
      expect(hit?.ean).toBe("3391891969949");
      expect(
        ebayIngestPackshots().some((row) => row.slug === "display-s28-fr"),
      ).toBe(true);
      expect(
        NARUTO_SEALED_SKUS.find((row) => row.slug === "display-s28-fr"),
      ).toMatchObject({ lang: "FR", setCode: "s28", attested: true });
    });
  });
}

