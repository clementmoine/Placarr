import { describe, expect, it } from "vitest";

import {
  compareTitlesForSort,
  getTitleSortKey,
  moveTrailingSortArticleToFront,
} from "@/lib/title/sort";

describe("moveTrailingSortArticleToFront", () => {
  it("réaffiche les titres de tri avec l'article en tête", () => {
    expect(moveTrailingSortArticleToFront("Dwarves, The")).toBe("The Dwarves");
    expect(moveTrailingSortArticleToFront("Adventure, An")).toBe(
      "An Adventure",
    );
    expect(moveTrailingSortArticleToFront("Hat in Time, A")).toBe(
      "A Hat in Time",
    );
  });

  it("laisse les titres déjà affichables inchangés", () => {
    expect(moveTrailingSortArticleToFront("The Dwarves")).toBe("The Dwarves");
  });
});

describe("getTitleSortKey", () => {
  it("ignore les articles de tête pour le tri", () => {
    expect(getTitleSortKey("The Dwarves")).toBe("Dwarves");
    expect(getTitleSortKey("A Hat in Time")).toBe("Hat in Time");
    expect(getTitleSortKey("Le Roi Lion")).toBe("Roi Lion");
    expect(getTitleSortKey("L'Age de Glace")).toBe("Age de Glace");
  });

  it("donne la même clé pour une variante de tri et son titre affichable", () => {
    expect(getTitleSortKey("Dwarves, The")).toBe(
      getTitleSortKey("The Dwarves"),
    );
  });
});

describe("compareTitlesForSort", () => {
  it("classe The Dwarves sous D plutôt que sous T", () => {
    const titles = ["Zelda", "The Dwarves", "Banjo-Kazooie"];
    expect(titles.sort(compareTitlesForSort)).toEqual([
      "Banjo-Kazooie",
      "The Dwarves",
      "Zelda",
    ]);
  });
});
