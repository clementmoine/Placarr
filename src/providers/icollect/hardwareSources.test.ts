import { describe, expect, it } from "vitest";

import { isCatalogTitleAnchorProvider } from "@/core/catalog/evidence";
import { buildProductEvidence } from "@/core/identify/evidence/parse";
import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { createEmptyBarcodeLookupPayload } from "@/core/identify/lookup/payload";

import { icollectModule } from "./index";

function payloadWithIce(
  title: string,
  platform?: string | null,
): BarcodeLookupPayload {
  const payload = createEmptyBarcodeLookupPayload();
  payload.ice = {
    title,
    platform: platform ?? null,
    coverUrl: "https://example.com/cover.jpg",
    barcode: "4020628553784",
  } as BarcodeLookupPayload["ice"];
  return payload;
}

describe("icollect hardware barcode sources", () => {
  it("anchors console/system catalog titles on hardware shelves", () => {
    expect(isCatalogTitleAnchorProvider("iCollect Everything")).toBe(true);

    const contributions = icollectModule.buildBarcodeSources!(
      payloadWithIce("PAC Man Atari Console & Ghost Joysticks", "Atari 2600"),
      {
        type: "hardware",
        isBook: false,
        cleanedBarcode: "4020628553784",
      },
    );

    expect(contributions.map((entry) => entry.mediaType).sort()).toEqual([
      "games",
      "hardware",
    ]);

    const hardware = contributions.find(
      (entry) => entry.mediaType === "hardware",
    );
    expect(hardware?.products[0]?.name).toMatch(/Console/i);

    const evidence = buildProductEvidence(
      "iCollect Everything",
      hardware!.products[0]!,
    );
    expect(evidence?.catalogTitleAnchor).toBe(true);
  });

  it("keeps ordinary game catalog titles off the hardware bucket", () => {
    const contributions = icollectModule.buildBarcodeSources!(
      payloadWithIce("Pac-Man", "Atari 2600"),
      {
        type: "hardware",
        isBook: false,
        cleanedBarcode: "0123456789012",
      },
    );

    expect(contributions.map((entry) => entry.mediaType)).toEqual(["games"]);
  });
});
