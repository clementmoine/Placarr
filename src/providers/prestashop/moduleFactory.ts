import { createScrapeCatalogModule } from "@/providers/shared/scrapeCatalogModuleFactory";

import {
  PrestashopAccessDeniedError,
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
    // La plateforme reconnaît son propre refus ; la fabrique n'a pas à savoir.
    isAccessDenied: (error) => error instanceof PrestashopAccessDeniedError,
    searchProduct: (config, name, barcode) =>
      searchPrestashopProduct(config, name, barcode),
    fetchBarcodeProduct: fetchPrestashopBarcodeProduct,
  });
