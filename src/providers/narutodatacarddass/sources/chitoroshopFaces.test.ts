import { describe, expect, it } from "vitest";

import {
  extractPrintedFromChitoroshopProduct,
  facesFromChitoroshopProducts,
  normalizeChitoroshopImageUrl,
} from "../harvestChitoroshop";
import { parseDataCarddassPrinted } from "../printKey";
import { dataCarddassChitoroshopIngestFaces } from "./chitoroshopFaces";

describe("normalizeChitoroshopImageUrl", () => {
  it("rewrites cdn.shopify.com to the shop CDN path", () => {
    expect(
      normalizeChitoroshopImageUrl(
        "https://cdn.shopify.com/s/files/1/0560/9589/9815/files/OnePieceTCG.jpg?v=1",
      ),
    ).toBe("https://chitoroshop.com/cdn/shop/files/OnePieceTCG.jpg");
  });
});

describe("extractPrintedFromChitoroshopProduct", () => {
  it("maps NX-0271 slug quirk to NX-271", () => {
    expect(
      extractPrintedFromChitoroshopProduct({
        handle: "sarutobi-asuma-nx-0271-foil-narutimate-cross",
        title: "Sarutobi Asuma NX-0271 (Foil) | Narutimate Cross",
      }),
    ).toBe("NX-271");
  });

  it("parses DN-038T from title", () => {
    expect(
      extractPrintedFromChitoroshopProduct({
        handle: "kankuro-dn-038t-narutimet-card-battle",
        title: "Kankuro DN-038T | Narutimet Card Battle",
      }),
    ).toBe("DN-38T");
  });
});

describe("facesFromChitoroshopProducts", () => {
  it("dedupes by printed and keeps shop CDN urls", () => {
    const faces = facesFromChitoroshopProducts([
      {
        handle: "a-dn-012t",
        title: "Gaara DN-012T | Narutimet Card Battle",
        images: [
          {
            src: "https://cdn.shopify.com/s/files/1/x/files/a.jpg?v=1",
          },
        ],
      },
      {
        handle: "a-dn-012t-copie",
        title: "Gaara DN-012T (Copie) | Narutimet Card Battle",
        images: [
          {
            src: "https://cdn.shopify.com/s/files/1/x/files/b.jpg",
          },
        ],
      },
    ]);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.printed).toBe("DN-12T");
    expect(faces[0]!.url).toBe(
      "https://chitoroshop.com/cdn/shop/files/a.jpg",
    );
  });
});

describe("dataCarddassChitoroshopIngestFaces", () => {
  it("liste des faces ingestibles avec printKey DCD valide", () => {
    const faces = dataCarddassChitoroshopIngestFaces();
    expect(faces.length).toBeGreaterThanOrEqual(100);
    for (const row of faces) {
      expect(parseDataCarddassPrinted(row.printed)).not.toBeNull();
      expect(row.url).toMatch(
        /^https:\/\/(chitoroshop\.com\/cdn\/shop\/files\/|cdn\.shopify\.com\/)/,
      );
    }
    expect(faces.some((f) => f.printed === "NX-271")).toBe(true);
  });
});
