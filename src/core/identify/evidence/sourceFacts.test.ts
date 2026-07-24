import { describe, expect, it } from "vitest";

import {
  barcodeSourceFactsFromFields,
  mergeBarcodeSourceFacts,
} from "./sourceFacts";

describe("barcodeSourceFactsFromFields", () => {
  it("normalise les champs structurés en facts barcode", () => {
    expect(
      barcodeSourceFactsFromFields({
        platformKey: "wii",
        players: "3 à 4",
        playtime: "60 min",
        ageRating: "PEGI 10",
        mediaFormat: "DVD-ROM",
      }),
    ).toEqual([
      { kind: "platform", label: "Plateforme", value: "wii" },
      { kind: "players", label: "Joueurs", value: "3 à 4" },
      { kind: "playtime", label: "Durée", value: "60 min" },
      { kind: "age-rating", label: "PEGI", value: "10" },
      { kind: "media-format", label: "Support", value: "DVD-ROM" },
    ]);
  });
});

describe("mergeBarcodeSourceFacts", () => {
  it("déduplique les facts identiques", () => {
    expect(
      mergeBarcodeSourceFacts(
        [{ kind: "players", label: "Joueurs", value: "2-4" }],
        [{ kind: "players", label: "Joueurs", value: "2-4" }],
      ),
    ).toEqual([{ kind: "players", label: "Joueurs", value: "2-4" }]);
  });
});
