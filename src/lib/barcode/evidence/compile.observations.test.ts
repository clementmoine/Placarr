import { describe, expect, it } from "vitest";

import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

import { isRejectedObservation } from "@/lib/metadata/observations";

import { compileResultForType } from "./compile";

describe("compileResultForType — observations", () => {
  it("attache des observations typées au résultat compilé", async () => {
    const result = await compileResultForType(
      "boardgames",
      [
        {
          providerName: "Philibert",
          products: [
            {
              name: "Catan",
              coverUrl: "https://example.com/catan.jpg",
            },
          ],
        },
      ],
      "3558380126133",
    );

    expect(result?.observationSchemaVersion).toBe(
      METADATA_OBSERVATION_SCHEMA_VERSION,
    );
    expect(result?.observations?.length).toBeGreaterThan(0);
    expect(result?.observations?.some((row) => row.kind === "title")).toBe(
      true,
    );
    expect(
      result?.observations?.find((row) => row.kind === "title"),
    ).toMatchObject({
      role: "catalog_title",
      value: "Catan",
      provenance: {
        providerId: "philibert",
        providerLabel: "Philibert",
      },
    });
  });

  it("retient les listings marketplace rejetés comme observations reject", async () => {
    const result = await compileResultForType(
      "boardgames",
      [
        {
          providerName: "ScreenScraper",
          products: [
            {
              name: "Catan",
              coverUrl: "https://example.com/catan.jpg",
            },
          ],
        },
        {
          providerName: "eBay",
          products: [
            {
              name: "Totally Unrelated Board Game Lot",
              coverUrl: "https://example.com/noise.jpg",
            },
          ],
        },
      ],
      "3558380126133",
    );

    const rejected = (result?.observations ?? []).filter(isRejectedObservation);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.some((row) => row.kind === "title")).toBe(true);
    expect(
      rejected.some((row) =>
        row.kind === "title" &&
        /unrelated/i.test(String(row.value)),
      ),
    ).toBe(true);
  });
});
