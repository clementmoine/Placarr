import { describe, expect, it } from "vitest";

import ledger from "./attestedFinishes.json";
import {
  resolveAttestedFinishes,
  attestedArtFoilMaskUrl,
  attestedFoilMaskDonor,
  attestedNeedsFullFoilMask,
  type AttestedFinish,
} from "./attestedFinishes";

const EMPTY: AttestedFinish = {
  foilTypes: null,
  varnishType: null,
  foilEffectColors: null,
};
const GLITTER: AttestedFinish = {
  foilTypes: ["Glitter"],
  varnishType: null,
  foilEffectColors: null,
};

/** Un catalogue de test : tout ce qui n'y est pas rend `undefined`. */
function catalogue(entries: Record<string, AttestedFinish>) {
  return (printKey: string) => entries[printKey];
}

describe("finitions attestées sur exemplaire", () => {
  it("pointe les fills attestés vers un MotifMask facsimile de leur art", () => {
    expect(attestedFoilMaskDonor("lorcana:p2-36")).toBe("lorcana:6-25-p2");
    expect(attestedNeedsFullFoilMask("lorcana:p2-36")).toBe(true);
    expect(attestedNeedsFullFoilMask("lorcana:1-12")).toBe(false);
    expect(attestedArtFoilMaskUrl("lorcana:p2-36", "en")).toBe(
      "/assets/lorcana/cards/p2/en/36/mask.attested.webp",
    );
  });

  it("reprend la finition de la carte de référence", () => {
    const { finishes, notes } = resolveAttestedFinishes(
      catalogue({
        "lorcana:p2-36": EMPTY,
        "lorcana:6-25-p2": GLITTER,
      }),
    );
    expect(finishes.get("lorcana:p2-36")).toEqual(GLITTER);
    expect(notes.join(" ")).toContain("attestée sur exemplaire");
  });

  it("suit la référence plutôt qu'un type figé", () => {
    // Si LorcanaJSON requalifiait la référence, l'attestation la suit : c'est
    // une relation qui a été observée, pas un nom de finition.
    const { finishes } = resolveAttestedFinishes(
      catalogue({
        "lorcana:p2-36": EMPTY,
        "lorcana:6-25-p2": {
          foilTypes: ["Satin"],
          varnishType: "MatteHotFoil",
          foilEffectColors: ["gold"],
        },
      }),
    );
    expect(finishes.get("lorcana:p2-36")).toEqual({
      foilTypes: ["Satin"],
      varnishType: "MatteHotFoil",
      foilEffectColors: ["gold"],
    });
  });

  it("ne contredit jamais une finition déjà déclarée", () => {
    const { finishes, notes } = resolveAttestedFinishes(
      catalogue({
        "lorcana:p2-36": { ...EMPTY, foilTypes: ["Silver"] },
        "lorcana:6-25-p2": GLITTER,
      }),
    );
    expect(finishes.size).toBe(0);
    expect(notes.join(" ")).toContain("une source prime sur l'œil");
  });

  it("se tait plutôt que d'inventer quand la référence manque", () => {
    const { finishes, notes } = resolveAttestedFinishes(
      catalogue({ "lorcana:p2-36": EMPTY }),
    );
    expect(finishes.size).toBe(0);
    expect(notes.join(" ")).toContain("absente du catalogue");
  });

  it("se tait quand la référence n'a elle-même aucune finition", () => {
    const { finishes, notes } = resolveAttestedFinishes(
      catalogue({ "lorcana:p2-36": EMPTY, "lorcana:6-25-p2": EMPTY }),
    );
    expect(finishes.size).toBe(0);
    expect(notes.join(" ")).toContain("aucune finition");
  });

  it("signale une attestation dont le tirage a disparu", () => {
    const { finishes, notes } = resolveAttestedFinishes(catalogue({}));
    expect(finishes.size).toBe(0);
    expect(notes.join(" ")).toContain("absent du catalogue");
  });

  it("chaque entrée du registre dit sa provenance", () => {
    expect(ledger.entries.length).toBeGreaterThan(0);
    for (const entry of ledger.entries) {
      expect(entry.printKey).toMatch(/^lorcana:/);
      expect(entry.sameFinishAs).toMatch(/^lorcana:/);
      // Une attestation ne se réfère pas à elle-même.
      expect(entry.sameFinishAs).not.toBe(entry.printKey);
      expect(entry.card.length).toBeGreaterThan(0);
      expect(entry.reference.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(0);
    }
  });
});
