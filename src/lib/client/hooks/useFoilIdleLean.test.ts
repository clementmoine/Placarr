import { describe, expect, it } from "vitest";

import { foilIdleShouldTick } from "./useFoilIdleLean";

/*
  Une carte au repos anime son reflet sur l'horloge partagée — mais seulement
  si on la voit. Abonnées hors écran, les ~120 holos de la page Objets
  réécrivaient leurs variables CSS à chaque frame : 90 ms de style et de mise
  en page par frame sur 37 000 nœuds, 11 images/s au repos comme au défilement.
*/
describe("foilIdleShouldTick", () => {
  const base = { driven: false, reducedMotion: false, nearViewport: true };

  it("ticks a resting card that is on screen", () => {
    expect(foilIdleShouldTick(base)).toBe(true);
  });

  it("stays still off screen, under a pointer, or with reduced motion", () => {
    expect(foilIdleShouldTick({ ...base, nearViewport: false })).toBe(false);
    expect(foilIdleShouldTick({ ...base, driven: true })).toBe(false);
    expect(foilIdleShouldTick({ ...base, reducedMotion: true })).toBe(false);
  });
});
