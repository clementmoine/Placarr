import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrintCandidate, ProviderModule } from "@/types/providerModule";

const modules: ProviderModule[] = [];

vi.mock("@/core/catalog/registry", () => ({
  get PROVIDER_MODULES() {
    return modules;
  },
}));

import {
  searchPrintCandidates,
  resolveUniquePrintCandidate,
  supportsPrintSearch,
  collectorQueryFromItemSlug,
  printKeyMatchesDigitQuery,
} from "./printSearch";

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

describe("printKeyMatchesDigitQuery", () => {
  it("equates padded and bare collector numbers", () => {
    expect(printKeyMatchesDigitQuery("naruto:uc-0003", "3")).toBe(true);
    expect(printKeyMatchesDigitQuery("naruto:uc-0003", "0003")).toBe(true);
    expect(printKeyMatchesDigitQuery("naruto:uc-0013", "3")).toBe(false);
  });
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

  it("hides a locale that was never printed", async () => {
    modules.push(
      fakeModule("narutocarddass", ["tcg"], async () => [
        candidate({
          printKey: "naruto:ni-0255",
          printed: false,
          language: "fr",
        }),
        candidate({
          printKey: "naruto:ni-0255",
          printed: true,
          language: "it",
        }),
      ]),
    );

    const found = await searchPrintCandidates("ni255", "tcg");
    expect(found.map((entry) => entry.language)).toEqual(["it"]);
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

describe("resolveUniquePrintCandidate", () => {
  it("returns the only printing when the query resolves to one key", async () => {
    modules.push(fakeModule("lorcanajson", ["tcg"], async () => [candidate()]));

    const found = await resolveUniquePrintCandidate("TFC#207", "tcg");

    expect(found?.printKey).toBe("lorcana:1-207");
    expect(found?.title).toBe("Elsa - Esprit de l'hiver");
  });

  it("prefers the base print when challenge/promo twins share set+number", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({
          printKey: "lorcana:1-1",
          title: "Ariel - Sur des jambes humaines",
        }),
        candidate({ printKey: "lorcana:1-1-c1", title: "Dragon Fire" }),
        candidate({
          printKey: "lorcana:1-1-cc1",
          title: "Ariel - Spectacular Singer",
        }),
        candidate({
          printKey: "lorcana:1-1-d23",
          title: "Mickey Mouse - Brave Little Tailor",
        }),
        candidate({ printKey: "lorcana:1-1-p1", title: "Promo twin" }),
      ]),
    );

    const found = await resolveUniquePrintCandidate("TFC#001", "tcg");

    expect(found?.printKey).toBe("lorcana:1-1");
    expect(found?.title).toBe("Ariel - Sur des jambes humaines");
  });

  it("prefers the base print when a promo twin shares set+number", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({ printKey: "lorcana:1-20", title: "Simba" }),
        candidate({ printKey: "lorcana:1-20-p1", title: "Genie" }),
      ]),
    );

    const found = await resolveUniquePrintCandidate("TFC#20", "tcg");

    expect(found?.printKey).toBe("lorcana:1-20");
    expect(found?.title).toBe("Simba");
  });

  it("stays unresolved when several unrelated prints match", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({ printKey: "lorcana:1-1", title: "Ariel" }),
        candidate({ printKey: "lorcana:1-20", title: "Simba" }),
      ]),
    );

    expect(
      await resolveUniquePrintCandidate("premier chapitre", "tcg"),
    ).toBeNull();
  });

  it("keeps promo twins ambiguous when the query asks for a promo group", async () => {
    modules.push(
      fakeModule("lorcanajson", ["tcg"], async () => [
        candidate({ printKey: "lorcana:1-20", title: "Simba" }),
        candidate({ printKey: "lorcana:1-20-p1", title: "Genie" }),
      ]),
    );

    const found = await resolveUniquePrintCandidate("20 P1", "tcg");

    expect(found?.printKey).toBe("lorcana:1-20-p1");
    expect(found?.title).toBe("Genie");
  });

  it("keeps a digit query on the exact collector number, not substring hits", async () => {
    modules.push(
      fakeModule("narutoultra", ["tcg"], async () => [
        candidate({ printKey: "naruto:uc-0003", title: "Naruto" }),
        candidate({ printKey: "naruto:uc-0013", title: "Sasuke" }),
        candidate({ printKey: "naruto:uc-0030", title: "Sakura" }),
      ]),
    );

    const found = await resolveUniquePrintCandidate("3", "tcg", {
      providerId: "narutoultra",
    });

    expect(found?.printKey).toBe("naruto:uc-0003");
    expect(found?.title).toBe("Naruto");
  });

  it("does not treat alphanumeric collector numbers as digit pastes", async () => {
    modules.push(
      fakeModule("narutocarddass", ["tcg"], async () => [
        candidate({ printKey: "naruto:s1-ni003", title: "NI003" }),
        candidate({ printKey: "naruto:s1-te003", title: "TE003" }),
      ]),
    );

    expect(await resolveUniquePrintCandidate("3", "tcg")).toBeNull();
  });
});

describe("collectorQueryFromItemSlug", () => {
  it("rebuilds the collector code that produced the item slug", () => {
    expect(collectorQueryFromItemSlug("tfc-2")).toBe("TFC#2");
    expect(collectorQueryFromItemSlug("tfc-2a")).toBe("TFC#2a");
    expect(collectorQueryFromItemSlug("pr3-34")).toBe("PR3#34");
  });

  it("ignores ordinary title slugs", () => {
    expect(
      collectorQueryFromItemSlug("ariel-chanteuse-exceptionnelle"),
    ).toBeNull();
    expect(collectorQueryFromItemSlug("tfc")).toBeNull();
  });
});
