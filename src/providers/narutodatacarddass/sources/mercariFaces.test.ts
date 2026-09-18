import { describe, expect, it } from "vitest";

import { dataCarddassMercariIngestFaces } from "./mercariFaces";

describe("dataCarddass mercari faces ledger", () => {
  it("keeps only ingestible pasted listings with mercdn urls", () => {
    const faces = dataCarddassMercariIngestFaces();
    expect(faces.length).toBeGreaterThan(0);
    expect(
      faces.every(
        (row) =>
          row.ingest &&
          typeof row.url === "string" &&
          row.url.includes("mercdn.net"),
      ),
    ).toBe(true);
    expect(faces.some((row) => row.printedRef === "NF-021")).toBe(true);
  });
});
