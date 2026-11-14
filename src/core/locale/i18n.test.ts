import { describe, expect, it } from "vitest";

import { resolveMessage } from "@/core/locale/i18n";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

describe("resolveMessage", () => {
  it("reads a nested key and a flat dotted sibling of a string parent", () => {
    expect(resolveMessage(fr, "filters.view")).toBe("Vue");
    expect(resolveMessage(fr, "filters.view.active")).toBe("Toute la collection");
    expect(resolveMessage(fr, "filters.view.away")).toBe(
      "Absents (prêt, commande…)",
    );
    expect(resolveMessage(fr, "filters.view.past")).toBe("Déjà eus");
    expect(resolveMessage(fr, "filters.view.all")).toBe("Tout");
    expect(resolveMessage(fr, "filters.view.duplicates")).toBe(
      "Doublons seulement",
    );
    expect(resolveMessage(fr, "sorting.name_asc")).toBe("A-Z (Alphabétique)");
    expect(resolveMessage(en, "filters.view.active")).toBe("Entire collection");
    expect(resolveMessage(fr, "filters.missing")).toBeUndefined();
  });
});
