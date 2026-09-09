import { describe, expect, it } from "vitest";

import {
  goatLocalePromoFaceLedger,
  goatLocalePromoIngestFaces,
} from "./install/installGoatLocalePromoFaces";

describe("installGoatLocalePromoFaces ledger", () => {
  it("pastes only attested Goat French Foil CDNs", () => {
    const faces = goatLocalePromoIngestFaces();
    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatchObject({
      printedRef: "PR-100",
      lang: "fr",
      setCode: "promo",
      ingest: true,
    });
    expect(faces[0]!.url).toContain("pr-100%20french.jpg");
    expect(goatLocalePromoFaceLedger().skus.map((row) => row.ref)).toEqual([
      "PR-095",
      "PR-096",
      "PR-100",
    ]);
  });
});
