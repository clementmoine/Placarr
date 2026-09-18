import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  abebooksCoverDownloadCandidates,
  abebooksCoverUrl,
  abebooksProductUrl,
  fetchAbeBooksProduct,
  isbnFromAbeBooksCoverUrl,
  parseAbeBooksCoverUrl,
  parseAbeBooksProductName,
  parseAbeBooksProductOffers,
  parseAbeBooksSeriesId,
  parseAbeBooksSeriesVolumes,
  splitAbeBooksTitleAndAuthor,
} from "./fetch";
import { mapAbeBooksMetadata } from "./index";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

function productHtml(
  options: {
    usedBlock?: string;
    newBlock?: string;
    coverUrl?: string;
    title?: string;
  } = {},
) {
  const usedBlock =
    options.usedBlock ??
    `<div id="used-from" class="mbo">
      <a id="mbo-count-used" href="/rechercher-livre/isbn/9782803624560/n/100121502">
        <div class="mbo-count">4 D&#39;occasion</div> De <span class="no-wrap">EUR 8,21</span>
      </a>
    </div>`;
  const newBlock =
    options.newBlock ??
    `<div id="new-from" class="mbo">
      <a id="mbo-count-new" href="/rechercher-livre/isbn/9782803624560/n/100121501">
        <div class="mbo-count">2 Neuf</div> De <span class="no-wrap">EUR 12,50</span>
      </a>
    </div>`;
  const coverUrl =
    options.coverUrl ??
    "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg";
  const title =
    options.title ??
    "Alpha - Tome 11 - Fucking patriot - Jigounov, Iouri: 9782803624560 - AbeBooks";
  return `
    <title>${title}</title>
    <link rel="preload" href="${coverUrl}" as="image" />
    <img src="${coverUrl}" alt="9782803624560: Alpha" />
    ${usedBlock}
    ${newBlock}
  `;
}

