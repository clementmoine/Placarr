import { describe, expect, it } from "vitest";

import { narutoccgModule } from "./index";

/**
 * The provider plays the role Lorcana and Pokémon split across two modules:
 * catalogue owner *and* card database. These are the hooks the card-database
 * side is expected to carry (`lorcanajson`, `tcgdex`) — without them the
 * provider is invisible to the admin test panel and to the mapping audit.
 */
describe("narutoccg provider hooks", () => {
  it("declares the card-database surface, not just the catalogue", () => {
    expect(narutoccgModule.searchPrints).toBeTypeOf("function");
    expect(narutoccgModule.lookupPrint).toBeTypeOf("function");
    expect(narutoccgModule.suggestDatabaseTitles).toBeTypeOf("function");
    expect(narutoccgModule.runMappingProbe).toBeTypeOf("function");
    expect(narutoccgModule.collectMappingRawKeys).toBeTypeOf("function");
    expect(narutoccgModule.evidence?.label).toBeTruthy();
    // `nameDatabase` is what makes `suggestDatabaseTitles` reachable.
    expect(narutoccgModule.info.nameDatabase).toBe(true);
  });

  it("exposes a search and a print-key handler to the admin test panel", () => {
    const handlers = Object.keys(narutoccgModule.testHandlers ?? {});
    expect(handlers).toContain("narutoccg-search");
    expect(handlers).toContain("narutoccg-printkey");
  });

  it("suggests each distinct title once, prints being told apart by the picker", async () => {
    const titles = await narutoccgModule.suggestDatabaseTitles!({
      cleanedName: "Tayuya",
    } as never);
    // `ni151` and `ni253` are both "Tayuya": one suggestion, two prints.
    expect(titles).toEqual(["Tayuya"]);
  });

  it("probes a sample that is always on disk", async () => {
    const probe = await narutoccgModule.runMappingProbe!();
    expect(probe).not.toBeNull();
    const keys = await narutoccgModule.collectMappingRawKeys!(
      undefined as never,
    );
    expect(keys).toContain("field:fullname");
  });
});
