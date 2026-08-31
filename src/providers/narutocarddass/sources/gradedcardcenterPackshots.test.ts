import { describe, expect, it } from "vitest";

import {
  gradedcardcenterIngestPackshots,
  gradedcardcenterLedger,
  gradedcardcenterOriginalUrl,
} from "./gradedcardcenterPackshots";
import { narutoCatalogueLineForSealed } from "../packs";

function jan13ChecksumOk(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  const body = digits.slice(0, 12);
  const odd = [...body].reduce(
    (sum, ch, i) => sum + (i % 2 === 0 ? Number(ch) : 0),
    0,
  );
  const even = [...body].reduce(
    (sum, ch, i) => sum + (i % 2 === 1 ? Number(ch) : 0),
    0,
  );
  const check = (10 - ((odd + even * 3) % 10)) % 10;
  return check === Number(digits[12]);
}

describe("Graded Card Center JP Carddass packshots", () => {
  it("keeps the pasted 巻ノ五 booster, not FR s5 and not Shippuden 第五幕", () => {
    const ledger = gradedcardcenterLedger();
    expect(ledger.ingestCatalog).toBe(false);
    expect(gradedcardcenterIngestPackshots().map((row) => row.slug)).toEqual([
      "booster-vol5-jp",
    ]);
    const row = ledger.products[0]!;
    expect(row.setCode).toBe("maki5");
    expect(row.setCode).not.toBe("s5");
    expect(row.lang).toBe("JA");
    expect(row.printedRef).toBe("NA-B5");
    expect(row.cardsPerPack).toBe(6);
    expect(row.cardsPerPack).not.toBe(8);
    expect(row.year).toBe(2004);
    expect(row.title).toContain("巻ノ五");
    expect(row.title).not.toContain("第五幕");
    expect(row.barcode).toBe("4543112200365");
    expect(jan13ChecksumOk(row.barcode)).toBe(true);
    expect(row.url).toContain("f96806f8-6e60-4dcd-9acd-8592855db527");
    expect(row.recto.url).not.toContain("cdn-cgi/image");
    expect(row.verso.url).not.toContain("cdn-cgi/image");
  });

  it("strips Cloudflare resizes so we do not keep an upscaled webp", () => {
    expect(
      gradedcardcenterOriginalUrl(
        "https://cdn.gradedcardcenter.com/cdn-cgi/image/width=800,fit=contain,format=webp,quality=65/item_recto_MBFCqKzG6LDJwmCWOP7Un",
      ),
    ).toBe("https://cdn.gradedcardcenter.com/item_recto_MBFCqKzG6LDJwmCWOP7Un");
    expect(
      gradedcardcenterOriginalUrl(
        "https://cdn.gradedcardcenter.com/item_verso_cmXWHyO66GQ69MEEJz399",
      ),
    ).toBe("https://cdn.gradedcardcenter.com/item_verso_cmXWHyO66GQ69MEEJz399");
  });

  it("files the JP volume on Carddass, not Bandai CCG", () => {
    expect(
      narutoCatalogueLineForSealed({
        slug: "booster-vol5-jp",
        setCode: "maki5",
        lang: "JA",
      }),
    ).toBe("carddass-fr");
  });
});
