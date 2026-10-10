import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import {
  fetchLorcastSetPrints,
  fetchLorcastSets,
  loadLorcastCatalogue,
  mapLorcastCataloguePrint,
} from "./catalogue";

/** Copiée de la vraie fiche `36/P2`, pièges compris. */
function rawPuzzlePromo() {
  return {
    id: "crd_efd1ac7f32014d28938b008066f592ab",
    name: "Mickey Mouse",
    version: "True Friend",
    collector_number: "36",
    rarity: "Promo",
    cost: 3,
    inkwell: true,
    ink: "Amber",
    type: ["Character"],
    classifications: ["Storyborn", "Hero"],
    illustrators: ["Dave Beauchene"],
    flavor_text: "As long as he's around…",
    strength: 3,
    willpower: 3,
    lore: 2,
    image_uris: {
      digital: {
        small: "https://cards.lorcast.io/card/digital/small/crd_efd.avif?1",
        normal: "https://cards.lorcast.io/card/digital/normal/crd_efd.avif?1",
        large: "https://cards.lorcast.io/card/digital/large/crd_efd.avif?1",
      },
    },
    set: { code: "P2", name: "Promo Set 2" },
  };
}

beforeEach(() => {
  httpGet.mockReset();
});

describe("mapLorcastCataloguePrint", () => {
  it("lit la fiche sans rien inventer", () => {
    expect(mapLorcastCataloguePrint(rawPuzzlePromo())).toEqual({
      providerId: "crd_efd1ac7f32014d28938b008066f592ab",
      setCode: "P2",
      setName: "Promo Set 2",
      collectorNumber: "36",
      name: "Mickey Mouse",
      version: "True Friend",
      rarity: "Promo",
      cardType: "Character",
      color: "Amber",
      cost: 3,
      lore: 2,
      strength: 3,
      willpower: 3,
      inkwell: true,
      subtypes: ["Storyborn", "Hero"],
      artists: ["Dave Beauchene"],
      flavorText: "As long as he's around…",
      imageUrl: "https://cards.lorcast.io/card/digital/large/crd_efd.avif?1",
      thumbnailUrl:
        "https://cards.lorcast.io/card/digital/small/crd_efd.avif?1",
    });
  });

  it("déplie la rareté soulignée de Lorcast", () => {
    const card = mapLorcastCataloguePrint({
      ...rawPuzzlePromo(),
      rarity: "Super_rare",
    });
    expect(card?.rarity).toBe("Super rare");
  });

  it("jette le sous-titre littéral « None »", () => {
    const card = mapLorcastCataloguePrint({
      ...rawPuzzlePromo(),
      name: "Pull the Lever!",
      version: "None",
    });
    expect(card?.version).toBeNull();
  });

  it("retombe sur `normal` quand `large` manque", () => {
    const card = mapLorcastCataloguePrint({
      ...rawPuzzlePromo(),
      image_uris: { digital: { normal: "https://cards.lorcast.io/n.avif" } },
    });
    expect(card?.imageUrl).toBe("https://cards.lorcast.io/n.avif");
  });

  it("rend null sans identité utilisable", () => {
    expect(
      mapLorcastCataloguePrint({ ...rawPuzzlePromo(), collector_number: null }),
    ).toBeNull();
    expect(
      mapLorcastCataloguePrint({ ...rawPuzzlePromo(), set: { code: null } }),
    ).toBeNull();
  });
});

describe("fetchLorcastSets", () => {
  it("lit la liste, quelle que soit son enveloppe", async () => {
    httpGet.mockResolvedValueOnce({
      data: {
        results: [{ code: "P2", name: "Promo Set 2" }, { name: "sans code" }],
      },
    });
    expect(await fetchLorcastSets()).toEqual([
      { code: "P2", name: "Promo Set 2" },
    ]);

    httpGet.mockResolvedValueOnce({ data: [{ code: "9", name: "Fabled" }] });
    expect(await fetchLorcastSets()).toEqual([{ code: "9", name: "Fabled" }]);
  });
});

describe("fetchLorcastSetPrints", () => {
  it("écarte les lignes illisibles sans perdre les autres", async () => {
    httpGet.mockResolvedValueOnce({
      data: { results: [rawPuzzlePromo(), { id: "crd_vide" }] },
    });
    const prints = await fetchLorcastSetPrints("P2");
    expect(prints.map((p) => p.collectorNumber)).toEqual(["36"]);
  });
});

describe("loadLorcastCatalogue", () => {
  it("saute les sets que l'appelant refuse, et le dit", async () => {
    httpGet.mockResolvedValueOnce({
      data: { results: [{ code: "cp" }, { code: "P2" }] },
    });
    httpGet.mockResolvedValueOnce({ data: { results: [rawPuzzlePromo()] } });

    const catalogue = await loadLorcastCatalogue({
      skipSet: (set) => (set.code === "cp" ? "numérotation en conflit" : null),
    });

    expect(catalogue.skipped).toEqual([
      { setCode: "cp", reason: "numérotation en conflit" },
    ]);
    expect(catalogue.prints).toHaveLength(1);
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it("perd un set en panne, pas les autres", async () => {
    httpGet.mockResolvedValueOnce({
      data: { results: [{ code: "P2" }, { code: "Coconut" }] },
    });
    httpGet.mockRejectedValueOnce(new Error("HTTP 503"));
    httpGet.mockResolvedValueOnce({ data: { results: [rawPuzzlePromo()] } });

    const catalogue = await loadLorcastCatalogue();
    expect(catalogue.failed).toEqual([{ setCode: "P2", error: "HTTP 503" }]);
    expect(catalogue.prints).toHaveLength(1);
  });
});
