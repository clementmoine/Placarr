import { describe, expect, it } from "vitest";

import { colekaListingItems } from "./listingItems";

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
