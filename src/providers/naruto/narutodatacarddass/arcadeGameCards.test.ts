import { describe, expect, it } from "vitest";
import {
  arcadeDniSkuToPrinted,
  arcadeNormalizeFaceUrl,
  parseArcadeDcdListing,
  parseArcadeUploadsListing,
} from "./arcadeGameCards";

// —— arcadeGameCards ——
{
  describe("arcadeDniSkuToPrinted", () => {
    it("maps DNI wave SKUs to DN-###T", () => {
      expect(arcadeDniSkuToPrinted("DNI1-08")).toBe("DN-008T");
      expect(arcadeDniSkuToPrinted("DNI2-01")).toBe("DN-001T");
      expect(arcadeDniSkuToPrinted("DNI2-P01")).toBeNull();
    });
  });

  describe("arcadeNormalizeFaceUrl", () => {
    it("strips Jetpack fit params", () => {
      expect(
        arcadeNormalizeFaceUrl(
          "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/03/narutimatedni1-08.jpg?fit=300%2C438&amp;ssl=1",
        ),
      ).toBe(
        "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/03/narutimatedni1-08.jpg",
      );
    });
  });

  describe("parseArcadeDcdListing", () => {
    it("reads product tiles with images", () => {
      const html = `
        <li class="product type-product">
          <a href="https://www.arcadegamecards.com/product/naruto-narutimate-ninja-fight-dn1-08-sasuke-uchiha/">
            <img src="https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/03/narutimatedni1-08.jpg?fit=300%2C438&amp;ssl=1">
            <h2 class="woocommerce-loop-product__title">Naruto Narutimate Ninja Fight DNI1-08 Sasuke</h2>
          </a>
        </li>`;
      expect(parseArcadeDcdListing(html)).toEqual([
        {
          sku: "DNI1-08",
          printed: "DN-008T",
          title: "Naruto Narutimate Ninja Fight DNI1-08 Sasuke",
          href: "https://www.arcadegamecards.com/product/naruto-narutimate-ninja-fight-dn1-08-sasuke-uchiha/",
          imageUrl:
            "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/03/narutimatedni1-08.jpg",
        },
      ]);
    });
  });

  describe("parseArcadeUploadsListing", () => {
    it("keeps full-size stems only", () => {
      const html = `
        <a href="narutimatedni1-08.jpg">full</a>
        <a href="narutimatedni1-08-300x450.jpg">thumb</a>
        <a href="narutimatedni2-01.jpg">full2</a>
      `;
      expect(parseArcadeUploadsListing(html).map((r) => r.printed)).toEqual([
        "DN-008T",
        "DN-001T",
      ]);
    });
  });
}
