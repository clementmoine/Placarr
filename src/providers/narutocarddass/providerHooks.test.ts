import { describe, expect, it } from "vitest";

import { narutocarddassModule } from "./index";

/**
 * The provider plays the role Lorcana and Pokémon split across two modules:
 * catalogue owner *and* card database. These are the hooks the card-database
 * side is expected to carry (`lorcanajson`, `tcgdex`) — without them the
 * provider is invisible to the admin test panel and to the mapping audit.
 */
describe("narutocarddass provider hooks", () => {
  it("declares the card-database surface, not just the catalogue", () => {
    expect(narutocarddassModule.searchPrints).toBeTypeOf("function");
    expect(narutocarddassModule.lookupPrint).toBeTypeOf("function");
    expect(narutocarddassModule.suggestDatabaseTitles).toBeTypeOf("function");
    expect(narutocarddassModule.runMappingProbe).toBeTypeOf("function");
    expect(narutocarddassModule.collectMappingRawKeys).toBeTypeOf("function");
    expect(narutocarddassModule.evidence?.label).toBeTruthy();
    // `nameDatabase` is what makes `suggestDatabaseTitles` reachable.
    expect(narutocarddassModule.info.nameDatabase).toBe(true);
  });

  it("exposes a search and a print-key handler to the admin test panel", () => {
    const handlers = Object.keys(narutocarddassModule.testHandlers ?? {});
    expect(handlers).toContain("narutocarddass-search");
    expect(handlers).toContain("narutocarddass-printkey");
  });

  it("suggests each distinct title once, prints being told apart by the picker", async () => {
    const titles = await narutocarddassModule.suggestDatabaseTitles!({
      cleanedName: "Tayuya",
    } as never);
    // `ni151` and `ni253` are both "Tayuya": one suggestion, two prints.
    // EN CCG also has a distinct "Tayuya (State 1)" title — keep it separate.
    expect(titles).toEqual(["Tayuya", "Tayuya (State 1)"]);
  });

  it("probes a sample that is always on disk", async () => {
    const probe = await narutocarddassModule.runMappingProbe!();
    expect(probe).not.toBeNull();
    const keys = await narutocarddassModule.collectMappingRawKeys!(
      undefined as never,
    );
    expect(keys).toContain("field:fullname");
  });
});
