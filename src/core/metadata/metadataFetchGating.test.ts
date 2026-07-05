import { describe, expect, it } from "vitest";

import { consoleShelfRejectsWebOnlyGameMetadata } from "./metadataFetchGating";

describe("consoleShelfRejectsWebOnlyGameMetadata", () => {
  it("rejects web-only catalog hits when the shelf targets a physical release", () => {
    expect(
      consoleShelfRejectsWebOnlyGameMetadata(
        {
          title: "Halo",
          facts: [{ kind: "platform", label: "Platform", value: "Web" }],
        },
        "xbox",
      ),
    ).toBe(true);
  });

  it("allows web facts when the shelf targets PC", () => {
    expect(
      consoleShelfRejectsWebOnlyGameMetadata(
        {
          title: "Civilization",
          facts: [{ kind: "platform", label: "Platform", value: "Web" }],
        },
        "pc",
      ),
    ).toBe(false);
  });

  it("allows mixed platform facts on a physical shelf", () => {
    expect(
      consoleShelfRejectsWebOnlyGameMetadata(
        {
          title: "Halo",
          facts: [
            { kind: "platform", label: "Platform", value: "Web" },
            { kind: "platform", label: "Platform", value: "Xbox" },
          ],
        },
        "xbox",
      ),
    ).toBe(false);
  });
});
