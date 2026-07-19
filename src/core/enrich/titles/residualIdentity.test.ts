import { describe, expect, it } from "vitest";
import {
  residualIdentityMatch,
  authorNamesFromMetadata,
  identityTokens,
} from "@/core/enrich/titles/residualIdentity";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";

describe("identityTokens", () => {
  it("conserve les tokens courts (z) — pas de liste spin-off", () => {
    expect(identityTokens("Dragon Ball Z - Tome 2")).toEqual([
      "dragon",
      "ball",
      "z",
    ]);
    expect(identityTokens("Dragon Ball, tome 2")).toEqual(["dragon", "ball"]);
    expect(identityTokens("Baldur's Gate 3")).toEqual([
      "baldurs",
      "gate",
      "3",
    ]);
  });

  it("retire plateforme registry + connecteurs, pas l'identité produit", () => {
    expect(identityTokens("Silt sur PS4")).toEqual(["silt"]);
    expect(identityTokens("Far Cry Blood Dragon")).toEqual([
      "far",
      "cry",
      "blood",
      "dragon",
    ]);
  });
});

describe("residualIdentityMatch", () => {
  it("rejette Dragon Ball Z vs classique (ligne de série ordonnée, pas une liste)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Dragon Ball Z - Tome 2"],
      candidateTitles: ["Dragon Ball, tome 2"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("request_series_line_unexplained");
  });

  it("rejette Super vs super livre (ligne étendue, pas une liste)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Dragon Ball Super n°01"],
      candidateTitles: ["Dragon Ball - Le super livre, Tome 1"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("series_line_extended_on_candidate");
  });

  it("conserve Cycle sur Dragon Ball Z (pas une extension de ligne)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Dragon Ball Z - Tome 2"],
        candidateTitles: ["Dragon Ball Z - Cycle 1, tome 2"],
      }).decision,
    ).toBe("uncertain");
  });

  it("accepte même volume + résidu vide (Naruto)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Naruto n°26"],
        candidateTitles: ["Naruto - Tome 26"],
      }).decision,
    ).toBe("accept");
  });

  it("accepte un résidu couvert par authors", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Naruto n°26"],
      candidateTitles: ["Naruto - Tome 26 - Masashi Kishimoto"],
      candidateAuthors: ["Masashi Kishimoto"],
    });
    expect(result.decision).toBe("accept");
    expect(result.reasons).toContain("author_covered");
  });

  it("rejette un conflit de volume", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Naruto n°26"],
        candidateTitles: ["Naruto - Tome 27"],
      }).decision,
    ).toBe("reject");
  });

  it("rejette un volume manquant côté candidat", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Super Picsou Géant n°01"],
        candidateTitles: ["Super Picsou Geant"],
      }).reasons,
    ).toContain("volume_missing_on_candidate");
  });

  it("rejette un tome arbitraire sur une demande collection seule", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Fullmetal Alchemist"],
        candidateTitles: ["Fullmetal Alchemist - Tome 17"],
      }).reasons,
    ).toContain("unrequested_volume_on_candidate");
  });

  it("rejette le merch / coque", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Naruto n°26"],
        candidateTitles: ["Coque Naruto n°26"],
      }).reasons,
    ).toContain("merch_accessory");
  });

  it("rejette une identité candidat inexpliquée sans volume partagé", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Far Cry"],
      candidateTitles: ["Far Cry Blood Dragon"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("unexplained_candidate_identity");
  });

  it("reste uncertain FR↔EN (résidu bilatéral)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["La Révélation Finale"],
      candidateTitles: ["The Last Revelation"],
    });
    expect(result.decision).toBe("uncertain");
    expect(result.reasons).toContain("bilateral_unexplained");
  });

  it("sous-titre album avec volume matché → uncertain (pas reject)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Dragon Ball n°01"],
      candidateTitles: ["Dragon Ball 1 . Le nuage supersonique"],
    });
    expect(result.decision).toBe("uncertain");
    expect(result.reasons).toContain("ambiguous_residual_with_volume");
  });

  it("cross-lang bilatéral → uncertain (pas reject sibling)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Ni No Kuni 2 - L'avénement d'un nouveau royaume"],
        candidateTitles: ["Ni no Kuni II: Revenant Kingdom"],
      }).decision,
    ).toBe("uncertain");
  });
});

describe("isMetadataTitleAligned via residual", () => {
  it("aligne AbeBooks-like avec authors", () => {
    expect(
      isMetadataTitleAligned(
        {
          title: "Naruto - Tome 26 - Masashi Kishimoto",
          authors: [{ name: "Masashi Kishimoto" }],
        },
        ["Naruto n°26"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejette DB classique pour demande Z via résidu", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball, tome 2" },
        ["Dragon Ball Z - Tome 2"],
        0.58,
      ),
    ).toBe(false);
  });

  it("authorNamesFromMetadata extrait les noms", () => {
    expect(
      authorNamesFromMetadata([{ name: "Masashi Kishimoto" }, { name: "" }]),
    ).toEqual(["Masashi Kishimoto"]);
  });

  it("accepte la restatement arabe d'un sequel romain déjà présent", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Alan Wake II - Deluxe Edition"],
        candidateTitles: ["PS5 Alan Wake II (2) Deluxe Edition"],
      }).decision,
    ).toBe("accept");
  });

  it("ignore japanese / artbook comme packaging listing, pas identité", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Lollipop Chainsaw RePOP"],
        candidateTitles: ["PS5 Lollipop Chainsaw RePOP Japanese"],
      }).decision,
    ).toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["L'Art et la Création de Arcane"],
        candidateTitles: ["Artbook L'art et la création de Arcane"],
      }).decision,
    ).toBe("accept");
  });

  it("ne laisse pas un fragment d'alignement vetoer le titre complet", () => {
    expect(
      residualIdentityMatch({
        requestTitles: [
          "Assassin's Creed Valhalla l'Aube du Ragnarok",
          "Assassin's Creed",
          "l'Aube du Ragnarok",
        ],
        candidateTitles: [
          "Assassin's Creed Valhalla DLC Aube du Ragnarok sur PS4",
        ],
      }).decision,
    ).not.toBe("reject");
  });

  it("ne laisse pas une variante romaine vetoer le titre primaire", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Death Note Tome 1", "Death Note I", "Death Note"],
        candidateTitles: ["Death Note - Tome 1"],
      }).decision,
    ).toBe("accept");
  });
});
