import { createScrapeCatalogModule } from "@/services/providers/shared/scrapeCatalogModuleFactory";

import {
  fetchPrestashopBarcodeProduct,
  searchPrestashopProduct,
} from "./fetch";
import { createPrestashopResolver } from "./resolver";
import type { PrestashopRetailerConfig } from "./types";

export const createPrestashopModule =
  createScrapeCatalogModule<PrestashopRetailerConfig>({
    platformLabel: "PrestaShop AJAX",
    defaultCapabilities: [
      "identify",
      "description",
      "cover",
      "price",
      "ageRating",
      "duration",
      "players",
      "people",
      "releaseDate",
    ],
    defaultSample: {
      name: "Catan",
      barcode: "3558380126133",
    },
    createResolver: createPrestashopResolver,
    searchProduct: (config, name, barcode) =>
      searchPrestashopProduct(config, name, barcode),
    fetchBarcodeProduct: fetchPrestashopBarcodeProduct,
  });
