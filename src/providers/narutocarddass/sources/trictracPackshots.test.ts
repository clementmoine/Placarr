import { describe, expect, it } from "vitest";

import {
  trictracCdnOriginal,
  trictracIngestPackshots,
  trictracLedger,
} from "./trictracPackshots";

describe("Tric Trac Naruto JCC galleries", () => {
  it("unwraps the Next 96px thumb into the cdn10 original", () => {
    expect(
      trictracCdnOriginal(
        "/_next/image?url=https%3A%2F%2Fcdn10.trictrac.net%2Ftrictrac%2F3f%2F2d%2F1d93407cb246c93603268bddb13a4b52e9f1.jpeg&w=96&q=75",
      ),
    ).toBe(
      "https://cdn10.trictrac.net/trictrac/3f/2d/1d93407cb246c93603268bddb13a4b52e9f1.jpeg",
    );
    expect(
      trictracCdnOriginal(
        "https://cdn10.trictrac.net/trictrac/3f/2d/1d93407cb246c93603268bddb13a4b52e9f1.jpeg",
      ),
    ).toBe(
      "https://cdn10.trictrac.net/trictrac/3f/2d/1d93407cb246c93603268bddb13a4b52e9f1.jpeg",
    );
  });

  it("ingests S1–S3 starter boxes + Coffret Métal — not same-pixel card faces", () => {
    const ledger = trictracLedger();
    expect(trictracIngestPackshots().map((row) => row.slug)).toEqual([
      "starter-pays-du-vent",
      "starter-maitre-hokage",
      "starter-sceller-le-malefice",
      "starter-detruire-konoha",
      "starter-apprentissage",
      "starter-puissances-cachees",
      "tin-box",
    ]);
    expect(ledger.faces.ingest).toBe("none");
    expect(ledger.faces.servedPixels).toEqual({ width: 350, height: 495 });
    const tin = ledger.products.find((row) => row.slug === "tin-box");
    expect(tin).toMatchObject({
      kind: "coffret",
      ingest: true,
      staging: "staging/trictrac/tin-box.jpeg",
      url: "https://cdn.trictrac.net/discourse/original/3X/6/2/62e132077392c32c832507a4a4a184d6a30f122f.jpeg",
    });
    expect(tin?.url).toMatch(/\/discourse\/original\//);
    const s1 = ledger.pages.find((row) => row.setCode === "s1");
    expect(s1?.community?.cardTypes).toBe(184);
    expect(s1?.localFrFaces).toBe(184);
    const s2 = ledger.pages.find((row) => row.setCode === "s2");
    expect(s2?.community?.cardTypes).toBe(146);
    expect(s2?.gap).toBe(10);
    expect(
      ledger.pages.find((row) => row.setCode === "s4")?.community,
    ).toBeNull();
  });
});
