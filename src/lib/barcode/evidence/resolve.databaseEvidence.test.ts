import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  confrontWithDatabase: vi.fn(),
}));

vi.mock("@/services/metadata/database", () => ({
  confrontWithDatabase: h.confrontWithDatabase,
}));

import { buildDatabaseEvidence } from "./resolve";

beforeEach(() => {
  h.confrontWithDatabase.mockReset();
  delete process.env.RECORD;
  delete process.env.BARCODE_RECORD_SLIM;
});

describe("buildDatabaseEvidence", () => {
  it("skips database fan-out during RECORD fixture capture", async () => {
    process.env.RECORD = "1";
    h.confrontWithDatabase.mockImplementation(() => new Promise(() => {}));

    const evidence = await buildDatabaseEvidence(
      ["Mario Kart Wii"],
      "games",
    );

    expect(evidence).toEqual([]);
    expect(h.confrontWithDatabase).not.toHaveBeenCalled();
  });

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
