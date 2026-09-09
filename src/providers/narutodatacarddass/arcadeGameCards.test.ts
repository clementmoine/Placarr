import { describe, expect, it } from "vitest";

import {
  arcadeDniSkuToPrinted,
  parseArcadeDcdListing,
} from "./arcadeGameCards";

describe("arcadeDniSkuToPrinted", () => {
  it("maps DNI wave SKUs to DN-###", () => {
    expect(arcadeDniSkuToPrinted("DNI1-08")).toBe("DN-008");
    expect(arcadeDniSkuToPrinted("DNI2-01")).toBe("DN-001");
    expect(arcadeDniSkuToPrinted("DNI2-P01")).toBeNull();
  });
});

describe("parseArcadeDcdListing", () => {
  it("reads product tiles", () => {
    const html = `
      <li class="product">
        <a href="/product/x/">
          <img src="https://example.com/a.jpg">
          <h2 class="woocommerce-loop-product__title">Naruto Narutimate Ninja Fight DNI1-08 Sasuke</h2>
        </a>
      </li>`;
    expect(parseArcadeDcdListing(html)).toEqual([
      {
        sku: "DNI1-08",
        printed: "DN-008",
        title: "Naruto Narutimate Ninja Fight DNI1-08 Sasuke",
        href: "/product/x/",
        imageUrl: null,
      },
    ]);
  });
});
