import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "./collectorIdentity";
import {
  leboncoinFaceLedger,
  leboncoinIngestFaces,
  leboncoinListingImageFull,
} from "./installLeboncoinFaces";

describe("leboncoin pasted faces", () => {
  it("keeps PR-096 as a pasted CDN URL, not a store crawl", () => {
    const ledger = leboncoinFaceLedger();
    expect(ledger.ingestCollection).toBe(false);
    const faces = leboncoinIngestFaces();
    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatchObject({
      printedRef: "PR-096",
      lang: "fr",
      setCode: "promo",
      ingest: true,
    });
    expect(faces[0]?.listing).toContain("/ad/collection/3233037633");
    expect(narutoDiskCardId(faces[0]!.printedRef)).toBe("pr0096");
    expect(leboncoinListingImageFull(faces[0]!.url)).toContain("rule=ad-large");
  });
});
