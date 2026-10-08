import { describe, expect, it, vi } from "vitest";

import { chasseauxlivresModule } from "./index";

vi.mock("./fetch", () => ({
  fetchChasseAuxLivresMetadataProduct: vi.fn(),
  fetchFromChasseAuxLivres: vi.fn(),
  fetchPricesFromChasseAuxLivres: vi.fn(),
  isChasseAuxLivresSearchProtected: vi.fn(),
}));

import { fetchChasseAuxLivresMetadataProduct } from "./fetch";

const mockedMetadataProduct = vi.mocked(fetchChasseAuxLivresMetadataProduct);

describe("chasseauxlivres metadata adapter", () => {
  it("accepts page EAN when /prix/ slug uses an internal id", async () => {
    mockedMetadataProduct.mockResolvedValue({
      name: "Fantastic Mr Fox",
      barcode: "9780140328721",
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/0140328726/fantastic-mr-fox-roald-dahl",
      coverUrl: "https://img.chasse-aux-livres.fr/cover.jpg",
    });

    const adapter = chasseauxlivresModule.createMetadataAdapter!()!;
    const metadata = await adapter.resolve({
      name: "",
      barcode: "9780140328721",
      type: "books",
    });

    expect(metadata?.title).toBe("Fantastic Mr Fox");
    expect(metadata?.observations?.length).toBeGreaterThan(0);
    expect(metadata?.observationSchemaVersion).toBeTruthy();
  });

  it("drops marketplace 'non-dispo' covers instead of emitting Affiche tiles", async () => {
    mockedMetadataProduct.mockResolvedValue({
      name: "Toy Story",
      barcode: "3456789012345",
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/3456789012345/toy-story",
      coverUrl: "https://images.chasse-aux-livres.fr/c/images/non-dispo.png",
      images: ["https://images.chasse-aux-livres.fr/c/images/non-dispo.png"],
    });

    const adapter = chasseauxlivresModule.createMetadataAdapter!()!;
    const metadata = await adapter.resolve({
      name: "Toy Story",
      barcode: "3456789012345",
      type: "movies",
    });

    expect(metadata?.imageUrl).toBeUndefined();
    expect(metadata?.attachments ?? []).toEqual([]);
  });
});

import { isChasseTitleAligned } from "./index";

describe("isChasseTitleAligned", () => {
  it("refuse un resultat qui perd le numero explicitement demande", () => {
    expect(
      isChasseTitleAligned("super picsou geant n 1", "Super picsou géant"),
    ).toBe(false);
  });

  it("refuse un tome arbitraire quand la recherche ne demande pas de volume", () => {
    expect(
      isChasseTitleAligned(
        "Fullmetal Alchemist",
        "FullMetal Alchemist - Tome 17",
      ),
    ).toBe(false);
  });

  it("accepte un titre enrichi sans volume arbitraire", () => {
    expect(
      isChasseTitleAligned(
        "L'art et la création de Arcane",
        "L'art Et La Création De Arcane - League Of Legends",
      ),
    ).toBe(true);
  });

  it("refuse une variante avec suffixe quand la requete est le titre de base", () => {
    expect(
      isChasseTitleAligned("Black Stories", "Black Stories Fantastique"),
    ).toBe(false);
    expect(isChasseTitleAligned("Black Stories", "Iello Black Stories")).toBe(
      true,
    );
  });
});
