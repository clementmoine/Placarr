import { describe, expect, it } from "vitest";

import {
  colekaListingItems,
  colekaListingPagesCoherent,
  colekaListingTemplate,
} from "./listingItems";

/** Gabarit historique (`lib_has_2_lines`), page 1 S24 en cache 2026-10-18. */
const LEGACY = `
<li class="pending col-md-4 col-xs-6 col-lg-3">
  <a class="lib_has_2_lines" data-id="788802" href="/fr/cartes/s24/scellage-des-demons-a-queues_i788802" >
    <img src="https://thumbs.coleka.com/media/item/202010/16/s24-scellage_250x250.webp" alt="Scellage" class=" img-thumbnail img-fluid" width="200" height="200" />
    <span class="lib">
      <h3 class="product-title">Scellage des Démons &amp; Queues</h3>
      <span><span class="ref">Ref. JU-895</span> <span class="an">(2012)</span></span>
    </span>
  </a>
</li>`;

/** Gabarit « k5 », page 2 S24 récupérée 2026-11-21. */
const K5 = `
<article class="k5" data-id="788713">
  <a class="k5-lien" href="/fr/cartes/s24/shikamaru-nara_i788713">
    <div class="k5-img">
      <img src="https://thumbs.coleka.com/media/item/202010/14/s24-shikamaru-nara_250x250.webp" alt="Shikamaru Nara" width="250" height="250">
    </div>
    <div class="k5-corps">
      <h3>Shikamaru Nara</h3>
      <p>Ref. NI-1363</p>
    </div>
  </a>
  <div class="k5-barre"><button type="button" class="k5-ajout tt">+</button></div>
</article>`;

describe("colekaListingItems", () => {
  it("reads the legacy lib_has_2_lines tiles", () => {
    expect(colekaListingItems(LEGACY)).toEqual([
      {
        id: "788802",
        href: "/fr/cartes/s24/scellage-des-demons-a-queues_i788802",
        title: "Scellage des Démons & Queues",
        ref: "JU-895",
        thumbUrl:
          "https://thumbs.coleka.com/media/item/202010/16/s24-scellage_250x250.webp",
      },
    ]);
  });

  it("reads the k5 tiles Coleka serves since 2026-11", () => {
    expect(colekaListingItems(K5)).toEqual([
      {
        id: "788713",
        href: "/fr/cartes/s24/shikamaru-nara_i788713",
        title: "Shikamaru Nara",
        ref: "NI-1363",
        thumbUrl:
          "https://thumbs.coleka.com/media/item/202010/14/s24-shikamaru-nara_250x250.webp",
      },
    ]);
  });

  it("reads a page mixing both (one tile each)", () => {
    expect(colekaListingItems(LEGACY + K5).map((i) => i.ref)).toEqual([
      "JU-895",
      "NI-1363",
    ]);
  });
});

describe("colekaListingTemplate / colekaListingPagesCoherent", () => {
  const legacy = `<a class="lib_has_2_lines" data-id="1" href="/fr/x_i1"><h3 class="product-title">A</h3><span class="ref">Ref. NI-1</span></a>`;
  const k5 = `<article class="k5" data-id="2"><a class="k5-lien" href="/fr/y_i2"><h3>B</h3><p>Ref. NI-2</p></a></article>`;

  it("names the template a page was served with", () => {
    expect(colekaListingTemplate(legacy)).toBe("legacy");
    expect(colekaListingTemplate(k5)).toBe("k5");
    expect(colekaListingTemplate("<html>verify</html>")).toBeNull();
  });

  it("refuses a listing read whose pages mix templates", () => {
    // 2026-11-22 : Sage's Legacy FR lu avec p0 historique (48/page, tri A),
    // p1 k5 (60/page, tri B), p2 historique en cache → 12 cartes sur aucune
    // page, `cards.json` réécrit à 108 au lieu de 120.
    expect(colekaListingPagesCoherent([k5, k5, ""])).toBe(true);
    expect(colekaListingPagesCoherent([legacy, legacy])).toBe(true);
    expect(colekaListingPagesCoherent([legacy, k5, legacy])).toBe(false);
  });
});

describe("colekaListingItems — k5 ref with year", () => {
  it("keeps the reference, not the release year appended to it", () => {
    // k5 prints `Ref. NI-01 · 2002` on some tiles: S1 Naruto Uzumaki lost
    // its FR title (2026-11-22).
    const html = `<article class="k5" data-id="202417"><a class="k5-lien" href="/fr/naruto-uzumaki_i202417"><div class="k5-img"><img src="https://thumbs.coleka.com/media/item/201808/27/ni-01_250x250.webp" alt="Naruto Uzumaki"></div><div class="k5-corps"><h3>Naruto Uzumaki</h3><p>Ref. NI-01 · 2002</p></div></a></article>`;
    expect(colekaListingItems(html)[0]).toMatchObject({
      title: "Naruto Uzumaki",
      ref: "NI-01",
    });
  });
});
