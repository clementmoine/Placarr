import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  confrontWithDatabase: vi.fn(),
}));

vi.mock("@/services/metadataDatabase", () => ({
  confrontWithDatabase: h.confrontWithDatabase,
}));

import { buildDatabaseEvidence } from "./resolve";

beforeEach(() => {
  h.confrontWithDatabase.mockReset();
});

describe("buildDatabaseEvidence", () => {
  it("does not turn a database miss into canonical evidence", async () => {
    h.confrontWithDatabase.mockResolvedValue(null);

    const evidence = await buildDatabaseEvidence(
      ["Mille Sabords Gigamic neuf sous blister"],
      "boardgames",
    );

    expect(evidence).toEqual([]);
  });

  it("builds canonical evidence only from a real database match", async () => {
    h.confrontWithDatabase.mockResolvedValue("Mille Sabords");

    const evidence = await buildDatabaseEvidence(
      ["Mille Sabords Gigamic"],
      "boardgames",
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      providerName: "DatabaseResolver",
      cleanName: "Mille Sabords",
      isCanonical: true,
    });
  });
});
