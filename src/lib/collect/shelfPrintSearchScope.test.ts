import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrintCatalogue } from "@/core/identify/printSearch";
import type { ProviderModule } from "@/types/providerModule";

const modules: ProviderModule[] = [];
const catalogues: PrintCatalogue[] = [];

vi.mock("@/core/catalog/registry", () => ({
  get PROVIDER_MODULES() {
    return modules;
  },
}));

vi.mock("@/core/identify/printSearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/core/identify/printSearch")>();
  return {
    ...actual,
    printSearchCatalogues: async () => catalogues,
  };
});

import { shelfPrintSearchScope } from "./shelfPrintSearchScope";

function fakeModule(
  id: string,
  label: string,
  sets: string[],
  printGames: string[] = ["naruto"],
  aliases: string[] = [],
): ProviderModule {
  return {
    info: {
      id,
      label,
      catalogueLabel: label,
      ...(aliases.length ? { catalogueAliases: aliases } : {}),
      types: ["tcg"],
      capabilities: [],
      auth: { kind: "none" },
      canonical: false,
      defaultLanguage: "fr",
    },
    printGames,
    searchPrints: async () => [],
    listPrintSets: async () =>
      sets.map((setId) => ({ id: setId, label: setId.toUpperCase() })),
    listSetPrints: async () => [],
  } as ProviderModule;
}

beforeEach(() => {
  modules.length = 0;
  catalogues.length = 0;
});

describe("shelfPrintSearchScope", () => {
  it("scopes to the catalogue the shelf name uniquely implies", async () => {
    catalogues.push({
      id: "narutoultra",
      label: "Naruto Ultra Challenge",
      aliases: [{ label: "Ultra Challenge" }],
      defaultLanguage: "fr",
      languages: ["fr"],
      sets: [],
    });
    catalogues.push({
      id: "lorcanajson",
      label: "Lorcana",
      aliases: [],
      defaultLanguage: "fr",
      languages: ["fr"],
      sets: [],
    });
    modules.push(
      fakeModule("narutoultra", "Naruto Ultra Challenge", ["uc"], ["naruto"], [
        "Ultra Challenge",
      ]),
    );
    modules.push(
      fakeModule("lorcanajson", "Lorcana", ["1"], ["lorcana"]),
    );

    await expect(
      shelfPrintSearchScope({
        type: "tcg",
        shelfName: "Naruto Ultra Challenge",
      }),
    ).resolves.toEqual({
      providerId: "narutoultra",
      language: "fr",
    });
  });

  it("stays unscoped when several catalogues remain plausible", async () => {
    catalogues.push({
      id: "narutoultra",
      label: "Naruto Ultra Challenge",
      aliases: [],
      defaultLanguage: "fr",
      languages: ["fr"],
      sets: [],
    });
    catalogues.push({
      id: "narutoranks",
      label: "Naruto Ninja Ranks",
      aliases: [],
      defaultLanguage: "fr",
      languages: ["fr"],
      sets: [],
    });
    modules.push(
      fakeModule("narutoultra", "Naruto Ultra Challenge", ["uc"]),
    );
    modules.push(fakeModule("narutoranks", "Naruto Ninja Ranks", ["nr"]));

    await expect(
      shelfPrintSearchScope({ type: "tcg", shelfName: "Naruto" }),
    ).resolves.toEqual({});
  });
});