describe("abebooks fetch", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("construit l'URL produit ISBN directe (seule route robots-ok)", () => {
    expect(abebooksProductUrl("9782803624560")).toBe(
      "https://www.abebooks.fr/products/isbn/9782803624560",
    );
  });

  it("construit l'URL cover CDN depuis l'ISBN", () => {
    expect(abebooksCoverUrl("9782803624560")).toBe(
      "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg",
    );
  });

  it("extrait la cover depuis le HTML (ou fallback ISBN)", () => {
    expect(parseAbeBooksCoverUrl(productHtml())).toBe(
      "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg",
    );
    expect(parseAbeBooksCoverUrl("<html></html>", "9782871294276")).toBe(
      "https://pictures.abebooks.com/isbn/9782871294276-fr.jpg",
    );
  });

  it("propose des variantes de locale pour le download cover", () => {
    expect(
      abebooksCoverDownloadCandidates(
        "https://pictures.abebooks.com/isbn/9782803624560-us.jpg",
      ),
    ).toEqual([
      "https://pictures.abebooks.com/isbn/9782803624560-us.jpg",
      "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg",
      "https://pictures.abebooks.com/isbn/9782803624560-uk.jpg",
      "https://pictures.abebooks.com/isbn/9782803624560-de.jpg",
      "https://pictures.abebooks.com/isbn/9782803624560-it.jpg",
      "https://pictures.abebooks.com/isbn/9782803624560-es.jpg",
    ]);
  });

  it("extrait les offres neuf/occasion des blocs de synthèse", () => {
    expect(parseAbeBooksProductOffers(productHtml())).toEqual([
      { condition: "new", priceCents: 1250, offerCount: 2 },
      { condition: "used", priceCents: 821, offerCount: 4 },
    ]);
  });

  it("ignore un bloc « 0 Neuf » sans prix (template non résolu)", () => {
    const html = productHtml({
      newBlock: `<div id="new-from" class="mbo">
        <a id="mbo-count-new" data-csa-c-cost="$lowestItem.getListingPrice()">
          <div class="mbo-count">0 Neuf</div>
        </a>
      </div>`,
    });
    expect(parseAbeBooksProductOffers(html)).toEqual([
      { condition: "used", priceCents: 821, offerCount: 4 },
    ]);
  });

  it("nettoie le nom produit du <title>", () => {
    expect(parseAbeBooksProductName(productHtml())).toBe(
      "Alpha - Tome 11 - Fucking patriot",
    );
  });

  it("sépare l'auteur du titre pour l'alignement (Naruto Tome N)", () => {
    expect(
      splitAbeBooksTitleAndAuthor("Naruto - Tome 26 - Masashi Kishimoto"),
    ).toEqual({
      title: "Naruto - Tome 26",
      author: "Masashi Kishimoto",
    });
    expect(
      splitAbeBooksTitleAndAuthor(
        "Alpha - Tome 11 - Fucking patriot - Jigounov, Iouri",
      ),
    ).toEqual({
      title: "Alpha - Tome 11 - Fucking patriot",
      author: "Jigounov, Iouri",
    });
  });

  it("retourne les offres + cover avec l'URL source pour un EAN valide", async () => {
    mockedGet.mockResolvedValue({ status: 200, data: productHtml() });

    const product = await fetchAbeBooksProduct("9782803624560");
    expect(product).toEqual({
      barcode: "9782803624560",
      productName: "Alpha - Tome 11 - Fucking patriot",
      author: "Jigounov, Iouri",
      coverUrl: "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg",
      sourceUrl: "https://www.abebooks.fr/products/isbn/9782803624560",
      offers: [
        { condition: "new", priceCents: 1250, offerCount: 2 },
        { condition: "used", priceCents: 821, offerCount: 4 },
      ],
    });
  });

  it("peut retourner cover/titre sans offres pour le metadata adapter", async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: productHtml({
        usedBlock: "",
        newBlock: "",
      }),
    });

    expect(await fetchAbeBooksProduct("9782803624560")).toBeNull();
    const product = await fetchAbeBooksProduct("9782803624560", {
      requireOffers: false,
    });
    expect(product?.coverUrl).toBe(
      "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg",
    );
    expect(mapAbeBooksMetadata(product)?.imageUrl).toBe(
      "https://pictures.abebooks.com/isbn/9782803624560-fr.jpg",
    );
  });

  it("retourne null sur 404, page vide ou barcode invalide", async () => {
    mockedGet.mockResolvedValue({ status: 404, data: "" });
    expect(await fetchAbeBooksProduct("9782803624560")).toBeNull();

    mockedGet.mockResolvedValue({ status: 200, data: "<html>rien</html>" });
    expect(await fetchAbeBooksProduct("9782803624560")).toBeNull();

    expect(await fetchAbeBooksProduct("pas-un-code")).toBeNull();
  });

  it("extrait l'ISBN depuis l'URL cover du widget série", () => {
    expect(
      isbnFromAbeBooksCoverUrl(
        "https://pictures.abebooks.com/isbn/9782871294146-fr.jpg",
      ),
    ).toBe("9782871294146");
  });

  it("parse le series id depuis le mount widget produit", () => {
    const html = `
      <div class="series-widget-mount"
           data-id="B0CT3L6SQB"
           data-heading-url="/servlet/SearchResults?inclseries=B0CT3L6SQB"></div>
    `;
    expect(parseAbeBooksSeriesId(html)).toBe("B0CT3L6SQB");
  });

  it("parse les volumes siblings (ISBN via cover URL)", () => {
    expect(
      parseAbeBooksSeriesVolumes({
        positionCards: [
          {
            imageUrl: "https://pictures.abebooks.com/isbn/9782871294146-fr.jpg",
            positionLabel: "Livre 1 sur 72",
            title: "Naruto, tome 1",
          },
          {
            imageUrl: "https://pictures.abebooks.com/isbn/9782871294177-us.jpg",
            positionLabel: "Book 2 of 72",
            title: "Naruto - Tome 2",
          },
          {
            imageUrl: "https://pictures.abebooks.com/isbn/9782871294177-fr.jpg",
            positionLabel: "Livre 2 sur 72",
            title: "duplicate isbn skipped",
          },
        ],
      }),
    ).toEqual([
      {
        volume: "1",
        barcode: "9782871294146",
        title: "Naruto, tome 1",
        coverUrl: "https://pictures.abebooks.com/isbn/9782871294146-fr.jpg",
      },
      {
        volume: "2",
        barcode: "9782871294177",
        title: "Naruto - Tome 2",
        coverUrl: "https://pictures.abebooks.com/isbn/9782871294177-fr.jpg",
      },
    ]);
  });
});
