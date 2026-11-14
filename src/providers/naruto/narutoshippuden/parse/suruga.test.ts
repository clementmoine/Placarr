import { describe, expect, it } from "vitest";
import { foldSurugaShippudenListings, loadSurugaShippudenCuratedListings, parseCardNameFromSurugaTitle, parseSurugaShippudenHtml, parseSurugaShippudenListingsTsv, parseSurugaShippudenPrintedFromTitle, serializeSurugaShippudenListingsTsv, surugaShippudenFaceUrl, type SurugaShippudenListing } from "./suruga";

// —— parseSurugaShippuden ——
{
  describe("parseSurugaShippuden", () => {
    it("extracts printed references from Suruga product titles", () => {
      expect(parseSurugaShippudenPrintedFromTitle("忍伝-165[レア]：デイダラ（Bランク）")).toBe("忍伝-165");
      expect(parseSurugaShippudenPrintedFromTitle("忍伝-学007[ノーマル]：ガマブン太")).toBe("忍伝-学007");
      expect(parseSurugaShippudenPrintedFromTitle("術伝-053[ノーマル]：千年殺し")).toBe("術伝-053");
      expect(parseSurugaShippudenPrintedFromTitle("作伝-049[レア]：ある夏の日")).toBe("作伝-049");
      expect(parseSurugaShippudenPrintedFromTitle("忍伝 - 081 [レア]：日向ヒナタ")).toBe("忍伝-081");
      expect(
        parseSurugaShippudenPrintedFromTitle(
          "PR作伝-5[プロモーショカード]：究極連係",
        ),
      ).toBe("PR作伝-5");
      expect(
        parseSurugaShippudenPrintedFromTitle(
          "PR忍伝-6[プロモーショカード]：うちはサスケ",
        ),
      ).toBe("PR忍伝-6");
      // Ignores unrelated products
      expect(parseSurugaShippudenPrintedFromTitle("忍界5-17[R]：次郎坊")).toBeNull();
      expect(parseSurugaShippudenPrintedFromTitle("NARUTO-ナルト- 疾風伝 アクリルイラスト")).toBeNull();
    });

    it("parses modern Suruga HTML with product-name DOM and script items", () => {
      const html = `
        <div class="item_detail">
          <div class="title">
            <a href="/product/detail/GL124439?branch_number=0077">
              <h3 class="product-name">忍伝-165[レア]：デイダラ（Bランク）</h3>
            </a>
          </div>
        </div>
        <script>
          items.push({
            item_id: common.htmlDecode('GU362436'),
            item_name: common.htmlDecode('忍伝-学007[ノーマル]：ガマブン太')
          });
        </script>
      `;
      const listings = parseSurugaShippudenHtml(html);
      expect(listings).toEqual([
        {
          id: "GL124439",
          printed: "忍伝-165",
          title: "忍伝-165[レア]：デイダラ（Bランク）",
        },
        {
          id: "GU362436",
          printed: "忍伝-学007",
          title: "忍伝-学007[ノーマル]：ガマブン太",
        },
      ]);
    });

    it("roundtrips TSV format", () => {
      const original: SurugaShippudenListing[] = [
        { id: "GL124439", printed: "忍伝-165", title: "忍伝-165[レア]：デイダラ" },
        { id: "GU362436", printed: "忍伝-学007", title: "ガマブン太" },
      ];
      const tsv = serializeSurugaShippudenListingsTsv(original);
      const parsed = parseSurugaShippudenListingsTsv(tsv);
      expect(parsed).toEqual(original);
    });

    it("heals stale truncated printed columns from the title (忍伝-2 ≠ 忍伝-207)", () => {
      const tsv = [
        "602308643\t忍伝-2\t忍伝-207[ノーマル]：忍伝-207/奈良ヨシノ",
        "GN663724\t忍伝-16\t忍伝-165[レア]：デイダラ（Bランク）",
        "G8868299\t忍伝-207\t忍伝-207[ノーマル]：忍伝-207/奈良ヨシノ",
      ].join("\n");
      const listings = parseSurugaShippudenListingsTsv(tsv);
      expect(listings.find((l) => l.id === "602308643")?.printed).toBe(
        "忍伝-207",
      );
      expect(listings.find((l) => l.id === "GN663724")?.printed).toBe(
        "忍伝-165",
      );
      const folded = foldSurugaShippudenListings(listings);
      expect(folded.find((c) => c.diskId === "shi0002")).toBeUndefined();
      expect(folded.find((c) => c.diskId === "shi0016")).toBeUndefined();
      expect(folded.find((c) => c.diskId === "shi0207")?.productIds[0]).toBe(
        "G8868299",
      );
      expect(folded.find((c) => c.diskId === "shi0207")?.productIds).toContain(
        "602308643",
      );
      expect(folded.find((c) => c.diskId === "shi0165")?.productIds).toContain(
        "GN663724",
      );
    });

    it("curated TSV has no stale truncated binds or non-card Suruga ids", () => {
      const listings = loadSurugaShippudenCuratedListings();
      for (const l of listings) {
        if (!l.title) continue;
        const fromTitle = parseSurugaShippudenPrintedFromTitle(l.title);
        if (fromTitle) expect(l.printed).toBe(fromTitle);
      }
      const ids = new Set(listings.map((l) => l.id));
      // CDN for these served a figurine / wafer pack, not the card face.
      expect(ids.has("602308643")).toBe(false);
      expect(ids.has("GN663724")).toBe(false);
      const folded = foldSurugaShippudenListings(listings);
      expect(folded.find((c) => c.diskId === "shi0002")).toBeUndefined();
    });

    it("folds multiple listings for the same card into unique cards", () => {
      const listings: SurugaShippudenListing[] = [
        { id: "GL124439", printed: "忍伝-165", title: "忍伝-165 A" },
        { id: "GL999999", printed: "忍伝-165", title: "忍伝-165 B" },
        { id: "GU362436", printed: "忍伝-学007", title: "忍伝-学007" },
      ];
      const cards = foldSurugaShippudenListings(listings);
      expect(cards).toHaveLength(2);
      expect(cards[0]).toEqual({
        family: "gaku",
        diskId: "gaku0007",
        printKey: "naruto:gaku-0007",
        printed: "忍伝-学007",
        title: "忍伝-学007",
        productIds: ["GU362436"],
        faceUrl: "https://cdn.suruga-ya.jp/database/pics/game/gu362436.jpg",
      });
      expect(cards[1]).toEqual({
        family: "shi",
        diskId: "shi0165",
        printKey: "naruto:shi-0165",
        printed: "忍伝-165",
        title: "忍伝-165 A",
        productIds: ["GL124439", "GL999999"],
        faceUrl: "https://cdn.suruga-ya.jp/database/pics/game/gl124439.jpg",
      });
    });

    it("extracts card name from Suruga product titles", () => {
      expect(parseCardNameFromSurugaTitle("作伝-058[ノーマル]：作伝-058/決意の涙")).toBe("決意の涙");
      expect(parseCardNameFromSurugaTitle("忍伝-205[ノーマル]：忍伝-205/犬塚ハナ")).toBe("犬塚ハナ");
      expect(parseCardNameFromSurugaTitle("忍伝-165[レア]：デイダラ（Bランク）")).toBe("デイダラ");
      expect(parseCardNameFromSurugaTitle("術伝-163[ノーマル]：術伝-163/水遁滝壺の術")).toBe("水遁滝壺の術");
    });

    it("loads curated TSV with all entries", () => {
      const listings = loadSurugaShippudenCuratedListings();
      expect(listings.length).toBeGreaterThanOrEqual(140);
      const folded = foldSurugaShippudenListings(listings);
      expect(folded.length).toBeGreaterThanOrEqual(140);
    });

    it("generates correct face URL from product ID", () => {
      expect(surugaShippudenFaceUrl("GL124439")).toBe(
        "https://cdn.suruga-ya.jp/database/pics/game/gl124439.jpg",
      );
    });
  });
}
