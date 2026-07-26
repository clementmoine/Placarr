import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrintCandidate, ProviderModule } from "@/types/providerModule";

const modules: ProviderModule[] = [];

vi.mock("@/core/catalog/registry", () => ({
  get PROVIDER_MODULES() {
    return modules;
  },
}));

import { searchPrintCandidates, supportsPrintSearch } from "./printSearch";

function candidate(overrides: Partial<PrintCandidate> = {}): PrintCandidate {
  return {
    printKey: "lorcana:1-207",
    title: "Elsa - Esprit de l'hiver",
    reference: "Premier Chapitre · 207",
    rarity: "Enchantée",
    ...overrides,
  };
}

function fakeModule(
  id: string,
  types: string[],
  searchPrints?: ProviderModule["searchPrints"],
): ProviderModule {
  return {
    info: {
      id,
      label: id,
      types: types as never,
      capabilities: [],
      auth: { kind: "none" },
      canonical: false,
    },
    ...(searchPrints ? { searchPrints } : {}),
  } as ProviderModule;
}

beforeEach(() => {
  modules.length = 0;
  vi.restoreAllMocks();
});

describe("supportsPrintSearch", () => {
  it("is false for a type whose providers cannot search prints", () => {
    modules.push(fakeModule("igdb", ["games"]));
    modules.push(fakeModule("lorcanajson", ["tcg"], async () => []));

    expect(supportsPrintSearch("games")).toBe(false);
    expect(supportsPrintSearch("tcg")).toBe(true);
  });
});

describe("searchPrintCandidates", () => {
  it("stamps each candidate with the provider that produced it", async () => {
    modules.push(fakeModule("lorcanajson", ["tcg"], async () => [candidate()]));

    const [found] = await searchPrintCandidates("elsa", "tcg");
    expect(found.providerId).toBe("lorcanajson");
  });

  it("overrides a provider id a module tried to claim for itself", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({ providerId: "somethingElse" }),
      ]),
    );

    const [found] = await searchPrintCandidates("elsa", "tcg");
    expect(found.providerId).toBe("lorcanajson");
  });

  it("merges several providers serving the same type", async () => {
    modules.push(fakeModule("lorcanajson", ["tcg"], async () => [candidate()]));
    modules.push(
      fakeModule("tcgdex", ["tcg"], async () => [
        candidate({ printKey: "pokemon:swsh3-136", title: "Dracaufeu" }),
      ]),
    );

    const found = await searchPrintCandidates("x", "tcg");
    expect(found.map((entry) => entry.providerId).sort()).toEqual([
      "lorcanajson",
      "tcgdex",
    ]);
  });

  it("ignores providers registered for another media type", async () => {
    modules.push(fakeModule("igdb", ["games"], async () => [candidate()]));

    expect(await searchPrintCandidates("elsa", "tcg")).toEqual([]);
  });

  it("keeps the list alive when one provider throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    modules.push(
      fakeModule("broken", ["tcg"], async () => {
        throw new Error("upstream down");
      }),
    );
    modules.push(fakeModule("lorcanajson", ["tcg"], async () => [candidate()]));

    const found = await searchPrintCandidates("elsa", "tcg");
    expect(found).toHaveLength(1);
    expect(found[0]?.providerId).toBe("lorcanajson");
    expect(warn).toHaveBeenCalled();
  });

  it("drops a candidate whose key could never be re-resolved", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({ printKey: "" }),
        candidate({ printKey: "not a key" }),
        candidate({ printKey: "lorcana:9-1" }),
      ]),
    );

    const found = await searchPrintCandidates("x", "tcg");
    expect(found.map((entry) => entry.printKey)).toEqual(["lorcana:9-1"]);
  });

  it("de-duplicates the same print returned by two providers", async () => {
    modules.push(fakeModule("lorcanajson", ["tcg"], async () => [candidate()]));
    modules.push(fakeModule("lorcast", ["tcg"], async () => [candidate()]));

    const found = await searchPrintCandidates("elsa", "tcg");
    expect(found).toHaveLength(1);
    expect(found[0]?.providerId).toBe("lorcanajson");
  });

  it("keeps the same print in two languages apart", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({ language: "fr" }),
        candidate({ language: "en", title: "Elsa - Spirit of Winter" }),
      ]),
    );

    const found = await searchPrintCandidates("elsa", "tcg");
    expect(found).toHaveLength(2);
  });

  it("returns nothing for a blank query rather than asking every provider", async () => {
    const searchPrints = vi.fn(async () => [candidate()]);
    modules.push(fakeModule("lorcanajson", ["tcg"], searchPrints));

    expect(await searchPrintCandidates("", "tcg")).toEqual([]);
    expect(await searchPrintCandidates("   ", "tcg")).toEqual([]);
    expect(searchPrints).not.toHaveBeenCalled();
  });

  it("honours the caller's limit", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () =>
        Array.from({ length: 30 }, (_, index) =>
          candidate({ printKey: `lorcana:1-${index + 1}` }),
        ),
      ),
    );

    const found = await searchPrintCandidates("e", "tcg", { limit: 5 });
    expect(found).toHaveLength(5);
  });

  it("passes the language and abort signal down to the provider", async () => {
    const searchPrints = vi.fn(async () => [candidate()]);
    modules.push(fakeModule("lorcanajson", ["tcg"], searchPrints));
    const controller = new AbortController();

    await searchPrintCandidates("elsa", "tcg", {
      language: "en",
      signal: controller.signal,
    });

    expect(searchPrints).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "elsa",
        language: "en",
        signal: controller.signal,
      }),
    );
  });

  it("trims the query before handing it to providers", async () => {
    const searchPrints = vi.fn(async () => [candidate()]);
    modules.push(fakeModule("lorcanajson", ["tcg"], searchPrints));

    await searchPrintCandidates("  elsa  ", "tcg");

    expect(searchPrints).toHaveBeenCalledWith(
      expect.objectContaining({ query: "elsa" }),
    );
  });
});
